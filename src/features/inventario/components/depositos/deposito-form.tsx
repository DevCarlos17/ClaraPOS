import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { depositoSchema } from '@/features/inventario/schemas/deposito-schema'
import {
  crearDeposito,
  actualizarDeposito,
  type Deposito,
} from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface DepositoFormProps {
  isOpen: boolean
  onClose: () => void
  deposito?: Deposito
}

export function DepositoForm({ isOpen, onClose, deposito }: DepositoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!deposito
  const { user } = useCurrentUser()

  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [esPrincipal, setEsPrincipal] = useState(false)
  const [permiteVenta, setPermiteVenta] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (deposito) {
        setNombre(deposito.nombre)
        setDireccion(deposito.direccion ?? '')
        setEsPrincipal(deposito.es_principal === 1)
        setPermiteVenta(deposito.permite_venta === 1)
      } else {
        setNombre('')
        setDireccion('')
        setEsPrincipal(false)
        setPermiteVenta(false)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, deposito])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = depositoSchema.safeParse({
      nombre,
      direccion: direccion || undefined,
      es_principal: esPrincipal,
      permite_venta: permiteVenta,
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
      if (isEditing && deposito) {
        await actualizarDeposito(deposito.id, {
          nombre: parsed.data.nombre,
          direccion: parsed.data.direccion,
          es_principal: parsed.data.es_principal,
          permite_venta: parsed.data.permite_venta,
        })
        toast.success('Deposito actualizado correctamente')
      } else {
        await crearDeposito({
          nombre: parsed.data.nombre,
          direccion: parsed.data.direccion,
          es_principal: parsed.data.es_principal,
          permite_venta: parsed.data.permite_venta,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Deposito creado correctamente')
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? 'Editar Deposito' : 'Nuevo Deposito'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="deposito-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="deposito-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: ALMACEN PRINCIPAL"
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
            <label htmlFor="deposito-direccion" className="block text-sm font-medium text-gray-700 mb-1">
              Direccion <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="deposito-direccion"
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Direccion del deposito"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.direccion ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.direccion && (
              <p className="text-red-500 text-xs mt-1">{errors.direccion}</p>
            )}
          </div>

          {/* Es principal */}
          <div className="flex items-center gap-2">
            <input
              id="deposito-es-principal"
              type="checkbox"
              checked={esPrincipal}
              onChange={(e) => setEsPrincipal(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="deposito-es-principal" className="text-sm font-medium text-gray-700">
              Deposito principal
            </label>
          </div>

          {/* Permite venta */}
          <div className="flex items-center gap-2">
            <input
              id="deposito-permite-venta"
              type="checkbox"
              checked={permiteVenta}
              onChange={(e) => setPermiteVenta(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="deposito-permite-venta" className="text-sm font-medium text-gray-700">
              Permite venta
            </label>
          </div>

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
