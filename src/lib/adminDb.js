import { adminSupabase } from './adminSupabase'

// 관리자 전용 데이터 조회/수정. 반드시 adminSupabase(관리자 세션)로 요청해야
// RLS의 app_is_admin() 이 이 요청을 보낸 관리자 계정 기준으로 통과한다.
export async function getAllUsersAdmin() {
  const [{ data: users, error: usersError }, { data: terms, error: termsError }] = await Promise.all([
    adminSupabase
      .from('users')
      .select('id, nickname, email, is_admin, is_guest, onboarded, birthdate, lifestyle, created_at, last_login_at, group_members(count), pot_members(count), user_term_agreements(term_id)')
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('terms')
      .select('id, title, is_required, is_active')
      .order('sort_order', { ascending: true }),
  ])
  if (usersError) throw usersError
  if (termsError) throw termsError

  const requiredActiveTerms = (terms ?? []).filter(t => t.is_required && t.is_active)

  return users.map(u => {
    const agreedIds = new Set((u.user_term_agreements ?? []).map(a => a.term_id))
    return {
      ...u,
      group_count: u.group_members?.[0]?.count ?? 0,
      pot_count: u.pot_members?.[0]?.count ?? 0,
      agreed_required_count: requiredActiveTerms.filter(t => agreedIds.has(t.id)).length,
      required_total_count: requiredActiveTerms.length,
      agreed_term_titles: (terms ?? []).filter(t => agreedIds.has(t.id)).map(t => t.title),
    }
  })
}

export async function setUserAdminFlag(userId, isAdmin) {
  const { data, error } = await adminSupabase
    .from('users')
    .update({ is_admin: isAdmin })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

// 앱 데이터 + auth.users 레코드까지 완전히 삭제 (service_role 권한이 필요해 Edge Function 경유)
export async function deleteUserAdmin(userId) {
  const { data, error } = await adminSupabase.functions.invoke('admin-delete-user', {
    body: { userId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

// ── 점심 상태 리마인드 알림 설정 ──────────────────────
export async function getLunchReminderConfig() {
  const { data, error } = await adminSupabase.from('lunch_reminder_config').select('*').eq('id', true).single()
  if (error) throw error
  return data
}

export async function updateLunchReminderConfig(patch) {
  const { data, error } = await adminSupabase
    .from('lunch_reminder_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getHolidays(year) {
  const { data, error } = await adminSupabase
    .from('holidays')
    .select('*')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true })
  if (error) throw error
  return data
}

export async function addHoliday(date, name) {
  const { data, error } = await adminSupabase.from('holidays').insert({ date, name }).select().single()
  if (error) throw error
  return data
}

export async function deleteHoliday(date) {
  const { error } = await adminSupabase.from('holidays').delete().eq('date', date)
  if (error) throw error
}

// ── 신고/제재 ──────────────────────────────────────────
export async function getAllReportsAdmin() {
  const { data, error } = await adminSupabase
    .from('reports')
    .select('*, reporter:reporter_id(id, nickname, email), resolver:resolved_by(id, nickname)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function resolveReportAdmin(reportId, adminId, status, actionTaken = null) {
  const { data, error } = await adminSupabase
    .from('reports')
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: adminId, action_taken: actionTaken })
    .eq('id', reportId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function suspendUserAdmin(userId, reason, until = null) {
  const { data, error } = await adminSupabase
    .from('users')
    .update({ is_suspended: true, suspended_reason: reason, suspended_until: until })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function unsuspendUserAdmin(userId) {
  const { data, error } = await adminSupabase
    .from('users')
    .update({ is_suspended: false, suspended_reason: null, suspended_until: null })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── 사용자 의견 ────────────────────────────────────────
export async function getAllFeedbackAdmin() {
  const { data, error } = await adminSupabase
    .from('feedback')
    .select('*, user:user_id(id, nickname, email), replier:replied_by(id, nickname)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function replyToFeedbackAdmin(feedbackId, adminId, userId, reply) {
  const { data, error } = await adminSupabase
    .from('feedback')
    .update({ reply, status: 'answered', replied_at: new Date().toISOString(), replied_by: adminId })
    .eq('id', feedbackId)
    .select()
    .single()
  if (error) throw error

  const { error: notifError } = await adminSupabase.from('notifications').insert({
    user_id: userId, title: '의견에 답변이 달렸어요', body: reply, url: '/account', event_type: 'feedback_reply',
  })
  if (notifError) console.error('feedback reply 알림 insert 실패:', notifError)

  const { error: pushError } = await adminSupabase.functions.invoke('send-push', {
    body: { userIds: [userId], title: '의견에 답변이 달렸어요', body: reply, url: '/account' },
  })
  if (pushError) console.warn('feedback reply send-push 실패:', pushError)

  return data
}
