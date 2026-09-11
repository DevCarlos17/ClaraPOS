import { createFileRoute, Outlet } from '@tanstack/react-router'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/clientes/gestion')({
  component: ClientesGestionLayout,
})

function ClientesGestionLayout() {
  return (
    <RequirePermission permission={PERMISSIONS.CLIENTS_MANAGE} fallback={<AccessDeniedPage />}>
      <Outlet />
    </RequirePermission>
  )
}
