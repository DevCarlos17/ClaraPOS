import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { gastoSchema } from '@/features/contabilidad/schemas/gasto-schema'
import { crearGasto, type GastoPago } from '@/features/contabilidad/hooks/use-gastos'
import { useCuentasDetallePorTipo } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

// ─── Tipos locales ──────────────────────────────────────────

interface PagoRow {
  id: string
  metodo_cobro_id: string
  banco_empresa_id: string
  moneda: 'USD' | 'BS'
  monto: string
  referencia: string
}

// ─── Props ────────────────────────────────────────────────────

interface GastoFormProps {
  isOpen: boolean
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────

function nuevoPagoRow(): PagoRow {
  return {
    id: uuidv4(),
    metodo_cobro_id: '',
    banco_empresa_id: '',
    moneda: 'USD',
    monto: '',
    referencia: '',
  }
}

// ─── Componente ───────────────────────────────────────────────

export function GastoForm({ isOpen, onClose }: GastoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()

  // Dependencias externas
  const { cuentas, isLoading: loadingCuentas } = useCuentasDetallePorTipo('GASTO')
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()
  const { tasa: tasaActual } = useTasaActual()

  // ─── Estado de campos ──────────────────────────────────────

  const [cuentaId, setCuentaId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [tasa, setTasa] = useState('')
  const [montoUsd, setMontoUsd] = useState('')
  const [pagos, setPagos] = useState<PagoRow[]>([nuevoPagoRow()])
  const [observaciones, setObservaciones] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // ─── Abrir / cerrar dialogo ───────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setCuentaId('')
      setProveedorId('')
      setDescripcion('')
      setFecha(new Date().toISOString().slice(0, 10))
      setTasa(tasaActual ? parseFloat(tasaActual.valor).toFixed(4) : '1.0000')
      setMontoUsd('')
      setPagos([nuevoPagoRow()])
      setObservaciones('')
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, tasaActual])

  // ─── Advertencias de fecha ────────────────────────────────

  const hoy = new Date().toISOString().slice(0, 10)
  const fechaEsFutura = Boolean(fecha && fecha > hoy)
  const fechaWarning = (() => {
    if (!fecha || fechaEsFutura) return false
    const [anio, mes] = fecha.split('-').map(Number)
    const now = new Date()
    return anio !== now.getFullYear() || mes !== (now.getMonth() + 1)
  })()

  // ─── Calculo de monto en Bs (solo visual) ─────────────────

  const montoBsPreview = (() => {
    const mUsd = parseFloat(montoUsd)
    const t = parseFloat(tasa)
    if (!isNaN(mUsd) && !isNaN(t) && mUsd > 0 && t > 0) {
      return (mUsd * t).toFixed(2)
    }
    return null
  })()

  // ─── Auto-fill monto cuando hay un solo pago ──────────────

