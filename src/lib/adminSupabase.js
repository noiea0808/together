import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 환경변수가 없습니다.')
}

// 일반 회원 세션(src/lib/supabase.js)과 별도의 storageKey를 사용해,
// 같은 브라우저에서도 관리자 로그인과 일반 로그인이 서로 영향을 주지 않는다.
export const adminSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'gachi-admin-auth',
    persistSession: true,
    autoRefreshToken: true,
  },
})
