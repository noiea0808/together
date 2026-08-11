// 프로필 사진이 없는 사람의 아바타 배경. 이름을 해시해 고르므로 같은 사람은 화면이 바뀌어도
// 늘 같은 톤으로 나온다. 판이 둘이다 — 대화가 오가는 자리(밥팟 댓글, 가고 싶은 곳)는
// 유채색 avatarColor, 사람이 줄줄이 쌓이는 멤버 목록은 무채색 avatarGray를 쓴다.
//
// 색은 "누구인지" 구분만 하면 되고 의미를 담지 않는다. 그래서 뜻이 정해진 색이 이미 쓰는
// 색상대는 피한다 — 주황(H16)·danger(H9)·success(H145)·info(H205)에서 각각 30도 이상
// 떨어뜨렸고, 그 구간을 빼고 나면 여섯이 최대다. 채도 46%로 묶어 한 벌로 읽히게 했고,
// 흰 이니셜이 얹히므로 전부 4.6:1을 넘긴다.
const AVATAR_COLORS = ['#77752C', '#507F2F', '#2F7F78', '#666AC7', '#9F54C0', '#BD4C88']

// 멤버 목록(오늘 화면 그룹/친구 보기, 그룹 멤버들)에서 쓰는 무채색 판. 목록은 한 화면에
// 사람이 여럿 쌓이는 자리라 유채색 여섯을 깔면 색이 먼저 읽히고 이름이 나중에 읽힌다.
// 대신 명암 세 단으로 나눠서 같은 사람이 늘 같은 톤으로 나오는 성질은 유지한다.
//
// warm-600 이하는 흰 이니셜을 얹으면 3:1대로 떨어져 못 쓴다(예전 단일 회색이 warm-600이라
// 3.07:1이었다). 700/800/900은 각각 5.5:1 / 7.8:1 / 10.2:1로 전부 AA를 넘긴다.
const AVATAR_GRAYS = ['var(--warm-700)', 'var(--warm-800)', 'var(--warm-900)']

function hash(name) {
  let h = 0
  for (const x of (name ?? '?')) h = (h * 31 + x.charCodeAt(0)) & 0xfffff
  return h
}

export function avatarColor(name) {
  return AVATAR_COLORS[hash(name) % AVATAR_COLORS.length]
}

export function avatarGray(name) {
  return AVATAR_GRAYS[hash(name) % AVATAR_GRAYS.length]
}
