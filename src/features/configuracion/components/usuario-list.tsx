import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  useUsuarios,
  toggleEmpleado,
  type Usuario,
} from '@/features/configuracion/hooks/use-usuarios'
import { UsuarioForm } from './usuario-form'
import { PageHeader } from '@/components/layout/page-header'

const LEVEL_CONFIG: Record<number, { label: string; bgClass: string; textClass: string; ringClass: string }> = {
  1: {
    label: 'Propietario',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700',
    ringClass: 'ring-blue-600/20',
  },
  2: {
    label: 'Supervisor',
    bgClass: 'bg-green-50',
    textClass: 'text-green-700',
    ringClass: 'ring-green-600/20',
  },
  3: {
    label: 'Cajero',
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-700',
    ringClass: 'ring-gray-600/20',
  },
}

function LevelBadge({ level }: { level: number }) {
  const config = LEVEL_CONFIG[level] ?? LEVEL_CONFIG[3]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${config.bgClass} ${config.textClass} ${config.ringClass}`}
    >
      {config.label}
    </span>
  )
}

function EstadoBadge({ activo }: { activo: number }) {
  if (activo === 1) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        Activo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
      Inactivo
    </span>
  )
}

export function UsuarioList() {
  const { user: currentUser } = useCurrentUser()
  const { usuarios, isLoading } = useUsuarios()
  const [formOpen, setFormOpen] = useState(false)
  const [editingUsuario, setEditingUsuario] = useState<Usuario | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingUsuario(undefined)
    setFormOpen(true)
  }

  function handleEditar(usuario: Usuario) {
    setEditingUsuario(usuario)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingUsuario(undefined)
  }

  async function handleToggleActivo(usuario: Usuario) {
    const nuevoEstado = usuario.activo !== 1
    setTogglingId(usuario.id)
    try {
      await toggleEmpleado(usuario.id, nuevoEstado)
      toast.success(nuevoEstado ? 'Empleado activado' : 'Empleado desactivado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  const isOwnerRow = (usuario: Usuario) => usuario.level === 1
  const isSelf = (usuario: Usuario) => usuario.id === currentUser?.id

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader titulo="Usuarios" descripcion="Gestion de empleados de tu empresa" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Usuarios" descripcion="Gestion de empleados de tu empresa">
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Agregar Empleado
        </button>
      </PageHeader>

      {usuarios.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay usuarios registrados</p>
          <p className="text-sm mt-1">Agrega empleados para que puedan acceder al sistema</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Correo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nivel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 hidden sm:table-cell">
                  Fecha
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usr) => (
                <tr
                  key={usr.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-900 font-medium">{usr.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{usr.email}</td>
                  <td className="px-4 py-3">
                    <LevelBadge level={usr.level} />
                  </td>
                  <td className="px-4 py-3">
                    {isOwnerRow(usr) || isSelf(usr) ? (
                      <EstadoBadge activo={usr.activo} />
                    ) : (
                      <button
                        onClick={() => handleToggleActivo(usr)}
                        disabled={togglingId === usr.id}
                        className="disabled:opacity-50"
                      >
                        <EstadoBadge activo={usr.activo} />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {new Date(usr.created_at).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isOwnerRow(usr) && !isSelf(usr) && (
                      <button
                        onClick={() => handleEditar(usr)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UsuarioForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        usuario={editingUsuario}
      />
    </div>
  )
}
