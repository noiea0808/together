// 경량 인메모리 캐시 (stale-while-revalidate 용)
// 외부 의존성 없이 탭 전환·포커스 복귀 시 중복 네트워크 요청을 줄인다.
const store = new Map() // key -> { data, ts }

// maxAgeMs 안이면 stale:false, 지나면 stale:true. 없으면 undefined.
export function getCache(key, maxAgeMs = 30000) {
  const entry = store.get(key)
  if (!entry) return undefined
  return { data: entry.data, stale: Date.now() - entry.ts > maxAgeMs }
}

export function setCache(key, data) {
  store.set(key, { data, ts: Date.now() })
}

// 정확히 일치하는 키 또는 prefix로 시작하는 키들을 무효화
export function invalidateCache(keyOrPrefix, { prefix = false } = {}) {
  if (!prefix) { store.delete(keyOrPrefix); return }
  for (const k of store.keys()) {
    if (k.startsWith(keyOrPrefix)) store.delete(k)
  }
}
