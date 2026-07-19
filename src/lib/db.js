import { supabase } from './supabase'
import { isPotTimeExpired } from './potConstants'

// ── Auth ──────────────────────────────────────────
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error

  const authUser = data.user
  // 최소 프로필만 생성하고, 닉네임·생년월일·약관동의는 /welcome 단계에서 채운다.
  const placeholder = email.split('@')[0]
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .upsert({ auth_id: authUser.id, email, nickname: placeholder, onboarded: false }, { onConflict: 'auth_id' })
    .select()
    .single()
  if (profileError) throw profileError
  return profile
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', data.user.id)
    .single()
  if (profileError) throw profileError
  return profile
}

export async function signOut() {
  await supabase.auth.signOut()
}

// 회원 탈퇴: delete-account Edge Function 을 호출해
// 앱 데이터 + auth.users 레코드를 완전히 삭제한 뒤 세션을 종료한다.
// (auth 계정 삭제는 service_role 권한이 필요하므로 서버에서 처리)
export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  await supabase.auth.signOut()
}

// OAuth 왕복 후 돌아올 경로. 그룹 초대 코드는 localStorage 대신 URL(/join/:code)에
// 실어 나른다 — 카톡 인앱 ↔ 외부 브라우저 전환이나 OAuth 리다이렉트 과정에서 저장소가
// 이어지지 않는 환경에서도 URL은 살아남기 때문. 밥팟 링크는 기존 returnTo 방식 유지.
function oauthReturnPath() {
  const invite = localStorage.getItem('pendingInviteCode')
  if (invite) return `/join/${invite}`
  const returnTo = sessionStorage.getItem('returnTo')
  if (returnTo) {
    sessionStorage.removeItem('returnTo')
    return returnTo
  }
  return '/today'
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + oauthReturnPath() },
  })
  if (error) throw error
}

export async function signInWithKakao() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: window.location.origin + oauthReturnPath() },
  })
  if (error) throw error
}

export async function getSessionUser() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', session.user.id)
    .single()

  // 첫 로그인(구글/이메일): users 테이블에 프로필이 없으면 최소 프로필 자동 생성.
  // 닉네임·생년월일·약관동의는 onboarded=false 상태로 두고 /welcome 단계에서 채운다.
  if (error && error.code === 'PGRST116') {
    const authUser = session.user
    // 익명(게스트) 세션이면 온보딩 게이트를 우회하도록 is_guest=true, onboarded=true 로 생성.
    // 닉네임·guest_pot_id 는 joinPotAsGuest 에서 다시 채운다.
    if (authUser.is_anonymous) {
      const { data: guestProfile, error: gErr } = await supabase
        .from('users')
        .upsert({ auth_id: authUser.id, nickname: '게스트', is_guest: true, onboarded: true }, { onConflict: 'auth_id' })
        .select()
        .single()
      if (gErr) return null
      return guestProfile
    }
    const nickname = authUser.user_metadata?.full_name?.split(' ')[0]
      ?? authUser.email?.split('@')[0]
      ?? '사용자'
    const { data: newProfile, error: insertError } = await supabase
      .from('users')
      .upsert({ auth_id: authUser.id, email: authUser.email, nickname, onboarded: false }, { onConflict: 'auth_id' })
      .select()
      .single()
    if (insertError) return null
    return newProfile
  }

  if (error) return null
  return data
}

// 온보딩 완료: 닉네임·생년월일·라이프스타일 저장 + 약관 동의 기록 + onboarded 처리
export async function completeOnboarding(userId, { nickname, birthdate, lifestyle }, agreedTermIds = []) {
  const { data: profile, error } = await supabase
    .from('users')
    .update({
      nickname: nickname.trim(),
      birthdate: birthdate || null,
      lifestyle: lifestyle || null,
      onboarded: true,
    })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error

  if (agreedTermIds.length > 0) {
    const rows = agreedTermIds.map(term_id => ({ user_id: userId, term_id }))
    const { error: agreeError } = await supabase
      .from('user_term_agreements')
      .upsert(rows, { onConflict: 'user_id,term_id' })
    if (agreeError) throw agreeError
  }
  return profile
}

// ── 약관 ──────────────────────────────────────────
// 온보딩에 노출할 활성 약관 (정렬 순)
export async function getActiveTerms() {
  const { data, error } = await supabase
    .from('terms')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

// 어드민: 전체 약관 조회
export async function getAllTerms() {
  const { data, error } = await supabase
    .from('terms')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function createTerm(term) {
  const { data, error } = await supabase
    .from('terms')
    .insert(term)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTerm(id, patch) {
  const { data, error } = await supabase
    .from('terms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTerm(id) {
  const { error } = await supabase.from('terms').delete().eq('id', id)
  if (error) throw error
}

// ── 유저 ──────────────────────────────────────────
export async function createUser(nickname) {
  const { data, error } = await supabase
    .from('users')
    .insert({ nickname })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getUser(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ── 그룹 ──────────────────────────────────────────
export async function createGroup(name, createdBy) {
  const invite_code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, invite_code, created_by: createdBy })
    .select()
    .single()
  if (error) throw error
  await joinGroup(data.id, createdBy)
  return data
}

export async function getGroupByInviteCode(code) {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('invite_code', code.toUpperCase())
    .single()
  if (error) throw error
  return data
}

export async function updateGroupName(groupId, name) {
  const { error } = await supabase
    .from('groups')
    .update({ name })
    .eq('id', groupId)
  if (error) throw error
}

export async function leaveGroup(groupId, userId) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .match({ group_id: groupId, user_id: userId })
  if (error) throw error
}

export async function joinGroup(groupId, userId) {
  const { error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, user_id: userId },
      { onConflict: 'group_id,user_id', ignoreDuplicates: true }
    )
  if (error) throw error
}

export async function getMyGroups(userId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, sort_order, groups(*)')
    .eq('user_id', userId)
  if (error) throw error
  return data
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    .map(d => d.groups)
}

export async function updateGroupOrder(userId, orders) {
  // orders: [{ groupId, sort_order }, ...]
  await Promise.all(orders.map(({ groupId, sort_order }) =>
    supabase
      .from('group_members')
      .update({ sort_order })
      .match({ user_id: userId, group_id: groupId })
  ))
}

export async function getGroupMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, nickname, users(*)')
    .eq('group_id', groupId)
  if (error) throw error
  return data.map(d => ({
    ...d.users,
    nickname: d.nickname || d.users.nickname,
    group_nickname: d.nickname || null,
    default_nickname: d.users.nickname,
  }))
}

// ── 친구 ──────────────────────────────────────────
// 이메일 완전일치 또는 닉네임 부분일치로 검색. search_users RPC가 비공개(is_discoverable=false)
// 계정과 존재하지 않는 계정을 구분하지 않고 똑같이 빈 결과로 돌려주므로, 여기서도 그 결과를
// 그대로 노출한다 — 검색으로 계정 존재 여부 자체를 알아낼 수 없게 하기 위함.
export async function searchUsers(query) {
  const { data, error } = await supabase.rpc('search_users', { p_query: query })
  if (error) throw error
  return data
}

export async function setDiscoverable(userId, value) {
  const { error } = await supabase.from('users').update({ is_discoverable: value }).eq('id', userId)
  if (error) throw error
}

// 친구 목록/요청은 users 테이블 RLS(같은 밥팟 참여자만 조회 가능)를 우회해야 해서
// SECURITY DEFINER RPC를 거친다 — 친구가 반드시 같은 밥팟에 있으리란 보장이 없기 때문.
export async function getMyFriends() {
  const { data, error } = await supabase.rpc('get_my_friends')
  if (error) throw error
  return data.map(r => ({ requestId: r.request_id, id: r.id, nickname: r.nickname, avatar_url: r.avatar_url }))
}

// direction: 'sent' | 'received'
export async function getMyFriendRequests() {
  const { data, error } = await supabase.rpc('get_my_friend_requests')
  if (error) throw error
  return data
}

async function notifyFriendRequest(requestId, toUserId, fromUserId, { title, body, eventType }) {
  const url = '/group?friend_requests=1'
  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: toUserId, friend_request_id: requestId, title, body, url, event_type: eventType,
  })
  if (notifError) console.error('friend notification insert 실패:', notifError)

  const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push', {
    body: { userIds: [toUserId], title, body, url },
  })
  if (pushError) console.warn('friend notification send-push 실패:', pushError)
  else if (pushResult?.failed > 0) console.warn('friend notification send-push 일부 실패:', pushResult.failures)
}

