// 온보딩 첫 화면 전용 — "점약있어?" 물어봤다가 이미 약속 있다는 대답에 머쓱해지는 순간을
// 그린 일러스트. 밥공기 아이콘 대신 이 장면 하나로 서비스가 생긴 이유를 전달한다.
export default function AskRejectedIllustration({ style }) {
  return (
    <svg
      viewBox="0 0 340 270"
      style={{ width: 'min(88vw, 360px)', height: 'auto', display: 'block', ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 말풍선 - 물어보는 쪽 */}
      <path d="M22 18h140a16 16 0 0 1 16 16v22a16 16 0 0 1-16 16H96l-14 16-4-16H22a16 16 0 0 1-16-16V34a16 16 0 0 1 16-16Z" fill="#FFFFFF" stroke="#DCD4C9" strokeWidth="2" />
      <text x="92" y="60" textAnchor="middle" fontSize="19" fontWeight="800" fill="#1A1A1A" fontFamily="inherit">점약있어?</text>

      {/* 말풍선 - 거절하는 쪽 */}
      <path d="M178 18h140a16 16 0 0 1 16 16v22a16 16 0 0 1-16 16h-130l-4 16-14-16h6a16 16 0 0 1-16-16V34a16 16 0 0 1 16-16Z" fill="#FFFFFF" stroke="#DCD4C9" strokeWidth="2" />
      <text x="264" y="60" textAnchor="middle" fontSize="18" fontWeight="800" fill="#1A1A1A" fontFamily="inherit">어... 있어 🥲</text>

      {/* 캐릭터 A - 묻는 사람, 머쓱해진 표정 */}
      <g>
        <rect x="48" y="168" width="92" height="84" rx="30" fill="#FF6B35" />
        <circle cx="94" cy="150" r="40" fill="#FFD9B3" />
        <ellipse cx="79" cy="152" rx="4" ry="5" fill="#1A1A1A" />
        <ellipse cx="109" cy="152" rx="4" ry="5" fill="#1A1A1A" />
        <path d="M80 170q14 8 28 0" stroke="#1A1A1A" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* 어색하게 든 손 */}
        <circle cx="150" cy="188" r="13" fill="#FFD9B3" />
        <rect x="132" y="182" width="26" height="20" rx="10" fill="#FF6B35" />
        {/* 식은땀 */}
        <path d="M132 118q7 10 0 16q-7-6 0-16Z" fill="#8EC6E6" />
      </g>

      {/* 캐릭터 B - 거절하는 사람, 미안한 표정 */}
      <g>
        <rect x="200" y="168" width="92" height="84" rx="30" fill="#8CA98A" />
        <circle cx="246" cy="150" r="40" fill="#F3CFA3" />
        <path d="M225 150q6-8 12 0" stroke="#1A1A1A" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M255 150q6-8 12 0" stroke="#1A1A1A" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M234 172q12-6 24 0" stroke="#1A1A1A" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* 미안한 듯 든 손 */}
        <circle cx="204" cy="182" r="13" fill="#F3CFA3" />
        <rect x="196" y="150" width="24" height="42" rx="12" fill="#8CA98A" />
      </g>
    </svg>
  )
}
