import { useQuery } from '@powersync/react'
import { CircleNotch } from '@phosphor-icons/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { type Cliente } from '@/features/clientes/hooks/use-clientes'
import { ClienteDetalle } from './cliente-detalle'

export interface ClienteDetalleResolverProps {
  clienteId: string
  onVolver: () => void
}

export function ClienteDetalleResolver({ clienteId, onVolver }: ClienteDetalleResolverProps) {
  const { user, loading: userLoading } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM clientes WHERE id = ? AND empresa_id = ?',
    [clienteId, empresaId]
  )

  if (userLoading || isLoading) {
    return (
      <div role="status" className="flex items-center justify-center py-20">
        <CircleNotch className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const cliente = (data?.[0] as Cliente) ?? null

  if (!cliente) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-base font-medium mb-4">Cliente no encontrado</p>
        <button
          type="button"
          onClick={onVolver}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors cursor-pointer"
        >
          Volver
        </button>
      </div>
    )
  }

  return <ClienteDetalle cliente={cliente} onVolver={onVolver} />
}
