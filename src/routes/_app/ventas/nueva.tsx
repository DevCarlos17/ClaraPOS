import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { PosTerminal } from '@/features/ventas/components/pos-terminal'

export const Route = createFileRoute('/_app/ventas/nueva')({
  component: NuevaVentaPage,
})

function NuevaVentaPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Nueva Venta" descripcion="Terminal de punto de venta" />
      <PosTerminal />
    </div>
  )
}
