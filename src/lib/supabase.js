import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 환경변수가 없습니다.')
}

// PKCE 플로우 — OAuth 콜백에 access_token을 평문으로 싣는 implicit 대신 code 하나만 오가게
// 한다. 웹은 detectSessionInUrl(기본 true)이 code를 그대로 스캔해 교환하므로 동작 그대로다.
// 커패시터 네이티브 앱은 커스텀 스킴 왕복 구간(로그캣 등에 노출될 수 있음)이 있어 필수.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' },
})
