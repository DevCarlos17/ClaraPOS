import { useStatus } from '@powersync/react'
import { RefreshCw, AlertCircle, Upload, WifiOff, Wifi } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

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
      return { label: 'SINCRONIZANDO', color: 'blue' as const, icon: RefreshCw, animate: true, description: `Sincronizando (${direction} datos)...` }
    }

    const hasDownloadError = status.dataFlowStatus?.downloadError
    const hasUploadError = status.dataFlowStatus?.uploadError

    const isConnectionError =
      hasDownloadError?.message?.includes('websocket') ||
      hasDownloadError?.message?.includes('connection') ||
      hasUploadError?.message?.includes('websocket') ||
      hasUploadError?.message?.includes('connection')

    if ((hasDownloadError || hasUploadError) && !isConnectionError && navigator.onLine) {
      return { label: 'ERROR', color: 'red' as const, icon: AlertCircle, animate: false, description: 'Error en ultima sincronizacion' }
    }

    if (!navigator.onLine || !status.connected) {
      return { label: 'DESCONECTADO', color: 'amber' as const, icon: WifiOff, animate: false, description: 'Trabajando sin conexion' }
    }

    if (status.hasSynced === false) {
      return { label: 'PENDIENTE', color: 'yellow' as const, icon: Upload, animate: true, description: 'Cambios locales pendientes' }
    }

    return { label: 'EN LINEA', color: 'green' as const, icon: Wifi, animate: false, description: 'Todo sincronizado' }
  }

  const syncState = getSyncState()
  const Icon = syncState.icon

  const colorClasses = {
    amber: { text: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-200' },
    blue: { text: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-500', border: 'border-blue-200' },
    yellow: { text: 'text-yellow-700', bg: 'bg-yellow-50', dot: 'bg-yellow-500', border: 'border-yellow-200' },
    red: { text: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500', border: 'border-red-200' },
    green: { text: 'text-green-600', bg: 'bg-green-50', dot: 'bg-green-500', border: 'border-green-200' },
  }

  const colors = colorClasses[syncState.color]

  return (
    <>
      <div
        ref={buttonRef}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className={`relative flex items-center gap-2 ${colors.bg} px-2 sm:px-3 py-1.5 rounded-full border ${colors.border} shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer`}
      >
        <Icon className={`hidden sm:block w-3.5 h-3.5 ${colors.text} ${syncState.animate ? 'animate-spin' : ''}`} />
        <span className={`text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
          {syncState.label}
        </span>
        <div
          className={`w-2 sm:w-2.5 h-2 sm:h-2.5 ${colors.dot} rounded-full ${syncState.animate ? 'animate-pulse' : ''} ${
            syncState.color === 'green' ? 'shadow-[0_0_8px_rgba(34,197,94,0.5)]' : ''
          }`}
        />
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
