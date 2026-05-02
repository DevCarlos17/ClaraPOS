import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALLED_KEY = 'clarapos-pwa-installed'

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [wasInstalledBefore, setWasInstalledBefore] = useState(
    () => localStorage.getItem(INSTALLED_KEY) === '1'
  )

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      localStorage.setItem(INSTALLED_KEY, '1')
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      const installPrompt = e as BeforeInstallPromptEvent
      setDeferredPrompt(installPrompt)
      setIsInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => {
      setIsInstalled(true)
      setIsInstallable(false)
      setDeferredPrompt(null)
      localStorage.setItem(INSTALLED_KEY, '1')
      setWasInstalledBefore(true)
    }

    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, '1')
      setWasInstalledBefore(true)
    }

    setDeferredPrompt(null)
    setIsInstallable(false)
  }

  return { isInstallable, isInstalled, wasInstalledBefore, install }
}
