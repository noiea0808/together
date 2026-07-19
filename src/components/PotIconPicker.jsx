import PotIcon from './PotIcon'
import { POT_ICON_KEYS } from '../lib/potConstants'

const ICON_LABELS = {
  together: '같이', tray: '식판', chat: '대화', salad: '샐러드', ready: '준비완료',
  party: '파티', care: '케어', map: '지도', delivery: '배달', random: '랜덤',
}

// 밥팟 열기/수정 화면에서 공용으로 쓰는 아이콘 선택 UI. 선택된 아이콘은 목록 안에서 크게 강조된다.
// 같은 아이콘을 다시 누르면 선택 해제된다.
export default function PotIconPicker({ value, onChange }) {
  return (
    <div style={S.wrap}>
      <div style={S.row}>
        {POT_ICON_KEYS.map(key => {
          const active = value === key
          const iconSize = active ? ICON_SIZE_ACTIVE : ICON_SIZE_INACTIVE
          return (
            <button
              key={key}
              type="button"
              style={{
                ...S.btn,
                width: iconSize + BTN_PAD, height: iconSize + BTN_PAD,
                ...(active ? S.btnActive : {}),
              }}
              onClick={() => onChange(active ? null : key)}
              aria-label={`${ICON_LABELS[key] ?? key} 아이콘${active ? ' 선택됨' : ''}`}
            >
              <PotIcon icon={key} size={iconSize} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 선택된 아이콘은 70px, 나머지는 기본 크기의 1.2배로 보여준다.
const ICON_SIZE_BASE = 30
const ICON_SIZE_ACTIVE = 70
const ICON_SIZE_INACTIVE = Math.round(ICON_SIZE_BASE * 1.2)
const BTN_PAD = 4 // 아이콘 주변 흰색 여백(지름 기준)

const S = {
  wrap: { display: 'flex', gap: 10, alignItems: 'center' },
  row: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: 1 },
  btn: {
    padding: 0, borderRadius: '50%', border: '1.5px solid var(--color-border)',
    background: 'var(--color-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  btnActive: { border: '2px solid var(--color-primary)' },
}
