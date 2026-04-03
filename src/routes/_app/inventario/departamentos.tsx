import { createFileRoute } from '@tanstack/react-router'
import { DepartamentoList } from '@/features/inventario/components/departamentos/departamento-list'
import { PageHeader } from '@/components/layout/page-header'

export const Route = createFileRoute('/_app/inventario/departamentos')({
  component: DepartamentosPage,
})

function DepartamentosPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Departamentos" descripcion="Gestiona las categorias de productos" />
      <DepartamentoList />
    </div>
  )
}
