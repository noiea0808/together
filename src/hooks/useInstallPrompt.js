import { useState, useEffect } from 'react'
import { getDeferredInstallPrompt, onInstallPromptReady, clearDeferredInstallPrompt } from '../lib/installPrompt'

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(() => getDeferredInstallPrompt())
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    // iPadOS 13+는 Safari 기본 UA가 데스크톱 macOS Safari로 위장돼 있어 "iPad" 문자열이 안 잡힌다.
    // 터치를 지원하는 "MacIntel"이면 실제로는 아이패드인 경우로 간주한다.
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
    const ios = /iphone|ipad|ipod/i.test(ua) || isIPadOS
    const android = /android/i.test(ua)
    setIsIOS(ios)
    setIsAndroid(android)

    const installed = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    setIsInstalled(installed)

    // main.jsx 로드 시점에 이미 캡처됐을 수도 있는 이벤트를 즉시 받고,
    // 이 훅이 마운트된 이후에 뒤늦게 발생하는 경우도 계속 구독한다.
    return onInstallPromptReady(setInstallPrompt)
  }, [])

  const triggerInstall = async () => {
    if (!installPrompt) return false
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      clearDeferredInstallPrompt()
      setInstallPrompt(null)
    }
    return outcome === 'accepted'
  }

  const isPC = !isIOS && !isAndroid
  const canInstall = !isInstalled && (isIOS || isAndroid || isPC)

  return { installPrompt, triggerInstall, isInstalled, isIOS, isAndroid, isPC, canInstall }
}
