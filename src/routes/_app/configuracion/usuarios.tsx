import { createFileRoute, Outlet } from '@tanstack/react-router'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/configuracion/usuarios')({
  component: UsuariosLayout,
})

function UsuariosLayout() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_USERS} fallback={<AccessDeniedPage />}>
      <Outlet />
    </RequirePermission>
  )
}
