import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { connector } from '@/core/db/powersync/connector'

export const Route = createFileRoute('/(auth)')({
  component: AuthLayout,
  beforeLoad: async () => {
    if (connector.currentSession) {
      throw redirect({ to: '/dashboard' })
    }
  },
})

function AuthLayout() {
  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-slate-50">
      <Outlet />
    </div>
  )
}
