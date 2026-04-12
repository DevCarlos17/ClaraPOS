import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { MovimientosList } from '@/features/caja/components/movimientos-list'

export const Route = createFileRoute('/_app/caja/movimientos')({
  component: MovimientosCajaPage,
})

function MovimientosCajaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CAJA_ACCESS} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Movimientos de Caja" descripcion="Movimientos por metodo de cobro y bancarios" />
        <MovimientosList />
      </div>
    </RequirePermission>
  )
}
