// 네이티브 앱(FCM, HTTP v1) 발송 — Firebase 콘솔 "프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성"으로
// 받은 JSON 전체를 FCM_SERVICE_ACCOUNT_JSON 시크릿에 그대로 넣어야 동작한다.
// 시크릿이 없으면(웹 푸시만 쓰는 동안은 정상 상태) 네이티브 발송만 조용히 건너뛴다.
//
// OAuth2 액세스 토큰은 서비스 계정 JSON만으로 여기서 직접 서명해 발급받는다(Web Crypto API,
// 외부 라이브러리 없음 — Deno Edge Function 환경에서 google-auth-library 같은 무거운 npm
// 패키지는 번들 호환성 리스크가 있어 피했다).
//
// secrets: supabase secrets set FCM_SERVICE_ACCOUNT_JSON='{...전체 JSON...}'

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

let serviceAccount: ServiceAccount | null = null
let fcmInitError: string | null = null

try {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON 시크릿이 설정되지 않았습니다.')
  serviceAccount = JSON.parse(raw)
} catch (e) {
  fcmInitError = e instanceof Error ? e.message : String(e)
}

// send-push처럼 FCM 없이는 아예 요청을 못 받아야 하는 엔드포인트에서만 참조한다.
export function getFcmInitError(): string | null {
  return fcmInitError
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes)
  return btoa(raw).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// 워밍업된 함수 인스턴스 사이에 재사용 — 매 요청마다 새로 서명/교환하지 않는다.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`

  const pem = account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, '')
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned))
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  })
  if (!res.ok) throw new Error(`FCM OAuth2 토큰 발급 실패: ${res.status} ${await res.text()}`)
  const { access_token, expires_in } = await res.json()

  cachedToken = { value: access_token, expiresAt: Date.now() + expires_in * 1000 }
  return access_token
}

export type FcmSendResult = {
  sent: number
  failed: number
  failures: { target: string; message: string }[]
}

const UNREGISTERED_ERRORS = ['UNREGISTERED', 'NOT_FOUND', 'INVALID_ARGUMENT']

// admin: service_role 클라이언트 (RLS 우회 — fcm_tokens/notifications 조회·정리에 필요)
export async function sendFcmToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: { title: string; body?: string; url?: string },
): Promise<FcmSendResult> {
  if (!serviceAccount) return { sent: 0, failed: 0, failures: [] }

  const { data: tokens, error: tokensErr } = await admin
    .from('fcm_tokens')
    .select('token, user_id')
    .in('user_id', userIds)
  if (tokensErr) throw tokensErr
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0, failures: [] }

  const { data: unreadRows } = await admin
    .from('notifications')
    .select('user_id')
    .in('user_id', userIds)
    .eq('is_read', false)
  const unreadCountByUser = new Map<string, number>()
  for (const row of unreadRows ?? []) {
    unreadCountByUser.set(row.user_id, (unreadCountByUser.get(row.user_id) ?? 0) + 1)
  }

  const accessToken = await getAccessToken(serviceAccount)
  const projectId = serviceAccount.project_id

  const results = await Promise.allSettled(
    tokens.map((t) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: payload.title, body: payload.body ?? '' },
            data: { url: payload.url ?? '/' },
            android: {
              priority: 'high',
              notification: { notification_count: unreadCountByUser.get(t.user_id) ?? 1 },
            },
          },
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
      }),
    ),
  )

  const staleTokens: string[] = []
  const failures: FcmSendResult['failures'] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason)
      if (UNREGISTERED_ERRORS.some((code) => message.includes(code))) staleTokens.push(tokens[i].token)
      // 토큰 전체는 기기 식별에 쓰일 수 있어 응답엔 끝 8자만 남긴다.
      failures.push({ target: '...' + tokens[i].token.slice(-8), message })
    }
  })
  if (staleTokens.length > 0) {
    await admin.from('fcm_tokens').delete().in('token', staleTokens)
  }

  return {
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    failures,
  }
}