  useEffect(() => {
    if (pagos.length === 1) {
      const tasaN = parseFloat(tasa) || 1
      setPagos((prev) =>
        prev.map((p, i) => {
          if (i !== 0) return p
          const monto = p.moneda === 'BS'
            ? ((parseFloat(montoUsd) || 0) * tasaN).toFixed(2)
            : montoUsd
          return { ...p, monto }
        })
      )
    }
    // Solo reaccionar al cambio de montoUsd/tasa, no a pagos para evitar loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoUsd, tasa])

  // ─── Operaciones sobre filas de pagos ─────────────────────

  function agregarPago() {
    setPagos((prev) => [...prev, nuevoPagoRow()])
  }

  function eliminarPago(id: string) {
    setPagos((prev) => prev.filter((p) => p.id !== id))
  }

  function actualizarPago(id: string, campo: keyof Omit<PagoRow, 'id'>, valor: string) {
    setPagos((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const updated = { ...p, [campo]: valor }
        // Auto-detectar banco y moneda desde el metodo de pago seleccionado
        if (campo === 'metodo_cobro_id') {
          const metodo = metodos.find((m) => m.id === valor)
          updated.banco_empresa_id = metodo?.banco_empresa_id ?? ''
          updated.moneda = (metodo?.moneda ?? 'USD') as 'USD' | 'BS'
          updated.monto = ''
        }
        return updated
      })
    )
  }

  // ─── Calculo del total de pagos ───────────────────────────

  const tasaNum = parseFloat(tasa) || 1
  const totalPagosUsd = pagos.reduce((sum, p) => {
    const val = parseFloat(p.monto) || 0
    return sum + (p.moneda === 'BS' ? val / tasaNum : val)
  }, 0)

  const montoTotalFloat = parseFloat(montoUsd) || 0
  const pagosDesbalanceados =
    montoTotalFloat > 0 && Math.abs(totalPagosUsd - montoTotalFloat) > 0.01

  // ─── Submit ───────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const tasaN = parseFloat(tasa) || 1
    const pagosPayload: GastoPago[] = pagos.map((p) => {
      const montoRaw = parseFloat(p.monto) || 0
      const montoUsdCalc = p.moneda === 'BS' ? montoRaw / tasaN : montoRaw
      return {
        metodo_cobro_id: p.metodo_cobro_id,
        banco_empresa_id: p.banco_empresa_id || undefined,
        monto_usd: montoUsdCalc,
        referencia: p.referencia.trim() || undefined,
      }
    })

    const parsed = gastoSchema.safeParse({
      cuenta_id: cuentaId,
      proveedor_id: proveedorId || undefined,
      descripcion: descripcion.trim(),
      fecha,
      moneda_id: 'USD',
      tasa: parseFloat(tasa) || 0,
      monto_usd: parseFloat(montoUsd) || 0,
      pagos: pagosPayload,
      observaciones: observaciones.trim(),
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

    // Validar que el total de pagos cuadre con el monto total
    const totalPagosValidacion = parsed.data.pagos.reduce(
      (sum, p) => sum + p.monto_usd,
      0
    )
    if (Math.abs(totalPagosValidacion - parsed.data.monto_usd) > 0.01) {
      toast.error(
        `La suma de pagos (${totalPagosValidacion.toFixed(2)}) no coincide con el monto total (${parsed.data.monto_usd.toFixed(2)})`
      )
      return
    }

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    setSubmitting(true)
    try {
      const { nroGasto } = await crearGasto({
        cuenta_id: parsed.data.cuenta_id,
        proveedor_id: parsed.data.proveedor_id,
        descripcion: parsed.data.descripcion,
        fecha: parsed.data.fecha,
        moneda_id: 'USD',
        tasa: parsed.data.tasa,
        monto_usd: parsed.data.monto_usd,
        pagos: parsed.data.pagos,
        observaciones: parsed.data.observaciones || undefined,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })
      toast.success(`Gasto ${nroGasto} registrado exitosamente`)
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

  // ─── Render ───────────────────────────────────────────────

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Nuevo Gasto</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cuenta contable */}
          <div>
            <label htmlFor="gasto-cuenta" className="block text-sm font-medium text-gray-700 mb-1">
              Cuenta Contable
            </label>
            <select
              id="gasto-cuenta"
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              disabled={loadingCuentas}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cuenta_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">
                {loadingCuentas ? 'Cargando cuentas...' : 'Seleccionar cuenta'}
              </option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} - {c.nombre}
                </option>
              ))}
            </select>
            {errors.cuenta_id && (
              <p className="text-red-500 text-xs mt-1">{errors.cuenta_id}</p>
            )}
          </div>

          {/* Proveedor */}
          <div>
            <label htmlFor="gasto-proveedor" className="block text-sm font-medium text-gray-700 mb-1">
              Proveedor <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select
              id="gasto-proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              disabled={loadingProveedores}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">
                {loadingProveedores ? 'Cargando...' : 'Sin proveedor'}
              </option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rif} - {p.razon_social}
                </option>
              ))}
            </select>
          </div>

          {/* Descripcion */}
          <div>
            <label htmlFor="gasto-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Descripcion
            </label>
            <textarea
              id="gasto-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripcion del gasto..."
              rows={2}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                errors.descripcion ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.descripcion && (
              <p className="text-red-500 text-xs mt-1">{errors.descripcion}</p>
            )}
          </div>

          {/* Fecha */}
          <div>
            <label htmlFor="gasto-fecha" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha
            </label>
            <input
              id="gasto-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.fecha ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.fecha && (
              <p className="text-red-500 text-xs mt-1">{errors.fecha}</p>
            )}
            {fechaEsFutura && !errors.fecha && (
              <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                ⚠ La fecha es posterior a hoy. Verifique que sea correcta.
              </div>
            )}
            {fechaWarning && (
              <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Advertencia: la fecha no corresponde al mes en curso
              </div>
            )}
          </div>

          {/* Tasa y Monto USD */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="gasto-tasa" className="block text-sm font-medium text-gray-700 mb-1">
                Tasa (Bs/USD)
              </label>
              <input
                id="gasto-tasa"
                type="number"
                step="0.0001"
                min="0.0001"
                value={tasa}
                onChange={(e) => setTasa(e.target.value)}
                placeholder="0.0000"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.tasa ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.tasa && (
                <p className="text-red-500 text-xs mt-1">{errors.tasa}</p>
              )}
            </div>
            <div>
              <label htmlFor="gasto-monto" className="block text-sm font-medium text-gray-700 mb-1">
                Monto (USD)
              </label>
              <input
                id="gasto-monto"
                type="number"
                step="0.01"
                min="0.01"
                value={montoUsd}
                onChange={(e) => setMontoUsd(e.target.value)}
                placeholder="0.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.monto_usd ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.monto_usd && (
                <p className="text-red-500 text-xs mt-1">{errors.monto_usd}</p>
              )}
            </div>
          </div>

          {/* Preview de conversion a Bs */}
          {montoBsPreview && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              Equivalente en Bs: {montoBsPreview}
            </p>
          )}

          {/* Seccion de pagos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Pagos
              </label>
              <button
                type="button"
                onClick={agregarPago}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar pago
              </button>
            </div>

            {errors.pagos && (
              <p className="text-red-500 text-xs mb-2">{errors.pagos}</p>
            )}

            <div className="space-y-3">
              {pagos.map((pago, index) => {
                const metodoSeleccionado = metodos.find(
                  (m) => m.id === pago.metodo_cobro_id
                )
                const requiereReferencia =
                  metodoSeleccionado?.requiere_referencia === 1

                return (
                  <div
                    key={pago.id}
                    className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">
                        Pago {index + 1}
                      </span>
                      {pagos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarPago(pago.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          aria-label="Eliminar pago"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Metodo de pago */}
                    <select
                      value={pago.metodo_cobro_id}
                      onChange={(e) =>
                        actualizarPago(pago.id, 'metodo_cobro_id', e.target.value)
                      }
                      disabled={loadingMetodos}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">
                        {loadingMetodos ? 'Cargando...' : 'Seleccionar metodo'}
                      </option>
                      {metodos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre} ({m.moneda})
                        </option>
                      ))}
                    </select>

                    {/* Monto */}
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={pago.monto}
                      onChange={(e) =>
                        actualizarPago(pago.id, 'monto', e.target.value)
                      }
                      placeholder={`Monto ${pago.moneda}`}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />

                    {/* Referencia (solo si el metodo lo requiere) */}
                    {requiereReferencia && (
                      <input
                        type="text"
                        value={pago.referencia}
                        onChange={(e) =>
                          actualizarPago(
                            pago.id,
                            'referencia',
                            e.target.value.toUpperCase()
                          )
                        }
                        placeholder="Nro de referencia"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Totalizador de pagos */}
            {montoTotalFloat > 0 && (
              <div
                className={`mt-2 rounded-md px-3 py-2 text-xs flex justify-between ${
                  pagosDesbalanceados
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-green-50 border border-green-200 text-green-700'
                }`}
              >
                <span>Total pagos: ${totalPagosUsd.toFixed(2)} USD</span>
                <span>Total gasto: ${montoTotalFloat.toFixed(2)} USD</span>
                {pagosDesbalanceados && (
                  <span className="font-medium">
                    Diferencia: ${Math.abs(totalPagosUsd - montoTotalFloat).toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label htmlFor="gasto-obs" className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              id="gasto-obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
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
              {submitting ? 'Registrando...' : 'Registrar Gasto'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
