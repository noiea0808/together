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

export async function signInWithGoogle() {
  // 밥팟 링크 등에서 넘어온 경우 OAuth 후 원래 위치로 복귀
  const returnTo = sessionStorage.getItem('returnTo') || '/today'
  sessionStorage.removeItem('returnTo')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + returnTo },
  })
  if (error) throw error
}

export async function signInWithKakao() {
  // 밥팟 링크 등에서 넘어온 경우 OAuth 후 원래 위치로 복귀
  const returnTo = sessionStorage.getItem('returnTo') || '/today'
  sessionStorage.removeItem('returnTo')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: window.location.origin + returnTo },
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
      .select('*, pot_members(user_id, users(nickname, is_guest, group_members(nickname, group_id))), modifier:users!last_modified_by(nickname)').in('group_id', groupIds).eq('date', date),
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

export async function createPot({ groupId, date, slot, meal_time, end_time, title, menu, memo, max_people, is_public, is_default, createdBy }) {
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
    .select('*, pot_members(user_id, users(nickname, is_guest, group_members(nickname, group_id))), modifier:users!last_modified_by(nickname)')
    .eq('group_id', groupId)
    .eq('date', date)
  if (error) throw error
  return data
}

export async function getPot(potId) {
  const { data, error } = await supabase
    .from('meal_pots')
    .select('*, pot_members(user_id, users(nickname, is_guest, group_members(nickname, group_id))), modifier:users!last_modified_by(nickname)')
    .eq('id', potId)
    .maybeSingle()
  if (error) throw error
  return data // 삭제됐으면 null
}

export async function joinPot(potId, userId) {
  const { error } = await supabase
    .from('pot_members')
    .upsert({ pot_id: potId, user_id: userId })
  if (error) throw error
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

export async function updatePot(potId, { meal_time, end_time, title, menu, memo, max_people, is_public }, lastModifiedBy = null) {
  const patch = { meal_time, end_time: end_time || null, title, menu: menu || null, memo: memo || null, max_people, is_public }
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

export async function insertGroupDefaultPotConfig({ groupId, slot, meal_time, end_time, title, memo, max_people, is_public, effective_from, lastModifiedBy }) {
  const { error } = await supabase
    .from('group_default_pot_configs')
    .insert({
      group_id: groupId, slot, meal_time, end_time: end_time || null,
      title, memo: memo || null, max_people, is_public, effective_from,
      last_modified_by: lastModifiedBy, updated_at: new Date().toISOString(),
    })
  if (error) throw error
}

export async function updateGroupDefaultPotConfig(id, { slot, meal_time, end_time, title, memo, max_people, is_public, effective_from, lastModifiedBy }) {
  const { error } = await supabase
    .from('group_default_pot_configs')
    .update({
      slot, meal_time, end_time: end_time || null,
      title, memo: memo || null, max_people, is_public, effective_from,
      last_modified_by: lastModifiedBy, updated_at: new Date().toISOString(),
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
  const applicable = configs.filter(c => c.effective_from <= date)
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
