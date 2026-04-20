import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { CuentasConfigList } from '@/features/contabilidad/components/cuentas-config-list'
import { MonedaContableConfig } from '@/features/contabilidad/components/moneda-contable-config'

export const Route = createFileRoute('/_app/contabilidad/cuentas-config')({
  component: CuentasConfigPage,
})

function CuentasConfigPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCOUNTING_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Configuracion Contable"
          descripcion="Mapeo de operaciones del sistema a cuentas del plan de cuentas"
        />
        <MonedaContableConfig />
        <CuentasConfigList />
      </div>
    </RequirePermission>
  )
}
