import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import { createEmployeeSchema, updateEmployeeSchema } from '@/features/configuracion/schemas/usuario-schema'
import {
  crearEmpleado,
  actualizarEmpleado,
  type Usuario,
} from '@/features/configuracion/hooks/use-usuarios'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface UsuarioFormProps {
  isOpen: boolean
  onClose: () => void
  usuario?: Usuario
}

export function UsuarioForm({ isOpen, onClose, usuario }: UsuarioFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!usuario

  const { user: currentUser } = useCurrentUser()
  const empresaId = currentUser?.empresa_id ?? ''

  const { data: rolesData } = useQuery(
    'SELECT id, nombre, descripcion FROM roles WHERE empresa_id = ? AND is_active = 1 AND is_system = 0 ORDER BY nombre ASC',
    [empresaId]
  )
  const roles = (rolesData ?? []) as { id: string; nombre: string; descripcion: string | null }[]

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rolId, setRolId] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const { data: permisosData } = useQuery(
    rolId
      ? 'SELECT p.modulo, p.nombre FROM rol_permisos rp JOIN permisos p ON rp.permiso_id = p.id WHERE rp.rol_id = ? ORDER BY p.modulo, p.nombre'
      : '',
    rolId ? [rolId] : []
  )
  const permisosList = (permisosData ?? []) as { modulo: string; nombre: string }[]

  const permisosAgrupados = permisosList.reduce<Record<string, string[]>>((acc, p) => {
    const mod = p.modulo.charAt(0).toUpperCase() + p.modulo.slice(1)
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(p.nombre)
    return acc
  }, {})

  useEffect(() => {
    if (isOpen) {
      if (usuario) {
        setNombre(usuario.nombre)
        setEmail(usuario.email)
        setPassword('')
        setRolId(usuario.rol_id ?? '')
      } else {
        setNombre('')
        setEmail('')
        setPassword('')
        setRolId('')
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
      const parsed = updateEmployeeSchema.safeParse({ nombre, rol_id: rolId })
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
          rol_id: parsed.data.rol_id,
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
      const parsed = createEmployeeSchema.safeParse({ nombre, email, password, rol_id: rolId })
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
        await crearEmpleado(parsed.data.nombre, parsed.data.email, parsed.data.password, parsed.data.rol_id)
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

          {/* Rol */}
          <div>
            <label htmlFor="usr-rol" className="block text-sm font-medium text-gray-700 mb-1">
              Rol
            </label>
            <select
              id="usr-rol"
              value={rolId}
              onChange={(e) => setRolId(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.rol_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccionar rol...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
            {errors.rol_id && (
              <p className="text-red-500 text-xs mt-1">{errors.rol_id}</p>
            )}
            {rolId && Object.keys(permisosAgrupados).length > 0 ? (
              <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Permisos del rol:</p>
                <div className="space-y-2">
                  {Object.entries(permisosAgrupados).map(([modulo, permisos]) => (
                    <div key={modulo}>
                      <p className="text-xs font-medium text-gray-500 mb-1">{modulo}</p>
                      <div className="flex flex-wrap gap-1">
                        {permisos.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : rolId ? (
              <p className="text-xs text-gray-400 mt-2">Sin permisos asignados</p>
            ) : (
              <p className="text-xs text-gray-400 mt-2">Selecciona un rol para ver sus permisos</p>
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
