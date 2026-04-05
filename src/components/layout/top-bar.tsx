import { Menu, TrendingUp } from 'lucide-react'
import { SyncStatusIndicator } from '@/components/sync/sync-status-indicator'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatTasa } from '@/lib/currency'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { tasa, tasaValor, isLoading } = useTasaActual()

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
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          <div className="flex flex-col leading-none">
            <span className="text-[10px] text-muted-foreground">USD/Bs</span>
            <span className="text-sm font-semibold tabular-nums">
              {isLoading ? '...' : tasaValor > 0 ? formatTasa(tasaValor) : 'Sin tasa'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
