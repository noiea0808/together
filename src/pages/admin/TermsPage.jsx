import { useState, useEffect } from 'react'
import { getAllTerms, createTerm, updateTerm, deleteTerm } from '../../lib/db'

const TYPE_OPTIONS = [
  { value: 'tos', label: '이용약관' },
  { value: 'privacy', label: '개인정보 처리방침' },
  { value: 'etc', label: '기타' },
]
const typeLabel = (v) => TYPE_OPTIONS.find(t => t.value === v)?.label ?? v

const EMPTY = { type: 'tos', title: '', content: '', version: '', is_required: true, is_active: true, sort_order: 0 }

export default function TermsPage() {
  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | term object (id 없으면 신규)
  const [originalVersion, setOriginalVersion] = useState(null) // 재동의 트리거 여부 판단용 — 수정 시작 시점의 version
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    getAllTerms().then(setTerms).catch(() => setTerms([])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openNew = () => { setEditing({ ...EMPTY, sort_order: terms.length + 1 }); setOriginalVersion(null) }
  const openEdit = (t) => { setEditing({ ...t }); setOriginalVersion(t.version?.trim() || null) }

  const save = async () => {
    if (!editing.title.trim()) return
    const payload = {
      type: editing.type,
      title: editing.title.trim(),
      content: editing.content ?? '',
      version: editing.version?.trim() || null,
      is_required: editing.is_required,
      is_active: editing.is_active,
      sort_order: Number(editing.sort_order) || 0,
    }

    // 기존 필수+활성 약관의 버전을 바꾸는 경우에만 재동의가 트리거되므로, 그 경우에 한해 한 번 더 확인한다.
    const versionChanged = editing.id && payload.version !== originalVersion
    if (versionChanged && payload.is_required && payload.is_active) {
      if (!confirm('버전을 변경하면 이미 동의한 사용자도 다음 접속 시 재동의해야 합니다. 계속할까요?')) return
    }

    setSaving(true)
    try {
      if (editing.id) await updateTerm(editing.id, payload)
      else await createTerm(payload)
      setEditing(null)
      load()
    } catch (e) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t) => {
    if (!confirm(`"${t.title}" 약관을 삭제할까요?`)) return
    try {
      await deleteTerm(t.id)
      load()
    } catch (e) {
      alert('삭제 실패: ' + e.message)
    }
  }

  const toggleActive = async (t) => {
    try {
      await updateTerm(t.id, { is_active: !t.is_active })
      load()
    } catch (e) {
      alert('변경 실패: ' + e.message)
    }
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>약관 관리</h1>
          <p style={s.subtitle}>온보딩(가입) 화면에 노출되는 약관을 관리합니다. 활성 상태인 약관만 사용자에게 표시됩니다.</p>
        </div>
        <button style={s.addBtn} onClick={openNew}>+ 약관 추가</button>
      </div>

      {loading ? (
        <p style={s.muted}>불러오는 중...</p>
      ) : terms.length === 0 ? (
        <p style={s.muted}>등록된 약관이 없습니다. "약관 추가"로 만들어주세요.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>순서</th>
              <th style={s.th}>구분</th>
              <th style={s.th}>제목</th>
              <th style={s.th}>필수</th>
              <th style={s.th}>버전</th>
              <th style={s.th}>활성</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {terms.map(t => (
              <tr key={t.id} style={s.tr}>
                <td style={s.td}>{t.sort_order}</td>
                <td style={s.td}>{typeLabel(t.type)}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>
                  <button style={s.titleBtn} onClick={() => openEdit(t)}>{t.title}</button>
                </td>
                <td style={s.td}>
                  <span style={t.is_required ? s.badgeReq : s.badgeOpt}>
                    {t.is_required ? '필수' : '선택'}
                  </span>
                </td>
                <td style={s.td}>{t.version || '—'}</td>
                <td style={s.td}>
                  <button style={{ ...s.toggle, ...(t.is_active ? s.toggleOn : {}) }} onClick={() => toggleActive(t)}>
                    {t.is_active ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button style={{ ...s.linkBtn, color: '#E04545' }} onClick={() => remove(t)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 편집 모달 (제목 클릭 시 바로 열림 — 내용 확인 + 수정을 겸함) */}
      {editing && (
        <div style={s.overlay} onClick={() => !saving && setEditing(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>{editing.id ? '약관 수정' : '약관 추가'}</h2>

            <div style={s.formGrid}>
              <div style={{ ...s.formRow, flex: '0 0 140px' }}>
                <label style={s.label}>구분</label>
                <select style={s.input} value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div style={s.formRow}>
                <label style={s.label}>제목</label>
                <input style={s.input} value={editing.title} placeholder="예: 이용약관 동의"
                  onChange={e => setEditing({ ...editing, title: e.target.value })} />
              </div>
            </div>

            <div style={s.formRow}>
              <label style={s.label}>본문</label>
              <textarea style={{ ...s.input, height: 200, resize: 'vertical', fontFamily: 'inherit' }}
                value={editing.content} placeholder="약관 전문을 입력하세요."
                onChange={e => setEditing({ ...editing, content: e.target.value })} />
            </div>

            <div style={s.formGrid}>
              <div style={s.formRow}>
                <label style={s.label}>버전</label>
                <input style={s.input} value={editing.version ?? ''} placeholder="예: 1.0"
                  onChange={e => setEditing({ ...editing, version: e.target.value })} />
                <span style={s.hint}>필수 약관의 버전을 바꾸면 이미 동의한 사용자도 다음 접속 시 재동의 화면을 보게 됩니다.</span>
              </div>
              <div style={s.formRow}>
                <label style={s.label}>정렬 순서</label>
                <input style={s.input} type="number" value={editing.sort_order}
                  onChange={e => setEditing({ ...editing, sort_order: e.target.value })} />
              </div>
            </div>

            <div style={s.checkRow}>
              <label style={s.checkLabel}>
                <input type="checkbox" checked={editing.is_required}
                  onChange={e => setEditing({ ...editing, is_required: e.target.checked })} />
                필수 동의 항목
              </label>
              <label style={s.checkLabel}>
                <input type="checkbox" checked={editing.is_active}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                활성 (사용자에게 노출)
              </label>
            </div>

            <div style={s.modalBtns}>
              <button style={s.cancelBtn} onClick={() => setEditing(null)} disabled={saving}>취소</button>
              <button style={s.saveBtn} onClick={save} disabled={saving || !editing.title.trim()}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: 800, margin: 0 },
  subtitle: { fontSize: 13, color: '#6A6A80', marginTop: 6, maxWidth: 540, lineHeight: 1.5 },
  addBtn: { flexShrink: 0, background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  muted: { color: '#8A8AA0', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8AA0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '12px 14px', borderBottom: '1px solid #EEE', background: '#FAFAFC' },
  tr: { borderBottom: '1px solid #F0F0F4' },
  td: { padding: '12px 14px', fontSize: 13, color: '#1A1A1A', verticalAlign: 'middle' },
  badgeReq: { fontSize: 11, fontWeight: 700, color: '#FF6B35', background: '#FFF0EA', padding: '2px 8px', borderRadius: 4 },
  badgeOpt: { fontSize: 11, fontWeight: 700, color: '#7070A0', background: '#F0F0F8', padding: '2px 8px', borderRadius: 4 },
  toggle: { border: '1.5px solid #D0D0DC', background: '#fff', color: '#9090A8', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  toggleOn: { borderColor: '#34A853', background: '#34A853', color: '#fff' },
  linkBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#FF6B35', fontWeight: 600, marginLeft: 10, padding: 2 },
  titleBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600, color: '#1A1A1A', textAlign: 'left' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, margin: 0 },
  formRow: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  formGrid: { display: 'flex', gap: 16 },
  label: { fontSize: 12, fontWeight: 700, color: '#4A4A60' },
  hint: { fontSize: 11, color: '#9090A8', lineHeight: 1.4 },
  input: { padding: '10px 12px', border: '1.5px solid #DDD', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', width: '100%' },
  checkRow: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1A1A1A', cursor: 'pointer' },
  modalBtns: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: { background: '#F0F0F4', color: '#4A4A60', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  saveBtn: { background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}
