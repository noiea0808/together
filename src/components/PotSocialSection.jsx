import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { getPotComments, addPotComment, deletePotComment, getPotPhotos, addPotPhoto, deletePotPhoto } from '../lib/db'
import { resizeImageFile } from '../lib/resizeImage'
import PhotoAdjustModal from './PhotoAdjustModal'

function avBg(name) {
  const colors = ['#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626', '#4F46E5', '#DB2777']
  let h = 0
  for (const x of name) h = (h * 31 + x.charCodeAt(0)) & 0xfffff
  return colors[h % colors.length]
}

function timeAgo(iso) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${Math.floor(diffHour / 24)}일 전`
}

// 밥팟 사진/코멘트 — 밥팟 상세와 모먼트 화면에서 공용으로 쓴다.
// canPost: 해당 밥팟 참여자만 true (사진/코멘트 등록 가능)
// compact: 카드 테두리·"사진"/"코멘트" 라벨 없이 이어붙는 형태로 렌더링(모먼트 피드용).
//          사진 등록 버튼은 숨기고 openPhotoPicker()를 ref로 노출해 바깥(⋯ 메뉴)에서 파일 선택창을 열 수 있게 한다.
// footer: 사진과 코멘트 사이에 끼워 넣을 요소(모먼트 피드의 아바타·댓글수·⋯메뉴 액션바 용도).
const PotSocialSection = forwardRef(function PotSocialSection({ potId, currentUserId, canPost, onChange, compact = false, footer = null }, ref) {
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [photos, setPhotos] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [pendingFile, setPendingFile] = useState(null)
  const [batchUploading, setBatchUploading] = useState(null) // { done, total } | null
  const [photoMenuOpenId, setPhotoMenuOpenId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState(null)
  const photoInputRef = useRef(null)
  const photoScrollRef = useRef(null)

  const handlePhotoScroll = () => {
    const el = photoScrollRef.current
    if (!el || !el.clientWidth) return
    setActivePhotoIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  useImperativeHandle(ref, () => ({
    openPhotoPicker: () => photoInputRef.current?.click(),
  }))

  const loadComments = async () => {
    try { setComments(await getPotComments(potId)) } catch (e) { console.error(e) }
  }
  const loadPhotos = async () => {
    try { setPhotos(await getPotPhotos(potId)) } catch (e) { console.error(e) }
  }

  useEffect(() => { loadComments(); loadPhotos(); setConfirmDeleteCommentId(null) }, [potId])

  const handlePostComment = async () => {
    if (!commentText.trim() || postingComment) return
    setPostingComment(true)
    try {
      const comment = await addPotComment(potId, currentUserId, commentText)
      setComments(prev => [...prev, comment])
      setCommentText('')
      onChange?.()
    } catch (e) { console.error(e) }
    finally { setPostingComment(false) }
  }

  const handleDeleteComment = async (commentId) => {
    setConfirmDeleteCommentId(null)
    setComments(prev => prev.filter(c => c.id !== commentId))
    try {
      await deletePotComment(commentId, currentUserId)
      onChange?.()
    } catch (e) { console.error(e); loadComments() }
  }

  // 1장 선택 → 크기·위치 조정 모달로. 2장 이상 선택 → 크롭 없이 원본 비율 그대로 순서대로 업로드.
  const handlePhotoFileChange = (e) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    if (files.length === 1) { setPendingFile(files[0]); return }
    handleUploadBatch(files)
  }

  const handleUploadBatch = async (files) => {
    setBatchUploading({ done: 0, total: files.length })
    const uploaded = []
    for (const file of files) {
      try {
        const blob = await resizeImageFile(file)
        uploaded.push(await addPotPhoto(potId, currentUserId, blob))
      } catch (e) { console.error(e) }
      setBatchUploading(prev => prev && { ...prev, done: prev.done + 1 })
    }
    if (uploaded.length > 0) { setPhotos(prev => [...prev, ...uploaded]); onChange?.() }
    setBatchUploading(null)
  }

  const handleConfirmPhoto = async (blob) => {
    setUploadingPhoto(true)
    try {
      const photo = await addPotPhoto(potId, currentUserId, blob)
      setPhotos(prev => [...prev, photo])
      setPendingFile(null)
      onChange?.()
    } catch (e) { console.error(e) }
    finally { setUploadingPhoto(false) }
  }

  const handleDeletePhoto = async (photoId) => {
    setPhotoMenuOpenId(null)
    setConfirmDeleteId(null)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
    try {
      await deletePotPhoto(photoId, currentUserId)
      onChange?.()
    } catch (e) { console.error(e); loadPhotos() }
  }

  const cardStyle = compact ? S.cardCompact : S.card

  return (
    <>
      {/* Photos */}
      <div style={cardStyle}>
        {!compact && (
          <div style={S.header}>
            <span style={S.title}>사진</span>
            <span style={S.count}>{photos.length}장</span>
          </div>
        )}
        {photos.length === 0 ? (
          !compact && <p style={S.empty}>아직 등록된 사진이 없어요.</p>
        ) : (
          <>
            <div className="no-scrollbar" style={S.photoScroll} ref={photoScrollRef} onScroll={handlePhotoScroll}>
              {photos.map(p => (
                <div key={p.id} style={S.photoItem}>
                  <img src={p.photo_url} alt="" style={S.photoImg} />
                  {p.user_id === currentUserId && (
                    <div style={S.photoMenuWrap}>
                      <button
                        style={S.photoEditBtn}
                        onClick={() => { setPhotoMenuOpenId(id => id === p.id ? null : p.id); setConfirmDeleteId(null) }}
                      >
                        ⋯
                      </button>
                      {photoMenuOpenId === p.id && (
                        <>
                          <div style={S.menuBackdrop} onClick={() => { setPhotoMenuOpenId(null); setConfirmDeleteId(null) }} />
                          <div style={S.photoMenuDropdown}>
                            {confirmDeleteId === p.id ? (
                              <>
                                <div style={S.photoMenuConfirmText}>사진을 삭제할까요?</div>
                                <button style={S.photoMenuItemDanger} onClick={() => handleDeletePhoto(p.id)}>삭제</button>
                                <button style={S.photoMenuItem} onClick={() => setConfirmDeleteId(null)}>취소</button>
                              </>
                            ) : (
                              <button style={S.photoMenuItemDanger} onClick={() => setConfirmDeleteId(p.id)}>🗑️ 사진 삭제</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {photos.length > 1 && (
              <div style={S.dotsRow}>
                {photos.map((_, i) => (
                  <span key={i} style={{ ...S.dot, ...(i === activePhotoIndex ? S.dotActive : {}) }} />
                ))}
              </div>
            )}
          </>
        )}
        {canPost && !compact && (
          <div style={S.addRow}>
            <button
              style={{ ...S.addBtn, opacity: (uploadingPhoto || batchUploading) ? 0.6 : 1 }}
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto || !!batchUploading}
            >
              {batchUploading ? `${batchUploading.done}/${batchUploading.total} 업로드 중...` : uploadingPhoto ? '업로드 중...' : '📷 사진 등록 (여러 장 선택 가능)'}
            </button>
          </div>
        )}
        {canPost && compact && batchUploading && (
          <p style={S.batchStatusCompact}>{batchUploading.done}/{batchUploading.total} 업로드 중...</p>
        )}
        {canPost && (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handlePhotoFileChange}
          />
        )}
      </div>

      {footer}

      {/* Comments */}
      <div style={cardStyle}>
        {!compact && (
          <div style={S.header}>
            <span style={S.title}>코멘트</span>
            <span style={S.count}>{comments.length}개</span>
          </div>
        )}
        <div style={S.commentsList}>
          {comments.length === 0 && !compact && <p style={S.empty}>아직 코멘트가 없어요.</p>}
          {comments.map(c => (
            <div key={c.id} style={S.commentItem}>
              <div style={{ ...S.commentAvatar, background: avBg(c.users?.nickname ?? '?') }}>
                {c.users?.avatar_url
                  ? <img src={c.users.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (c.users?.nickname ?? '?')[0]}
              </div>
              <div style={S.commentBody}>
                <div style={S.commentMetaRow}>
                  <span style={S.commentName}>{c.users?.nickname ?? '탈퇴한 사용자'}</span>
                  <span style={S.commentTime}>{timeAgo(c.created_at)}</span>
                </div>
                <div style={S.commentText}>{c.content}</div>
              </div>
              {c.user_id === currentUserId && (
                confirmDeleteCommentId === c.id ? (
                  <div style={S.commentConfirmRow}>
                    <span style={S.commentConfirmText}>삭제할까요?</span>
                    <button style={S.commentConfirmDanger} onClick={() => handleDeleteComment(c.id)}>삭제</button>
                    <button style={S.commentDeleteBtn} onClick={() => setConfirmDeleteCommentId(null)}>취소</button>
                  </div>
                ) : (
                  <button style={S.commentDeleteBtn} onClick={() => setConfirmDeleteCommentId(c.id)}>삭제</button>
                )
              )}
            </div>
          ))}
        </div>
        {canPost && (
          <div style={{ ...S.commentInputRow, ...(compact ? S.commentInputRowCompact : {}) }}>
            <input
              style={S.commentInput}
              placeholder="코멘트 남기기"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePostComment()}
              maxLength={200}
            />
            <button
              style={{ ...S.commentSendBtn, opacity: commentText.trim() && !postingComment ? 1 : 0.4 }}
              onClick={handlePostComment}
              disabled={!commentText.trim() || postingComment}
            >
              등록
            </button>
          </div>
        )}
      </div>

      {pendingFile && (
        <PhotoAdjustModal
          file={pendingFile}
          uploading={uploadingPhoto}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleConfirmPhoto}
        />
      )}
    </>
  )
})

export default PotSocialSection

const S = {
  card: { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 18, padding: 16 },
  cardCompact: {},
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },
  count: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 600 },
  empty: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px 0', margin: 0 },

  /* Photos — SNS 스타일 풀폭 캐러셀 (밥팟 상세/모먼트 공용) */
  photoScroll: { display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' },
  photoItem: { position: 'relative', flex: '0 0 100%', width: '100%', aspectRatio: '1', scrollSnapAlign: 'start', scrollSnapStop: 'always', background: 'var(--color-surface-2)', overflow: 'hidden', borderRadius: 'var(--radius-md)' },
  photoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  dotsRow: { display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--color-border)', transition: 'width 0.15s, background 0.15s' },
  dotActive: { width: 14, background: 'var(--color-primary)' },

  photoMenuWrap: { position: 'absolute', top: 8, right: 8 },
  photoEditBtn: {
    width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)',
    color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
  },
  menuBackdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  photoMenuDropdown: {
    position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: 120,
    background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.16)', overflow: 'hidden',
  },
  photoMenuItem: {
    width: '100%', padding: '10px 12px', background: 'none', border: 'none', textAlign: 'left',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  photoMenuItemDanger: {
    width: '100%', padding: '10px 12px', background: 'none', border: 'none', textAlign: 'left',
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  photoMenuConfirmText: { padding: '8px 12px 2px', fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },

  addRow: { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' },
  addBtn: { width: '100%', padding: 10, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  batchStatusCompact: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', textAlign: 'center', margin: '4px 0 0' },

  /* Comments */
  commentsList: { display: 'flex', flexDirection: 'column', gap: 12 },
  commentItem: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  commentAvatar: { width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-2xs)' },
  commentBody: { flex: 1, minWidth: 0 },
  commentMetaRow: { display: 'flex', alignItems: 'center', gap: 6 },
  commentName: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text)' },
  commentTime: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  commentText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', marginTop: 2, wordBreak: 'break-word', lineHeight: 1.5 },
  commentDeleteBtn: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, textDecoration: 'underline' },
  commentConfirmRow: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 },
  commentConfirmText: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
  commentConfirmDanger: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, textDecoration: 'underline' },
  commentInputRow: { display: 'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' },
  commentInputRowCompact: { marginTop: 10, paddingTop: 10 },
  commentInput: { flex: 1, padding: '10px 12px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', outline: 'none', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' },
  commentSendBtn: { flexShrink: 0, padding: '0 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
}
