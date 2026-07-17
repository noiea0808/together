import { useState, useRef, useEffect } from 'react'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const VIEWPORT = 280 // 정사각형 편집 영역 한 변(px)
const OUTPUT = 1200  // 업로드용 정사각형 출력 크기(px)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// 밥팟 사진은 모먼트/상세 모두 정사각형 카드로 보여주기 때문에, 업로드 전
// 정사각형 미리보기 안에서 드래그(위치)·슬라이더(확대)로 보여줄 부분을 고른 뒤
// 캔버스로 잘라 JPEG로 다시 인코딩해서 올린다. (AvatarCropModal과 동일한 방식,
// 원형 대신 정사각형 마스크만 다르다)
export default function PhotoAdjustModal({ file, onCancel, onConfirm, uploading }) {
  const [imgUrl, setImgUrl] = useState(null)
  const [naturalSize, setNaturalSize] = useState(null) // { w, h }
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null)
  const imgRef = useRef(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleImgLoad = () => {
    const img = imgRef.current
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const baseScale = naturalSize ? Math.max(VIEWPORT / naturalSize.w, VIEWPORT / naturalSize.h) : 1
  const scale = baseScale * zoom
  const dispW = naturalSize ? naturalSize.w * scale : 0
  const dispH = naturalSize ? naturalSize.h * scale : 0
  const maxPanX = Math.max(0, (dispW - VIEWPORT) / 2)
  const maxPanY = Math.max(0, (dispH - VIEWPORT) / 2)

  const clampPan = (p) => ({ x: clamp(p.x, -maxPanX, maxPanX), y: clamp(p.y, -maxPanY, maxPanY) })

  // 줌이 바뀌면 팬이 새 범위를 벗어날 수 있어 다시 가둔다
  useEffect(() => { setPan(p => clampPan(p)) }, [zoom, naturalSize])

  const onPointerDown = (e) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPan(clampPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }))
  }
  const onPointerUp = () => { dragRef.current = null }

  const handleConfirm = () => {
    if (!naturalSize) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    const imgLeft = (VIEWPORT - dispW) / 2 + pan.x
    const imgTop = (VIEWPORT - dispH) / 2 + pan.y
    const srcX = -imgLeft / scale
    const srcY = -imgTop / scale
    const srcSize = VIEWPORT / scale
    ctx.drawImage(imgRef.current, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT)
    canvas.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.85)
  }

  return (
    <div style={S.overlay} onClick={() => !uploading && onCancel()}>
      <div style={S.dialog} onClick={e => e.stopPropagation()}>
        <div style={S.title}>사진 크기·위치 조정</div>
        <p style={S.desc}>드래그해서 위치를, 슬라이더로 확대를 조정하세요.</p>

        <div
          style={S.viewport}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              onLoad={handleImgLoad}
              draggable={false}
              alt=""
              style={{
                position: 'absolute', left: '50%', top: '50%',
                width: dispW || 'auto', height: dispH || 'auto',
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
                pointerEvents: 'none', userSelect: 'none',
              }}
            />
          )}
        </div>

        <input
          type="range" min="1" max="3" step="0.01"
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          style={S.slider}
          disabled={!naturalSize}
        />

        <div style={S.btnRow}>
          <button style={S.cancelBtn} onClick={onCancel} disabled={uploading}>취소</button>
          <button style={{ ...S.confirmBtn, opacity: naturalSize && !uploading ? 1 : 0.5 }} onClick={handleConfirm} disabled={!naturalSize || uploading}>
            {uploading ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 360, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  desc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', margin: 0 },
  viewport: {
    width: VIEWPORT, height: VIEWPORT, borderRadius: 'var(--radius-md)', overflow: 'hidden',
    background: 'var(--color-surface-2)', position: 'relative', touchAction: 'none', cursor: 'grab',
    border: '2px solid var(--color-border)', flexShrink: 0, maxWidth: '100%',
  },
  slider: { width: '100%' },
  btnRow: { width: '100%', display: 'flex', gap: 8 },
  cancelBtn: { flex: 1, padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  confirmBtn: { ...PRIMARY_ACTION_BUTTON, flex: 1 },
}