// 상대가 이미 나에게 보낸 pending 요청이 있으면 맞요청으로 보고 바로 수락 처리한다.
// 거절됐던 요청을 다시 보내는 경우엔 기존 행을 pending으로 되돌린다(unique 제약 때문에
// 같은 두 사람 사이에 행이 여러 개 생길 수 없다).
export async function sendFriendRequest(fromUserId, toUserId) {
  const { data: existing, error: selErr } = await supabase
    .from('friend_requests')
    .select('*')
    .or(`and(from_user_id.eq.${fromUserId},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${fromUserId})`)
    .maybeSingle()
  if (selErr) throw selErr

  if (existing?.status === 'accepted') return existing
  if (existing?.status === 'pending' && existing.from_user_id === fromUserId) return existing
  if (existing?.status === 'pending' && existing.to_user_id === fromUserId) {
    return acceptFriendRequest(existing.id, fromUserId)
  }

  let request
  if (existing) {
    const { data, error } = await supabase
      .from('friend_requests')
      .update({ from_user_id: fromUserId, to_user_id: toUserId, status: 'pending', responded_at: null })
      .eq('id', existing.id)
      .select().single()
    if (error) throw error
    request = data
  } else {
    const { data, error } = await supabase
      .from('friend_requests')
      .insert({ from_user_id: fromUserId, to_user_id: toUserId, status: 'pending' })
      .select().single()
    if (error) throw error
    request = data
  }

  const { data: from } = await supabase.from('users').select('nickname').eq('id', fromUserId).single()
  await notifyFriendRequest(request.id, toUserId, fromUserId, {
    title: '친구 요청이 왔어요',
    body: `${from?.nickname ?? '누군가'}님이 친구 요청을 보냈어요.`,
    eventType: 'friend_request',
  })

  return request
}

export async function acceptFriendRequest(requestId, userId) {
  const { data: reqRow, error: fetchError } = await supabase
    .from('friend_requests').select('*').eq('id', requestId).single()
  if (fetchError) throw fetchError
  if (reqRow.to_user_id !== userId) throw new Error('내게 온 요청이 아니에요.')
  if (reqRow.status !== 'pending') return reqRow

  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', requestId)
    .select().single()
  if (error) throw error

  const { data: me } = await supabase.from('users').select('nickname').eq('id', userId).single()
  await notifyFriendRequest(requestId, reqRow.from_user_id, userId, {
    title: '친구 요청을 수락했어요',
    body: `${me?.nickname ?? '상대'}님과 친구가 됐어요.`,
    eventType: 'friend_accepted',
  })

  return data
}

// 거절은 상대에게 따로 알리지 않는다 (수락/거절 통보가 사회적으로 부담스러울 수 있어서
// 그룹 초대 등 다른 알림과 달리 조용히 처리).
export async function declineFriendRequest(requestId, userId) {
  const { data: reqRow, error: fetchError } = await supabase
    .from('friend_requests').select('to_user_id, status').eq('id', requestId).single()
  if (fetchError) throw fetchError
  if (reqRow.to_user_id !== userId) throw new Error('내게 온 요청이 아니에요.')
  if (reqRow.status !== 'pending') return

  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', requestId)
  if (error) throw error
}

// 내가 보낸 pending 요청 취소
export async function cancelFriendRequest(requestId, userId) {
  const { data: reqRow, error: fetchError } = await supabase
    .from('friend_requests').select('from_user_id, status').eq('id', requestId).single()
  if (fetchError) throw fetchError
  if (reqRow.from_user_id !== userId) throw new Error('내가 보낸 요청이 아니에요.')
  if (reqRow.status !== 'pending') return

  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId)
  if (error) throw error
}

// 친구 끊기 — 당사자 둘 중 누구든 가능
export async function removeFriend(requestId, userId) {
  const { data: reqRow, error: fetchError } = await supabase
    .from('friend_requests').select('from_user_id, to_user_id').eq('id', requestId).single()
  if (fetchError) throw fetchError
  if (reqRow.from_user_id !== userId && reqRow.to_user_id !== userId) throw new Error('권한이 없어요.')

  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId)
  if (error) throw error
}

// 특정 유저 한 명에게 그룹 초대 알림 발송. notifications 테이블에 group_id를 채워야
// notifications_insert_sharedgroup RLS(내가 그 그룹 멤버일 것)를 통과한다.
export async function inviteGroupFriend(groupId, fromUserId, toUserId) {
  const [{ data: group }, { data: from }] = await Promise.all([
    supabase.from('groups').select('name, invite_code').eq('id', groupId).single(),
    supabase.from('users').select('nickname').eq('id', fromUserId).single(),
  ])
  const title = '그룹에 초대했어요'
  const body = `${from?.nickname ?? '누군가'}님이 "${group?.name ?? '그룹'}"에 초대했어요.`
  const url = `/join/${group?.invite_code}`

  const { error } = await supabase.from('notifications').insert({
    user_id: toUserId, group_id: groupId, title, body, url, event_type: 'invite',
  })
  if (error) throw error

  const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push', {
    body: { userIds: [toUserId], title, body, url },
  })
  if (pushError) console.warn('inviteGroupFriend send-push 실패:', pushError)
  else if (pushResult?.failed > 0) console.warn('inviteGroupFriend send-push 일부 실패:', pushResult.failures)
}

// ── 슬롯 상태 (유저 기준 단일 레코드) ────────────────
export async function upsertStatus({ userId, date, slot, status, meal_time, end_time, menu }) {
  const { error } = await supabase
    .from('daily_status')
    .upsert({
      user_id: userId,
      date,
      slot,
      status,
      meal_time: meal_time || null,
      end_time: end_time || null,
      menu: menu || null,
    }, { onConflict: 'user_id,date,slot' })
  if (error) throw error
}

export async function deleteStatus({ userId, date, slot }) {
  const { error } = await supabase
    .from('daily_status')
    .delete()
    .match({ user_id: userId, date, slot })
  if (error) throw error
}

export async function setStatusHidden(userId, date, isHidden) {
  // 해당 날짜의 모든 슬롯 is_hidden 일괄 처리
  const { error } = await supabase
    .from('daily_status')
    .update({ is_hidden: isHidden })
    .match({ user_id: userId, date })
  if (error) throw error
}

