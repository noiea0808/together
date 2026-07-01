// 화면의 핵심 동작을 확정하는 버튼(밥팟 만들기/열기, 상태 저장, 참여하기 등)에
// 공통으로 쓰는 스타일. 페이지마다 따로 정의하지 말고 이걸 스프레드해서 쓴다.
export const PRIMARY_ACTION_BUTTON = {
  width: '100%',
  padding: 13,
  background: 'linear-gradient(135deg, #FF6B35, #FF8C5A)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '-0.3px',
  boxShadow: '0 4px 14px rgba(255,107,53,0.32)',
}
