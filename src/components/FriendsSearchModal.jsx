import { useState, useEffect } from 'react'
import {
  searchUsers, getMyFriendRequests,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest, cancelFriendRequest,
} from '../lib/db'

// 친구 검색 + 받은/보낸 요청 관리 팝업. 맺어진 친구 목록 자체는 "친구 관리"
// 메인 화면(같은 그룹 멤버와 합쳐진 통합 목록)에서 보여주므로 여기서는 다루지 않는다.
// initialTab: 알림(친구 요청 도착)에서 들어온 경우 'requests' 탭으로 바로 연다.
export default function FriendsSearchModal({ myUserId, initialTab = 'search', onClose }) {
  const [tab, setTab] = useState(initialTab)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = 검색 전
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [actingId, setActingId] = useState(null)

  const reloadRequests = () => {
    setRequestsLoading(true)
    getMyFriendRequests().then(setRequests).catch(e => console.error(e)).finally(() => setRequestsLoading(false))
  }

  useEffect(() => { reloadRequests() }, [])

  const receivedRequests = requests.filter(r => r.direction === 'received')
  const sentRequests = requests.filter(r => r.direction === 'sent')

  const runSearch = async () => {
    const q = query.trim()
    if (q.length < 2 || searching) return
    setSearching(true)
    setSearchError(null)
    try {
      const data = await searchUsers(q)
      setResults(data)
    } catch (e) {
      console.error(e)
      setSearchError('검색에 실패했어요.')
    } finally {
      setSearching(false)
    }
  }

  const withActing = async (id, fn) => {
    if (actingId) return
    setActingId(id)
    try {
      await fn()
    } catch (e) {
      console.error(e)
    } finally {
      setActingId(null)
    }
  }

  const handleAdd = (targetId) => withActing(targetId, async () => {
    await sendFriendRequest(myUserId, targetId)
    setResults(prev => prev?.map(r => r.id === targetId ? { ...r, relation: 'pending_sent' } : r) ?? prev)
    reloadRequests()
  })

  // 상대가 이미 나에게 보낸 요청이 있는 경우 — sendFriendRequest가 내부적으로 맞요청을
  // 감지해서 바로 수락 처리해주므로, 여기서 요청 id를 따로 찾을 필요가 없다.
  const handleAcceptFromSearch = (targetId) => withActing(targetId, async () => {
    await sendFriendRequest(myUserId, targetId)
    setResults(prev => prev?.map(r => r.id === targetId ? { ...r, relation: 'friends' } : r) ?? prev)
    reloadRequests()
  })

  const handleAcceptRequest = (reqId) => withActing(reqId, async () => {
    await acceptFriendRequest(reqId, myUserId)
    reloadRequests()
  })

  const handleDeclineRequest = (reqId) => withActing(reqId, async () => {
    await declineFriendRequest(reqId, myUserId)
    reloadRequests()
  })

  const handleCancelRequest = (reqId) => withActing(reqId, async () => {
    await cancelFriendRequest(reqId, myUserId)
    reloadRequests()
  })

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.dialog} onClick={e => e.stopPropagation()}>
        <div style={S.title}>친구 찾기</div>

        <div style={S.tabs}>
          <button style={{ ...S.tabBtn, ...(tab === 'search' ? S.tabBtnActive : {}) }} onClick={() => setTab('search')}>검색</button>
          <button style={{ ...S.tabBtn, ...(tab === 'requests' ? S.tabBtnActive : {}) }} onClick={() => setTab('requests')}>
            요청{receivedRequests.length > 0 ? ` (${receivedRequests.length})` : ''}
          </button>
        </div>

        {tab === 'search' && (
          <div style={S.panel}>
            <div style={S.searchRow}>
              <input
                style={S.searchInput}
                placeholder="이메일 또는 닉네임"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                autoFocus
              />
              <button style={S.searchBtn} onClick={runSearch} disabled={query.trim().length < 2 || searching}>
                {searching ? '...' : '검색'}
              </button>
            </div>
            {searchError && <p style={S.errorMsg}>{searchError}</p>}

            <div style={S.resultList}>
              {results === null ? (
                <div style={S.emptyMsg}>이메일은 정확히, 닉네임은 일부만 입력해도 찾을 수 있어요.</div>
              ) : results.length === 0 ? (
                <div style={S.emptyMsg}>일치하는 사용자가 없어요.</div>
              ) : results.map(r => (
                <div key={r.id} style={S.resultRow}>
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" style={S.avatarImg} />
                  ) : (
                    <div style={S.avatar}>{r.nickname[0]}</div>
                  )}
                  <span style={S.resultName}>{r.nickname}</span>
                  {r.relation === 'friends' ? (
                    <span style={S.badgeDone}>친구</span>
                  ) : r.relation === 'pending_sent' ? (
                    <span style={S.badgeMuted}>요청 보냄</span>
                  ) : r.relation === 'pending_received' ? (
                    <button style={S.actionBtn} onClick={() => handleAcceptFromSearch(r.id)} disabled={actingId === r.id}>
                      {actingId === r.id ? '...' : '수락하기'}
                    </button>
                  ) : (
                    <button style={S.actionBtn} onClick={() => handleAdd(r.id)} disabled={actingId === r.id}>
                      {actingId === r.id ? '...' : '친구 추가'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'requests' && (
          <div style={S.panel}>
            <div style={S.subLabel}>받은 요청</div>
            <div style={S.resultList}>
              {requestsLoading ? (
                <div style={S.emptyMsg}>불러오는 중...</div>
              ) : receivedRequests.length === 0 ? (
                <div style={S.emptyMsg}>받은 요청이 없어요.</div>
              ) : receivedRequests.map(r => (
                <div key={r.id} style={S.resultRow}>
                  {r.other_avatar_url ? (
                    <img src={r.other_avatar_url} alt="" style={S.avatarImg} />
                  ) : (
                    <div style={S.avatar}>{r.other_nickname[0]}</div>
                  )}
                  <span style={S.resultName}>{r.other_nickname}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={S.actionBtnSmall} onClick={() => handleAcceptRequest(r.id)} disabled={actingId === r.id}>수락</button>
                    <button style={S.actionBtnMuted} onClick={() => handleDeclineRequest(r.id)} disabled={actingId === r.id}>거절</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...S.subLabel, marginTop: 10 }}>보낸 요청</div>
            <div style={S.resultList}>
              {requestsLoading ? null : sentRequests.length === 0 ? (
                <div style={S.emptyMsg}>보낸 요청이 없어요.</div>
              ) : sentRequests.map(r => (
                <div key={r.id} style={S.resultRow}>
                  {r.other_avatar_url ? (
                    <img src={r.other_avatar_url} alt="" style={S.avatarImg} />
                  ) : (
                    <div style={S.avatar}>{r.other_nickname[0]}</div>
                  )}
                  <span style={S.resultName}>{r.other_nickname}</span>
                  <button style={S.actionBtnMuted} onClick={() => handleCancelRequest(r.id)} disabled={actingId === r.id}>취소</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button style={S.closeBtn} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 },
  dialog: { width: '100%', maxWidth: 'var(--max-width)', maxHeight: '82vh', overflowY: 'auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  tabs: { display: 'flex', gap: 6 },
  tabBtn: { flex: 1, padding: '9px 0', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' },
  tabBtnActive: { border: '1.5px solid var(--color-primary)', background: 'var(--color-primary-a10)', color: 'var(--color-primary)' },
  panel: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 },
  searchRow: { display: 'flex', gap: 8 },
  searchInput: { flex: 1, padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  searchBtn: { flexShrink: 0, padding: '0 18px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  errorMsg: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', margin: 0 },
  subLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  resultList: { display: 'flex', flexDirection: 'column', gap: 8 },
  emptyMsg: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', padding: '14px 0' },
  resultRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: '#9B9285', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-xs)', flexShrink: 0 },
  avatarImg: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  resultName: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actionBtn: { flexShrink: 0, padding: '6px 12px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
  actionBtnSmall: { flexShrink: 0, padding: '6px 12px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
  actionBtnMuted: { flexShrink: 0, padding: '6px 12px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', cursor: 'pointer' },
  badgeDone: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-success)', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-full)', padding: '4px 10px' },
  badgeMuted: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 10px' },
  closeBtn: { width: '100%', padding: 12, marginTop: 4, background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
}