// ── 상태 파생 공통 헬퍼 ──────────────────────────────
// 저장된 daily_status에 "밥팟 참여 사실"을 덮어써 그룹별 표시 상태를 만든다.
// 참여는 daily_status보다 우선: 이 그룹 팟 → 참여중 / 다른 그룹 팟 → 약속있음(closed)
function deriveGroupStatuses({ groupId, memberIds, statusRows, potParts, hiddenKeys, date }) {
  const memberSet = new Set(memberIds)
  const map = {}
  statusRows.forEach(s => {
    if (memberSet.has(s.user_id)) map[`${s.user_id}:${s.slot}`] = { ...s }
  })
  potParts.forEach(pm => {
    const mp = pm.meal_pots
    if (!memberSet.has(pm.user_id)) return
    const key = `${pm.user_id}:${mp.slot}`
    const existing = map[key]
    if (mp.group_id === groupId) {
      map[key] = {
        user_id: pm.user_id, date, slot: mp.slot,
        status: isPotTimeExpired(date, mp.end_time) ? '참여완료' : '참여중',
        meal_time: mp.meal_time, end_time: mp.end_time,
        menu: existing?.menu ?? null, is_hidden: existing?.is_hidden ?? false,
      }
    } else if (!existing || (existing.status !== '참여중' && existing.status !== '참여완료')) {
      // 다른 그룹 팟 참여 → 약속있음. 시간은 노출하되 메뉴(상대 그룹 정보)는 비노출
      map[key] = {
        user_id: pm.user_id, date, slot: mp.slot,
        status: 'closed', meal_time: mp.meal_time, menu: null,
        is_hidden: existing?.is_hidden ?? false,
      }
    }
  })
  return Object.values(map).filter(s => !hiddenKeys.has(`${s.user_id}:${s.slot}`))
}

// 단일 그룹 상태 — 실시간 부분 갱신(reloadGroup)에서 사용
export async function getGroupStatuses(groupId, date) {
  const { data: members, error: mErr } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
  if (mErr) throw mErr

  const memberIds = members.map(m => m.user_id)
  if (memberIds.length === 0) return []

  const [hiddenRes, statusRes, potRes] = await Promise.all([
    supabase.from('group_share_settings')
      .select('user_id, slot').eq('group_id', groupId).eq('date', date).eq('is_shared', false),
    supabase.from('daily_status')
      .select('*').in('user_id', memberIds).eq('date', date),
    supabase.from('pot_members')
      .select('user_id, meal_pots!inner(group_id, slot, meal_time, end_time, date)')
      .in('user_id', memberIds).eq('meal_pots.date', date),
  ])
  if (statusRes.error) throw statusRes.error

  return deriveGroupStatuses({
    groupId,
    memberIds,
    statusRows: statusRes.data ?? [],
    potParts: potRes.data ?? [],
    hiddenKeys: new Set((hiddenRes.data ?? []).map(r => `${r.user_id}:${r.slot}`)),
    date,
  })
}

// 오늘 화면 일괄 로더 — 그룹 수와 무관하게 상수 횟수 쿼리
// members / status / 공유설정 / pots / 팟참여를 한 번씩만 조회하고 클라이언트에서 그룹별 분배
export async function getTodayBoard(groupIds, date) {
  const empty = { membersMap: {}, statusesMap: {}, potsMap: {} }
  if (!groupIds || groupIds.length === 0) return empty

  // 1) 멤버 (그룹 전체 한 번에) — 멤버 ID 집합 확보
  const { data: memberRows, error: mErr } = await supabase
    .from('group_members')
    .select('group_id, user_id, nickname, users(*)')
    .in('group_id', groupIds)
  if (mErr) throw mErr

  const membersMap = {}
  const membersByGroup = {}   // groupId -> memberId[]
  const memberIdSet = new Set()
  groupIds.forEach(gid => { membersMap[gid] = []; membersByGroup[gid] = [] })
  memberRows.forEach(r => {
    membersMap[r.group_id].push({
      ...r.users,
      nickname: r.nickname || r.users.nickname,       // 표시 닉네임 (그룹 전용 우선)
      group_nickname: r.nickname || null,             // 그룹 전용 닉네임 (없으면 null)
      default_nickname: r.users.nickname,             // 기본 닉네임
    })
    membersByGroup[r.group_id].push(r.user_id)
    memberIdSet.add(r.user_id)
  })
  const memberIds = [...memberIdSet]
  if (memberIds.length === 0) return { ...empty, membersMap }

  // 2~5) 상태 / 공유설정 / 팟 / 팟참여 병렬 조회
  const [statusRes, shareRes, potRes, potPartRes] = await Promise.all([
    supabase.from('daily_status')
      .select('*').in('user_id', memberIds).eq('date', date),
    supabase.from('group_share_settings')
      .select('group_id, user_id, slot').in('group_id', groupIds).eq('date', date).eq('is_shared', false),
    supabase.from('meal_pots')
      .select('*, pot_members(user_id, users(nickname, avatar_url, is_guest, group_members(nickname, group_id))), modifier:users!last_modified_by(nickname), pot_comments(count)').in('group_id', groupIds).eq('date', date),
    supabase.from('pot_members')
      .select('user_id, meal_pots!inner(group_id, slot, meal_time, end_time, date)')
      .in('user_id', memberIds).eq('meal_pots.date', date),
  ])
  if (statusRes.error) throw statusRes.error
  if (potRes.error) throw potRes.error

  const statusRows = statusRes.data ?? []
  const potParts = potPartRes.data ?? []

  // 팟 그룹별 분배
  const potsMap = {}
  groupIds.forEach(gid => { potsMap[gid] = [] })
  ;(potRes.data ?? []).forEach(p => { potsMap[p.group_id]?.push(p) })

  // 공유 비활성 키 (그룹별)
  const hiddenByGroup = {}
  groupIds.forEach(gid => { hiddenByGroup[gid] = new Set() })
  ;(shareRes.data ?? []).forEach(r => { hiddenByGroup[r.group_id]?.add(`${r.user_id}:${r.slot}`) })

  // 상태 그룹별 파생
  const statusesMap = {}
  groupIds.forEach(gid => {
    statusesMap[gid] = deriveGroupStatuses({
      groupId: gid,
      memberIds: membersByGroup[gid],
      statusRows,
      potParts,
      hiddenKeys: hiddenByGroup[gid],
      date,
    })
  })

  return { membersMap, statusesMap, potsMap }
}

export async function getMyStatuses(userId, date) {
  const { data, error } = await supabase
    .from('daily_status')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
  if (error) throw error
  return data
}

