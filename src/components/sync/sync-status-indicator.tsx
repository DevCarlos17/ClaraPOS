import { useStatus } from '@powersync/react'
import { ArrowsClockwise, WarningCircle, Upload, WifiSlash } from '@phosphor-icons/react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export function SyncStatusIndicator() {
  const status = useStatus()
  const [showTooltip, setShowTooltip] = useState(false)
  const buttonRef = useRef<HTMLDivElement>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (showTooltip && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setTooltipPosition({ top: rect.bottom + 8, left: rect.left + rect.width / 2 })
    }
  }, [showTooltip])

  const getSyncState = () => {
    const isUploading = status.dataFlowStatus?.uploading
    const isDownloading = status.dataFlowStatus?.downloading

    if (isUploading || isDownloading) {
      const direction = isUploading ? 'subiendo' : 'descargando'
      return { label: 'Sincronizando', color: 'blue' as const, icon: ArrowsClockwise, animate: true, description: `Sincronizando (${direction} datos)...` }
    }

    const hasDownloadError = status.dataFlowStatus?.downloadError
    const hasUploadError = status.dataFlowStatus?.uploadError
    const isConnectionError =
      hasDownloadError?.message?.includes('websocket') ||
      hasDownloadError?.message?.includes('connection') ||
      hasUploadError?.message?.includes('websocket') ||
      hasUploadError?.message?.includes('connection')

    if ((hasDownloadError || hasUploadError) && !isConnectionError && navigator.onLine) {
      return { label: 'Error', color: 'red' as const, icon: WarningCircle, animate: false, description: 'Error en ultima sincronizacion' }
    }

    if (!navigator.onLine || !status.connected) {
      return { label: 'Sin conexion', color: 'amber' as const, icon: WifiSlash, animate: false, description: 'Trabajando sin conexion' }
    }

    if (status.hasSynced === false) {
      return { label: 'Pendiente', color: 'yellow' as const, icon: Upload, animate: true, description: 'Cambios locales pendientes' }
    }

    return { label: 'En linea', color: 'green' as const, icon: null, animate: false, description: 'Todo sincronizado' }
  }

  const syncState = getSyncState()
  const isAlert = syncState.color === 'red' || syncState.color === 'amber'

  const dotColor = {
    green: 'bg-green-500',
    blue: 'bg-blue-400',
    yellow: 'bg-yellow-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }[syncState.color]

  const alertColors = {
    red: 'text-red-600 bg-red-50 border-red-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
  }

  const Icon = syncState.icon

  return (
    <>
      <div
        ref={buttonRef}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className={cn(
          'flex items-center gap-1.5 cursor-pointer transition-all duration-200 rounded-full',
          isAlert
            ? `border px-2.5 py-1 ${alertColors[syncState.color as 'red' | 'amber']}`
            : 'px-1 py-1'
        )}
      >
        {isAlert && Icon ? (
          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <div
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              dotColor,
              syncState.animate && 'animate-pulse',
              syncState.color === 'green' && 'shadow-[0_0_6px_rgba(34,197,94,0.7)]'
            )}
          />
        )}
        <span
          className={cn(
            'hidden sm:block text-xs font-medium',
            isAlert ? '' : 'text-muted-foreground'
          )}
        >
          {syncState.label}
        </span>
        {syncState.animate && !isAlert && Icon && (
          <Icon className="w-3 h-3 text-blue-400 animate-spin" />
        )}
      </div>

      {showTooltip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[200] pointer-events-none"
            style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px`, transform: 'translateX(-50%)' }}
          >
            <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
              {syncState.description}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
