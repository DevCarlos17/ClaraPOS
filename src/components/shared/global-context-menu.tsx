import { type ReactNode, useState, useEffect, useRef } from 'react'
import {
  ArrowsClockwise,
  CornersOut,
  CornersIn,
  Gear,
  Question,
  DownloadSimple,
  Copy,
  ClipboardText,
} from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { usePWAInstall } from '@/hooks/use-pwa-install'

interface GlobalContextMenuProps {
  children: ReactNode
}

export function GlobalContextMenu({ children }: GlobalContextMenuProps) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)
  const navigate = useNavigate()
  const { isInstallable, install } = usePWAInstall()

  const selectedTextRef = useRef('')
  const focusedElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  function handleContextMenuCapture() {
    selectedTextRef.current = window.getSelection()?.toString() ?? ''
    focusedElementRef.current = document.activeElement as HTMLElement | null
  }

  function handleReload() {
    window.location.reload()
  }

  function handleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  function handleSettings() {
    void navigate({ to: '/configuracion/datos-empresa' })
  }

  function handleCopy() {
    const text = selectedTextRef.current
    if (text) {
      void navigator.clipboard.writeText(text)
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      const el = focusedElementRef.current
      if (!el) return
      setTimeout(() => {
        el.focus()
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          const start = el.selectionStart ?? el.value.length
          const end = el.selectionEnd ?? el.value.length
          el.setRangeText(text, start, end, 'end')
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }, 0)
    } catch {
      // Clipboard access denied — silently fail
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={handleContextMenuCapture}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {isInstallable && (
          <>
            <ContextMenuItem onClick={() => void install()}>
              <DownloadSimple className="h-4 w-4" />
              Instalar App
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onClick={handleCopy}
          disabled={!selectedTextRef.current}
        >
          <Copy className="h-4 w-4" />
          Copiar
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void handlePaste()}>
          <ClipboardText className="h-4 w-4" />
          Pegar
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleReload}>
          <ArrowsClockwise className="h-4 w-4" />
          Recargar App
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleFullscreen}>
          {isFullscreen ? (
            <CornersIn className="h-4 w-4" />
          ) : (
            <CornersOut className="h-4 w-4" />
          )}
          {isFullscreen ? 'Salir Pantalla Completa' : 'Pantalla Completa'}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleSettings}>
          <Gear className="h-4 w-4" />
          Ajustes de Sistema
        </ContextMenuItem>
        <ContextMenuItem disabled>
          <Question className="h-4 w-4" />
          Centro de Ayuda
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
