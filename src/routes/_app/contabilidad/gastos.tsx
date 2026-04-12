import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { GastoList } from '@/features/contabilidad/components/gasto-list'

export const Route = createFileRoute('/_app/contabilidad/gastos')({
  component: GastosPage,
})

function GastosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCOUNTING_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Gastos" descripcion="Registro de egresos operativos" />
        <GastoList />
      </div>
    </RequirePermission>
  )
}
