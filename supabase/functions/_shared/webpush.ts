// 웹 푸시 발송 공용 로직 — send-push, lunch-reminder 두 Edge Function이 공유한다.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { sendFcmToUsers } from './fcm.ts'

// VAPID 설정이 잘못되면 setVapidDetails가 즉시 throw하는데, 이걸 모듈 최상단에서 그대로 던지면
// 함수 전체가 매 요청마다 부팅조차 못 하고 죽어서 로그에만 남고 호출자는 원인을 알 방법이 없다.
// 그래서 여기서 잡아두고 호출부가 요청 시점에 명확히 알려줄 수 있게 한다.
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

export function getVapidInitError(): string | null {
  return vapidInitError
}

export type SendPushResult = {
  sent: number
  failed: number
  failures: { target: string; statusCode?: number; message: string }[]
}

// admin: service_role 클라이언트 (RLS 우회 — push_subscriptions/notifications 조회·정리에 필요)
// 웹 푸시(push_subscriptions)와 네이티브 FCM(fcm_tokens) 양쪽 구독자에게 함께 발송하고 결과를 합친다.
export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: { title: string; body?: string; url?: string },
): Promise<SendPushResult> {
  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds)
  if (subsErr) throw subsErr

  // iOS는 서비스워커에서 setAppBadge()를 인자 없이 호출하면 배지를 0으로 지워버린다.
  // 그래서 발송 시점에 수신자별 실제 안읽음 개수를 계산해 페이로드에 실어 보내고,
  // 서비스워커는 그 숫자로만 배지를 세팅한다.
  const { data: unreadRows } = await admin
    .from('notifications')
    .select('user_id')
    .in('user_id', userIds)
    .eq('is_read', false)
  const unreadCountByUser = new Map<string, number>()
  for (const row of unreadRows ?? []) {
    unreadCountByUser.set(row.user_id, (unreadCountByUser.get(row.user_id) ?? 0) + 1)
  }

  const results = await Promise.allSettled(
    (subs ?? []).map((s) => {
      const body = JSON.stringify({
        title: payload.title, body: payload.body ?? '', url: payload.url ?? '/',
        badge: unreadCountByUser.get(s.user_id) ?? 1,
      })
      return webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
    })
  )

  const staleEndpoints: string[] = []
  const failures: SendPushResult['failures'] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason as { statusCode?: number; body?: string; message?: string }
      const statusCode = reason?.statusCode
      // 404/410: 브라우저가 구독을 폐기한 경우.
      // 403: VAPID 키를 재발급하기 전에 만들어진 구독 — 지금 서버 키로는 영영 서명이 안 맞아
      //      매 발송마다 실패만 쌓인다. 지워두면 그 사람이 다음에 앱을 열 때 push.js의
      //      syncPushSubscription이 현재 공개키로 새로 구독하므로 저절로 복구된다.
      if (statusCode === 404 || statusCode === 410 || statusCode === 403) staleEndpoints.push(subs![i].endpoint)
      // endpoint 전체는 구독자 식별에 쓰일 수 있어 응답엔 끝 8자만 남긴다.
      failures.push({
        target: '...' + subs![i].endpoint.slice(-8),
        statusCode,
        message: reason?.body || reason?.message || String(reason),
      })
    }
  })
  if (staleEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  // FCM 시크릿이 없으면 sendFcmToUsers가 즉시 빈 결과를 돌려주므로 웹 푸시만 있어도 그대로 동작한다.
  // 여기서 잡히는 건 토큰별 실패(sendFcmToUsers 내부에서 이미 로그됨)가 아니라 OAuth2 토큰
  // 발급 실패 등 발송 자체를 막는 예외라 별도로 로그를 남긴다.
  const fcmResult = await sendFcmToUsers(admin, userIds, payload).catch((e) => {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[fcm] 발송 자체 실패:', message)
    return { sent: 0, failed: 1, failures: [{ target: 'fcm', message }] }
  })

  return {
    sent: results.filter((r) => r.status === 'fulfilled').length + fcmResult.sent,
    failed: results.filter((r) => r.status === 'rejected').length + fcmResult.failed,
    failures: [...failures, ...fcmResult.failures],
  }
}