// ── 밥팟 ──────────────────────────────────────────
function generatePotCode() {
  // 읽기 쉬운 6자리 대문자 코드 (O/0, I/1/L 제외)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function createPot({ groupId, date, slot, meal_time, end_time, title, menu, memo, max_people, is_public, is_default, createdBy, icon }) {
  const invite_code = is_default ? null : generatePotCode()
  const { data, error } = await supabase
    .from('meal_pots')
    .insert({
      group_id: groupId,
      date,
      slot,
      meal_time,
      end_time: end_time || null,
      title,
      menu: menu || null,
      memo: memo || null,
      max_people,
      is_public,
      is_default,
      created_by: is_default ? null : createdBy,
      invite_code,
      icon: icon || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function generatePotInviteCode(potId) {
  const code = generatePotCode()
  const { data, error } = await supabase
    .from('meal_pots')
    .update({ invite_code: code })
    .eq('id', potId)
    .select('invite_code')
    .single()
  if (error) throw error
  return data.invite_code
}

export async function getPotByInviteCode(code) {
  const { data, error } = await supabase
    .from('meal_pots')
    .select('*, pot_members(user_id, users(nickname, is_guest, group_members(nickname, group_id))), modifier:users!last_modified_by(nickname)')
    .eq('invite_code', code.toUpperCase().trim())
    .single()
  if (error) return null
  return data
}

export async function getGroupPots(groupId, date) {
  const { data, error } = await supabase
    .from('meal_pots')
    .select('*, pot_members(user_id, users(nickname, avatar_url, is_guest, group_members(nickname, group_id))), modifier:users!last_modified_by(nickname), pot_comments(count)')
    .eq('group_id', groupId)
    .eq('date', date)
  if (error) throw error
  return data
}

export async function getPot(potId) {
  const { data, error } = await supabase
    .from('meal_pots')
    .select('*, pot_members(user_id, users(nickname, avatar_url, is_guest, group_members(nickname, group_id))), modifier:users!last_modified_by(nickname)')
    .eq('id', potId)
    .maybeSingle()
  if (error) throw error
  return data // 삭제됐으면 null
}

// 밥팟 멤버(본인 제외)에게 알림함 기록 + 푸시 알림 발송. 실패해도 원래 동작을 막지 않는다.
// eventType: 'join' | 'leave' | 'update' | 'comment' — 알림함에서 종류 배지로 표시
export async function notifyPotMembers(potId, excludeUserId, { title, body, eventType }) {
  try {
    const { data: members } = await supabase
      .from('pot_members')
      .select('user_id')
      .eq('pot_id', potId)
    const userIds = (members ?? []).map(m => m.user_id).filter(id => id !== excludeUserId)
    if (userIds.length === 0) return
    const url = `/pot/${potId}`

    // 알림함 기록 — 푸시 구독/권한 여부와 무관하게 항상 남긴다.
    // supabase-js는 insert 실패 시 throw하지 않고 {error}만 채워서 반환하므로 직접 체크해야 한다.
    const rows = userIds.map(user_id => ({ user_id, pot_id: potId, title, body, url, event_type: eventType ?? null }))
    const { error: insertError } = await supabase.from('notifications').insert(rows)
    if (insertError) {
      // event_type 컬럼이 DB에 아직 없는 경우(마이그레이션 미실행) 대비 — 컬럼 없이 재시도
      console.error('notifyPotMembers insert 실패, event_type 없이 재시도:', insertError)
      const fallbackRows = rows.map(({ event_type, ...rest }) => rest)
      const retry = await supabase.from('notifications').insert(fallbackRows)
      if (retry.error) console.error('notifyPotMembers insert 재시도도 실패 (테이블/RLS 확인 필요):', retry.error)
    }

    const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push', {
      body: { userIds, title, body, url },
    })
    if (pushError) console.warn('notifyPotMembers send-push 실패:', pushError)
    else if (pushResult?.failed > 0) console.warn('notifyPotMembers send-push 일부 실패:', pushResult.failures)
  } catch (e) {
    console.warn('notifyPotMembers:', e)
  }
}

// 특정 유저 한 명에게만 초대 알림 발송. 대상이 아직 팟 멤버가 아니어도 되며,
// 발신자 본인이 이 팟의 멤버이기만 하면 notifications_insert_sharedpot RLS를 통과한다.
export async function invitePotFriend(potId, fromUserId, toUserId) {
  const [{ data: pot }, { data: from }] = await Promise.all([
    supabase.from('meal_pots').select('title, slot').eq('id', potId).single(),
    supabase.from('users').select('nickname').eq('id', fromUserId).single(),
  ])
  const title = '같이 먹자고 초대했어요'
  const body = `${from?.nickname ?? '누군가'}님이 [${pot?.title ?? '밥팟'}]에 초대했어요.`
  const url = `/pot/${potId}`

  const { error } = await supabase.from('notifications').insert({
    user_id: toUserId, pot_id: potId, title, body, url, event_type: 'invite',
  })
  if (error) throw error

  const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push', {
    body: { userIds: [toUserId], title, body, url },
  })
  if (pushError) console.warn('invitePotFriend send-push 실패:', pushError)
  else if (pushResult?.failed > 0) console.warn('invitePotFriend send-push 일부 실패:', pushResult.failures)
}

// 아직 밥팟이 없는 상태에서 "같이 먹자" 제안. 상대가 수락하면 acceptPotInvitation에서 밥팟이 생성된다.
export async function proposeMealTogether({ groupId, fromUserId, toUserId, date, slot, meal_time, menu }) {
  const { data: inv, error } = await supabase
    .from('pot_invitations')
    .insert({
      group_id: groupId, from_user_id: fromUserId, to_user_id: toUserId,
      date, slot, meal_time: meal_time || null, menu: menu || null,
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw error

  const { data: from } = await supabase.from('users').select('nickname').eq('id', fromUserId).single()
  const title = '같이 먹자는 제안이 왔어요'
  const body = `${from?.nickname ?? '누군가'}님이 ${slot}에 같이 먹자고 제안했어요.`
  const url = '/notifications'

  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: toUserId, invitation_id: inv.id, title, body, url, event_type: 'invite_new',
  })
  if (notifError) console.error('proposeMealTogether 알림 insert 실패:', notifError)

  const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push', {
    body: { userIds: [toUserId], title, body, url },
  })
  if (pushError) console.warn('proposeMealTogether send-push 실패:', pushError)
  else if (pushResult?.failed > 0) console.warn('proposeMealTogether send-push 일부 실패:', pushResult.failures)

  return inv
}

// 내가 보낸, 아직 응답 없는 제안 목록 (같은 슬롯 중복 제안 방지용)
export async function getMyPendingInvitationsForDate(userId, date) {
  const { data, error } = await supabase
    .from('pot_invitations')
    .select('*')
    .eq('from_user_id', userId)
    .eq('date', date)
    .eq('status', 'pending')
  if (error) throw error
  return data
}

// 제안 수락: 밥팟 생성 + 양쪽 참여 처리. createPot/joinPot을 그대로 재사용한다
// (두 번째 joinPot이 notifyPotMembers를 통해 발신자에게 "참여했어요" 알림을 자동으로 보내준다).
export async function acceptPotInvitation(invitationId, userId) {
  const { data: inv, error } = await supabase
    .from('pot_invitations')
    .select('*')
    .eq('id', invitationId)
    .single()
  if (error) throw error
  if (inv.status !== 'pending') throw new Error('이미 처리된 제안이에요.')
  if (inv.to_user_id !== userId) throw new Error('내게 온 제안이 아니에요.')

  const pot = await createPot({
    groupId: inv.group_id,
    date: inv.date,
    slot: inv.slot,
    meal_time: inv.meal_time,
    end_time: null,
    title: inv.title || '같이 먹어요',
    menu: inv.menu,
    memo: null,
    max_people: inv.max_people || 2,
    is_public: false,
    is_default: false,
    createdBy: inv.from_user_id,
  })
  await joinPot(pot.id, inv.from_user_id)
  await joinPot(pot.id, userId)

  const { error: updateError } = await supabase
    .from('pot_invitations')
    .update({ status: 'accepted', pot_id: pot.id, responded_at: new Date().toISOString() })
    .eq('id', invitationId)
  if (updateError) throw updateError

  return pot
}

