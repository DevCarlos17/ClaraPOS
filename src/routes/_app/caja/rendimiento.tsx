import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { RendimientoDashboard } from '@/features/caja/components/rendimiento-dashboard'

export const Route = createFileRoute('/_app/caja/rendimiento')({
  component: RendimientoCajaPage,
})

function RendimientoCajaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Rendimiento de Caja"
          descripcion="Estadisticas y analisis de rendimiento por cajera en tiempo real"
        />
        <RendimientoDashboard />
      </div>
    </RequirePermission>
  )
}
