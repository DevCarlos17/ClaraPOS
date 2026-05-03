import { createFileRoute } from '@tanstack/react-router'
import { PosTerminal } from '@/features/ventas/components/pos-terminal'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/ventas/nueva')({
  component: NuevaVentaPage,
})

function NuevaVentaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.SALES_CREATE} fallback={<AccessDeniedPage />}>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 -mb-4">
        <PosTerminal />
      </div>
    </RequirePermission>
  )
}
