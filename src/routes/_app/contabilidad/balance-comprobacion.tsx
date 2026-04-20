import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { BalanceComprobacion } from '@/features/contabilidad/components/balance-comprobacion'

export const Route = createFileRoute('/_app/contabilidad/balance-comprobacion')({
  component: BalanceComprobacionPage,
})

function BalanceComprobacionPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCOUNTING_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Balance de Comprobacion"
          descripcion="Sumas y saldos por cuenta contable"
        />
        <BalanceComprobacion />
      </div>
    </RequirePermission>
  )
}
