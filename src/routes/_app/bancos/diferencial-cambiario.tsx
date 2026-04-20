import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { DiferencialCambiariosbancos } from '@/features/bancos/components/diferencial-cambiario-bancos'

export const Route = createFileRoute('/_app/bancos/diferencial-cambiario')({
  component: DiferencialCambiariosPage,
})

function DiferencialCambiariosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCOUNTING_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Diferencial Cambiario - Bancos"
          descripcion="Ajuste del valor en Bs de cuentas bancarias en moneda extranjera segun la tasa vigente"
        />
        <DiferencialCambiariosbancos />
      </div>
    </RequirePermission>
  )
}
