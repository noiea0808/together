import { adminSupabase } from './adminSupabase'

// 관리자 전용 데이터 조회/수정. 반드시 adminSupabase(관리자 세션)로 요청해야
// RLS의 app_is_admin() 이 이 요청을 보낸 관리자 계정 기준으로 통과한다.
export async function getAllUsersAdmin() {
  const [{ data: users, error: usersError }, { data: terms, error: termsError }] = await Promise.all([
    adminSupabase
      .from('users')
      .select('id, nickname, email, is_admin, is_guest, onboarded, birthdate, lifestyle, created_at, group_members(count), user_term_agreements(term_id)')
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
