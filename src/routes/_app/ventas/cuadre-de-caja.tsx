import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { CuadrePage } from '@/features/reportes/components/cuadre-page'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

const searchSchema = z.object({
  fecha: z.string().optional(),
  cajaId: z.string().optional(),
  sesionId: z.string().optional(),
})

export const Route = createFileRoute('/_app/ventas/cuadre-de-caja')({
  validateSearch: searchSchema,
  component: CuadreDeCajaPage,
})

function CuadreDeCajaPage() {
  const { fecha, cajaId, sesionId } = Route.useSearch()
  return (
    <RequirePermission permission={PERMISSIONS.REPORTS_CASHCLOSE} fallback={<AccessDeniedPage />}>
      <CuadrePage initialFecha={fecha} initialCajaId={cajaId} initialSesionId={sesionId} />
    </RequirePermission>
  )
}
