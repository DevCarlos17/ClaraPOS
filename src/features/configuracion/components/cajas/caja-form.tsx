import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cajaSchema } from '@/features/configuracion/schemas/caja-schema'
import {
  crearCaja,
  actualizarCaja,
  type Caja,
} from '@/features/configuracion/hooks/use-cajas'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { NativeSelect } from '@/components/ui/native-select'

interface CajaFormProps {
  isOpen: boolean
  onClose: () => void
  caja?: Caja
}

export function CajaForm({ isOpen, onClose, caja }: CajaFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!caja
  const { user } = useCurrentUser()
  const { depositos, isLoading: loadingDepositos } = useDepositosActivos()

  const [nombre, setNombre] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [depositoId, setDepositoId] = useState('')
  const [activo, setActivo] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (caja) {
        setNombre(caja.nombre)
        setUbicacion(caja.ubicacion ?? '')
        setDepositoId(caja.deposito_id ?? '')
        setActivo(caja.is_active === 1)
      } else {
        setNombre('')
        setUbicacion('')
        setDepositoId('')
        setActivo(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, caja])

  function handleNombreChange(value: string) {
    setNombre(value.toUpperCase())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = cajaSchema.safeParse({
      nombre,
      ubicacion: ubicacion || undefined,
      deposito_id: depositoId || undefined,
      is_active: activo,
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
      if (isEditing && caja) {
        await actualizarCaja(caja.id, {
          nombre: parsed.data.nombre,
          ubicacion: parsed.data.ubicacion,
          deposito_id: parsed.data.deposito_id,
          is_active: parsed.data.is_active,
        })
        toast.success('Caja actualizada correctamente')
      } else {
        await crearCaja({
          nombre: parsed.data.nombre,
          ubicacion: parsed.data.ubicacion,
          deposito_id: parsed.data.deposito_id,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Caja creada correctamente')
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
          {isEditing ? 'Editar Caja' : 'Nueva Caja'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="caja-nombre" className="block text-sm font-medium text-muted-foreground mb-1">
              Nombre
            </label>
            <input
              id="caja-nombre"
              type="text"
              value={nombre}
              onChange={(e) => handleNombreChange(e.target.value)}
              placeholder="Ej: CAJA PRINCIPAL"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-input'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Ubicacion */}
          <div>
            <label htmlFor="caja-ubicacion" className="block text-sm font-medium text-muted-foreground mb-1">
              Ubicacion <span className="text-muted-foreground/60 font-normal">(opcional)</span>
            </label>
            <input
              id="caja-ubicacion"
              type="text"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Ej: Planta baja"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.ubicacion ? 'border-red-500' : 'border-input'
              }`}
            />
            {errors.ubicacion && (
              <p className="text-red-500 text-xs mt-1">{errors.ubicacion}</p>
            )}
          </div>

          {/* Deposito */}
          <div>
            <label htmlFor="caja-deposito" className="block text-sm font-medium text-muted-foreground mb-1">
              Deposito <span className="text-muted-foreground/60 font-normal">(opcional)</span>
            </label>
            <NativeSelect
              id="caja-deposito"
              value={depositoId}
              onChange={(e) => setDepositoId(e.target.value)}
              disabled={loadingDepositos}
              className={loadingDepositos ? 'text-muted-foreground' : undefined}
            >
              <option value="">Sin deposito</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </NativeSelect>
            {errors.deposito_id && (
              <p className="text-red-500 text-xs mt-1">{errors.deposito_id}</p>
            )}
          </div>

          {/* Activo */}
          <div className="flex items-center gap-2">
            <input
              id="caja-activo"
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="caja-activo" className="text-sm font-medium cursor-pointer">
              Activa
            </label>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
