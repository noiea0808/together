import { useEffect, useState } from 'react'
import { getCache, setCache } from '../lib/cache'

const URL_RE = /https?:\/\/[^\s]+/i
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function extractFirstUrl(text) {
  const match = text?.match(URL_RE)
  if (!match) return null
  return match[0].replace(/[)\]}>.,!?"']+$/, '')
}

function hostnameOf(url) {
  try { return new URL(url).hostname } catch { return url }
}

export default function LinkPreviewCard({ text }) {
  const url = extractFirstUrl(text)
  const [preview, setPreview] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!url) return
    const cached = getCache(`linkpreview:${url}`, ONE_DAY_MS)
    if (cached) { setPreview(cached.data); return }
    setFailed(false)
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(res => { if (!res.ok) throw new Error('fail'); return res.json() })
      .then(data => { setCache(`linkpreview:${url}`, data); setPreview(data) })
      .catch(() => setFailed(true))
  }, [url])

  if (!url || failed) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={styles.card}
      onClick={e => e.stopPropagation()}
    >
      {preview?.image
        ? <img src={preview.image} alt="" style={styles.thumb} onError={e => { e.currentTarget.style.display = 'none' }} />
        : <div style={styles.thumbFallback}>🔗</div>}
      <div style={styles.body}>
        <div style={styles.title}>{preview?.title || url}</div>
        {preview?.description && <div style={styles.desc}>{preview.description}</div>}
        <div style={styles.host}>{preview?.siteName || hostnameOf(url)}</div>
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
  title: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  desc: {
    fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', overflow: 'hidden',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4,
  },
  host: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', opacity: 0.8 },
}
