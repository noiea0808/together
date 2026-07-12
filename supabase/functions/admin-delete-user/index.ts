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

  // groups/meal_pots 는 created_by 등이 ON DELETE CASCADE 가 아니라
  // (nullable) NULL 로 비워줘야 users 삭제 시 FK 위반이 나지 않는다.
  const nullOutSteps = [
    admin.from('groups').update({ created_by: null }).eq('created_by', target.id),
    admin.from('meal_pots').update({ created_by: null }).eq('created_by', target.id),
    admin.from('meal_pots').update({ last_modified_by: null }).eq('last_modified_by', target.id),
    admin.from('group_default_pot_configs').update({ last_modified_by: null }).eq('last_modified_by', target.id),
  ]
  for (const step of nullOutSteps) {
    const { error } = await step
    if (error) return json({ error: error.message }, 500)
  }

  // 자식 데이터부터 정리 (FK 제약 회피) — delete-account 와 동일한 순서
  // 나머지(pot_comments, notifications, push_subscriptions 등)는 ON DELETE CASCADE 라 자동 정리됨
  const deleteSteps = [
    admin.from('pot_members').delete().eq('user_id', target.id),
    admin.from('daily_status').delete().eq('user_id', target.id),
    admin.from('group_share_settings').delete().eq('user_id', target.id),
    admin.from('group_members').delete().eq('user_id', target.id),
    admin.from('user_term_agreements').delete().eq('user_id', target.id),
  ]
  for (const step of deleteSteps) {
    const { error } = await step
    if (error) return json({ error: error.message }, 500)
  }

  const { error: userDeleteError } = await admin.from('users').delete().eq('id', target.id)
  if (userDeleteError) return json({ error: userDeleteError.message }, 500)

  // auth 계정 영구 삭제 (앱 데이터 삭제가 모두 끝난 뒤에만 수행)
  // 이전 시도에서 auth 계정만 먼저 지워진 상태(orphan row)였을 수 있으므로
  // "존재하지 않음" 에러는 이미 목표가 달성된 것으로 보고 무시한다.
  if (target.auth_id) {
    const { error: delErr } = await admin.auth.admin.deleteUser(target.auth_id)
    if (delErr && !/not.*found/i.test(delErr.message)) return json({ error: delErr.message }, 500)
  }

  return json({ success: true })
})
