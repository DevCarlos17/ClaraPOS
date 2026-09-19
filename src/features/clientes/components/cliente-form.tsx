import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { clienteSchema } from '@/features/clientes/schemas/cliente-schema'
import { filterCedulaInput } from '@/lib/identity'
import {
  crearCliente,
  actualizarCliente,
  type Cliente,
} from '@/features/clientes/hooks/use-clientes'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDeudaFacturasCliente } from '@/features/cxc/hooks/use-deuda-cliente'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { formatUsd } from '@/lib/currency'

interface ClienteFormProps {
  isOpen: boolean
  onClose: () => void
  cliente?: Cliente
}

export function ClienteForm({ isOpen, onClose, cliente }: ClienteFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!cliente
  const { user } = useCurrentUser()
  // Deuda y saldo a favor son cifras independientes, nunca neteadas entre si
  // (mismo modelo que CxC — ver exploracion sdd/clientes-saldo-separado).
  const { deudaFacturasUsd } = useDeudaFacturasCliente(cliente?.id ?? null)
  const { disponible: creditoFavorUsd } = useSaldoAFavor(cliente?.id ?? null)

  const [identificacion, setIdentificacion] = useState('')
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [limiteCredito, setLimiteCredito] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (cliente) {
        setIdentificacion(cliente.identificacion)
        setNombre(cliente.nombre)
        setDireccion(cliente.direccion ?? '')
        setTelefono(cliente.telefono ?? '')
        setLimiteCredito(cliente.limite_credito_usd)
        setIsActive(cliente.is_active === 1)
      } else {
        setIdentificacion('')
        setNombre('')
        setDireccion('')
        setTelefono('')
        setLimiteCredito('0')
        setIsActive(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, cliente])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = clienteSchema.safeParse({
      identificacion,
      nombre,
      direccion: direccion || undefined,
      telefono: telefono || undefined,
      limite_credito_usd: parseFloat(limiteCredito) || 0,
      is_active: isActive,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      if (isEditing && cliente) {
        await actualizarCliente(cliente.id, {
          nombre: parsed.data.nombre,
          direccion: parsed.data.direccion ?? null,
          telefono: parsed.data.telefono ?? null,
          limite_credito_usd: parsed.data.limite_credito_usd,
          is_active: parsed.data.is_active,
        })
        toast.success('Cliente actualizado correctamente')
      } else {
        await crearCliente({
          identificacion: parsed.data.identificacion,
          nombre: parsed.data.nombre,
          direccion: parsed.data.direccion,
          telefono: parsed.data.telefono,
          limite_credito_usd: parsed.data.limite_credito_usd,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Cliente creado correctamente')
      }
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
        </h2>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          {/* Identificacion */}
          <div>
            <label htmlFor="cli-identificacion" className="block text-sm font-medium text-gray-700 mb-1">
              Identificacion
            </label>
            <input
              id="cli-identificacion"
              type="text"
              value={identificacion}
              onChange={(e) => setIdentificacion(filterCedulaInput(e.target.value))}
              disabled={isEditing}
              placeholder="Ej: V22448021, E12345678"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
              } ${errors.identificacion ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.identificacion && (
              <p className="text-red-500 text-xs mt-1">{errors.identificacion}</p>
            )}
            {isEditing && (
              <p className="text-gray-400 text-xs mt-1">La identificacion no puede modificarse</p>
            )}
          </div>

          {/* Nombre Social */}
          <div>
            <label htmlFor="cli-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre / Razon Social
            </label>
            <input
              id="cli-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Nombre del cliente o empresa"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Direccion */}
          <div>
            <label htmlFor="cli-direccion" className="block text-sm font-medium text-gray-700 mb-1">
              Direccion <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              id="cli-direccion"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Direccion del cliente"
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Telefono */}
          <div>
            <label htmlFor="cli-telefono" className="block text-sm font-medium text-gray-700 mb-1">
              Telefono <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="cli-telefono"
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 0412-1234567"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Limite de Credito */}
          <div>
            <label htmlFor="cli-limite" className="block text-sm font-medium text-gray-700 mb-1">
              Limite de Credito (USD)
            </label>
            <input
              id="cli-limite"
              type="number"
              step="0.01"
              min="0"
              value={limiteCredito}
              onChange={(e) => setLimiteCredito(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.limite_credito_usd ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.limite_credito_usd && (
              <p className="text-red-500 text-xs mt-1">{errors.limite_credito_usd}</p>
            )}
          </div>

          {/* Activo (solo en edicion) */}
          {isEditing && (
            <div className="flex items-center gap-2">
              <input
                id="cli-activo"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="cli-activo" className="text-sm font-medium text-gray-700">
                Activo
              </label>
            </div>
          )}

          {/* Deuda / Saldo a favor (read-only en edicion, SIEMPRE separados) */}
          {isEditing && cliente && (
            <div className="rounded-md bg-gray-50 p-3 space-y-1">
              <div>
                <span className="text-sm text-gray-500">Deuda: </span>
                <span className={`text-sm font-semibold ${deudaFacturasUsd > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {formatUsd(deudaFacturasUsd)}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500">Saldo a favor: </span>
                <span className={`text-sm font-semibold ${creditoFavorUsd > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                  {creditoFavorUsd > 0 ? `+${formatUsd(creditoFavorUsd)}` : formatUsd(0)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                El saldo solo se modifica via movimientos de cuenta
              </p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
