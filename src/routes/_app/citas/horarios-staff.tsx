import { createFileRoute } from '@tanstack/react-router'
import { HorariosStaffPage } from '@/features/citas/components/horarios/horarios-staff-page'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/citas/horarios-staff')({
  component: HorariosStaffRoute,
})

function HorariosStaffRoute() {
  return (
    <RequirePermission permission={PERMISSIONS.CITAS_HORARIOS} fallback={<AccessDeniedPage />}>
      <div className="h-full flex flex-col">
        <div className="mb-4 shrink-0">
          <h1 className="text-xl font-bold">Horarios de Staff</h1>
          <p className="text-sm text-muted-foreground">Configura la disponibilidad semanal de cada profesional</p>
        </div>
        <div className="flex-1 min-h-0">
          <HorariosStaffPage />
        </div>
      </div>
    </RequirePermission>
  )
}
