import { adminSupabase } from './adminSupabase'

// 일반 회원 로그인(signIn, src/lib/db.js)과는 완전히 분리된 관리자 전용 로그인.
// 같은 auth.users 계정을 쓰더라도, 세션은 adminSupabase(별도 storageKey)에만 저장된다.
export async function adminSignIn(email, password) {
  const { data, error } = await adminSupabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  const { data: profile, error: profileError } = await adminSupabase
    .from('users')
    .select('*')
    .eq('auth_id', data.user.id)
    .single()
  if (profileError) throw profileError

  if (!profile.is_admin) {
    await adminSupabase.auth.signOut()
    throw new Error('관리자 권한이 없는 계정입니다.')
  }
  return profile
}

export async function adminSignOut() {
  await adminSupabase.auth.signOut()
}

export async function getAdminSessionUser() {
  const { data: { session } } = await adminSupabase.auth.getSession()
  if (!session) return null

  const { data, error } = await adminSupabase
    .from('users')
    .select('*')
    .eq('auth_id', session.user.id)
    .single()
  if (error || !data?.is_admin) return null
  return data
}
