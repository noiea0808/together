import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function isNative() {
  return Capacitor.isNativePlatform()
}

// 네이티브 앱은 등록 요청 -> 'registration' 이벤트로 비동기 토큰을 받는 구조라
// Notification.permission 같은 동기 API가 없다. 웹/네이티브 어느 쪽이든 이 함수 하나로
// 'granted' | 'denied' | 'default' 를 물어볼 수 있게 감싼다.
export async function getPushPermissionState() {
  if (isNative()) {
    const { receive } = await PushNotifications.checkPermissions()
    if (receive === 'granted') return 'granted'
    if (receive === 'denied') return 'denied'
    return 'default'
  }
  return Notification.permission
}

async function registerNativePush(userId) {
  const current = await PushNotifications.checkPermissions()
  let status = current.receive
  if (status !== 'granted') {
    const requested = await PushNotifications.requestPermissions()
    status = requested.receive
  }
  if (status !== 'granted') throw new Error('알림 권한이 거부됐어요.')

  return new Promise((resolve, reject) => {
    let registrationHandle
    let errorHandle
    const cleanup = () => { registrationHandle?.remove(); errorHandle?.remove() }

    PushNotifications.addListener('registration', async (token) => {
      cleanup()
      try {
        // 일반 upsert(RLS: 본인 행만 update)가 아니라 RPC를 쓴다 — 같은 기기를 이전에
        // 다른 계정으로 로그인했을 때 이 토큰이 그 계정 소유로 남아있을 수 있는데,
        // 그 소유권을 지금 로그인한 사용자에게 넘겨받아야 하기 때문이다
        // (fix_fcm_tokens_reclaim.sql). 그냥 upsert하면 RLS에 막혀 조용히 실패해
        // 이 기기로는 영영 푸시가 안 오는 상태가 될 수 있다.
        const { error } = await supabase.rpc('claim_fcm_token', { p_token: token.value, p_platform: 'android' })
        if (error) throw error
        resolve(token.value)
      } catch (e) {
        reject(e)
      }
    }).then((handle) => { registrationHandle = handle })

    PushNotifications.addListener('registrationError', (err) => {
      cleanup()
      reject(new Error(err.error || 'FCM 등록에 실패했어요.'))
    }).then((handle) => { errorHandle = handle })

    PushNotifications.register()
  })
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  if (isNative()) return true
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushSubscription() {
  if (isNative()) {
    // fcm_tokens는 RLS로 본인 행만 보이므로 필터 없이도 내 토큰만 조회된다.
    const { data } = await supabase.from('fcm_tokens').select('id').limit(1)
    return data && data.length > 0 ? data[0] : null
  }
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

// 브라우저는 서버가 VAPID 키를 재발급해도 기존 구독을 자동으로 갱신해주지 않는다.
// (getSubscription()은 옛 키로 만든 구독이라도 그냥 돌려준다.) 그래서 매번 지금 쓰는
// 공개키와 실제 구독에 박힌 키를 비교해서, 다르면 지우고 새 키로 다시 구독한다.
function applicationServerKeyMatches(subscription, desiredKey) {
  const current = subscription.options?.applicationServerKey
  if (!current) return false
  const a = new Uint8Array(current)
  return a.length === desiredKey.length && a.every((v, i) => v === desiredKey[i])
}

async function ensureFreshSubscription(userId) {
  const registration = await navigator.serviceWorker.ready
  const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  const existing = await registration.pushManager.getSubscription()

  let subscription = existing
  if (existing && !applicationServerKeyMatches(existing, applicationServerKey)) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint)
    await existing.unsubscribe()
    subscription = null
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  }

  const { endpoint, keys } = subscription.toJSON()
  // 일반 upsert(RLS: 본인 행만 update)가 아니라 RPC를 쓴다 — 같은 브라우저를 이전에
  // 다른 계정으로 로그인했을 때 이 endpoint가 그 계정 소유로 남아있을 수 있는데,
  // 그 소유권을 지금 로그인한 사용자에게 넘겨받아야 하기 때문이다 (fix_push_subscriptions_reclaim.sql).
  const { error } = await supabase.rpc('claim_push_subscription', {
    p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth,
  })
  if (error) throw error

  return subscription
}

export async function subscribeToPush(userId) {
  if (isNative()) return registerNativePush(userId)

  if (!isPushSupported()) throw new Error('이 기기/브라우저는 푸시 알림을 지원하지 않아요.')
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY 환경변수가 없습니다.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('알림 권한이 거부됐어요.')

  return ensureFreshSubscription(userId)
}

// 이미 알림 권한이 허용된 사용자를 대상으로, 앱 로드 시 조용히 키 일치 여부만 확인해
// 필요하면 재구독한다. requestPermission을 부르지 않으므로 팝업 없이 백그라운드에서 복구된다.
export async function syncPushSubscription(userId) {
  if (isNative()) {
    try {
      const { receive } = await PushNotifications.checkPermissions()
      if (receive === 'granted') await registerNativePush(userId)
    } catch {
      // 조용히 무시 — 다음 로드 때 다시 시도
    }
    return
  }

  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return
  if (Notification.permission !== 'granted') return
  try {
    await ensureFreshSubscription(userId)
  } catch {
    // 조용히 무시 — 다음 로드 때 다시 시도
  }
}

export async function unsubscribeFromPush() {
  if (isNative()) {
    // RLS로 본인 행만 대상이 되므로, 이 필터는 "전체 삭제"를 의도적으로 허용하는 항상-참 조건이다.
    await supabase.from('fcm_tokens').delete().not('id', 'is', null)
    return
  }

  const subscription = await getPushSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}
