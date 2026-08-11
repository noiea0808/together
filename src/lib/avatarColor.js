// 프로필 사진이 없는 사람의 아바타 배경. 이름을 해시해 고르므로 같은 사람은 화면이 바뀌어도
// 늘 같은 색으로 나온다. 원래 밥팟 댓글에서만 쓰던 함수인데, 멤버 목록 쪽은 전부 같은
// 회색 하나로 칠하고 있어서 목록이 통째로 무채색이 되고 사람 구분도 이니셜에만 기대야 했다.
//
// 색은 "누구인지" 구분만 하면 되고 의미를 담지 않는다. 그래서 뜻이 정해진 색이 이미 쓰는
// 색상대는 피한다 — 주황(H16)·danger(H9)·success(H145)·info(H205)에서 각각 30도 이상
// 떨어뜨렸고, 그 구간을 빼고 나면 여섯이 최대다. 채도 46%로 묶어 한 벌로 읽히게 했고,
// 흰 이니셜이 얹히므로 전부 4.6:1을 넘긴다.
const AVATAR_COLORS = ['#77752C', '#507F2F', '#2F7F78', '#666AC7', '#9F54C0', '#BD4C88']

export function avatarColor(name) {
  let h = 0
  for (const x of (name ?? '?')) h = (h * 31 + x.charCodeAt(0)) & 0xfffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