// 제안 거절: 상태 변경 + (선택) 거절 사유 저장. 발신자에게 거절 사유를 알림으로 보낸다.
export async function declinePotInvitation(invitationId, userId, reason) {
  const { data: inv, error: fetchError } = await supabase
    .from('pot_invitations')
    .select('from_user_id, to_user_id, status, slot')
    .eq('id', invitationId)
    .single()
  if (fetchError) throw fetchError
  if (inv.to_user_id !== userId) throw new Error('내게 온 제안이 아니에요.')
  if (inv.status !== 'pending') return

  const declineReason = reason?.trim() || null
  const { error } = await supabase
    .from('pot_invitations')
    .update({ status: 'declined', responded_at: new Date().toISOString(), decline_reason: declineReason })
    .eq('id', invitationId)
  if (error) throw error

  const { data: me } = await supabase.from('users').select('nickname').eq('id', userId).single()
  const title = '제안이 거절됐어요'
  const body = declineReason
    ? `${me?.nickname ?? '상대'}님이 ${inv.slot} 제안을 거절했어요: "${declineReason}"`
    : `${me?.nickname ?? '상대'}님이 ${inv.slot} 제안을 거절했어요.`
  const url = '/notifications'

  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: inv.from_user_id, invitation_id: invitationId, title, body, url, event_type: 'invite_declined',
  })
  if (notifError) console.error('declinePotInvitation 알림 insert 실패:', notifError)

  const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push', {
    body: { userIds: [inv.from_user_id], title, body, url },
  })
  if (pushError) console.warn('declinePotInvitation send-push 실패:', pushError)
  else if (pushResult?.failed > 0) console.warn('declinePotInvitation send-push 일부 실패:', pushResult.failures)
}

// 제안 취소: 발신자가 아직 상대가 응답하지 않은 제안을 거둬들인다.
export async function cancelPotInvitation(invitationId, userId) {
  const { data: inv, error: fetchError } = await supabase
    .from('pot_invitations')
    .select('from_user_id, status')
    .eq('id', invitationId)
    .single()
  if (fetchError) throw fetchError
  if (inv.from_user_id !== userId) throw new Error('내가 보낸 제안이 아니에요.')
  if (inv.status !== 'pending') return

  const { error } = await supabase
    .from('pot_invitations')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', invitationId)
  if (error) throw error
}

// ── 알림함 ──────────────────────────────────────────
// 날짜/그룹/밥팟 제목을 함께 보여주기 위해 밥팟·그룹 정보를 조인해서 가져온다.
export async function getMyNotifications(userId, limit = 50) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, meal_pots(title, date, slot, is_default, groups(name)), pot_invitations(id, date, slot, meal_time, title, menu, status, pot_id, decline_reason, groups(name))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function getUnreadNotificationCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw error
}

export async function joinPot(potId, userId) {
  const { error } = await supabase
    .from('pot_members')
    .upsert({ pot_id: potId, user_id: userId })
  if (error) throw error

  const { data: joined } = await supabase.from('users').select('nickname').eq('id', userId).single()
  await notifyPotMembers(potId, userId, {
    title: '같이 먹자',
    body: `${joined?.nickname ?? '누군가'}님이 밥팟에 참여했어요.`,
    eventType: 'join',
  })
}

// 게스트로 밥팟 참여: 익명 세션 발급 → 게스트 프로필 생성 → 참여. 게스트 프로필 반환.
export async function joinPotAsGuest(potId, nickname) {
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously()
  if (authError) throw authError
  const authId = authData.user.id

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .upsert(
      { auth_id: authId, nickname: nickname.trim() || '게스트', is_guest: true, guest_pot_id: potId, onboarded: true },
      { onConflict: 'auth_id' },
    )
    .select()
    .single()
  if (profileError) throw profileError

  await joinPot(potId, profile.id)
  return profile
}

// 게스트 홈: 참여한 밥팟 + 그룹명 + 같은 그룹·날짜의 본인 참여 팟 목록.
// 구성원/타인 상태는 노출하지 않는다.
export async function getGuestHome(potId) {
  const { data: pot, error } = await supabase
    .from('meal_pots')
    .select('*, groups(name), pot_members(user_id, users(nickname, is_guest, group_members(nickname, group_id)))')
    .eq('id', potId)
    .maybeSingle()
  if (error) throw error
  if (!pot) return null

  // 같은 그룹·날짜에서 내가 참여한 모든 팟
  const { data: { session } } = await supabase.auth.getSession()
  const { data: me } = await supabase
    .from('users').select('id').eq('auth_id', session.user.id).single()

  const { data: myParts } = await supabase
    .from('pot_members')
    .select('meal_pots!inner(*, pot_members(user_id, users(nickname, is_guest)))')
    .eq('user_id', me.id)
    .eq('meal_pots.group_id', pot.group_id)
    .eq('meal_pots.date', pot.date)

  const myPots = (myParts ?? []).map(r => r.meal_pots)
  return {
    groupName: pot.groups?.name ?? '',
    date: pot.date,
    slot: pot.slot,
    pots: myPots.length > 0 ? myPots : [pot],
  }
}

export async function leavePot(potId, userId) {
  const { data: left } = await supabase.from('users').select('nickname').eq('id', userId).single()

  // 알림함 INSERT 의 RLS는 "내가 이 팟의 멤버인가"를 검사한다.
  // pot_members 를 먼저 지워버리면 나가는 사람 본인이 더 이상 멤버가 아니게 되어
  // 알림 기록이 조용히 실패한다 — 그래서 삭제보다 먼저 알림을 보낸다.
  await notifyPotMembers(potId, userId, {
    title: '같이 먹자',
    body: `${left?.nickname ?? '누군가'}님이 밥팟에서 나갔어요.`,
    eventType: 'leave',
  })

  const { error } = await supabase
    .from('pot_members')
    .delete()
    .match({ pot_id: potId, user_id: userId })
  if (error) throw error
}

// 나간 뒤 기본팟이 아니고 멤버가 없으면 팟 자동 삭제
export async function leavePotWithCleanup(potId, userId) {
  const { data: pot } = await supabase
    .from('meal_pots')
    .select('is_default')
    .eq('id', potId)
    .single()

  const { data: members } = await supabase
    .from('pot_members')
    .select('user_id')
    .eq('pot_id', potId)

  if (!pot?.is_default && (members ?? []).length <= 1) {
    await deletePot(potId)
  } else {
    await leavePot(potId, userId)
  }
}

