import { Menu } from 'lucide-react'
import { SyncStatusIndicator } from '@/components/sync/sync-status-indicator'
import { useAuth } from '@/core/auth/auth-provider'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user } = useAuth()

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
        {user && (
          <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
        )}
      </div>
    </header>
  )
}
