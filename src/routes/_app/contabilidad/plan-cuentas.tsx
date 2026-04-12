import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { PlanCuentasList } from '@/features/contabilidad/components/plan-cuentas-list'

export const Route = createFileRoute('/_app/contabilidad/plan-cuentas')({
  component: PlanCuentasPage,
})

function PlanCuentasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCOUNTING_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Plan de Cuentas" descripcion="Estructura del plan contable" />
        <PlanCuentasList />
      </div>
    </RequirePermission>
  )
}
