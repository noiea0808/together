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

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const statusCode = (r.reason as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) staleEndpoints.push(subs![i].endpoint)
    }
  })
  if (staleEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  })
})
