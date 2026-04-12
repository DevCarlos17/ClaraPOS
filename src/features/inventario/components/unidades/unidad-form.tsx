import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { unidadSchema } from '@/features/inventario/schemas/unidad-schema'
import {
  crearUnidad,
  actualizarUnidad,
  type Unidad,
} from '@/features/inventario/hooks/use-unidades'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface UnidadFormProps {
  isOpen: boolean
  onClose: () => void
  unidad?: Unidad
}

export function UnidadForm({ isOpen, onClose, unidad }: UnidadFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!unidad
  const { user } = useCurrentUser()

  const [nombre, setNombre] = useState('')
  const [abreviatura, setAbreviatura] = useState('')
  const [esDecimal, setEsDecimal] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (unidad) {
        setNombre(unidad.nombre)
        setAbreviatura(unidad.abreviatura)
        setEsDecimal(unidad.es_decimal === 1)
      } else {
        setNombre('')
        setAbreviatura('')
        setEsDecimal(false)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, unidad])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = unidadSchema.safeParse({ nombre, abreviatura, es_decimal: esDecimal })

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
      if (isEditing && unidad) {
        await actualizarUnidad(unidad.id, {
          nombre: parsed.data.nombre,
          abreviatura: parsed.data.abreviatura,
          es_decimal: parsed.data.es_decimal,
        })
        toast.success('Unidad actualizada correctamente')
      } else {
        await crearUnidad({
          nombre: parsed.data.nombre,
          abreviatura: parsed.data.abreviatura,
          es_decimal: parsed.data.es_decimal,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Unidad creada correctamente')
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
          {isEditing ? 'Editar Unidad' : 'Nueva Unidad'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="unidad-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="unidad-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: KILOGRAMO"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Abreviatura */}
          <div>
            <label htmlFor="unidad-abreviatura" className="block text-sm font-medium text-gray-700 mb-1">
              Abreviatura <span className="text-gray-400 font-normal">(max. 5 caracteres)</span>
            </label>
            <input
              id="unidad-abreviatura"
              type="text"
              value={abreviatura}
              maxLength={5}
              onChange={(e) => setAbreviatura(e.target.value.toUpperCase())}
              placeholder="Ej: KG"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.abreviatura ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.abreviatura && (
              <p className="text-red-500 text-xs mt-1">{errors.abreviatura}</p>
            )}
          </div>

          {/* Admite decimales */}
          <div className="flex items-center gap-2">
            <input
              id="unidad-es-decimal"
              type="checkbox"
              checked={esDecimal}
              onChange={(e) => setEsDecimal(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="unidad-es-decimal" className="text-sm font-medium text-gray-700">
              Admite decimales
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
