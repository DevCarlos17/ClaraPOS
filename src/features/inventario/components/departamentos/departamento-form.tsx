import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { departamentoSchema } from '@/features/inventario/schemas/departamento-schema'
import {
  crearDepartamento,
  actualizarDepartamento,
  getSiguienteCodigoDepartamento,
  type Departamento,
} from '@/features/inventario/hooks/use-departamentos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface DepartamentoFormProps {
  isOpen: boolean
  onClose: () => void
  departamento?: Departamento
}

export function DepartamentoForm({ isOpen, onClose, departamento }: DepartamentoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!departamento
  const { user } = useCurrentUser()

  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (departamento) {
        setCodigo(departamento.codigo)
        setNombre(departamento.nombre)
      } else {
        setCodigo('')
        setNombre('')
        if (user?.empresa_id) {
          getSiguienteCodigoDepartamento(user.empresa_id)
            .then((next) => setCodigo(next))
            .catch(() => setCodigo(''))
        }
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, departamento, user?.empresa_id])

  function handleNombreChange(value: string) {
    setNombre(value.toUpperCase())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = departamentoSchema.safeParse({ codigo, nombre, is_active: true })

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
      if (isEditing && departamento) {
        await actualizarDepartamento(departamento.id, {
          nombre: parsed.data.nombre,
        })
        toast.success('Departamento actualizado correctamente')
      } else {
        await crearDepartamento(parsed.data.nombre, user!.empresa_id!)
        toast.success('Departamento creado correctamente')
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
          {isEditing ? 'Editar Departamento' : 'Nuevo Departamento'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Codigo */}
          <div>
            <label htmlFor="dep-codigo" className="block text-sm font-medium text-gray-700 mb-1">
              Codigo
            </label>
            <input
              id="dep-codigo"
              type="text"
              value={codigo}
              readOnly
              disabled
              placeholder="Auto-generado"
              className="w-full rounded-md border border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed px-3 py-2 text-sm"
            />
            <p className="text-gray-400 text-xs mt-1">
              {isEditing
                ? 'El codigo no puede modificarse'
                : 'El codigo se asigna automaticamente'}
            </p>
          </div>

          {/* Nombre */}
          <div>
            <label htmlFor="dep-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="dep-nombre"
              type="text"
              value={nombre}
              onChange={(e) => handleNombreChange(e.target.value)}
              placeholder="Nombre del departamento"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
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
