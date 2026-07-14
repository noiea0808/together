import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'

// 로그아웃 상태에서 그룹 초대 링크(/join/:code)를 열면 JoinPage가 localStorage에
// pendingInviteCode를 남기고 로그인 화면으로 보낸다. 신규 가입자는 /welcome
// (ProfileSetupPage)이 그 코드를 소비해 가입 직후 /join으로 보내주지만, 이미
// onboarded된 사용자가 이메일 로그인이나 구글/카카오 로그인으로 들어오는 경우는
// /welcome을 거치지 않아 그 코드가 끝까지 안 쓰이고 버려졌다 — 로그인은 됐는데
// 원래 받은 초대 링크가 사라지는 문제. 로그인 방식과 무관하게 온보딩된 사용자가
// 되는 순간 여기서 한 번 더 확인해 남아있으면 그 초대로 보내준다.
export default function PendingInviteRedirect() {
  const { user } = useUser()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user || !user.onboarded) return
    const code = localStorage.getItem('pendingInviteCode')
    if (!code) return
    localStorage.removeItem('pendingInviteCode')
    navigate(`/join/${code}`)
  }, [user?.id, user?.onboarded])

  return null
}
