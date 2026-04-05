import { createFileRoute } from '@tanstack/react-router'
import { TasaForm } from '@/features/configuracion/components/tasa-form'
import { TasaList } from '@/features/configuracion/components/tasa-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/configuracion/tasa-cambio')({
  component: TasaCambioPage,
})

function TasaCambioPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Tasas de Cambio" descripcion="Gestiona las tasas de cambio USD/Bs" />
        <TasaForm />
        <TasaList />
      </div>
    </RequirePermission>
  )
}
