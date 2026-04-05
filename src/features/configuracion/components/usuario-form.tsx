import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createEmployeeSchema, updateEmployeeSchema } from '@/features/configuracion/schemas/usuario-schema'
import {
  crearEmpleado,
  actualizarEmpleado,
  type Usuario,
} from '@/features/configuracion/hooks/use-usuarios'

interface UsuarioFormProps {
  isOpen: boolean
  onClose: () => void
  usuario?: Usuario
}

const LEVEL_LABELS: Record<number, string> = {
  2: 'Supervisor',
  3: 'Cajero',
}

export function UsuarioForm({ isOpen, onClose, usuario }: UsuarioFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!usuario

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [level, setLevel] = useState<number>(3)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (usuario) {
        setNombre(usuario.nombre)
        setEmail(usuario.email)
        setPassword('')
        setLevel(usuario.level)
      } else {
        setNombre('')
        setEmail('')
        setPassword('')
        setLevel(3)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, usuario])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (isEditing && usuario) {
      const parsed = updateEmployeeSchema.safeParse({ nombre, level })
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
        await actualizarEmpleado(usuario.id, {
          nombre: parsed.data.nombre,
          level: parsed.data.level,
        })
        toast.success('Empleado actualizado correctamente')
        onClose()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      } finally {
        setSubmitting(false)
      }
    } else {
      const parsed = createEmployeeSchema.safeParse({ nombre, email, password, level })
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
        await crearEmpleado(parsed.data.nombre, parsed.data.email, parsed.data.password, parsed.data.level)
        toast.success('Empleado creado correctamente')
        onClose()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      } finally {
        setSubmitting(false)
      }
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
          {isEditing ? 'Editar Empleado' : 'Nuevo Empleado'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="usr-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="usr-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Email (solo crear) */}
          {!isEditing && (
            <div>
              <label htmlFor="usr-email" className="block text-sm font-medium text-gray-700 mb-1">
                Correo electronico
              </label>
              <input
                id="usr-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="empleado@ejemplo.com"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email}</p>
              )}
            </div>
          )}

          {/* Password (solo crear) */}
          {!isEditing && (
            <div>
              <label htmlFor="usr-password" className="block text-sm font-medium text-gray-700 mb-1">
                Contrasena
              </label>
              <input
                id="usr-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password}</p>
              )}
            </div>
          )}

          {/* Nivel */}
          <div>
            <label htmlFor="usr-level" className="block text-sm font-medium text-gray-700 mb-1">
              Nivel
            </label>
            <select
              id="usr-level"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.level ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value={2}>{LEVEL_LABELS[2]}</option>
              <option value={3}>{LEVEL_LABELS[3]}</option>
            </select>
            {errors.level && (
              <p className="text-red-500 text-xs mt-1">{errors.level}</p>
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
