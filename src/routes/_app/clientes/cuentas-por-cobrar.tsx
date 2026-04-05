import { createFileRoute } from '@tanstack/react-router'
import { CxcList } from '@/features/cxc/components/cxc-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/clientes/cuentas-por-cobrar')({
  component: CuentasPorCobrarPage,
})

function CuentasPorCobrarPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CLIENTS_CREDIT} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Cuentas por Cobrar" descripcion="Gestion de deudas y pagos de clientes" />
        <CxcList />
      </div>
    </RequirePermission>
  )
}
