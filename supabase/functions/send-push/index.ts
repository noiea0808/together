// 웹 푸시 + 네이티브(FCM) 발송 Edge Function
// 호출자의 JWT로 인증만 확인하고, service_role 권한으로 push_subscriptions/fcm_tokens 를 읽어 발송한다.
// 만료/무효 구독·토큰(404, 410, UNREGISTERED 등)은 자동으로 삭제한다.
//
// 배포:  supabase functions deploy send-push
// secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//          supabase secrets set FCM_SERVICE_ACCOUNT_JSON='{...Firebase 서비스 계정 JSON 전체...}'
//          (FCM_SERVICE_ACCOUNT_JSON 없으면 네이티브 발송만 조용히 건너뛰고 웹 푸시는 그대로 동작)
// 호출:  supabase.functions.invoke('send-push', { body: { userIds, title, body, url } })

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getVapidInitError, sendPushToUsers } from '../_shared/webpush.ts'

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
  const vapidInitError = getVapidInitError()
  if (vapidInitError) return json({ error: `VAPID 설정 오류: ${vapidInitError}` }, 500)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  const { userIds, title, body, url: targetUrl } = await req.json()
  if (!Array.isArray(userIds) || userIds.length === 0 || !title) {
    return json({ error: 'userIds(array), title 은 필수입니다.' }, 400)
  }

  const admin = createClient(url, serviceKey)
  try {
    // "활동 알림"을 꺼둔 사용자는 제외한다. 인앱 알림함 기록(notifications 테이블)은 이
    // 함수를 호출하기 전에 이미 별도로 남겨지므로 여기서 걸러도 알림함에서는 그대로 보인다.
    // notify_lunch_reminder는 별도 함수(lunch-reminder)가 독립적으로 필터링하므로 여기선
    // 관여하지 않는다 — 두 알림 종류가 서로 영향을 주지 않게 하는 지점이 바로 여기다.
    const { data: optedUsers, error: usersErr } = await admin
      .from('users')
      .select('id')
      .in('id', userIds)
      .eq('notify_activity', true)
    if (usersErr) return json({ error: usersErr.message }, 500)

    const targetIds = (optedUsers ?? []).map((u) => u.id)
    if (targetIds.length === 0) return json({ sent: 0, failed: 0, failures: [] })

    const result = await sendPushToUsers(admin, targetIds, { title, body, url: targetUrl })
    return json(result)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
