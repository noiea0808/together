// 날짜 줄에 붙는 상대 라벨(오늘/내일/모레/어제/엊그제)과 그 색.
// 오늘 화면과 그룹 화면이 각자 같은 함수를 들고 있었는데, 한쪽에만 모레·엊그제가 있어서
// 같은 날짜가 화면에 따라 "모레"로도 "2일 뒤"로도 보였다.
//
// 모든 날이 채운 알약이고, 색만 넷으로 나뉜다. 알약을 색으로 나눈 이유는 날짜 줄이 화면 맨
// 위에 늘 떠 있어서 여기가 무채색이면 페이지 전체가 가라앉기 때문이고, 색을 하나가 아니라
// 셋으로 둔 건 지나간 날인지 다가올 날인지를 글자를 읽기 전에 알 수 있게 하기 위해서다.
// 사흘 넘게 떨어진 날("3일 뒤" 등)은 그 셋에 끼지 않고 연회색 알약으로 물러난다 — 모양은
// 같아서 날짜 줄에 알약이 있다 없다 하지 않고, 색이 빠져 있어 가까운 날과 헷갈리지 않는다.
//
// 예전에 이 자리에 "연한 배경 + 같은 색 어두운 글자" 알약을 둘렀다가 전부 걷어낸 이력이 있다.
// 그 조합은 채도 대비가 없어서 색을 스틸/초록/보라/앰버 뭘로 바꿔도 똑같이 탁했다 — 색이
// 아니라 구조가 원인이었다. 채운 알약에 흰 글자를 얹는 구조에는 그 문제가 없고, far는 애초에
// 전할 색이 없는 무채색이라 그 함정에 걸리지 않는다(4.87:1로 AA도 넘긴다).
export function getRelativeLabel(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24))
  if (diff === 0)  return { label: '오늘', tone: 'today' }
  if (diff === 1)  return { label: '내일', tone: 'future' }
  if (diff === 2)  return { label: '모레', tone: 'future' }
  if (diff === -1) return { label: '어제', tone: 'past' }
  if (diff === -2) return { label: '엊그제', tone: 'past' }
  if (diff < 0)    return { label: `${Math.abs(diff)}일 전`, tone: 'far' }
  return { label: `${diff}일 뒤`, tone: 'far' }
}

export const REL_TONE_FILL = {
  today: 'var(--color-today-fill)',
  future: 'var(--color-future-fill)',
  past: 'var(--color-past-fill)',
  far: 'var(--color-chip-bg)',
}

// far만 흰 글자를 얹을 수 없다. 연회색 위의 흰 글자는 읽히지 않으므로 글자색을 되돌린다.
export const REL_TONE_TEXT = {
  today: '#fff',
  future: '#fff',
  past: '#fff',
  far: 'var(--color-text-muted)',
}
