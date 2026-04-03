import { createFileRoute } from '@tanstack/react-router'
import { CxcList } from '@/features/cxc/components/cxc-list'
import { PageHeader } from '@/components/layout/page-header'

export const Route = createFileRoute('/_app/cxc')({
  component: CxcPage,
})

function CxcPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Cuentas por Cobrar" descripcion="Gestion de deudas y pagos de clientes" />
      <CxcList />
    </div>
  )
}
