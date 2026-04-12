import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { ImpuestoList } from '@/features/configuracion/components/impuestos/impuesto-list'

export const Route = createFileRoute('/_app/configuracion/impuestos')({
  component: ImpuestosPage,
})

function ImpuestosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Impuestos" descripcion="Configuracion de IVA, IGTF y otros tributos" />
        <ImpuestoList />
      </div>
    </RequirePermission>
  )
}
