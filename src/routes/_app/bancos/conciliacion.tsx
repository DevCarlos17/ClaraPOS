import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { ConciliacionBancaria } from '@/features/bancos/components/conciliacion-bancaria'

export const Route = createFileRoute('/_app/bancos/conciliacion')({
  component: ConciliacionBancariaPage,
})

function ConciliacionBancariaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Conciliacion Bancaria"
          descripcion="Control y validacion de movimientos bancarios"
        />
        <ConciliacionBancaria />
      </div>
    </RequirePermission>
  )
}
