import { useState, useEffect } from 'react'
import { getAllDailyTips, createDailyTip, updateDailyTip, deleteDailyTip, uploadDailyTipImage } from '../../lib/db'
import { resizeImageFile } from '../../lib/resizeImage'

const EMPTY = { content: '', image_url: null, is_active: true, is_featured: false, sort_order: 0 }

const CATEGORY_TABS = [
  { key: 'tip', label: '오늘의 팁', addLabel: '+ 팁 추가', empty: '등록된 팁이 없습니다. "팁 추가"로 만들어주세요.',
    subtitle: '로그인 후 접속할 때마다 뜨는 팁 팝업입니다. 활성 상태인 팁만 랜덤 순서로 사용자에게 노출되며, 별표 표시한 팁은 노출 가중치가 2배 적용됩니다.' },
  { key: 'guide', label: "'같이먹자' 시작하기", addLabel: '+ 안내 추가', empty: '등록된 시작 안내가 없습니다. "안내 추가"로 만들어주세요.',
    subtitle: '' },
]

function truncate(text, max = 40) {
  const t = text.trim()
  if (!t) return '(사진만 등록됨)'
  return t.length > max ? t.slice(0, max) + '…' : t
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function TipsPage() {
  const [tips, setTips] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | tip object (id 없으면 신규) + _newImageFile
  const [saving, setSaving] = useState(false)
  const [activeCategory, setActiveCategory] = useState('tip')

  const load = () => {
    setLoading(true)
    getAllDailyTips().then(setTips).catch(() => setTips([])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const tab = CATEGORY_TABS.find(t => t.key === activeCategory)
  const filteredTips = tips
    .filter(t => (t.category ?? 'tip') === activeCategory)
    .sort((a, b) => activeCategory === 'guide' ? a.sort_order - b.sort_order : 0)

  const openNew = () => setEditing({ ...EMPTY, category: activeCategory, sort_order: filteredTips.length + 1, _newImageFile: null })
  const openEdit = (t) => setEditing({ ...t, _newImageFile: null })

  const hasContent = (t) => !!t.content.trim() || !!t.image_url || !!t._newImageFile

  const save = async () => {
    if (!hasContent(editing)) return
    setSaving(true)
    try {
      let image_url = editing.image_url ?? null
      if (editing._newImageFile) {
        const blob = await resizeImageFile(editing._newImageFile)
        image_url = await uploadDailyTipImage(blob)
      }
      const payload = {
        content: editing.content.trim(), image_url, is_active: editing.is_active,
        is_featured: editing.is_featured, category: editing.category, sort_order: Number(editing.sort_order) || 0,
      }
      if (editing.id) await updateDailyTip(editing.id, payload)
      else await createDailyTip(payload)
      setEditing(null)
      load()
    } catch (e) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t) => {
    if (!confirm(`"${truncate(t.content, 20)}" 팁을 삭제할까요?`)) return
    try {
      await deleteDailyTip(t.id)
      load()
    } catch (e) {
      alert('삭제 실패: ' + e.message)
    }
  }

  const toggleActive = async (t) => {
    try {
      await updateDailyTip(t.id, { is_active: !t.is_active })
      load()
    } catch (e) {
      alert('변경 실패: ' + e.message)
    }
  }

  const toggleFeatured = async (t) => {
    try {
      await updateDailyTip(t.id, { is_featured: !t.is_featured })
      load()
    } catch (e) {
      alert('변경 실패: ' + e.message)
    }
  }

  const previewSrc = editing?._newImageFile ? URL.createObjectURL(editing._newImageFile) : editing?.image_url

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>오늘의 팁 관리</h1>
          {tab.subtitle && <p style={s.subtitle}>{tab.subtitle}</p>}
        </div>
      </div>

      <div style={s.tabRow}>
        {CATEGORY_TABS.map(t => (
          <button
            key={t.key}
            style={{ ...s.tabBtn, ...(activeCategory === t.key ? s.tabBtnActive : {}) }}
            onClick={() => setActiveCategory(t.key)}
          >
            {t.label}
          </button>
        ))}
        <button style={s.addBtn} onClick={openNew}>{tab.addLabel}</button>
      </div>

      {loading ? (
        <p style={s.muted}>불러오는 중...</p>
      ) : filteredTips.length === 0 ? (
        <p style={s.muted}>{tab.empty}</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{activeCategory === 'guide' ? '순서' : '별표'}</th>
              <th style={s.th}>등록일</th>
              <th style={s.th}>활성</th>
              <th style={s.th}>내용</th>
              <th style={s.th}>이미지</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredTips.map(t => (
              <tr key={t.id} style={s.tr}>
                <td style={s.td}>
                  {activeCategory === 'guide' ? (
                    <span style={{ color: '#8A8AA0' }}>{t.sort_order}</span>
                  ) : (
                    <button style={s.starBtn} onClick={() => toggleFeatured(t)} aria-label="별표">
                      {t.is_featured ? '⭐' : '☆'}
                    </button>
                  )}
                </td>
                <td style={{ ...s.td, whiteSpace: 'nowrap', color: '#8A8AA0' }}>{formatDate(t.created_at)}</td>
                <td style={s.td}>
                  <button style={{ ...s.toggle, ...(t.is_active ? s.toggleOn : {}) }} onClick={() => toggleActive(t)}>
                    {t.is_active ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td style={{ ...s.td, maxWidth: 360, cursor: 'pointer' }} onClick={() => openEdit(t)}>{truncate(t.content, 60)}</td>
                <td style={s.td}>
                  {t.image_url ? <img src={t.image_url} alt="" style={s.thumb} /> : <div style={s.thumbEmpty}>—</div>}
                </td>
                <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button style={s.linkBtn} onClick={() => openEdit(t)}>수정</button>
                  <button style={{ ...s.linkBtn, color: '#E04545' }} onClick={() => remove(t)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div style={s.overlay} onClick={() => !saving && setEditing(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>{editing.id ? '팁 수정' : '팁 추가'}</h2>

            <div style={s.formRow}>
              <label style={s.label}>내용</label>
              <textarea style={{ ...s.input, height: 140, resize: 'vertical', fontFamily: 'inherit' }}
                value={editing.content} placeholder="팁 내용을 입력하세요. (사진만 등록해도 괜찮아요)"
                onChange={e => setEditing({ ...editing, content: e.target.value })} />
            </div>

            <div style={s.formRow}>
              <label style={s.label}>사진 (선택)</label>
              {previewSrc && (
                <div style={s.previewWrap}>
                  <img src={previewSrc} alt="" style={s.preview} />
                  <button
                    style={s.removeImageBtn}
                    onClick={() => setEditing({ ...editing, image_url: null, _newImageFile: null })}
                  >
                    이미지 제거
                  </button>
                </div>
              )}
              <input type="file" accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) setEditing({ ...editing, _newImageFile: file })
                }} />
            </div>

            {editing.category === 'guide' && (
              <div style={s.formRow}>
                <label style={s.label}>순서</label>
                <input style={s.input} type="number" value={editing.sort_order}
                  onChange={e => setEditing({ ...editing, sort_order: e.target.value })} />
              </div>
            )}

            <div style={s.checkRow}>
              <label style={s.checkLabel}>
                <input type="checkbox" checked={editing.is_active}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                활성 (사용자에게 노출)
              </label>
              {editing.category !== 'guide' && (
                <label style={s.checkLabel}>
                  <input type="checkbox" checked={editing.is_featured}
                    onChange={e => setEditing({ ...editing, is_featured: e.target.checked })} />
                  별표 (랜덤 노출 가중치 2배)
                </label>
              )}
            </div>

            <div style={s.modalBtns}>
              <button style={s.cancelBtn} onClick={() => setEditing(null)} disabled={saving}>취소</button>
              <button style={s.saveBtn} onClick={save} disabled={saving || !hasContent(editing)}>
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
  addBtn: { marginLeft: 'auto', background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  tabBtn: { background: '#fff', border: '1.5px solid #E5E1DB', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#8A8AA0', cursor: 'pointer' },
  tabBtnActive: { background: '#FF6B35', borderColor: '#FF6B35', color: '#fff' },
  muted: { color: '#8A8AA0', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8AA0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '12px 14px', borderBottom: '1px solid #EEE', background: '#FAFAFC' },
  tr: { borderBottom: '1px solid #F0F0F4' },
  td: { padding: '12px 14px', fontSize: 13, color: '#1A1A1A', verticalAlign: 'middle' },
  thumb: { width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #EEE' },
  thumbEmpty: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: '#FAFAFC', border: '1px solid #EEE', color: '#C0C0CC', fontSize: 12 },
  toggle: { border: '1.5px solid #D0D0DC', background: '#fff', color: '#9090A8', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  starBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 },
  toggleOn: { borderColor: '#34A853', background: '#34A853', color: '#fff' },
  linkBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#FF6B35', fontWeight: 600, marginLeft: 10, padding: 2 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, margin: 0 },
  formRow: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  label: { fontSize: 12, fontWeight: 700, color: '#4A4A60' },
  input: { padding: '10px 12px', border: '1.5px solid #DDD', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', width: '100%' },
  previewWrap: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
  preview: { maxWidth: 200, maxHeight: 140, objectFit: 'contain', borderRadius: 8, border: '1px solid #EEE' },
  removeImageBtn: { background: 'none', border: 'none', color: '#E04545', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  checkRow: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1A1A1A', cursor: 'pointer' },
  modalBtns: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: { background: '#F0F0F4', color: '#4A4A60', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  saveBtn: { background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}
