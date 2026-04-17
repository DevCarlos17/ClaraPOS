import { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { clienteSchema } from '@/features/clientes/schemas/cliente-schema'
import { crearCliente } from '@/features/clientes/hooks/use-clientes'
import { useCurrentUser } from '@/core/hooks/use-current-user'

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
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [limiteCredito, setLimiteCredito] = useState('0')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const resetForm = () => {
    setIdentificacion('')
    setNombre('')
    setDireccion('')
    setTelefono('')
    setLimiteCredito('0')
    setErrors({})
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const parsed = clienteSchema.safeParse({
      identificacion: identificacion.trim(),
      nombre: nombre.trim(),
      direccion: direccion.trim() || undefined,
      telefono: telefono.trim() || undefined,
      limite_credito_usd: parseFloat(limiteCredito) || 0,
      is_active: true,
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
        direccion: parsed.data.direccion,
        telefono: parsed.data.telefono,
        limite_credito_usd: parsed.data.limite_credito_usd,
        empresa_id: user.empresa_id,
      })

      toast.success('Cliente creado correctamente')
      onCreado({
        id,
        nombre: parsed.data.nombre,
        identificacion: parsed.data.identificacion,
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
      <div className="relative bg-card rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 border overflow-y-auto max-h-[90vh]">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserPlus size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Nuevo Cliente</h3>
            <p className="text-xs text-muted-foreground">Registro rapido de cliente</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Identificacion */}
          <div>
            <label className="block text-sm font-medium mb-1">Identificacion</label>
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

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium mb-1">Nombre / Razon Social</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Nombre del cliente o empresa"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background ${
                errors.nombre ? 'border-destructive' : 'border-input'
              }`}
            />
            {errors.nombre && (
              <p className="text-xs text-destructive mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Direccion */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Direccion
              <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
            </label>
            <textarea
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Direccion del cliente"
              rows={2}
              className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background resize-none"
            />
          </div>

          {/* Telefono */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Telefono
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

          {/* Limite de credito */}
          <div>
            <label className="block text-sm font-medium mb-1">Limite de Credito (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={limiteCredito}
              onChange={(e) => setLimiteCredito(e.target.value)}
              onKeyDown={(e) => { if (e.key === '-') e.preventDefault() }}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background ${
                errors.limite_credito_usd ? 'border-destructive' : 'border-input'
              }`}
            />
            {errors.limite_credito_usd && (
              <p className="text-xs text-destructive mt-1">{errors.limite_credito_usd}</p>
            )}
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
