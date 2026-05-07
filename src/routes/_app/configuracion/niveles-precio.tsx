import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { NivelPrecioList } from '@/features/configuracion/components/niveles-precio/nivel-precio-list'

export const Route = createFileRoute('/_app/configuracion/niveles-precio')({
  component: NivelesPrecioPage,
})

function NivelesPrecioPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Niveles de Precio"
          descripcion="Configura los niveles de precio y sus margenes defecto (max. 3)"
        />
        <NivelPrecioList />
      </div>
    </RequirePermission>
  )
}
