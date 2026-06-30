import { useState, useEffect } from 'react'

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua)
    const android = /android/i.test(ua)
    setIsIOS(ios)
    setIsAndroid(android)

    const installed = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    setIsInstalled(installed)

    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const triggerInstall = async () => {
    if (!installPrompt) return false
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
    return outcome === 'accepted'
  }

  const isPC = !isIOS && !isAndroid
  const canInstall = !isInstalled && (isIOS || isAndroid || isPC)

  return { installPrompt, triggerInstall, isInstalled, isIOS, isAndroid, isPC, canInstall }
}
