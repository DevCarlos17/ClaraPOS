import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { BancoList } from '@/features/configuracion/components/banco-list'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/configuracion/bancos')({
  component: BancosPage,
})

function BancosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Bancos" descripcion="Cuentas bancarias de la empresa para transferencias" />
        <BancoList />
      </div>
    </RequirePermission>
  )
}
