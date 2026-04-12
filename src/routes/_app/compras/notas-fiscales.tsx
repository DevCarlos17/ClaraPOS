import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { NotaFiscalCompraList } from '@/features/compras/components/nota-fiscal-compra-list'

export const Route = createFileRoute('/_app/compras/notas-fiscales')({
  component: NotasFiscalesPage,
})

function NotasFiscalesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Notas Fiscales" descripcion="Notas de credito y debito de proveedores" />
        <NotaFiscalCompraList />
      </div>
    </RequirePermission>
  )
}
