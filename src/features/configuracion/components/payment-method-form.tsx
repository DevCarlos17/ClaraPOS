import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { paymentMethodSchema } from '@/features/configuracion/schemas/payment-method-schema'
import {
  createPaymentMethod,
  updatePaymentMethod,
  type PaymentMethod,
} from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface PaymentMethodFormProps {
  isOpen: boolean
  onClose: () => void
  method?: PaymentMethod
}

export function PaymentMethodForm({ isOpen, onClose, method }: PaymentMethodFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!method
  const { user } = useCurrentUser()

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD')
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (method) {
        setName(method.nombre)
        setCurrency(method.moneda as 'USD' | 'BS')
        setActive(method.activo === 1)
      } else {
        setName('')
        setCurrency('USD')
        setActive(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, method])

  function handleNameChange(value: string) {
    setName(value.toUpperCase())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = paymentMethodSchema.safeParse({ name, currency, active })

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
      if (isEditing && method) {
        await updatePaymentMethod(method.id, {
          nombre: parsed.data.name,
          activo: parsed.data.active,
        })
        toast.success('Metodo de pago actualizado correctamente')
      } else {
        await createPaymentMethod(parsed.data.name, parsed.data.currency, user!.empresa_id!)
        toast.success('Metodo de pago creado correctamente')
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
          {isEditing ? 'Editar Metodo de Pago' : 'Nuevo Metodo de Pago'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="mp-name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="mp-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej: EFECTIVO USD"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          {/* Moneda */}
          <div>
            <label htmlFor="mp-currency" className="block text-sm font-medium text-gray-700 mb-1">
              Moneda
            </label>
            <select
              id="mp-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'USD' | 'BS')}
              disabled={isEditing}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
              } ${errors.currency ? 'border-red-500' : 'border-gray-300'}`}
            >
              <option value="USD">USD - Dolares</option>
              <option value="BS">BS - Bolivares</option>
            </select>
            {errors.currency && (
              <p className="text-red-500 text-xs mt-1">{errors.currency}</p>
            )}
            {isEditing && (
              <p className="text-gray-400 text-xs mt-1">La moneda no puede modificarse</p>
            )}
          </div>

          {/* Activo */}
          <div className="flex items-center gap-2">
            <input
              id="mp-active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="mp-active" className="text-sm font-medium text-gray-700">
              Activo
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
