const CACHE_NAME = 'gachi-meokja-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim())
})

self.addEventListener('fetch', (e) => {
  // GET이 아니거나(POST 등 API 호출) 다른 origin(Supabase 등) 요청은 그대로 통과시킨다.
  // 가로채서 캐시 매칭을 시도하면 캐시에 없는 경우 undefined를 respondWith에 넘기게 되어
  // "Failed to convert value to 'Response'" 에러가 난다.
  if (e.request.method !== 'GET') return
  if (new URL(e.request.url).origin !== self.location.origin) return

  // 네트워크 우선, 실패 시 캐시
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

self.addEventListener('push', (e) => {
  let payload = { title: '같이 먹자', body: '' }
  try {
    if (e.data) payload = { ...payload, ...e.data.json() }
  } catch {
    if (e.data) payload.body = e.data.text()
  }

  // 서버(send-push)가 발송 시점의 실제 안읽음 개수를 payload.badge로 실어 보낸다.
  // iOS는 인자 없이 setAppBadge()를 부르면 배지를 0으로 지워버리므로(포그라운드에서
  // BadgeSync가 세팅해둔 값까지 덮어써 지워지는 원인이었다), 반드시 숫자를 넘겨야 한다.
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: payload.url || '/' },
      }),
      self.navigator.setAppBadge
        ? self.navigator.setAppBadge(typeof payload.badge === 'number' ? payload.badge : 1).catch(() => {})
        : Promise.resolve(),
    ])
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
