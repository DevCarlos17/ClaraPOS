import { useState } from 'react'
import { Menu, TrendingUp } from 'lucide-react'
import { SyncStatusIndicator } from '@/components/sync/sync-status-indicator'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { TasaUpdateModal } from '@/features/configuracion/components/tasa-update-modal'
import { formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
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
  const desactualizada = tasa ? isTasaDesactualizada(tasa.created_at) : false

  return (
    <header className="h-16 bg-background/90 backdrop-blur-xl border-b border-transparent px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-40 w-full transition-colors duration-300">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 hover:bg-black/5 rounded-xl transition-all duration-200 active:scale-[0.98] z-50 relative cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 ml-auto">
        <SyncStatusIndicator />
        <button
          type="button"
          onClick={() => setTasaModalOpen(true)}
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-primary/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            desactualizada && 'border-red-300 bg-red-50 hover:border-red-400'
          )}
          title={tasa ? `Actualizada: ${formatDateTime(tasa.created_at)} - Click para actualizar` : 'Sin tasa registrada - Click para registrar'}
          aria-label="Actualizar tasa de cambio"
        >
          <TrendingUp className={cn('h-4 w-4', desactualizada ? 'text-red-600' : 'text-primary')} />
          <div className="flex flex-col leading-none text-left">
            <span className="text-[10px] text-muted-foreground">USD/Bs</span>
            <span className={cn('text-sm font-semibold tabular-nums', desactualizada && 'text-red-700')}>
              {isLoading && !tasa ? '...' : tasaValor > 0 ? formatTasa(tasaValor) : 'Sin tasa'}
            </span>
            {tasa && (
              <span className={cn('text-[9px] mt-0.5', desactualizada ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                {formatDateTime(tasa.created_at)}
              </span>
            )}
          </div>
        </button>
      </div>

      <TasaUpdateModal open={tasaModalOpen} onOpenChange={setTasaModalOpen} />
    </header>
  )
}
