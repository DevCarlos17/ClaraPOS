import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS, usePermissions } from '@/core/hooks/use-permissions'
import { CxpPage } from '@/features/compras/components/cxp-page'
import { ImportarCxpModal } from '@/features/compras/components/importar-cxp-modal'
import { UploadSimple } from '@phosphor-icons/react'

export const Route = createFileRoute('/_app/compras/cxp')({
  component: CxpRoutePage,
  validateSearch: (search: Record<string, unknown>) => ({
    proveedorId: typeof search.proveedorId === 'string' ? search.proveedorId : undefined,
  }),
})

export function CxpRoutePage() {
  const { isOwner } = usePermissions()
  const [modalImportarAbierto, setModalImportarAbierto] = useState(false)
  const { proveedorId } = Route.useSearch()

  return (
    <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW} fallback={<AccessDeniedPage />}>
      {/* Altura acotada al viewport restante (TopBar h-16 + padding vertical
          de <main>) para que CxpPage controle su propio scroll interno en
          vez de hacer crecer la pagina completa (fix cxc-cxp-scroll-altura). */}
      <div className="flex h-[calc(100vh-6.5rem)] min-h-0 flex-col gap-6">
        <PageHeader
          titulo="Cuentas por Pagar"
          descripcion="Registro y pago de deudas a proveedores"
        >
          {isOwner && (
            <Button size="sm" onClick={() => setModalImportarAbierto(true)}>
              <UploadSimple className="h-4 w-4 mr-2" />
              Importar Saldos
            </Button>
          )}
        </PageHeader>

        <CxpPage initialProveedorId={proveedorId} />

        {isOwner && (
          <ImportarCxpModal
            isOpen={modalImportarAbierto}
            onClose={() => setModalImportarAbierto(false)}
          />
        )}
      </div>
    </RequirePermission>
  )
}
