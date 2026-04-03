import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'
import { PWAInstallBanner } from '@/components/pwa/pwa-install-banner'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
      <Toaster position="top-right" richColors />
      <PWAInstallBanner />
    </>
  )
}
