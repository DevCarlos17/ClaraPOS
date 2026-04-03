import { createFileRoute } from '@tanstack/react-router'
import { RecetaManager } from '@/features/inventario/components/recetas/receta-manager'
import { PageHeader } from '@/components/layout/page-header'

export const Route = createFileRoute('/_app/inventario/recetas')({
  component: RecetasPage,
})

function RecetasPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Recetas" descripcion="Bill of Materials - Ingredientes por servicio" />
      <RecetaManager />
    </div>
  )
}