// ── 내 일정 ──────────────────────────────────────────
export async function getMySchedule(userId, fromDate, toDate) {
  const [statusRes, potRes] = await Promise.all([
    supabase.from('daily_status')
      .select('*').eq('user_id', userId).gte('date', fromDate).lte('date', toDate),
    supabase.from('pot_members')
      .select('meal_pots!inner(slot, meal_time, end_time, date)')
      .eq('user_id', userId)
      .gte('meal_pots.date', fromDate)
      .lte('meal_pots.date', toDate),
  ])
  if (statusRes.error) throw statusRes.error

  // 밥팟 참여 사실로 보정 — 참여중은 저장하지 않고 pot_members에서 파생
  const map = {}
  ;(statusRes.data ?? []).forEach(s => { map[`${s.date}:${s.slot}`] = { ...s } })
  ;(potRes.data ?? []).forEach(pm => {
    const mp = pm.meal_pots
    const key = `${mp.date}:${mp.slot}`
    const existing = map[key]
    map[key] = {
      user_id: userId, date: mp.date, slot: mp.slot,
      status: isPotTimeExpired(mp.date, mp.end_time) ? '참여완료' : '참여중',
      meal_time: mp.meal_time, end_time: mp.end_time,
      menu: existing?.menu ?? null, is_hidden: existing?.is_hidden ?? false,
    }
  })
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
}

// ── 그룹 공유 설정 (그룹 × 날짜 × 슬롯 단위) ─────────────
// 사전 조건: Supabase에 group_share_settings 테이블 생성 필요
// CREATE TABLE group_share_settings (
//   user_id uuid references users(id),
//   group_id uuid references groups(id),
//   date date,
//   slot text,
//   is_shared boolean default true,
//   primary key (user_id, group_id, date, slot)
// );
export async function getGroupShareSettings(userId, date) {
  const { data, error } = await supabase
    .from('group_share_settings')
    .select('group_id, slot, is_shared')
    .eq('user_id', userId)
    .eq('date', date)
  if (error) throw error
  return data
}

export async function setGroupShareSetting(userId, groupId, date, slot, isShared) {
  const { error } = await supabase
    .from('group_share_settings')
    .upsert(
      { user_id: userId, group_id: groupId, date, slot, is_shared: isShared },
      { onConflict: 'user_id,group_id,date,slot' }
    )
  if (error) throw error
}

// fromDate 이후 전체 날짜에 공유 설정 적용 (60일 범위)
export async function setGroupShareSettingBulk(userId, groupId, fromDate, slot, isShared) {
  if (isShared) {
    // true(공개)로 되돌릴 때 — 레코드 삭제로 기본값(공개) 복원
    const { error } = await supabase
      .from('group_share_settings')
      .delete()
      .eq('user_id', userId)
      .eq('group_id', groupId)
      .eq('slot', slot)
      .gte('date', fromDate)
    if (error) throw error
  } else {
    // false(비공개)로 — fromDate부터 60일치 레코드 upsert
    const rows = []
    const d = new Date(fromDate)
    for (let i = 0; i < 60; i++) {
      const dateStr = d.toISOString().slice(0, 10)
      rows.push({ user_id: userId, group_id: groupId, date: dateStr, slot, is_shared: false })
      d.setDate(d.getDate() + 1)
    }
    const { error } = await supabase
      .from('group_share_settings')
      .upsert(rows, { onConflict: 'user_id,group_id,date,slot' })
    if (error) throw error
  }
}

export async function updateNickname(userId, nickname) {
  const { error } = await supabase
    .from('users')
    .update({ nickname })
    .eq('id', userId)
  if (error) throw error
}

