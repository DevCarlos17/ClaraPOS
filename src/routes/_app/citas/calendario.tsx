import { createFileRoute } from '@tanstack/react-router'
import { CalendarioCitas } from '@/features/citas/components/calendario/calendario-citas'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/citas/calendario')({
  component: CalendarioCitasPage,
})

function CalendarioCitasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CITAS_VIEW} fallback={<AccessDeniedPage />}>
      <div className="flex flex-col h-[calc(100vh-5rem)] p-4 gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Agenda</h1>
            <p className="text-sm text-muted-foreground">Calendario de citas y disponibilidad</p>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <CalendarioCitas />
        </div>
      </div>
    </RequirePermission>
  )
}
