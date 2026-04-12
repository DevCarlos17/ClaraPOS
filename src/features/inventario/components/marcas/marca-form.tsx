import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { marcaSchema } from '@/features/inventario/schemas/marca-schema'
import {
  crearMarca,
  actualizarMarca,
  type Marca,
} from '@/features/inventario/hooks/use-marcas'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface MarcaFormProps {
  isOpen: boolean
  onClose: () => void
  marca?: Marca
}

export function MarcaForm({ isOpen, onClose, marca }: MarcaFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!marca
  const { user } = useCurrentUser()

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (marca) {
        setNombre(marca.nombre)
        setDescripcion(marca.descripcion ?? '')
      } else {
        setNombre('')
        setDescripcion('')
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, marca])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = marcaSchema.safeParse({
      nombre,
      descripcion: descripcion || undefined,
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
      if (isEditing && marca) {
        await actualizarMarca(marca.id, {
          nombre: parsed.data.nombre,
          descripcion: parsed.data.descripcion,
        })
        toast.success('Marca actualizada correctamente')
      } else {
        await crearMarca({
          nombre: parsed.data.nombre,
          descripcion: parsed.data.descripcion,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Marca creada correctamente')
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
          {isEditing ? 'Editar Marca' : 'Nueva Marca'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="marca-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="marca-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: JOHNSON"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Descripcion */}
          <div>
            <label htmlFor="marca-descripcion" className="block text-sm font-medium text-gray-700 mb-1">
              Descripcion <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="marca-descripcion"
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripcion de la marca"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.descripcion ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.descripcion && (
              <p className="text-red-500 text-xs mt-1">{errors.descripcion}</p>
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