export async function uploadAvatar(userId, file) {
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('로그인이 필요합니다.')

  const ext = file.name.split('.').pop()
  const path = `${authUser.id}/avatar.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  const avatar_url = `${publicUrl}?t=${Date.now()}`

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url })
    .eq('id', userId)
  if (updateError) throw updateError

  return avatar_url
}

// 그룹 전용 닉네임 설정 (null 이면 기본 닉네임으로 복원)
export async function updateGroupNickname(userId, groupId, nickname) {
  const { error } = await supabase
    .from('group_members')
    .update({ nickname: nickname?.trim() || null })
    .match({ user_id: userId, group_id: groupId })
  if (error) throw error
}

// 그룹 무관하게 해당 슬롯의 참여 팟 전체 조회
export async function getMyPotsForSlotAllGroups(userId, date, slot) {
  const { data, error } = await supabase
    .from('pot_members')
    .select('pot_id, meal_pots!inner(id, title, meal_time, slot, date, group_id)')
    .eq('user_id', userId)
    .eq('meal_pots.date', date)
    .eq('meal_pots.slot', slot)
  if (error) throw error
  return data
}

export async function getMyPotsForSlot(userId, groupId, date, slot) {
  const { data, error } = await supabase
    .from('pot_members')
    .select('pot_id, meal_pots!inner(id, title, meal_time, slot, date, group_id)')
    .eq('user_id', userId)
    .eq('meal_pots.group_id', groupId)
    .eq('meal_pots.date', date)
    .eq('meal_pots.slot', slot)
  if (error) throw error
  return data
}

export async function updatePotCreator(potId, newCreatorId) {
  const { error } = await supabase
    .from('meal_pots')
    .update({ created_by: newCreatorId })
    .eq('id', potId)
  if (error) throw error
}

export async function deletePot(potId) {
  const { error } = await supabase
    .from('meal_pots')
    .delete()
    .eq('id', potId)
  if (error) throw error
}

export async function updatePot(potId, { meal_time, end_time, title, menu, memo, max_people, is_public, icon }, lastModifiedBy = null) {
  const patch = { meal_time, end_time: end_time || null, title, menu: menu || null, memo: memo || null, max_people, is_public, icon: icon || null }
  if (lastModifiedBy) { patch.last_modified_by = lastModifiedBy; patch.last_modified_at = new Date().toISOString() }
  const { error } = await supabase.from('meal_pots').update(patch).eq('id', potId)
  if (error) throw error
}

// ── 그룹 기본 밥팟 설정 ────────────────────────────────
export async function getGroupDefaultPotConfigs(groupId) {
  const { data, error } = await supabase
    .from('group_default_pot_configs')
    .select('*, users(nickname)')
    .eq('group_id', groupId)
    .order('slot')
  if (error) throw error
  return data ?? []
}

export async function insertGroupDefaultPotConfig({ groupId, slot, meal_time, end_time, title, memo, max_people, is_public, effective_from, repeat_days, lastModifiedBy, icon }) {
  const { error } = await supabase
    .from('group_default_pot_configs')
    .insert({
      group_id: groupId, slot, meal_time, end_time: end_time || null,
      title, memo: memo || null, max_people, is_public, effective_from,
      repeat_days: repeat_days ?? [1, 2, 3, 4, 5],
      last_modified_by: lastModifiedBy, updated_at: new Date().toISOString(),
      icon: icon || null,
    })
  if (error) throw error
}

export async function updateGroupDefaultPotConfig(id, { slot, meal_time, end_time, title, memo, max_people, is_public, effective_from, repeat_days, lastModifiedBy, icon }) {
  const { error } = await supabase
    .from('group_default_pot_configs')
    .update({
      slot, meal_time, end_time: end_time || null,
      title, memo: memo || null, max_people, is_public, effective_from,
      repeat_days: repeat_days ?? [1, 2, 3, 4, 5],
      last_modified_by: lastModifiedBy, updated_at: new Date().toISOString(),
      icon: icon || null,
    })
    .eq('id', id)
  if (error) throw error

  // 적용 시작일 이후로 이미 예전 설정으로 자동 생성돼 있던 기본팟은 지운다.
  // (ensureDefaultPots가 다음 로드 때 새 설정으로 다시 만들어주므로, 적용 시작일부터 즉시 반영된다.)
  await supabase
    .from('meal_pots')
    .delete()
    .eq('config_id', id)
    .eq('is_default', true)
    .gte('date', effective_from)
}

export async function deleteGroupDefaultPotConfig(id, fromDate) {
  // 오늘(또는 지정일) 이후 이 설정으로 자동 생성된 기본팟도 함께 제거
  if (fromDate) {
    await supabase
      .from('meal_pots')
      .delete()
      .eq('config_id', id)
      .eq('is_default', true)
      .gte('date', fromDate)
  }
  const { error } = await supabase
    .from('group_default_pot_configs')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// 기본팟 설정이 있는데 해당 날짜에 아직 팟이 없으면 자동 생성 (config_id 기준으로 중복 방지)
export async function ensureDefaultPots(groupId, date, configs) {
  if (!configs || configs.length === 0) return
  const weekday = new Date(`${date}T00:00:00`).getDay()
  const applicable = configs.filter(c => c.effective_from <= date && (c.repeat_days ?? [1, 2, 3, 4, 5]).includes(weekday))
  if (applicable.length === 0) return

  const { data: existing } = await supabase
    .from('meal_pots').select('config_id').eq('group_id', groupId).eq('date', date).eq('is_default', true)
  const existingConfigIds = new Set((existing ?? []).map(p => p.config_id).filter(Boolean))

  const toCreate = applicable.filter(c => !existingConfigIds.has(c.id))
  if (toCreate.length === 0) return

  const rows = toCreate.map(c => ({
    group_id: groupId, date, slot: c.slot,
    meal_time: c.meal_time, end_time: c.end_time || null,
    title: c.title, menu: null, memo: c.memo || null,
    max_people: c.max_people, is_public: c.is_public,
    is_default: true, created_by: null,
    last_modified_by: c.last_modified_by,
    config_id: c.id,
    icon: c.icon || null,
  }))
  // 유니크 제약(config_id+date) 위반 시 무시 (동시 요청 경합 방지)
  for (const row of rows) {
    await supabase.from('meal_pots').insert(row)
  }
}

export async function updatePotMenu(potId, menu) {
  const { error } = await supabase
    .from('meal_pots')
    .update({ menu: menu || null })
    .eq('id', potId)
  if (error) throw error
}

// ── 밥팟 코멘트 ──────────────────────────────────────
export async function getPotComments(potId) {
  const { data, error } = await supabase
    .from('pot_comments')
    .select('id, content, created_at, user_id, users(nickname, is_guest, avatar_url)')
    .eq('pot_id', potId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addPotComment(potId, userId, content) {
  const trimmed = content.trim()
  const { data, error } = await supabase
    .from('pot_comments')
    .insert({ pot_id: potId, user_id: userId, content: trimmed })
    .select('id, content, created_at, user_id, users(nickname, is_guest, avatar_url)')
    .single()
  if (error) throw error

  const preview = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
  await notifyPotMembers(potId, userId, {
    title: '같이 먹자',
    body: `${data.users?.nickname ?? '누군가'}: ${preview}`,
    eventType: 'comment',
  })

  return data
}

export async function deletePotComment(commentId, userId) {
  const { error } = await supabase
    .from('pot_comments')
    .delete()
    .match({ id: commentId, user_id: userId })
  if (error) throw error
}

// ── 밥팟 사진 ──────────────────────────────────────
export async function getPotPhotos(potId) {
  const { data, error } = await supabase
    .from('pot_photos')
    .select('id, photo_url, created_at, user_id, users(nickname, is_guest)')
    .eq('pot_id', potId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// blob: PhotoAdjustModal에서 정사각형으로 잘라 재인코딩한 JPEG 이미지
export async function addPotPhoto(potId, userId, blob) {
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('로그인이 필요합니다.')

  const path = `${authUser.id}/${potId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('pot-photos')
    .upload(path, blob, { cacheControl: '3600', contentType: 'image/jpeg' })
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage.from('pot-photos').getPublicUrl(path)

  const { data, error } = await supabase
    .from('pot_photos')
    .insert({ pot_id: potId, user_id: userId, photo_url: publicUrl })
    .select('id, photo_url, created_at, user_id, users(nickname, is_guest)')
    .single()
  if (error) throw error
  return data
}

export async function deletePotPhoto(photoId, userId) {
  const { error } = await supabase
    .from('pot_photos')
    .delete()
    .match({ id: photoId, user_id: userId })
  if (error) throw error
}

// ── 모먼트 (종료된 밥팟의 사진/코멘트 공유: 참여자만 / 그룹공유 / 전체공유) ────
// scope: 'participants' | 'group' | 'public'. RLS 우회 없이 pot_members 참여 여부를
// 서버(RPC)에서 검증하므로, 밥팟 참여자면 누구나 호출 가능 (수정 권한자 아니어도 됨).
export async function setPotMomentScope(potId, scope) {
  const { error } = await supabase.rpc('set_pot_moment_scope', { p_pot_id: potId, p_scope: scope })
  if (error) throw error
}

// 목록 렌더링(MomentCard)에 실제로 쓰는 컬럼만 명시 — '*'로 memo 등 불필요한 컬럼까지
// 매번 끌어오지 않도록 함.
const MOMENT_POT_SELECT = 'id, group_id, date, slot, meal_time, end_time, title, menu, moment_scope, ' +
  'pot_members(user_id, users(nickname, avatar_url, is_guest, group_members(nickname, group_id))), pot_comments(count)'

// 커서 기반 페이지네이션 페이지 크기. 한 번에 이 개수만큼만 가져오고, 화면에서
// 스크롤이 끝에 닿으면 마지막으로 받은 날짜를 커서 삼아 다음 페이지를 더 가져온다.
const MOMENT_PAGE_SIZE = 20

// "내 그룹" 모먼트 피드: 내 그룹에 방송된(그룹공유·전체공유) 밥팟 + 범위와 무관하게
// 내가 직접 참여했던 밥팟을 합쳐서 반환한다 (참여자만 범위여도 본인에게는 보임).
// cursorDate가 없으면 todayStr 이하(오늘 포함)부터, 있으면 그 날짜보다 이전 것부터 최대
// MOMENT_PAGE_SIZE건 가져온다. 오늘 밥팟 중 아직 안 끝난 건 호출부(isPotEnded)에서 걸러낸다.
// 반환값의 nextCursor로 다음 페이지를, hasMore로 더 가져올 게 남았는지 확인한다.
export async function getGroupMomentPots(groupIds, userId, todayStr, cursorDate = null) {
  if (!groupIds || groupIds.length === 0) return { pots: [], nextCursor: null, hasMore: false }

  let broadcastQuery = supabase
    .from('meal_pots')
    .select(MOMENT_POT_SELECT)
    .in('group_id', groupIds)
    .in('moment_scope', ['group', 'public'])
  broadcastQuery = cursorDate ? broadcastQuery.lt('date', cursorDate) : broadcastQuery.lte('date', todayStr)

  let ownQuery = supabase
    .from('pot_members')
    .select(`meal_pots!inner(${MOMENT_POT_SELECT})`)
    .eq('user_id', userId)
    .in('meal_pots.group_id', groupIds)
  ownQuery = cursorDate ? ownQuery.lt('meal_pots.date', cursorDate) : ownQuery.lte('meal_pots.date', todayStr)

  const [broadcastRes, ownRes] = await Promise.all([
    broadcastQuery.order('date', { ascending: false }).limit(MOMENT_PAGE_SIZE),
    ownQuery.order('date', { ascending: false, referencedTable: 'meal_pots' }).limit(MOMENT_PAGE_SIZE),
  ])
  if (broadcastRes.error) throw broadcastRes.error
  if (ownRes.error) throw ownRes.error

  const rawDates = [...broadcastRes.data.map(p => p.date), ...ownRes.data.map(r => r.meal_pots.date)]
  const byId = new Map()
  for (const pot of broadcastRes.data) byId.set(pot.id, pot)
  for (const row of ownRes.data) byId.set(row.meal_pots.id, row.meal_pots)
  const pots = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date))

  // 두 소스 중 하나라도 페이지 꽉 채워 왔으면 더 남았을 가능성 있음 (보수적으로 잡음).
  const hasMore = broadcastRes.data.length === MOMENT_PAGE_SIZE || ownRes.data.length === MOMENT_PAGE_SIZE
  // 다음 커서는 이번에 받은 원본 로우들(중복 제거 전) 중 가장 오래된 날짜 — 경계에서 항목이
  // 씹히지 않도록 병합·중복제거된 pots가 아니라 rawDates 기준으로 잡는다.
  const nextCursor = hasMore && rawDates.length > 0 ? rawDates.reduce((a, b) => (a < b ? a : b)) : null

  return { pots, nextCursor, hasMore: hasMore && nextCursor !== null }
}

