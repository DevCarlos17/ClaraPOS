import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { GlobalContextMenu } from '@/components/shared/global-context-menu'
import { useSidebarStore } from '@/stores/sidebar-store'
import { connector } from '@/core/db/powersync/connector'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
  beforeLoad: async ({ location }) => {
    if (!connector.currentSession) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})

function AppLayout() {
  const { isOpen: sidebarOpen, setOpen: setSidebarOpen, toggle, isMobile } = useSidebarStore()
  const router = useRouterState()
  const _pathname = router.location.pathname

  useEffect(() => {
    // Auto-collapse not needed for now but keeping the pattern
  }, [_pathname, sidebarOpen, isMobile, setSidebarOpen])

  return (
    <GlobalContextMenu>
      <div className="flex min-h-screen bg-background overflow-x-hidden font-sans antialiased text-foreground selection:bg-primary/10">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div
          className={cn(
            'flex-1 flex flex-col relative z-0 min-w-0 overflow-x-hidden transition-all duration-500 ease-in-out',
            !isMobile ? 'ml-[88px]' : ''
          )}
        >
          <TopBar onMenuClick={toggle} />

          <main className="flex-1 relative z-0 min-w-0 max-w-full overflow-x-hidden pb-4 px-4 pt-4 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </GlobalContextMenu>
  )
}
