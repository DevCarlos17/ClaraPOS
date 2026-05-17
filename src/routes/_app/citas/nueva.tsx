import { createFileRoute } from '@tanstack/react-router'
import { NuevaCitaWizard } from '@/features/citas/components/wizard/nueva-cita-wizard'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/citas/nueva')({
  component: NuevaCitaPage,
})

function NuevaCitaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CITAS_CREATE} fallback={<AccessDeniedPage />}>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Nueva Cita</h1>
          <p className="text-sm text-muted-foreground">Agenda una cita en 4 pasos simples</p>
        </div>
        <NuevaCitaWizard />
      </div>
    </RequirePermission>
  )
}
