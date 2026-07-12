// 관리자용 사용자 강제 삭제 Edge Function
// 호출자가 관리자(is_admin=true)인지 확인한 뒤, service_role 권한으로
// 대상 사용자의 앱 데이터 + auth.users 레코드를 완전히 삭제한다.
// delete-account(회원 본인 탈퇴)와 정리 순서는 동일하되, 대상을 본인이 아닌
// 요청 바디의 userId 로 받는다.
//
// 배포:  supabase functions deploy admin-delete-user
// 호출:  adminSupabase.functions.invoke('admin-delete-user', { body: { userId } })

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

  const { userId } = await req.json().catch(() => ({}))
  if (!userId) return json({ error: 'userId가 필요합니다.' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. 호출자 신원 확인 (전달된 access token 으로)
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user: callerAuthUser }, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !callerAuthUser) return json({ error: 'Unauthorized' }, 401)

  // 2. service_role 클라이언트로 관리자 권한 확인 + 삭제 수행 (RLS 우회)
  const admin = createClient(url, serviceKey)

  const { data: callerProfile } = await admin
    .from('users')
    .select('id, is_admin')
    .eq('auth_id', callerAuthUser.id)
    .single()

  if (!callerProfile?.is_admin) return json({ error: '관리자 권한이 없는 계정입니다.' }, 403)

  if (callerProfile.id === userId) {
    return json({ error: '본인 계정은 이 기능으로 삭제할 수 없습니다.' }, 400)
  }

  const { data: target } = await admin
    .from('users')
    .select('id, auth_id')
    .eq('id', userId)
    .single()

  if (!target) return json({ error: '대상 사용자를 찾을 수 없습니다.' }, 404)

  // 자식 데이터부터 정리 (FK 제약 회피) — delete-account 와 동일한 순서
  await admin.from('pot_members').delete().eq('user_id', target.id)
  await admin.from('daily_status').delete().eq('user_id', target.id)
  await admin.from('group_share_settings').delete().eq('user_id', target.id)
  await admin.from('group_members').delete().eq('user_id', target.id)
  await admin.from('user_term_agreements').delete().eq('user_id', target.id)
  await admin.from('users').delete().eq('id', target.id)

  // auth 계정 영구 삭제
  if (target.auth_id) {
    const { error: delErr } = await admin.auth.admin.deleteUser(target.auth_id)
    if (delErr) return json({ error: delErr.message }, 500)
  }

  return json({ success: true })
})
