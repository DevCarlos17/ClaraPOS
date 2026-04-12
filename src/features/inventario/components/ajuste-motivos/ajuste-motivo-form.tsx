import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ajusteMotivoSchema } from '@/features/inventario/schemas/ajuste-motivo-schema'
import {
  crearAjusteMotivo,
  actualizarAjusteMotivo,
  type AjusteMotivo,
} from '@/features/inventario/hooks/use-ajuste-motivos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface AjusteMotivoFormProps {
  isOpen: boolean
  onClose: () => void
  motivo?: AjusteMotivo
}

export function AjusteMotivoForm({ isOpen, onClose, motivo }: AjusteMotivoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!motivo
  const { user } = useCurrentUser()

  const [nombre, setNombre] = useState('')
  const [operacionBase, setOperacionBase] = useState<'ENTRADA' | 'SALIDA'>('ENTRADA')
  const [afectaCosto, setAfectaCosto] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (motivo) {
        setNombre(motivo.nombre)
        setOperacionBase(motivo.operacion_base as 'ENTRADA' | 'SALIDA')
        setAfectaCosto(motivo.afecta_costo === 1)
      } else {
        setNombre('')
        setOperacionBase('ENTRADA')
        setAfectaCosto(false)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, motivo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = ajusteMotivoSchema.safeParse({
      nombre,
      operacion_base: operacionBase,
      afecta_costo: afectaCosto,
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
      if (isEditing && motivo) {
        await actualizarAjusteMotivo(motivo.id, {
          nombre: parsed.data.nombre,
          operacion_base: parsed.data.operacion_base,
          afecta_costo: parsed.data.afecta_costo,
        })
        toast.success('Motivo actualizado correctamente')
      } else {
        await crearAjusteMotivo({
          nombre: parsed.data.nombre,
          operacion_base: parsed.data.operacion_base,
          afecta_costo: parsed.data.afecta_costo,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Motivo creado correctamente')
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
          {isEditing ? 'Editar Motivo de Ajuste' : 'Nuevo Motivo de Ajuste'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="motivo-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="motivo-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: AJUSTE POR INVENTARIO"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Operacion base */}
          <div>
            <label htmlFor="motivo-operacion" className="block text-sm font-medium text-gray-700 mb-1">
              Operacion
            </label>
            <select
              id="motivo-operacion"
              value={operacionBase}
              onChange={(e) => setOperacionBase(e.target.value as 'ENTRADA' | 'SALIDA')}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.operacion_base ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="ENTRADA">ENTRADA</option>
              <option value="SALIDA">SALIDA</option>
            </select>
            {errors.operacion_base && (
              <p className="text-red-500 text-xs mt-1">{errors.operacion_base}</p>
            )}
          </div>

          {/* Afecta costo */}
          <div className="flex items-center gap-2">
            <input
              id="motivo-afecta-costo"
              type="checkbox"
              checked={afectaCosto}
              onChange={(e) => setAfectaCosto(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="motivo-afecta-costo" className="text-sm font-medium text-gray-700">
              Afecta costo
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
