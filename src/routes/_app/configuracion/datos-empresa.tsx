import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { CompanyDataForm } from '@/features/configuracion/components/company-data-form'

export const Route = createFileRoute('/_app/configuracion/datos-empresa')({
  component: DatosEmpresaPage,
})

function DatosEmpresaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader
          titulo="Datos de la Empresa"
          descripcion="Razon social, RIF, contacto y datos fiscales"
        />
        <CompanyDataForm />
      </div>
    </RequirePermission>
  )
}
