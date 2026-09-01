import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { ConciliacionTesoreria } from '@/features/tesoreria/components/conciliacion-tesoreria'

export const Route = createFileRoute('/_app/tesoreria/')({
  component: TesoreriaPage,
})

function TesoreriaPage() {
  // TODO: agregar PERMISSIONS.TESORERIA_VIEW cuando se cree el permiso especifico de tesoreria.
  // Por ahora se reutiliza CONFIG_RATES ('config.tasas') como guardia de acceso.
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          titulo="Tesoreria"
          descripcion="Estado de cuentas bancarias y efectivo"
        />
        <ConciliacionTesoreria />
      </div>
    </RequirePermission>
  )
}
