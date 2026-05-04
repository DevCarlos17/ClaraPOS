import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { ConciliacionTesoreria } from '@/features/tesoreria/components/conciliacion-tesoreria'

export const Route = createFileRoute('/_app/bancos/conciliacion')({
  component: ConciliacionTesoreriaPage,
})

function ConciliacionTesoreriaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Conciliacion de Tesoreria"
          descripcion="Control de movimientos bancarios, caja fuerte y traspasos"
        />
        <ConciliacionTesoreria />
      </div>
    </RequirePermission>
  )
}
