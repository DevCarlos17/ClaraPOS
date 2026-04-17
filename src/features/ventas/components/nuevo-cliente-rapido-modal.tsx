import { useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { crearCliente } from '@/features/clientes/hooks/use-clientes'
import { useCurrentUser } from '@/core/hooks/use-current-user'

const clienteRapidoSchema = z.object({
  identificacion: z.string().min(1, 'La identificacion es requerida').max(20),
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  telefono: z.string().max(20).optional(),
})

interface NuevoClienteRapidoModalProps {
  isOpen: boolean
  onClose: () => void
  onCreado: (cliente: { id: string; nombre: string; identificacion: string }) => void
}

export function NuevoClienteRapidoModal({
  isOpen,
  onClose,
  onCreado,
}: NuevoClienteRapidoModalProps) {
  const { user } = useCurrentUser()
  const [identificacion, setIdentificacion] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const resetForm = () => {
    setIdentificacion('')
    setNombre('')
    setTelefono('')
    setErrors({})
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const parsed = clienteRapidoSchema.safeParse({
      identificacion: identificacion.trim(),
      nombre: nombre.trim(),
      telefono: telefono.trim() || undefined,
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

    if (!user?.empresa_id) {
      toast.error('No se pudo determinar la empresa')
      return
    }

    setSubmitting(true)
    try {
      const id = await crearCliente({
        identificacion: parsed.data.identificacion,
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono,
        limite_credito_usd: 0,
        empresa_id: user.empresa_id,
      })

      toast.success('Cliente creado correctamente')
      onCreado({
        id,
        nombre: parsed.data.nombre.toUpperCase(),
        identificacion: parsed.data.identificacion.toUpperCase(),
      })
      resetForm()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el cliente')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-card rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 border">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserPlus size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Nuevo Cliente</h3>
            <p className="text-xs text-muted-foreground">Registro rápido de cliente</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Identificación</label>
            <input
              type="text"
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value.toUpperCase())}
              placeholder="Ej: V-12345678"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background ${
                errors.identificacion ? 'border-destructive' : 'border-input'
              }`}
            />
            {errors.identificacion && (
              <p className="text-xs text-destructive mt-1">{errors.identificacion}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background ${
                errors.nombre ? 'border-destructive' : 'border-input'
              }`}
            />
            {errors.nombre && (
              <p className="text-xs text-destructive mt-1">{errors.nombre}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Teléfono
              <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="0412-1234567"
              className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Crear Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
