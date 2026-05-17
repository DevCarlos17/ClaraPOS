import { createFileRoute } from '@tanstack/react-router'
import { PanelTrabajo } from '@/features/citas/components/panel/panel-trabajo'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/citas/panel')({
  component: PanelTrabajoPage,
})

function PanelTrabajoPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CITAS_VIEW} fallback={<AccessDeniedPage />}>
      <div className="flex flex-col h-[calc(100vh-5rem)] p-4 gap-4">
        <div>
          <h1 className="text-xl font-bold">Panel de Trabajo</h1>
          <p className="text-sm text-muted-foreground">Gestion del dia a dia — vista Kanban</p>
        </div>
        <div className="flex-1 overflow-hidden">
          <PanelTrabajo />
        </div>
      </div>
    </RequirePermission>
  )
}
