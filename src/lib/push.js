import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushSubscription() {
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
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' }
    )
  if (error) throw error

  return subscription
}

export async function subscribeToPush(userId) {
  if (!isPushSupported()) throw new Error('이 기기/브라우저는 푸시 알림을 지원하지 않아요.')
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY 환경변수가 없습니다.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('알림 권한이 거부됐어요.')

  return ensureFreshSubscription(userId)
}

// 이미 알림 권한이 허용된 사용자를 대상으로, 앱 로드 시 조용히 키 일치 여부만 확인해
// 필요하면 재구독한다. requestPermission을 부르지 않으므로 팝업 없이 백그라운드에서 복구된다.
export async function syncPushSubscription(userId) {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return
  if (Notification.permission !== 'granted') return
  try {
    await ensureFreshSubscription(userId)
  } catch {
    // 조용히 무시 — 다음 로드 때 다시 시도
  }
}

export async function unsubscribeFromPush() {
  const subscription = await getPushSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}
