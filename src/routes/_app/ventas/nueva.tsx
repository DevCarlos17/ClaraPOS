import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { PosTerminal } from '@/features/ventas/components/pos-terminal'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/ventas/nueva')({
  component: NuevaVentaPage,
})

function NuevaVentaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.SALES_CREATE} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Nueva Venta" descripcion="Terminal de punto de venta" />
        <PosTerminal />
      </div>
    </RequirePermission>
  )
}
