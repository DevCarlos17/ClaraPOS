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
import {
  useDeduccionesDeMetodo,
  createDeduccion,
  updateDeduccion,
  type TipoDeduccion,
} from '@/features/configuracion/hooks/use-metodo-cobro-deducciones'
import { useCuentasDetallePorTipo } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { NativeSelect } from '@/components/ui/native-select'

interface PaymentMethodFormProps {
  isOpen: boolean
  onClose: () => void
  method?: PaymentMethod
}

// PR-3 (metodo-cobro-deducciones): fila local editable de deduccion.
// `id` undefined = fila nueva, aun no persistida.
interface DeduccionRow {
  id?: string
  concepto: string
  tipo: TipoDeduccion
  porcentaje: string
  cuenta_gasto_id: string
  is_active: boolean
}

const TIPOS_DEDUCCION: { value: TipoDeduccion; label: string }[] = [
  { value: 'COMISION', label: 'Comision' },
  { value: 'ISLR', label: 'Retencion ISLR' },
  { value: 'OTRO', label: 'Otro' },
]

export function PaymentMethodForm({ isOpen, onClose, method }: PaymentMethodFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!method
  const { user } = useCurrentUser()
  const { bancos } = useBancosActivos()
  const { cuentas: cuentasGasto } = useCuentasDetallePorTipo('GASTO')

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD')
  const [tipo, setTipo] = useState<string>('EFECTIVO')
  const [bancoEmpresaId, setBancoEmpresaId] = useState<string>('')
  const [requiereReferencia, setRequiereReferencia] = useState(false)
  const [active, setActive] = useState(true)
  const [consolidarLotes, setConsolidarLotes] = useState(true)
  const [deducciones, setDeducciones] = useState<DeduccionRow[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const requiereBanco = ['TRANSFERENCIA', 'PUNTO', 'PAGO_MOVIL'].includes(tipo)
  const { deducciones: deduccionesExistentes } = useDeduccionesDeMetodo(method?.id)

  useEffect(() => {
    if (isOpen) {
      if (method) {
        setName(method.nombre)
        setCurrency(method.moneda as 'USD' | 'BS')
        setTipo(method.tipo ?? 'EFECTIVO')
        setBancoEmpresaId(method.banco_empresa_id ?? '')
        setRequiereReferencia(method.requiere_referencia === 1)
        setActive(method.is_active === 1)
        setConsolidarLotes(method.consolidar_lotes !== 0)
        setDeducciones(
          deduccionesExistentes.map((d) => ({
            id: d.id,
            concepto: d.concepto,
            tipo: d.tipo as TipoDeduccion,
            porcentaje: d.porcentaje,
            cuenta_gasto_id: d.cuenta_gasto_id,
            is_active: d.is_active === 1,
          }))
        )
      } else {
        setName('')
        setCurrency('USD')
        setTipo('EFECTIVO')
        setBancoEmpresaId('')
        setRequiereReferencia(false)
        setActive(true)
        setConsolidarLotes(true)
        setDeducciones([])
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, method, deduccionesExistentes])

  // PR-3 (SC-07): al elegir banco en modo creacion, precarga 1 slot de
  // comision base apuntando a la cuenta pasarela del banco (editable). Sin
  // defaults por `tipo` de metodo — misma regla para cualquier tipo bancario.
  useEffect(() => {
    if (!isOpen || isEditing || !bancoEmpresaId) return
    if (deducciones.length > 0) return
    const banco = bancos.find((b) => b.id === bancoEmpresaId)
    if (!banco?.cuenta_gasto_pasarela_id) return
    setDeducciones([
      {
        concepto: 'Comision bancaria',
        tipo: 'COMISION',
        porcentaje: '0',
        cuenta_gasto_id: banco.cuenta_gasto_pasarela_id,
        is_active: true,
      },
    ])
  }, [isOpen, isEditing, bancoEmpresaId, bancos, deducciones.length])

  // SC-09: metodo sin banco no ofrece deducciones bancarias.
  useEffect(() => {
    if (isOpen && !isEditing && !bancoEmpresaId) {
      setDeducciones([])
    }
  }, [isOpen, isEditing, bancoEmpresaId])

  function handleNameChange(value: string) {
    setName(value.toUpperCase())
  }

  function handleAddDeduccion() {
    const banco = bancos.find((b) => b.id === bancoEmpresaId)
    setDeducciones((prev) => [
      ...prev,
      {
        concepto: '',
        tipo: 'COMISION',
        porcentaje: '0',
        cuenta_gasto_id: banco?.cuenta_gasto_pasarela_id ?? '',
        is_active: true,
      },
    ])
  }

  function updateDeduccionRow(index: number, patch: Partial<DeduccionRow>) {
    setDeducciones((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  // SC-11: soft-deactivate, nunca DELETE fisico. Una fila aun no persistida
  // (sin id) simplemente se quita del array local.
  async function handleDeactivateDeduccion(index: number) {
    const row = deducciones[index]
    if (!row.id) {
      setDeducciones((prev) => prev.filter((_, i) => i !== index))
      return
    }
    try {
      await updateDeduccion(row.id, { is_active: false })
      updateDeduccionRow(index, { is_active: false })
      toast.success('Deduccion desactivada')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    }
  }

  // Persiste filas de deduccion de un metodo YA EXISTENTE (fuera de la
  // writeTransaction de creacion, que solo aplica a metodo nuevo).
  async function persistDeducciones(metodoCobroId: string, rows: DeduccionRow[]) {
    if (!user?.empresa_id) return
    for (const [i, row] of rows.entries()) {
      if (row.id) {
        await updateDeduccion(row.id, {
          concepto: row.concepto,
          tipo: row.tipo,
          porcentaje: row.porcentaje,
          cuenta_gasto_id: row.cuenta_gasto_id,
          orden: i,
        })
      } else {
        await createDeduccion({
          metodo_cobro_id: metodoCobroId,
          empresa_id: user.empresa_id,
          cuenta_gasto_id: row.cuenta_gasto_id,
          concepto: row.concepto,
          tipo: row.tipo,
          porcentaje: row.porcentaje,
          orden: i,
          usuario_id: user.id,
        })
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    // SC-09: metodo sin banco no arma el array de deducciones bancarias.
    const deduccionesPayload = bancoEmpresaId ? deducciones : []

    const parsed = paymentMethodSchema.safeParse({
      name,
      currency,
      tipo,
      banco_empresa_id: bancoEmpresaId || undefined,
      requiere_referencia: requiereReferencia,
      active,
      consolidar_lotes: consolidarLotes,
      deducciones: deduccionesPayload,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.')
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
          consolidar_lotes: parsed.data.consolidar_lotes,
        })
        await persistDeducciones(method.id, parsed.data.deducciones)
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
          consolidar_lotes: parsed.data.consolidar_lotes,
          deducciones: parsed.data.deducciones,
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

          {/* Deducciones del metodo (PR-3): solo si hay banco asociado (SC-09) */}
          {bancoEmpresaId && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Deducciones (comisiones)
                </label>
                <button
                  type="button"
                  onClick={handleAddDeduccion}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  + Agregar deduccion
                </button>
              </div>

              {deducciones.length === 0 && (
                <p className="text-xs text-gray-400 mb-2">Sin deducciones configuradas.</p>
              )}

              <div className="space-y-3">
                {deducciones.map((row, i) => (
                  <div
                    key={row.id ?? `nueva-${i}`}
                    className={`rounded-md border p-3 space-y-2 ${
                      row.is_active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Concepto</label>
                        <input
                          type="text"
                          value={row.concepto}
                          onChange={(e) => updateDeduccionRow(i, { concepto: e.target.value })}
                          disabled={!row.is_active}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                        {errors[`deducciones.${i}.concepto`] && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors[`deducciones.${i}.concepto`]}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Tipo</label>
                        <NativeSelect
                          value={row.tipo}
                          onChange={(e) =>
                            updateDeduccionRow(i, { tipo: e.target.value as TipoDeduccion })
                          }
                          disabled={!row.is_active}
                        >
                          {TIPOS_DEDUCCION.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Porcentaje %</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={row.porcentaje}
                          onChange={(e) => updateDeduccionRow(i, { porcentaje: e.target.value })}
                          disabled={!row.is_active}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                        {errors[`deducciones.${i}.porcentaje`] && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors[`deducciones.${i}.porcentaje`]}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Cuenta de gasto</label>
                        <NativeSelect
                          value={row.cuenta_gasto_id}
                          onChange={(e) =>
                            updateDeduccionRow(i, { cuenta_gasto_id: e.target.value })
                          }
                          disabled={!row.is_active}
                        >
                          <option value="">-- Seleccione una cuenta --</option>
                          {cuentasGasto.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.codigo} - {c.nombre}
                            </option>
                          ))}
                        </NativeSelect>
                        {errors[`deducciones.${i}.cuenta_gasto_id`] && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors[`deducciones.${i}.cuenta_gasto_id`]}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      {row.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivateDeduccion(i)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          {row.id ? 'Desactivar' : 'Quitar'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">Desactivada</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500 mt-2">
                La comision de pasarela ya viene precargada con la cuenta base del banco. Puedes
                ajustar el porcentaje, re-apuntar la cuenta o agregar mas conceptos (ej. retencion
                ISLR).
              </p>
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

          {/* Consolidar lotes (condicional, solo POS) */}
          {tipo === 'PUNTO' && (
            <div>
              <div className="flex items-center gap-2">
                <input
                  id="mp-consolidar-lotes"
                  type="checkbox"
                  checked={consolidarLotes}
                  onChange={(e) => setConsolidarLotes(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="mp-consolidar-lotes" className="text-sm font-medium text-gray-700">
                  Consolidar lotes al cerrar caja
                </label>
              </div>
              <p className="text-gray-400 text-xs mt-1 ml-6">
                {consolidarLotes
                  ? 'Los lotes cargados se envian a Tesoreria en UN solo traspaso, con la comision aplicada sobre el total.'
                  : 'Cada lote se envia a Tesoreria en un traspaso independiente, con su propia comision.'}
              </p>
            </div>
          )}

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
