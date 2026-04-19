import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { LibroContableList } from '@/features/contabilidad/components/libro-contable-list'

export const Route = createFileRoute('/_app/contabilidad/libro-contable')({
  component: LibroContablePage,
})

function LibroContablePage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCOUNTING_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Libro Contable"
          descripcion="Registro de asientos contables con partida doble"
        />
        <LibroContableList />
      </div>
    </RequirePermission>
  )
}
