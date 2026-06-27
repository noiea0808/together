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

// ── 슬롯 상태 ──────────────────────────────────────
export async function upsertStatus({ userId, groupId, date, slot, status, meal_time, menu }) {
  const { error } = await supabase
    .from('daily_status')
    .upsert({
      user_id: userId,
      group_id: groupId,
      date,
      slot,
      status,
      meal_time: meal_time || null,
      menu: menu || null,
    }, { onConflict: 'user_id,group_id,date,slot' })
  if (error) throw error
}

export async function deleteStatus({ userId, groupId, date, slot }) {
  const { error } = await supabase
    .from('daily_status')
    .delete()
    .match({ user_id: userId, group_id: groupId, date, slot })
  if (error) throw error
}

export async function getGroupStatuses(groupId, date) {
  const { data, error } = await supabase
    .from('daily_status')
    .select('*, users(nickname)')
    .eq('group_id', groupId)
    .eq('date', date)
  if (error) throw error
  return data
}

// ── 밥팟 ──────────────────────────────────────────
export async function createPot({ groupId, date, slot, meal_time, title, max_people, is_public, is_default, createdBy }) {
  const { data, error } = await supabase
    .from('meal_pots')
    .insert({
      group_id: groupId,
      date,
      slot,
      meal_time,
      title,
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
