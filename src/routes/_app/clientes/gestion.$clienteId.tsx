import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ClienteDetalleResolver } from '@/features/clientes/components/cliente-detalle-resolver'

export const Route = createFileRoute('/_app/clientes/gestion/$clienteId')({
  component: ClienteDetallePage,
})

function ClienteDetallePage() {
  const { clienteId } = Route.useParams()
  const navigate = useNavigate()

  return (
    <ClienteDetalleResolver
      clienteId={clienteId}
      onVolver={() => navigate({ to: '/clientes/gestion' })}
    />
  )
}
