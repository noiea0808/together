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

    // groups/meal_pots 는 created_by 등이 ON DELETE CASCADE 가 아니라
    // (nullable) NULL 로 비워줘야 users 삭제 시 FK 위반이 나지 않는다.
    const nullOutSteps = [
      admin.from('groups').update({ created_by: null }).eq('created_by', uid),
      admin.from('meal_pots').update({ created_by: null }).eq('created_by', uid),
      admin.from('meal_pots').update({ last_modified_by: null }).eq('last_modified_by', uid),
      admin.from('group_default_pot_configs').update({ last_modified_by: null }).eq('last_modified_by', uid),
    ]
    for (const step of nullOutSteps) {
      const { error } = await step
      if (error) return json({ error: error.message }, 500)
    }

    // 자식 데이터부터 정리 (FK 제약 회피)
    // 나머지(pot_comments, notifications, push_subscriptions 등)는 ON DELETE CASCADE 라 자동 정리됨
    const deleteSteps = [
      admin.from('pot_members').delete().eq('user_id', uid),
      admin.from('daily_status').delete().eq('user_id', uid),
      admin.from('group_share_settings').delete().eq('user_id', uid),
      admin.from('group_members').delete().eq('user_id', uid),
      admin.from('user_term_agreements').delete().eq('user_id', uid),
    ]
    for (const step of deleteSteps) {
      const { error } = await step
      if (error) return json({ error: error.message }, 500)
    }

    const { error: userDeleteError } = await admin.from('users').delete().eq('id', uid)
    if (userDeleteError) return json({ error: userDeleteError.message }, 500)
  }

  // 3. auth 계정 영구 삭제 (앱 데이터 삭제가 모두 끝난 뒤에만 수행)
  // 이전 시도에서 auth 계정만 먼저 지워진 상태(orphan row)였을 수 있으므로
  // "존재하지 않음" 에러는 이미 목표가 달성된 것으로 보고 무시한다.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr && !/not.*found/i.test(delErr.message)) return json({ error: delErr.message }, 500)

  return json({ success: true })
})
