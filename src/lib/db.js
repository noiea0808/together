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

export async function getGroupStatuses(groupId, date) {
  const { data: members, error: mErr } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
  if (mErr) throw mErr

  const memberIds = members.map(m => m.user_id)
  if (memberIds.length === 0) return []

  // 이 그룹에서 비공유로 설정된 (user_id, slot) 쌍 조회
  const { data: hiddenRows } = await supabase
    .from('group_share_settings')
    .select('user_id, slot')
    .eq('group_id', groupId)
    .eq('date', date)
    .eq('is_shared', false)

  const hiddenSet = new Set((hiddenRows ?? []).map(r => `${r.user_id}:${r.slot}`))

  const { data: statusRows, error } = await supabase
    .from('daily_status')
    .select('*')
    .in('user_id', memberIds)
    .eq('date', date)
  if (error) throw error

  // (user_id:slot) -> 상태 레코드
  const map = {}
  ;(statusRows ?? []).forEach(s => { map[`${s.user_id}:${s.slot}`] = { ...s } })

  // 밥팟 참여라는 "사실"로 상태 보정 — 저장된 status보다 우선
  // 이 그룹 팟 참여 → 참여중 / 다른 그룹 팟 참여 → 약속있음(closed)
  const { data: potRows } = await supabase
    .from('pot_members')
    .select('user_id, meal_pots!inner(group_id, slot, meal_time, date)')
    .in('user_id', memberIds)
    .eq('meal_pots.date', date)

  ;(potRows ?? []).forEach(pm => {
    const mp = pm.meal_pots
    const key = `${pm.user_id}:${mp.slot}`
    const existing = map[key]
    if (mp.group_id === groupId) {
      // 이 그룹 팟 참여 — 최우선
      map[key] = {
        user_id: pm.user_id, date, slot: mp.slot,
        status: '참여중', meal_time: mp.meal_time,
        menu: existing?.menu ?? null, is_hidden: existing?.is_hidden ?? false,
      }
    } else if (!existing || existing.status !== '참여중') {
      // 다른 그룹 팟 참여 — 세부정보는 비노출
      map[key] = {
        user_id: pm.user_id, date, slot: mp.slot,
        status: 'closed', meal_time: null, menu: null,
        is_hidden: existing?.is_hidden ?? false,
      }
    }
  })

  return Object.values(map).filter(s => !hiddenSet.has(`${s.user_id}:${s.slot}`))
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
export async function createPot({ groupId, date, slot, meal_time, end_time, title, menu, max_people, is_public, is_default, createdBy }) {
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
    .select('*, pot_members(user_id, users(nickname))')
    .eq('group_id', groupId)
    .eq('date', date)
  if (error) throw error
  return data
}

export async function getPot(potId) {
  const { data, error } = await supabase
    .from('meal_pots')
    .select('*, pot_members(user_id, users(nickname))')
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
  const { data, error } = await supabase
    .from('daily_status')
    .select('*')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true })
  if (error) throw error
  return data
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

export async function updatePot(potId, { meal_time, end_time, title, menu, max_people, is_public }) {
  const { error } = await supabase
    .from('meal_pots')
    .update({ meal_time, end_time: end_time || null, title, menu: menu || null, max_people, is_public })
    .eq('id', potId)
  if (error) throw error
}

export async function updatePotMenu(potId, menu) {
  const { error } = await supabase
    .from('meal_pots')
    .update({ menu: menu || null })
    .eq('id', potId)
  if (error) throw error
}
