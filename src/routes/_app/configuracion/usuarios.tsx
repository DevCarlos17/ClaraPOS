import { createFileRoute } from '@tanstack/react-router'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { UsuarioList } from '@/features/configuracion/components/usuario-list'

export const Route = createFileRoute('/_app/configuracion/usuarios')({
  component: UsuariosPage,
})

function UsuariosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_USERS} fallback={<AccessDeniedPage />}>
      <UsuarioList />
    </RequirePermission>
  )
}
