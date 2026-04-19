import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { GastosDashboard } from '@/features/contabilidad/components/gastos-dashboard'

export const Route = createFileRoute('/_app/contabilidad/gastos-dashboard')({
  component: GastosDashboardPage,
})

function GastosDashboardPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCOUNTING_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Dashboard de Gastos" descripcion="Analisis y estadisticas de egresos" />
        <GastosDashboard />
      </div>
    </RequirePermission>
  )
}
