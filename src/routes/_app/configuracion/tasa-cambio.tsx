import { createFileRoute } from '@tanstack/react-router'
import { TasaForm } from '@/features/configuracion/components/tasa-form'
import { TasaList } from '@/features/configuracion/components/tasa-list'
import { PageHeader } from '@/components/layout/page-header'

export const Route = createFileRoute('/_app/configuracion/tasa-cambio')({
  component: TasaCambioPage,
})

function TasaCambioPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Tasas de Cambio" descripcion="Gestiona las tasas de cambio USD/Bs" />
      <TasaForm />
      <TasaList />
    </div>
  )
}
