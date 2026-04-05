import { createFileRoute } from '@tanstack/react-router'
import { CuadrePage } from '@/features/reportes/components/cuadre-page'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/ventas/cuadre-de-caja')({
  component: CuadreDeCajaPage,
})

function CuadreDeCajaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.REPORTS_CASHCLOSE} fallback={<AccessDeniedPage />}>
      <CuadrePage />
    </RequirePermission>
  )
}
