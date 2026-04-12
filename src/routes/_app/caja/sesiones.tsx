import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { SesionCajaList } from '@/features/caja/components/sesion-caja-list'

export const Route = createFileRoute('/_app/caja/sesiones')({
  component: SesionesCajaPage,
})

function SesionesCajaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CAJA_ACCESS} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Sesiones de Caja" descripcion="Apertura y cierre de sesiones de caja" />
        <SesionCajaList />
      </div>
    </RequirePermission>
  )
}
