import WishCategoryIcon from './WishCategoryIcon'
import { WISH_CATEGORY_OPTIONS } from '../lib/potConstants'

// 가고 싶은 곳 등록/수정 모달에서 쓰는 카테고리 선택 UI. 하나는 항상 선택돼 있어야 한다.
export default function WishCategoryPicker({ value, onChange }) {
  return (
    <div style={S.row}>
      {WISH_CATEGORY_OPTIONS.map(opt => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            style={{ ...S.btn, ...(active ? S.btnActive : {}) }}
            onClick={() => onChange(opt.key)}
          >
            <WishCategoryIcon category={opt.key} size={36} />
            <span style={{ ...S.label, ...(active ? S.labelActive : {}) }}>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

const S = {
  row: { display: 'flex', gap: 6 },
  btn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '8px 2px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--color-border)',
    background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnActive: { border: '1.5px solid var(--color-primary)', background: 'var(--color-primary)0c' },
  label: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.2 },
  labelActive: { color: 'var(--color-primary)' },
}
