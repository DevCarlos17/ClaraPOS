import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
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
      console.log('PWA instalada')
    }

    setDeferredPrompt(null)
    setIsInstallable(false)
  }

  return { isInstallable, isInstalled, install }
}
