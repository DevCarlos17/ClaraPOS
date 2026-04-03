import { createFileRoute } from '@tanstack/react-router'
import { ClienteList } from '@/features/clientes/components/cliente-list'
import { PageHeader } from '@/components/layout/page-header'

export const Route = createFileRoute('/_app/clientes')({
  component: ClientesPage,
})

function ClientesPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Clientes" descripcion="Gestiona la ficha maestra de clientes y su estado de cuenta" />
      <ClienteList />
    </div>
  )
}