// "전체" 모먼트 피드: 그룹 소속과 무관하게 전체공유로 설정된 밥팟을 앱 전체에서 조회.
export async function getPublicMomentPots(todayStr, cursorDate = null) {
  let query = supabase
    .from('meal_pots')
    .select(`${MOMENT_POT_SELECT}, groups(name)`)
    .eq('moment_scope', 'public')
  query = cursorDate ? query.lt('date', cursorDate) : query.lte('date', todayStr)

  const { data, error } = await query.order('date', { ascending: false }).limit(MOMENT_PAGE_SIZE)
  if (error) throw error

  const hasMore = data.length === MOMENT_PAGE_SIZE
  const nextCursor = hasMore ? data[data.length - 1].date : null
  return { pots: data, nextCursor, hasMore }
}

// ── 가고 싶은 식당 (내 계정 > 가고 싶은데...) ──────────────
// 지금은 본인 것만 조회/작성 가능(RLS). wish_place_shares로 그룹별 공개 범위를 함께 가져온다.
export async function getWishPlaces(userId) {
  const { data, error } = await supabase
    .from('wish_places')
    .select('*, wish_place_shares(group_id)')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

// 위시 항목의 그룹 공개 범위를 통째로 교체한다. groupIds가 비어있으면 나만 보기(비공개).
export async function setWishPlaceShares(wishPlaceId, groupIds) {
  const { error: delError } = await supabase
    .from('wish_place_shares')
    .delete()
    .eq('wish_place_id', wishPlaceId)
  if (delError) throw delError

  if (groupIds.length > 0) {
    const { error: insError } = await supabase
      .from('wish_place_shares')
      .insert(groupIds.map(group_id => ({ wish_place_id: wishPlaceId, group_id })))
    if (insError) throw insError
  }
}

export async function addWishPlace(userId, content) {
  const { data: last, error: lastError } = await supabase
    .from('wish_places')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (lastError) throw lastError
  const nextOrder = (last?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('wish_places')
    .insert({ user_id: userId, content, sort_order: nextOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateWishPlace(id, content) {
  const { error } = await supabase
    .from('wish_places')
    .update({ content })
    .eq('id', id)
  if (error) throw error
}

export async function deleteWishPlace(id) {
  const { error } = await supabase
    .from('wish_places')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function updateWishPlaceOrder(userId, orders) {
  // orders: [{ id, sort_order, content }, ...] — content도 함께 보내야 한다.
  // upsert는 충돌 여부와 무관하게 NOT NULL 컬럼이 빠지면 insert 시도 단계에서 바로 실패한다.
  if (orders.length === 0) return
  const { error } = await supabase
    .from('wish_places')
    .upsert(orders.map(({ id, sort_order, content }) => ({ id, sort_order, content, user_id: userId })))
  if (error) throw error
}

// 친구 관리 화면에서 상대방의 위시 리스트를 볼 때 사용. wish_places RLS는 본인만
// 허용하므로 friend_requests(accepted)/같은 그룹 여부(+ 그룹 제한)를 확인하는 RPC를 거친다.
export async function getFriendWishPlaces(targetUserId) {
  const { data, error } = await supabase.rpc('get_friend_wish_places', { target_user_id: targetUserId })
  if (error) throw error
  return data
}

// 친구의 위시 항목에 "같이 가고 싶어요" 제안을 보낸다. proposeMealTogether와 동일한 순서:
// insert -> 보낸 사람 닉네임 조회 -> 알림함 기록 -> 푸시 발송. 알림/푸시 실패는 propose 자체를 막지 않는다.
export async function proposeWishPlace({ wishPlaceId, fromUserId, toUserId, groupId, message }) {
  const { data: proposal, error } = await supabase
    .from('wish_place_proposals')
    .insert({
      wish_place_id: wishPlaceId, from_user_id: fromUserId, to_user_id: toUserId,
      group_id: groupId || null, message: message || null,
    })
    .select()
    .single()
  if (error) throw error

  const { data: from } = await supabase.from('users').select('nickname').eq('id', fromUserId).single()
  // wish_places SELECT RLS는 본인 것만 허용 — 남의 항목 내용은 RLS 우회 RPC로 가져온다.
  const { data: wishContent } = await supabase.rpc('get_wish_place_content', { p_wish_place_id: wishPlaceId })
  const shortContent = wishContent ? (wishContent.length > 20 ? `${wishContent.slice(0, 20)}…` : wishContent) : '가고 싶은 곳'
  const title = '가고 싶은 곳에 제안이 왔어요'
  const body = `${from?.nickname ?? '누군가'}님이 "${shortContent}" 같이 가고 싶대요.`
  const url = '/account?tab=wish'

  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: toUserId, wish_place_proposal_id: proposal.id, title, body, url, event_type: 'wish_propose',
  })
  if (notifError) console.error('proposeWishPlace 알림 insert 실패:', notifError)

  const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push', {
    body: { userIds: [toUserId], title, body, url },
  })
  if (pushError) console.warn('proposeWishPlace send-push 실패:', pushError)
  else if (pushResult?.failed > 0) console.warn('proposeWishPlace send-push 일부 실패:', pushResult.failures)

  return proposal
}

// 친구의 위시리스트를 열 때 "이미 제안한 항목"을 표시하기 위해 한 번 불러온다.
export async function getMySentWishProposals(toUserId) {
  const { data, error } = await supabase.rpc('get_my_sent_wish_proposals', { p_to_user_id: toUserId })
  if (error) throw error
  return data
}

// 내 계정 화면에서 내 위시 항목들에 누가 관심을 보였는지 한 번에 조회.
export async function getMyWishPlaceProposals() {
  const { data, error } = await supabase.rpc('get_my_wish_place_proposals')
  if (error) throw error
  return data
}

export async function deleteWishPlaceProposal(id) {
  const { error } = await supabase.from('wish_place_proposals').delete().eq('id', id)
  if (error) throw error
}
