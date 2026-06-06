import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CxcList } from '@/features/cxc/components/cxc-list'
import { ImportarCxcModal } from '@/features/cxc/components/importar-cxc-modal'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS, usePermissions } from '@/core/hooks/use-permissions'
import { UploadSimple } from '@phosphor-icons/react'

export const Route = createFileRoute('/_app/clientes/cuentas-por-cobrar')({
  component: CuentasPorCobrarPage,
})

function CuentasPorCobrarPage() {
  const { isOwner } = usePermissions()
  const [modalImportarAbierto, setModalImportarAbierto] = useState(false)

  return (
    <RequirePermission permission={PERMISSIONS.CLIENTS_CREDIT} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Cuentas por Cobrar" descripcion="Gestion de deudas y pagos de clientes">
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => setModalImportarAbierto(true)}>
              <UploadSimple className="h-4 w-4 mr-2" />
              Importar Saldos
            </Button>
          )}
        </PageHeader>

        <CxcList />

        {isOwner && (
          <ImportarCxcModal
            isOpen={modalImportarAbierto}
            onClose={() => setModalImportarAbierto(false)}
          />
        )}
      </div>
    </RequirePermission>
  )
}
