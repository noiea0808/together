import { useState, useEffect, useMemo } from 'react'
import { getAllUsersAdmin, setUserAdminFlag, deleteUserAdmin } from '../../lib/adminDb'
import { useAdminAuth } from '../../lib/AdminAuthContext'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function UsersPage() {
  const { adminUser } = useAdminAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    setLoading(true)
    getAllUsersAdmin().then(setUsers).catch(() => setUsers([])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      u.nickname?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    )
  }, [users, query])

  const toggleAdmin = async (u) => {
    if (u.id === adminUser?.id) return // 본인 권한은 여기서 해제 불가 (실수 방지)
    const next = !u.is_admin
    if (!confirm(`"${u.nickname}"의 관리자 권한을 ${next ? '부여' : '해제'}할까요?`)) return
    setUpdatingId(u.id)
    try {
      await setUserAdminFlag(u.id, next)
      load()
    } catch (e) {
      alert('변경 실패: ' + e.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDelete = async (u) => {
    if (u.id === adminUser?.id) return // 본인 계정은 여기서 삭제 불가
    if (!confirm(`"${u.nickname}" 계정을 완전히 삭제할까요?\n\n작성한 상태·밥팟 참여·그룹 정보가 모두 삭제되며 되돌릴 수 없습니다.`)) return
    setDeletingId(u.id)
    try {
      await deleteUserAdmin(u.id)
      load()
    } catch (e) {
      alert('삭제 실패: ' + e.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>사용자 관리</h1>
          <p style={s.subtitle}>현재 등록된 전체 사용자 목록입니다. 관리자 권한은 아래 토글로 부여/해제할 수 있습니다.</p>
        </div>
        <input
          style={s.search}
          placeholder="닉네임 또는 이메일 검색"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p style={s.muted}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p style={s.muted}>{query ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다.'}</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>닉네임</th>
              <th style={s.th}>이메일</th>
              <th style={s.th}>가입일</th>
              <th style={s.th}>상태</th>
              <th style={s.th}>생년월일</th>
              <th style={s.th}>라이프스타일</th>
              <th style={s.th}>약관동의</th>
              <th style={s.th}>그룹 수</th>
              <th style={s.th}>관리자</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} style={s.tr}>
                <td style={{ ...s.td, fontWeight: 600 }}>{u.nickname}</td>
                <td style={s.td}>{u.email || '—'}</td>
                <td style={s.td}>{formatDate(u.created_at)}</td>
                <td style={s.td}>
                  {u.is_guest && <span style={s.badgeGuest}>게스트</span>}
                  {!u.is_guest && (
                    <span style={u.onboarded ? s.badgeDone : s.badgePending}>
                      {u.onboarded ? '온보딩 완료' : '온보딩 미완료'}
                    </span>
                  )}
                </td>
                <td style={s.td}>{formatDate(u.birthdate)}</td>
                <td style={s.td}>{u.lifestyle || '—'}</td>
                <td style={s.td}>
                  {u.required_total_count === 0 ? (
                    '—'
                  ) : (
                    <span
                      style={u.agreed_required_count >= u.required_total_count ? s.badgeDone : s.badgePending}
                      title={u.agreed_term_titles.length > 0 ? u.agreed_term_titles.join(', ') : '동의한 약관 없음'}
                    >
                      {u.agreed_required_count}/{u.required_total_count}
                    </span>
                  )}
                </td>
                <td style={s.td}>{u.group_count}</td>
                <td style={s.td}>
                  <button
                    style={{ ...s.toggle, ...(u.is_admin ? s.toggleOn : {}) }}
                    onClick={() => toggleAdmin(u)}
                    disabled={updatingId === u.id || u.id === adminUser?.id}
                    title={u.id === adminUser?.id ? '본인 권한은 여기서 변경할 수 없습니다' : undefined}
                  >
                    {u.is_admin ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    style={s.deleteBtn}
                    onClick={() => handleDelete(u)}
                    disabled={deletingId === u.id || u.id === adminUser?.id}
                    title={u.id === adminUser?.id ? '본인 계정은 여기서 삭제할 수 없습니다' : undefined}
                  >
                    {deletingId === u.id ? '삭제 중...' : '삭제'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: 800, margin: 0 },
  subtitle: { fontSize: 13, color: '#6A6A80', marginTop: 6, maxWidth: 540, lineHeight: 1.5 },
  search: { flexShrink: 0, padding: '10px 14px', border: '1.5px solid #DDD', borderRadius: 8, fontSize: 13, outline: 'none', width: 220 },
  muted: { color: '#8A8AA0', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8AA0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '12px 14px', borderBottom: '1px solid #EEE', background: '#FAFAFC' },
  tr: { borderBottom: '1px solid #F0F0F4' },
  td: { padding: '12px 14px', fontSize: 13, color: '#1A1A1A', verticalAlign: 'middle' },
  badgeDone: { fontSize: 11, fontWeight: 700, color: '#34A853', background: '#EAF7EE', padding: '2px 8px', borderRadius: 4 },
  badgePending: { fontSize: 11, fontWeight: 700, color: '#E65100', background: '#FFF3E0', padding: '2px 8px', borderRadius: 4 },
  badgeGuest: { fontSize: 11, fontWeight: 700, color: '#7070A0', background: '#F0F0F8', padding: '2px 8px', borderRadius: 4 },
  toggle: { border: '1.5px solid #D0D0DC', background: '#fff', color: '#9090A8', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  toggleOn: { borderColor: '#FF6B35', background: '#FF6B35', color: '#fff' },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#E04545', fontWeight: 600, padding: 2 },
}
