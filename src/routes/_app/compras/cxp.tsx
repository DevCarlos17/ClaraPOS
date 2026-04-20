import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { CxpPage } from '@/features/compras/components/cxp-page'

export const Route = createFileRoute('/_app/compras/cxp')({
  component: CxpRoutePage,
})

function CxpRoutePage() {
  return (
    <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Cuentas por Pagar"
          descripcion="Registro y pago de deudas a proveedores"
        />
        <CxpPage />
      </div>
    </RequirePermission>
  )
}
