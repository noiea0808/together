import { supabase } from './supabase'

// ── Auth ──────────────────────────────────────────
export async function signUp(email, password, nickname) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error

  const authUser = data.user
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .insert({ auth_id: authUser.id, email, nickname })
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

export async function getSessionUser() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', session.user.id)
    .single()
  if (error) return null
  return data
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
    .upsert({ group_id: groupId, user_id: userId })
  if (error) throw error
}

export async function getMyGroups(userId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, groups(*)')
    .eq('user_id', userId)
  if (error) throw error
  return data.map(d => d.groups)
}

export async function getGroupMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, users(*)')
    .eq('group_id', groupId)
  if (error) throw error
  return data.map(d => d.users)
}

// ── 슬롯 상태 (유저 기준 단일 레코드) ────────────────
export async function upsertStatus({ userId, date, slot, status, meal_time, menu }) {
  const { error } = await supabase
    .from('daily_status')
    .upsert({
      user_id: userId,
      date,
      slot,
      status,
      meal_time: meal_time || null,
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
        status: '참여중', meal_time: mp.meal_time,
        menu: existing?.menu ?? null, is_hidden: existing?.is_hidden ?? false,
      }
    } else if (!existing || existing.status !== '참여중') {
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
      .select('user_id, meal_pots!inner(group_id, slot, meal_time, date)')
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
    .select('group_id, user_id, users(*)')
    .in('group_id', groupIds)
  if (mErr) throw mErr

  const membersMap = {}
  const membersByGroup = {}   // groupId -> memberId[]
  const memberIdSet = new Set()
  groupIds.forEach(gid => { membersMap[gid] = []; membersByGroup[gid] = [] })
  memberRows.forEach(r => {
    membersMap[r.group_id].push(r.users)
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
      .select('*, pot_members(user_id, users(nickname)), modifier:users!last_modified_by(nickname)').in('group_id', groupIds).eq('date', date),
    supabase.from('pot_members')
      .select('user_id, meal_pots!inner(group_id, slot, meal_time, date)')
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
export async function createPot({ groupId, date, slot, meal_time, end_time, title, menu, memo, max_people, is_public, is_default, createdBy }) {
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
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getGroupPots(groupId, date) {
  const { data, error } = await supabase
    .from('meal_pots')
    .select('*, pot_members(user_id, users(nickname)), modifier:users!last_modified_by(nickname)')
    .eq('group_id', groupId)
    .eq('date', date)
  if (error) throw error
  return data
}

export async function getPot(potId) {
  const { data, error } = await supabase
    .from('meal_pots')
    .select('*, pot_members(user_id, users(nickname)), modifier:users!last_modified_by(nickname)')
    .eq('id', potId)
    .single()
  if (error) throw error
  return data
}

export async function joinPot(potId, userId) {
  const { error } = await supabase
    .from('pot_members')
    .upsert({ pot_id: potId, user_id: userId })
  if (error) throw error
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
      .select('meal_pots!inner(slot, meal_time, date)')
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
      status: '참여중', meal_time: mp.meal_time,
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
