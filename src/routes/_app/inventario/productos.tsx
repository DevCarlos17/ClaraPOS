import { createFileRoute } from '@tanstack/react-router'
import { ProductoList } from '@/features/inventario/components/productos/producto-list'
import { PageHeader } from '@/components/layout/page-header'

export const Route = createFileRoute('/_app/inventario/productos')({
  component: ProductosPage,
})

function ProductosPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Productos y Servicios" descripcion="Catalogo maestro de productos y servicios" />
      <ProductoList />
    </div>
  )
}
