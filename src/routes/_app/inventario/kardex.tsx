import { createFileRoute } from '@tanstack/react-router'
import { KardexList } from '@/features/inventario/components/kardex/kardex-list'
import { PageHeader } from '@/components/layout/page-header'

export const Route = createFileRoute('/_app/inventario/kardex')({
  component: KardexPage,
})

function KardexPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Kardex" descripcion="Movimientos de inventario" />
      <KardexList />
    </div>
  )
}
