import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { paymentMethodSchema } from '@/features/configuracion/schemas/payment-method-schema'
import {
  createPaymentMethod,
  updatePaymentMethod,
  TIPOS_METODO,
  type PaymentMethod,
} from '@/features/configuracion/hooks/use-payment-methods'
import { useBancosActivos } from '@/features/configuracion/hooks/use-bancos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { NativeSelect } from '@/components/ui/native-select'

interface PaymentMethodFormProps {
  isOpen: boolean
  onClose: () => void
  method?: PaymentMethod
}

export function PaymentMethodForm({ isOpen, onClose, method }: PaymentMethodFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!method
  const { user } = useCurrentUser()
  const { bancos } = useBancosActivos()

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD')
  const [tipo, setTipo] = useState<string>('EFECTIVO')
  const [bancoEmpresaId, setBancoEmpresaId] = useState<string>('')
  const [requiereReferencia, setRequiereReferencia] = useState(false)
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const requiereBanco = ['TRANSFERENCIA', 'PUNTO', 'PAGO_MOVIL'].includes(tipo)

  useEffect(() => {
    if (isOpen) {
      if (method) {
        setName(method.nombre)
        setCurrency(method.moneda as 'USD' | 'BS')
        setTipo(method.tipo ?? 'EFECTIVO')
        setBancoEmpresaId(method.banco_empresa_id ?? '')
        setRequiereReferencia(method.requiere_referencia === 1)
        setActive(method.is_active === 1)
      } else {
        setName('')
        setCurrency('USD')
        setTipo('EFECTIVO')
        setBancoEmpresaId('')
        setRequiereReferencia(false)
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

    const parsed = paymentMethodSchema.safeParse({
      name,
      currency,
      tipo,
      banco_empresa_id: bancoEmpresaId || undefined,
      requiere_referencia: requiereReferencia,
      active,
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

    if (requiereBanco && !bancoEmpresaId) {
      setErrors({ banco_empresa_id: 'Debe seleccionar un banco para este tipo de metodo' })
      return
    }

    setSubmitting(true)
    try {
      if (isEditing && method) {
        await updatePaymentMethod(method.id, {
          nombre: parsed.data.name,
          tipo: parsed.data.tipo,
          banco_empresa_id: bancoEmpresaId || null,
          is_active: parsed.data.active,
        })
        toast.success('Metodo de pago actualizado correctamente')
      } else {
        await createPaymentMethod({
          nombre: parsed.data.name,
          moneda: parsed.data.currency,
          tipo: parsed.data.tipo,
          banco_empresa_id: bancoEmpresaId || undefined,
          requiere_referencia: parsed.data.requiere_referencia,
          empresa_id: user!.empresa_id!,
          usuario_id: user!.id,
        })
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

          {/* Tipo */}
          <div>
            <label htmlFor="mp-tipo" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <NativeSelect
              id="mp-tipo"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value)
                if (!['TRANSFERENCIA', 'PUNTO', 'PAGO_MOVIL'].includes(e.target.value)) {
                  setBancoEmpresaId('')
                }
              }}
            >
              {TIPOS_METODO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </NativeSelect>
            {errors.tipo && (
              <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>
            )}
          </div>

          {/* Moneda */}
          <div>
            <label htmlFor="mp-currency" className="block text-sm font-medium text-gray-700 mb-1">
              Moneda
            </label>
            <NativeSelect
              id="mp-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'USD' | 'BS')}
              disabled={isEditing}
              className={isEditing ? 'text-gray-500 cursor-not-allowed' : undefined}
            >
              <option value="USD">USD - Dolares</option>
              <option value="BS">BS - Bolivares</option>
            </NativeSelect>
            {errors.currency && (
              <p className="text-red-500 text-xs mt-1">{errors.currency}</p>
            )}
            {isEditing && (
              <p className="text-gray-400 text-xs mt-1">La moneda no puede modificarse</p>
            )}
          </div>

          {/* Banco (condicional) */}
          {requiereBanco && (
            <div>
              <label htmlFor="mp-banco" className="block text-sm font-medium text-gray-700 mb-1">
                Banco Asociado
              </label>
              {bancos.length === 0 ? (
                <p className="text-amber-600 text-xs bg-amber-50 rounded-md px-3 py-2">
                  No hay bancos registrados. Cree un banco primero en la seccion de Bancos.
                </p>
              ) : (
                <NativeSelect
                  id="mp-banco"
                  value={bancoEmpresaId}
                  onChange={(e) => setBancoEmpresaId(e.target.value)}
                >
                  <option value="">-- Seleccione un banco --</option>
                  {bancos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre_banco} - {b.nro_cuenta}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {errors.banco_empresa_id && (
                <p className="text-red-500 text-xs mt-1">{errors.banco_empresa_id}</p>
              )}
            </div>
          )}

          {/* Requiere Referencia */}
          <div className="flex items-center gap-2">
            <input
              id="mp-ref"
              type="checkbox"
              checked={requiereReferencia}
              onChange={(e) => setRequiereReferencia(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="mp-ref" className="text-sm font-medium text-gray-700">
              Requiere numero de referencia
            </label>
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
