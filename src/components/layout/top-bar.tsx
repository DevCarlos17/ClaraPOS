import { useState, useRef, useEffect } from 'react'
import { List, TrendUp, WarningCircle } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { SyncStatusIndicator } from '@/components/sync/sync-status-indicator'
import { ThemePicker } from '@/components/theme-picker'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { TasaUpdateModal } from '@/features/configuracion/components/tasa-update-modal'
import { formatTasa } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface TopBarProps {
  onMenuClick: () => void
}

const TASA_STALE_HOURS = 24

function isTasaDesactualizada(createdAt: string): boolean {
  const createdMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdMs)) return false
  return (Date.now() - createdMs) / (1000 * 60 * 60) > TASA_STALE_HOURS
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { tasa, tasaValor, isLoading } = useTasaActual()
  const [tasaModalOpen, setTasaModalOpen] = useState(false)
  const [showTasaTooltip, setShowTasaTooltip] = useState(false)
  const tasaRef = useRef<HTMLButtonElement>(null)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const desactualizada = tasa ? isTasaDesactualizada(tasa.created_at) : false

  useEffect(() => {
    if (showTasaTooltip && tasaRef.current) {
      const rect = tasaRef.current.getBoundingClientRect()
      setTooltipPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 })
    }
  }, [showTasaTooltip])

  const tasaLabel = isLoading && !tasa
    ? 'Cargando...'
    : tasaValor > 0
      ? `${formatTasa(tasaValor)} Bs/$ ${desactualizada ? '· Desactualizada' : ''}`
      : 'Sin tasa registrada'

  return (
    <header className="h-16 bg-background/90 backdrop-blur-xl border-b border-transparent px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-40 w-full transition-colors duration-300">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 hover:bg-black/5 rounded-xl transition-all duration-200 active:scale-[0.98] z-50 relative cursor-pointer"
          aria-label="Abrir menu"
        >
          <List className="w-5 h-5 text-foreground" />
        </button>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <SyncStatusIndicator />

        <div className="h-4 w-px bg-border" />

        <ThemePicker />

        {/* Tasa button: solo icono en mobile, icono + texto en desktop */}
        <button
          ref={tasaRef}
          type="button"
          onClick={() => setTasaModalOpen(true)}
          onMouseEnter={() => setShowTasaTooltip(true)}
          onMouseLeave={() => setShowTasaTooltip(false)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer',
            'transition-all duration-200 active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
            desactualizada
              ? 'text-amber-600 hover:bg-amber-50'
              : 'text-muted-foreground hover:text-foreground hover:bg-black/5'
          )}
          aria-label="Actualizar tasa de cambio"
        >
          {/* Icono visible solo en sm+ */}
          {desactualizada ? (
            <WarningCircle className="hidden sm:block h-4 w-4 flex-shrink-0" />
          ) : (
            <TrendUp className="hidden sm:block h-4 w-4 flex-shrink-0" />
          )}

          {/* Precio siempre visible. Label "USD / Bs" solo en sm+ */}
          <div className="flex flex-col leading-none text-left">
            <span className={cn('text-sm font-semibold tabular-nums', desactualizada ? 'text-amber-700' : 'text-foreground')}>
              {isLoading && !tasa ? '...' : tasaValor > 0 ? formatTasa(tasaValor) : 'Sin tasa'}
            </span>
            <span className="hidden sm:block text-[10px] text-muted-foreground">USD / Bs</span>
          </div>
        </button>
      </div>

      {/* Tooltip de tasa (útil en mobile para ver el valor sin abrir modal) */}
      {showTasaTooltip && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[200] pointer-events-none"
            style={{ top: `${tooltipPos.top}px`, left: `${tooltipPos.left}px`, transform: 'translateX(-50%)' }}
          >
            <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
              {tasaLabel}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            </div>
          </div>,
          document.body
        )}

      <TasaUpdateModal open={tasaModalOpen} onOpenChange={setTasaModalOpen} />
    </header>
  )
}
