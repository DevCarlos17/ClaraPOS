import { createFileRoute } from '@tanstack/react-router'
import { ClienteList } from '@/features/clientes/components/cliente-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/clientes/gestion')({
  component: ClientesGestionPage,
})

function ClientesGestionPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CLIENTS_MANAGE} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Clientes" descripcion="Gestiona la ficha maestra de clientes y su estado de cuenta" />
        <ClienteList />
      </div>
    </RequirePermission>
  )
}
