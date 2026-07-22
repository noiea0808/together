import SlotIcon from './SlotIcon'
import StatusIcon from './StatusIcon'

// 일정/친구 목록 등에서 "이 날 이 슬롯에 이런 상태였다"를 한눈에 보여주는 아이콘 배지.
// open/skip/closed처럼 사용자가 직접 고른 상태만 상태 아이콘, 나머지(참여중/참여완료)는 슬롯 아이콘.
export default function SlotStatusBadge({ slot, opt, size = 55 }) {
  if (!opt) return null
  const iconStyle = { position: 'absolute', top: '50%', left: '50%', width: '78%', height: '78%', transform: 'translate(-50%, -50%)', objectFit: 'cover' }
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: size, height: size, boxSizing: 'border-box',
      border: '1.5px solid', borderColor: opt.border, borderRadius: Math.round(size * 0.22),
      overflow: 'hidden', flexShrink: 0, background: '#fff',
    }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {opt.key === 'open' || opt.key === 'skip' || opt.key === 'closed'
          ? <StatusIcon statusKey={opt.key} style={iconStyle} />
          : <SlotIcon slot={slot} muted={opt.key === '참여완료'} style={iconStyle} />}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '1px 0 3px', background: opt.bg }}>
        <span style={{ fontSize: Math.round(size * 0.2), fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-0.3px', color: opt.color }}>{slot}</span>
      </div>
    </div>
  )
}
