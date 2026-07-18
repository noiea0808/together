import { useEffect, useState } from 'react'
import { getCache, setCache } from '../lib/cache'

const URL_RE = /https?:\/\/[^\s]+/i
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function extractFirstUrl(text) {
  const match = text?.match(URL_RE)
  if (!match) return null
  return match[0].replace(/[)\]}>.,!?"']+$/, '')
}

// 링크가 섞인 텍스트를 카드로 미리보기 할 때, 원문에서 그 주소 부분만 잘라내고
// 나머지 메모만 카드 뒤에 이어서 보여주기 위한 헬퍼.
export function textWithoutUrl(content, url) {
  if (!url) return content
  const idx = content.indexOf(url)
  if (idx === -1) return content
  return (content.slice(0, idx) + content.slice(idx + url.length)).trim()
}

function hostnameOf(url) {
  try { return new URL(url).hostname } catch { return url }
}

// 썸네일은 우리 이미지 프록시를 거쳐 불러온다. 네이버 등 일부 CDN이 Referer로
// 핫링크를 차단해 <img>로 직접 부르면 배포 도메인에서 403이 나기 때문이다.
function proxied(imageUrl) {
  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
}

export default function LinkPreviewCard({ text }) {
  const url = extractFirstUrl(text)
  const [preview, setPreview] = useState(null)
  const [imgFailed, setImgFailed] = useState(false)
  // og:image는 실제 콘텐츠 사진일 수도, 사이트 로고/아이콘일 수도 있어 API 응답만으론 구분이 안 된다.
  // 그래서 일단 컴팩트(아이콘형)로 시작해서, 실제로 로드된 이미지가 크고 정사각형이 아니면(=사진일 가능성)
  // 그때만 큰 카드로 전환한다. 축소보다 확대가 덜 튀어서 기본값을 컴팩트로 둔다.
  const [isIconStyle, setIsIconStyle] = useState(true)

  useEffect(() => {
    if (!url) return
    const cached = getCache(`linkpreview:${url}`, ONE_DAY_MS)
    if (cached) { setPreview(cached.data); return }
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(res => { if (!res.ok) throw new Error('fail'); return res.json() })
      .then(data => { setCache(`linkpreview:${url}`, data); setPreview(data) })
      .catch(() => {})
  }, [url])

  useEffect(() => { setImgFailed(false); setIsIconStyle(true) }, [preview?.image])

  const handleImgLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.target
    if (!w || !h) return
    const nearSquare = Math.abs(w - h) / Math.max(w, h) < 0.15
    const looksLikePhoto = !nearSquare && w > 200 && h > 200
    setIsIconStyle(!looksLikePhoto)
  }

  // preview 메타데이터를 못 가져와도(failed) 최소한 url/호스트명은 보여준다 —
  // 위시 리스트처럼 원문 텍스트 없이 카드만 남기는 화면에서 아무것도 안 보이면 안 되기 때문.
  if (!url) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={isIconStyle ? styles.cardCompact : styles.card}
      onClick={e => e.stopPropagation()}
    >
      {preview?.image && !imgFailed
        ? (
          <img
            src={proxied(preview.image)}
            alt=""
            style={isIconStyle ? styles.thumbCompact : styles.thumb}
            onLoad={handleImgLoad}
            onError={() => setImgFailed(true)}
          />
        )
        : <div style={isIconStyle ? styles.thumbFallbackCompact : styles.thumbFallback}>🔗</div>}
      <div style={isIconStyle ? styles.bodyCompact : styles.body}>
        <div style={isIconStyle ? styles.titleCompact : styles.title}>{preview?.title || url}</div>
        <div style={isIconStyle ? styles.hostCompact : styles.host}>{preview?.siteName || hostnameOf(url)}</div>
      </div>
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
}
