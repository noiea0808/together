import { useEffect, useRef, useState } from 'react'
import { getCache, setCache } from '../lib/cache'
import { extractFirstUrl, textWithoutUrl, proxiedImageUrl, fetchLinkPreview } from '../lib/linkPreview'
import { UndoIcon } from './GroupIcons'

export { extractFirstUrl, textWithoutUrl }

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function hostnameOf(url) {
  try { return new URL(url).hostname } catch { return url }
}

// preview: undefined면 기존처럼 컴포넌트가 알아서 가져와 세션 캐시에만 남기는 "독립 모드"
// (밥팟 메모 등). null/객체로 명시해서 넘기면 "제어 모드" — 부모(DB)가 들고 있는 값을 그대로
// 보여주고, 처음 한 번 없을 때만 가져온 뒤 onFetched로 결과를 돌려줘 영구 저장하게 한다.
// editable이 true면(본인 소유일 때만) 새로고침 버튼을 보여준다.
export default function LinkPreviewCard({ text, preview: storedPreview, onFetched, editable = false }) {
  const url = extractFirstUrl(text)
  const controlled = storedPreview !== undefined
  const [preview, setPreview] = useState(controlled ? storedPreview : null)
  const [refreshing, setRefreshing] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  // og:image는 실제 콘텐츠 사진일 수도, 사이트 로고/아이콘일 수도 있어 API 응답만으론 구분이 안 된다.
  // 그래서 일단 컴팩트(아이콘형)로 시작해서, 실제로 로드된 이미지가 크고 정사각형이 아니면(=사진일 가능성)
  // 그때만 큰 카드로 전환한다. 축소보다 확대가 덜 튀어서 기본값을 컴팩트로 둔다.
  const [isIconStyle, setIsIconStyle] = useState(true)
  const rootRef = useRef(null)
  const [visible, setVisible] = useState(false)

  // 제어 모드에서는 부모가 들고 있는 값(예: 새로고침 후 갱신된 값)이 바뀌면 그대로 반영한다.
  useEffect(() => { if (controlled) setPreview(storedPreview) }, [controlled, storedPreview])

  // 리스트에 카드가 여러 개 렌더링될 때(위시 리스트, 밥팟 코멘트 등) 화면에 보이기 전까지
  // /api/link-preview 호출을 미룬다 — 마운트되자마자 전부 요청하면 스크롤 안 한 카드까지 낭비.
  useEffect(() => {
    if (!url) return
    const el = rootRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [url])

  // 독립 모드: 세션 캐시 우선, 없으면 가져와서 캐시만 해둔다(영구 저장 없음).
  useEffect(() => {
    if (!url || controlled || !visible) return
    const cached = getCache(`linkpreview:${url}`, ONE_DAY_MS)
    if (cached) { setPreview(cached.data); return }
    fetchLinkPreview(url).then(data => { if (data) { setCache(`linkpreview:${url}`, data); setPreview(data) } })
  }, [url, visible, controlled])

  // 제어 모드: 저장된 미리보기가 아직 없을 때(등록 직후 등) 딱 한 번 가져와서 부모에게 돌려준다.
  // 부모가 DB에 저장해두면 다음부터는 storedPreview로 바로 채워져 이 effect가 다시 돌지 않는다.
  useEffect(() => {
    if (!url || !controlled || storedPreview || !visible) return
    fetchLinkPreview(url).then(data => { if (data) setPreview(data); onFetched?.(data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, controlled, visible])

  useEffect(() => { setImgFailed(false); setIsIconStyle(true) }, [preview?.image])

  const handleImgLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.target
    if (!w || !h) return
    const nearSquare = Math.abs(w - h) / Math.max(w, h) < 0.15
    const looksLikePhoto = !nearSquare && w > 200 && h > 200
    setIsIconStyle(!looksLikePhoto)
  }

  const handleRefresh = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (refreshing) return
    setRefreshing(true)
    const data = await fetchLinkPreview(url)
    if (data) setPreview(data)
    onFetched?.(data)
    setRefreshing(false)
  }

  // preview 메타데이터를 못 가져와도(failed) 최소한 url/호스트명은 보여준다 —
  // 위시 리스트처럼 원문 텍스트 없이 카드만 남기는 화면에서 아무것도 안 보이면 안 되기 때문.
  if (!url) return null

  return (
    <a
      ref={rootRef}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={isIconStyle ? styles.cardCompact : styles.card}
      onClick={e => e.stopPropagation()}
    >
      {preview?.image && !imgFailed
        ? (
          <img
            src={proxiedImageUrl(preview.image)}
            alt=""
            style={isIconStyle ? styles.thumbCompact : styles.thumb}
            loading="lazy"
            decoding="async"
            onLoad={handleImgLoad}
            onError={() => setImgFailed(true)}
          />
        )
        : <div style={isIconStyle ? styles.thumbFallbackCompact : styles.thumbFallback}>🔗</div>}
      <div style={isIconStyle ? styles.bodyCompact : styles.body}>
        <div style={isIconStyle ? styles.titleCompact : styles.title}>{preview?.title || url}</div>
        <div style={isIconStyle ? styles.hostCompact : styles.host}>{preview?.siteName || hostnameOf(url)}</div>
      </div>
      {editable && controlled && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="미리보기 새로고침"
          style={styles.refreshBtn}
        >
          <UndoIcon size={13} style={refreshing ? styles.refreshSpinning : undefined} />
        </button>
      )}
    </a>
  )
}

const styles = {
  card: {
    display: 'flex', gap: 8, marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.6)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', textDecoration: 'none',
    color: 'inherit', overflow: 'hidden', cursor: 'pointer',
  },
  thumb: { width: 52, height: 52, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  thumbFallback: {
    width: 52, height: 52, borderRadius: 6, background: 'var(--color-surface-2)', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
  },
  body: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' },
  title: {
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4,
  },
  host: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', opacity: 0.8 },

  // 사진이 아니라 로고/아이콘 수준인 링크용 — 자리를 덜 차지하는 한 줄짜리 행
  cardCompact: {
    display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '6px 8px',
    background: 'rgba(255,255,255,0.6)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', textDecoration: 'none', color: 'inherit',
    overflow: 'hidden', cursor: 'pointer',
  },
  thumbCompact: {
    width: 32, height: 32, borderRadius: 6, objectFit: 'contain', flexShrink: 0,
    background: 'var(--color-surface-2)', padding: 4, boxSizing: 'border-box',
  },
  thumbFallbackCompact: {
    width: 32, height: 32, borderRadius: 6, background: 'var(--color-surface-2)', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
  },
  bodyCompact: { minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  titleCompact: {
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  hostCompact: {
    fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', opacity: 0.8,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  refreshBtn: {
    flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0,
  },
  refreshSpinning: { animation: 'fabSpin 0.8s linear infinite' },
}
