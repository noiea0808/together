import { useState, useEffect, useMemo } from 'react'
import { getAllReportsAdmin, resolveReportAdmin, suspendUserAdmin } from '../../lib/adminDb'
import { useAdminAuth } from '../../lib/AdminAuthContext'

const STATUS_LABEL = { pending: '대기', reviewing: '처리중', resolved: '해결', dismissed: '반려' }
const STATUS_COLOR = {
  pending: { color: '#E65100', background: '#FFF3E0' },
  reviewing: { color: '#1565C0', background: '#E3F2FD' },
  resolved: { color: '#2E7D32', background: '#E8F5E9' },
  dismissed: { color: '#6A6A80', background: '#F0F0F4' },
}
const TARGET_LABEL = {
  pot: '모먼트',
  pot_comment: '밥팟 댓글',
  wish_place: '위시플레이스',
  wish_place_comment: '위시플레이스 댓글',
  user: '사용자',
}
const TABS = ['전체', '대기', '처리중', '해결', '반려']

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ReportsPage() {
  const { adminUser } = useAdminAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('전체')
  const [busyId, setBusyId] = useState(null)

  const load = () => {
    setLoading(true)
    getAllReportsAdmin().then(setReports).catch(() => setReports([])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    if (tab === '전체') return reports
    const key = Object.entries(STATUS_LABEL).find(([, label]) => label === tab)?.[0]
    return reports.filter(r => r.status === key)
  }, [reports, tab])

  const handleResolve = async (report, status) => {
    let actionTaken = null
    if (status === 'resolved') {
      actionTaken = prompt('어떤 조치를 취했는지 간단히 남겨주세요. (예: 콘텐츠 삭제, 경고 안내 등)')
      if (actionTaken === null) return // 취소
    } else {
      if (!confirm('이 신고를 반려할까요?')) return
    }
    setBusyId(report.id)
    try {
      await resolveReportAdmin(report.id, adminUser.id, status, actionTaken)
      load()
    } catch (e) {
      alert('처리 실패: ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  const handleSuspend = async (report) => {
    const reason = prompt('정지 사유를 입력하세요.')
    if (!reason) return
    const untilInput = prompt('정지 종료일을 입력하세요 (YYYY-MM-DD, 무기한이면 비워두기)')
    const until = untilInput ? new Date(`${untilInput}T00:00:00`).toISOString() : null
    if (!confirm(`이 사용자 계정을 ${until ? untilInput + '까지' : '무기한'} 정지할까요?`)) return
    setBusyId(report.id)
    try {
      await suspendUserAdmin(report.target_id, reason, until)
      await resolveReportAdmin(report.id, adminUser.id, 'resolved', `계정 정지: ${reason}`)
      load()
    } catch (e) {
      alert('정지 처리 실패: ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>신고/제재 관리</h1>
          <p style={s.subtitle}>사용자가 접수한 신고 목록입니다. 검토 후 반려하거나 조치를 남기고 해결 처리하세요.</p>
        </div>
      </div>

      <div style={s.tabRow}>
        {TABS.map(t => (
          <button key={t} style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }} onClick={() => setTab(t)}>
            {t}
            {t !== '전체' && (
              <span style={s.tabCount}>{reports.filter(r => STATUS_LABEL[r.status] === t).length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={s.muted}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p style={s.muted}>해당하는 신고가 없습니다.</p>
      ) : (
        <div style={s.list}>
          {filtered.map(r => (
            <div key={r.id} style={s.card}>
              <div style={s.cardTop}>
                <div style={s.badgeRow}>
                  <span style={s.targetBadge}>{TARGET_LABEL[r.target_type] ?? r.target_type}</span>
                  <span style={{ ...s.statusBadge, ...STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                </div>
                <span style={s.date}>{formatDateTime(r.created_at)}</span>
              </div>

              <div style={s.body}>
                <div style={s.row}><span style={s.label}>사유</span><span>{r.reason}</span></div>
                {r.detail && <div style={s.row}><span style={s.label}>상세</span><span style={s.detailText}>{r.detail}</span></div>}
                <div style={s.row}><span style={s.label}>신고자</span><span>{r.reporter?.nickname ?? '알 수 없음'} ({r.reporter?.email ?? '—'})</span></div>
                <div style={s.row}><span style={s.label}>대상 ID</span><span style={s.mono}>{r.target_id}</span></div>
                {r.action_taken && <div style={s.row}><span style={s.label}>조치 내역</span><span>{r.action_taken}</span></div>}
                {r.resolved_at && (
                  <div style={s.row}><span style={s.label}>처리</span><span>{r.resolver?.nickname ?? '—'} · {formatDateTime(r.resolved_at)}</span></div>
                )}
              </div>

              {(r.status === 'pending' || r.status === 'reviewing') && (
                <div style={s.actions}>
                  {r.target_type === 'user' && (
                    <button style={s.suspendBtn} onClick={() => handleSuspend(r)} disabled={busyId === r.id}>계정 정지</button>
                  )}
                  <button style={s.resolveBtn} onClick={() => handleResolve(r, 'resolved')} disabled={busyId === r.id}>해결 처리</button>
                  <button style={s.dismissBtn} onClick={() => handleResolve(r, 'dismissed')} disabled={busyId === r.id}>반려</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 800, margin: 0 },
  subtitle: { fontSize: 13, color: '#6A6A80', marginTop: 6, maxWidth: 560, lineHeight: 1.5 },
  muted: { color: '#8A8AA0', fontSize: 14 },

  tabRow: { display: 'flex', gap: 6, marginBottom: 18 },
  tabBtn: {
    display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #DDD', background: '#fff',
    color: '#6A6A80', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  tabBtnActive: { borderColor: '#FF6B35', background: '#FF6B35', color: '#fff' },
  tabCount: { fontSize: 11, opacity: 0.8 },

  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  badgeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  targetBadge: { fontSize: 11, fontWeight: 700, color: '#7070A0', background: '#F0F0F8', padding: '2px 8px', borderRadius: 4 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 },
  date: { fontSize: 12, color: '#9090A8' },

  body: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#1A1A1A' },
  row: { display: 'flex', gap: 8 },
  label: { flexShrink: 0, width: 60, color: '#9090A8', fontWeight: 600 },
  detailText: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#6A6A80' },

  actions: { display: 'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid #F0F0F4' },
  resolveBtn: { border: '1.5px solid #34A853', background: '#fff', color: '#34A853', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  dismissBtn: { border: '1.5px solid #D0D0DC', background: '#fff', color: '#6A6A80', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  suspendBtn: { border: '1.5px solid #E04545', background: '#fff', color: '#E04545', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
}
