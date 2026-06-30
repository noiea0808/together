// 회원 탈퇴 Edge Function
// 호출자의 JWT로 본인 확인 후, service_role 권한으로
// 앱 데이터 + auth.users 레코드를 완전히 삭제한다.
//
// 배포:  supabase functions deploy delete-account
// 호출:  supabase.functions.invoke('delete-account')  (access token 자동 첨부)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. 호출자 신원 확인 (전달된 access token 으로)
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  // 2. service_role 클라이언트로 RLS 우회하여 정리
  const admin = createClient(url, serviceKey)

  const { data: profile } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  if (profile) {
    const uid = profile.id
    // 자식 데이터부터 정리 (FK 제약 회피)
    await admin.from('pot_members').delete().eq('user_id', uid)
    await admin.from('daily_status').delete().eq('user_id', uid)
    await admin.from('group_share_settings').delete().eq('user_id', uid)
    await admin.from('group_members').delete().eq('user_id', uid)
    await admin.from('user_term_agreements').delete().eq('user_id', uid)
    await admin.from('users').delete().eq('id', uid)
  }

  // 3. auth 계정 영구 삭제
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) return json({ error: delErr.message }, 500)

  return json({ success: true })
})
