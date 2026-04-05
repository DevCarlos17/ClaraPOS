import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/shared/placeholder-page'
import { Heart } from 'lucide-react'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/clinica')({
  component: ClinicaPage,
})

function ClinicaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CLINIC_ACCESS} fallback={<AccessDeniedPage />}>
      <PlaceholderPage
        titulo="Clinica"
        descripcion="Historias clinicas, sesiones, fotos antes/despues y mapas anatomicos para pacientes."
        icon={Heart}
      />
    </RequirePermission>
  )
}
