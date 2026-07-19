// 웹 푸시 발송 Edge Function
// 호출자의 JWT로 인증만 확인하고, service_role 권한으로 push_subscriptions 를 읽어 발송한다.
// 만료/무효(404, 410) 구독은 자동으로 삭제한다.
//
// 배포:  supabase functions deploy send-push
// secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
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
    const result = await sendPushToUsers(admin, userIds, { title, body, url: targetUrl })
    return json(result)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
