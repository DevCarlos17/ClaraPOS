import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { nivelPrecioSchema } from '@/features/configuracion/schemas/nivel-precio-schema'
import {
  crearNivelPrecio,
  actualizarNivelPrecio,
  type NivelPrecio,
} from '@/features/configuracion/hooks/use-niveles-precio'
import { useCurrentUser } from '@/core/hooks/use-current-user'

const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
const stopScroll = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()

interface NivelPrecioFormProps {
  isOpen: boolean
  onClose: () => void
  nivel?: NivelPrecio
  nextOrden?: number
}

export function NivelPrecioForm({ isOpen, onClose, nivel, nextOrden }: NivelPrecioFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!nivel
  const { user } = useCurrentUser()

  const [nombre, setNombre] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [activo, setActivo] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (nivel) {
        setNombre(nivel.nombre)
        setPorcentaje(nivel.porcentaje_defecto)
        setActivo(nivel.is_active === 1)
      } else {
        setNombre('')
        setPorcentaje('0')
        setActivo(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, nivel])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = nivelPrecioSchema.safeParse({
      nombre,
      porcentaje_defecto: parseFloat(porcentaje),
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
      if (isEditing && nivel) {
        await actualizarNivelPrecio(nivel.id, {
          nombre: parsed.data.nombre,
          porcentaje_defecto: parsed.data.porcentaje_defecto,
          is_active: activo,
          updated_by: user?.id,
        })
        toast.success('Nivel de precio actualizado')
      } else {
        await crearNivelPrecio({
          nombre: parsed.data.nombre,
          orden: nextOrden ?? 1,
          porcentaje_defecto: parsed.data.porcentaje_defecto,
          empresa_id: user!.empresa_id!,
          created_by: user?.id,
        })
        toast.success('Nivel de precio creado')
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
    if (e.target === dialogRef.current) onClose()
  }

  const esOrden1 = nivel?.orden === 1

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? `Editar Nivel ${nivel?.orden}` : 'Nuevo Nivel de Precio'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="nv-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="nv-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: DETAL, MAYOR, ESPECIAL"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>}
          </div>

          {/* Porcentaje defecto */}
          <div>
            <label htmlFor="nv-pct" className="block text-sm font-medium text-gray-700 mb-1">
              Margen Default (%)
            </label>
            <input
              id="nv-pct"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              onWheel={stopScroll}
              placeholder="0.00"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${noSpinner} ${
                errors.porcentaje_defecto ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            <p className="text-xs text-gray-400 mt-1">
              Se pre-rellena en productos nuevos. 0 = sin defecto.
            </p>
            {errors.porcentaje_defecto && (
              <p className="text-red-500 text-xs mt-1">{errors.porcentaje_defecto}</p>
            )}
          </div>

          {/* Activo — deshabilitado para orden 1 */}
          <div className="flex items-center gap-2">
            <input
              id="nv-activo"
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              disabled={esOrden1}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <label
              htmlFor="nv-activo"
              className={`text-sm font-medium ${esOrden1 ? 'text-gray-400' : 'text-gray-700'}`}
            >
              Activo
            </label>
            {esOrden1 && (
              <span className="text-xs text-gray-400">(el nivel principal no puede desactivarse)</span>
            )}
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
