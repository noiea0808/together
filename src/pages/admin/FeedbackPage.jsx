import { useState, useEffect, useMemo } from 'react'
import { getAllFeedbackAdmin, replyToFeedbackAdmin } from '../../lib/adminDb'
import { useAdminAuth } from '../../lib/AdminAuthContext'

const STATUS_LABEL = { pending: '대기', answered: '답변완료' }
const STATUS_COLOR = {
  pending: { color: '#E65100', background: '#FFF3E0' },
  answered: { color: '#2E7D32', background: '#E8F5E9' },
}
const TABS = ['전체', '대기', '답변완료']

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function truncate(text, max = 40) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function FeedbackPage() {
  const { adminUser } = useAdminAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('전체')
  const [selected, setSelected] = useState(null) // null | feedback row
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    getAllFeedbackAdmin().then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    if (tab === '전체') return items
    const key = Object.entries(STATUS_LABEL).find(([, label]) => label === tab)?.[0]
    return items.filter(i => i.status === key)
  }, [items, tab])

  const openRow = (item) => { setSelected(item); setReplyText(item.reply ?? '') }

  const save = async () => {
    if (!replyText.trim() || saving) return
    setSaving(true)
    try {
      await replyToFeedbackAdmin(selected.id, adminUser.id, selected.user_id, replyText.trim())
      setSelected(null)
      load()
    } catch (e) {
      alert('답변 등록 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>사용자 의견</h1>
          <p style={s.subtitle}>사용자가 남긴 의견 목록입니다. 항목을 선택해 답변을 등록하면 해당 사용자에게 알림/푸시가 전송됩니다.</p>
        </div>
      </div>

      <div style={s.tabRow}>
        {TABS.map(t => (
          <button key={t} style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }} onClick={() => setTab(t)}>
            {t}
            {t !== '전체' && (
              <span style={s.tabCount}>{items.filter(i => STATUS_LABEL[i.status] === t).length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={s.muted}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p style={s.muted}>해당하는 의견이 없습니다.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>상태</th>
              <th style={s.th}>작성자</th>
              <th style={s.th}>내용</th>
              <th style={s.th}>접수일</th>
              <th style={s.th}>답변일</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} style={s.tr} onClick={() => openRow(item)}>
                <td style={s.td}>
                  <span style={{ ...s.statusBadge, ...STATUS_COLOR[item.status] }}>{STATUS_LABEL[item.status]}</span>
                </td>
                <td style={{ ...s.td, fontWeight: 600 }}>{item.user?.nickname ?? '알 수 없음'}</td>
                <td style={s.td}>{truncate(item.content)}</td>
                <td style={s.td}>{formatDateTime(item.created_at)}</td>
                <td style={s.td}>{formatDateTime(item.replied_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div style={s.overlay} onClick={() => !saving && setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>의견 상세</h2>

            <div style={s.modalMeta}>
              <span style={{ ...s.statusBadge, ...STATUS_COLOR[selected.status] }}>{STATUS_LABEL[selected.status]}</span>
              <span style={s.modalMetaText}>{selected.user?.nickname ?? '알 수 없음'} ({selected.user?.email ?? '—'})</span>
              <span style={s.modalMetaText}>{formatDateTime(selected.created_at)}</span>
            </div>

            <div style={s.modalContent}>{selected.content}</div>

            <div style={s.formRow}>
              <label style={s.label}>답변</label>
              <textarea
                style={{ ...s.input, height: 140, resize: 'vertical', fontFamily: 'inherit' }}
                value={replyText}
                placeholder="사용자에게 보낼 답변을 입력하세요."
                onChange={e => setReplyText(e.target.value)}
              />
            </div>
            {selected.replied_at && (
              <p style={s.repliedHint}>이전 답변: {selected.replier?.nickname ?? '—'} · {formatDateTime(selected.replied_at)}</p>
            )}

            <div style={s.modalBtns}>
              <button style={s.cancelBtn} onClick={() => setSelected(null)} disabled={saving}>닫기</button>
              <button style={s.saveBtn} onClick={save} disabled={saving || !replyText.trim()}>
                {saving ? '저장 중...' : (selected.status === 'answered' ? '답변 수정' : '답변 등록')}
              </button>
            </div>
          </div>
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

  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8AA0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '12px 14px', borderBottom: '1px solid #EEE', background: '#FAFAFC' },
  tr: { borderBottom: '1px solid #F0F0F4', cursor: 'pointer' },
  td: { padding: '12px 14px', fontSize: 13, color: '#1A1A1A', verticalAlign: 'middle' },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, margin: 0 },
  modalMeta: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: -8 },
  modalMetaText: { fontSize: 12, color: '#8A8AA0', fontWeight: 600 },
  modalContent: { fontSize: 14, color: '#1A1A1A', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#FAFAFC', border: '1px solid #EEE', borderRadius: 8, padding: 14 },
  formRow: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  label: { fontSize: 12, fontWeight: 700, color: '#4A4A60' },
  input: { padding: '10px 12px', border: '1.5px solid #DDD', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', width: '100%' },
  repliedHint: { fontSize: 12, color: '#9090A8', margin: 0 },
  modalBtns: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: { background: '#F0F0F4', color: '#4A4A60', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  saveBtn: { background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}
