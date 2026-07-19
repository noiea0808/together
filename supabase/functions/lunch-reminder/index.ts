// 점심 상태 미설정 리마인드 알림 — pg_cron이 주기적으로 호출한다.
// 사용자 브라우저가 아니라 크론이 부르는 함수라 send-push와 달리 사용자 JWT가 없다.
// 대신 호출자가 SUPABASE_SERVICE_ROLE_KEY를 Authorization 헤더로 그대로 보냈는지만 확인한다.
//
// 배포: supabase functions deploy lunch-reminder
// 크론 설정: scripts/add_lunch_reminder_cron.sql 참고

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

const LUNCH_SLOT = '점심'

// KST(UTC+9) 기준 오늘 날짜(yyyy-mm-dd)와 "지금 몇 분째인지"(자정 기준 분)를 함께 구한다.
function nowInKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const date = kst.toISOString().slice(0, 10)
  const minutesSinceMidnight = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  const weekday = kst.getUTCDay() // 0=일 6=토 (getUTCDay: 위에서 이미 +9h 보정된 시각이라 KST 요일과 동일)
  return { date, minutesSinceMidnight, weekday }
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const vapidInitError = getVapidInitError()
  if (vapidInitError) return json({ error: `VAPID 설정 오류: ${vapidInitError}` }, 500)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${serviceKey}`) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(url, serviceKey)
  const { date, minutesSinceMidnight, weekday } = nowInKst()

  const { data: config, error: configErr } = await admin
    .from('lunch_reminder_config').select('*').eq('id', true).single()
  if (configErr) return json({ error: configErr.message }, 500)
  if (!config.enabled) return json({ skipped: 'disabled' })
  if (config.last_sent_date === date) return json({ skipped: 'already_sent_today' })
  if (timeToMinutes(config.send_time) > minutesSinceMidnight) return json({ skipped: 'too_early' })

  if (weekday === 0 || weekday === 6) return json({ skipped: 'weekend' })
  const { data: holiday } = await admin.from('holidays').select('date').eq('date', date).maybeSingle()
  if (holiday) return json({ skipped: 'holiday' })

  // 1) 리마인드 대상 후보 = 리마인드 opt-in ∧ 최소 한 그룹 소속 ∧ 푸시 구독 보유
  const [{ data: subs, error: subsErr }, { data: members, error: membersErr }, { data: optedUsers, error: usersErr }] =
    await Promise.all([
      admin.from('push_subscriptions').select('user_id'),
      admin.from('group_members').select('user_id'),
      admin.from('users').select('id').eq('notify_lunch_reminder', true),
    ])
  if (subsErr) return json({ error: subsErr.message }, 500)
  if (membersErr) return json({ error: membersErr.message }, 500)
  if (usersErr) return json({ error: usersErr.message }, 500)

  const subscribedIds = new Set((subs ?? []).map(r => r.user_id))
  const groupedIds = new Set((members ?? []).map(r => r.user_id))
  let candidateIds = (optedUsers ?? [])
    .map(u => u.id)
    .filter(id => subscribedIds.has(id) && groupedIds.has(id))
  if (candidateIds.length === 0) return json({ skipped: 'no_candidates' })

  // 2) 오늘 점심 상태를 이미 정했거나(daily_status), 팟으로 이미 참여 중인 사람은 제외
  const [{ data: statusRows, error: statusErr }, { data: potRows, error: potErr }] = await Promise.all([
    admin.from('daily_status').select('user_id').eq('date', date).eq('slot', LUNCH_SLOT).in('user_id', candidateIds),
    admin.from('pot_members').select('user_id, meal_pots!inner(date, slot)').eq('meal_pots.date', date).eq('meal_pots.slot', LUNCH_SLOT).in('user_id', candidateIds),
  ])
  if (statusErr) return json({ error: statusErr.message }, 500)
  if (potErr) return json({ error: potErr.message }, 500)

  const alreadySetIds = new Set([
    ...(statusRows ?? []).map(r => r.user_id),
    ...(potRows ?? []).map(r => r.user_id),
  ])
  const targetIds = candidateIds.filter(id => !alreadySetIds.has(id))
  if (targetIds.length === 0) {
    await admin.from('lunch_reminder_config').update({ last_sent_date: date, updated_at: new Date().toISOString() }).eq('id', true)
    return json({ skipped: 'all_already_set' })
  }

  const title = config.title || '오늘 점심 뭐 드실래요?'
  const body = config.body || '아직 점심 상태를 안 정하셨어요. 지금 정해두면 눈치 안 봐도 돼요.'
  const notifyUrl = '/today'

  const { error: insertErr } = await admin.from('notifications').insert(
    targetIds.map(userId => ({ user_id: userId, title, body, url: notifyUrl, event_type: 'lunch_reminder' }))
  )
  if (insertErr) return json({ error: insertErr.message }, 500)

  const result = await sendPushToUsers(admin, targetIds, { title, body, url: notifyUrl })

  await admin.from('lunch_reminder_config').update({ last_sent_date: date, updated_at: new Date().toISOString() }).eq('id', true)

  return json({ targeted: targetIds.length, ...result })
})
