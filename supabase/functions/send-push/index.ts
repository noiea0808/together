// 웹 푸시 발송 Edge Function
// 호출자의 JWT로 인증만 확인하고, service_role 권한으로 push_subscriptions 를 읽어 발송한다.
// 만료/무효(404, 410) 구독은 자동으로 삭제한다.
//
// 배포:  supabase functions deploy send-push
// secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
// 호출:  supabase.functions.invoke('send-push', { body: { userIds, title, body, url } })

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

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

// VAPID 설정(예: SUBJECT가 mailto:/https: URL이 아닌 경우)이 잘못되면 setVapidDetails가 즉시 throw하는데,
// 이걸 모듈 최상단에서 그대로 던지면 함수 전체가 매 요청마다 부팅조차 못 하고 죽어서
// 로그에만 남고 호출자는 원인을 알 방법이 없다. 그래서 여기서 잡아두고 요청 시점에 명확히 알려준다.
let vapidInitError: string | null = null
try {
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
} catch (e) {
  vapidInitError = e instanceof Error ? e.message : String(e)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
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
  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (subsErr) return json({ error: subsErr.message }, 500)

  const payload = JSON.stringify({ title, body: body ?? '', url: targetUrl ?? '/' })

  const results = await Promise.allSettled(
    (subs ?? []).map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    )
  )

  const staleEndpoints: string[] = []
  const failures: { endpoint: string; statusCode?: number; message: string }[] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason as { statusCode?: number; body?: string; message?: string }
      const statusCode = reason?.statusCode
      if (statusCode === 404 || statusCode === 410) staleEndpoints.push(subs![i].endpoint)
      // endpoint 전체는 구독자 식별에 쓰일 수 있어 응답엔 끝 8자만 남긴다.
      failures.push({
        endpoint: '...' + subs![i].endpoint.slice(-8),
        statusCode,
        message: reason?.body || reason?.message || String(reason),
      })
    }
  })
  if (staleEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    failures,
  })
})
