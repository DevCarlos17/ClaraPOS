import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { gastoSchema } from '@/features/contabilidad/schemas/gasto-schema'
import { crearGasto } from '@/features/contabilidad/hooks/use-gastos'
import { useCuentasDetalle } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { usePaymentMethods } from '@/features/configuracion/hooks/use-payment-methods'
import { useBancos } from '@/features/configuracion/hooks/use-bancos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Props ────────────────────────────────────────────────────

interface GastoFormProps {
  isOpen: boolean
  onClose: () => void
}

// ─── Componente ───────────────────────────────────────────────

export function GastoForm({ isOpen, onClose }: GastoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()

  // Dependencias externas
  const { cuentas, isLoading: loadingCuentas } = useCuentasDetalle()
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const { methods, isLoading: loadingMetodos } = usePaymentMethods()
  const { bancos, isLoading: loadingBancos } = useBancos()
  const { tasa: tasaActual } = useTasaActual()

  // ─── Estado de campos ──────────────────────────────────────

  const [cuentaId, setCuentaId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [tasa, setTasa] = useState('')
  const [montoUsd, setMontoUsd] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [bancoEmpresa, setBancoEmpresa] = useState('')
  const [referencia, setReferencia] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // ─── Abrir / cerrar dialogo ───────────────────────────────

  useEffect(() => {
    if (isOpen) {
      // Valores iniciales
      setCuentaId('')
      setProveedorId('')
      setDescripcion('')
      // Fecha de hoy por defecto
      setFecha(new Date().toISOString().slice(0, 10))
      // Tasa actual por defecto
      setTasa(tasaActual ? parseFloat(tasaActual.valor).toFixed(4) : '1.0000')
      setMontoUsd('')
      setMetodoCobro('')
      setBancoEmpresa('')
      setReferencia('')
      setObservaciones('')
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, tasaActual])

  // ─── Calculo de monto en Bs (solo visual) ─────────────────

  const montoBsPreview = (() => {
    const mUsd = parseFloat(montoUsd)
    const t = parseFloat(tasa)
    if (!isNaN(mUsd) && !isNaN(t) && mUsd > 0 && t > 0) {
      return (mUsd * t).toFixed(2)
    }
    return null
  })()

  // ─── Submit ───────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = gastoSchema.safeParse({
      cuenta_id: cuentaId,
      proveedor_id: proveedorId || undefined,
      descripcion: descripcion.trim(),
      fecha,
      moneda_id: 'USD',
      tasa: parseFloat(tasa) || 0,
      monto_usd: parseFloat(montoUsd) || 0,
      metodo_cobro_id: metodoCobro || undefined,
      banco_empresa_id: bancoEmpresa || undefined,
      referencia: referencia.trim(),
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
        metodo_cobro_id: parsed.data.metodo_cobro_id,
        banco_empresa_id: parsed.data.banco_empresa_id,
        referencia: parsed.data.referencia || undefined,
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

          {/* Metodo de cobro */}
          <div>
            <label htmlFor="gasto-metodo" className="block text-sm font-medium text-gray-700 mb-1">
              Metodo de Pago <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select
              id="gasto-metodo"
              value={metodoCobro}
              onChange={(e) => setMetodoCobro(e.target.value)}
              disabled={loadingMetodos}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">
                {loadingMetodos ? 'Cargando...' : 'Sin especificar'}
              </option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Banco empresa */}
          <div>
            <label htmlFor="gasto-banco" className="block text-sm font-medium text-gray-700 mb-1">
              Banco <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select
              id="gasto-banco"
              value={bancoEmpresa}
              onChange={(e) => setBancoEmpresa(e.target.value)}
              disabled={loadingBancos}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">
                {loadingBancos ? 'Cargando...' : 'Sin especificar'}
              </option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.banco}
                </option>
              ))}
            </select>
          </div>

          {/* Referencia */}
          <div>
            <label htmlFor="gasto-ref" className="block text-sm font-medium text-gray-700 mb-1">
              Referencia <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="gasto-ref"
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value.toUpperCase())}
              placeholder="Nro de transferencia, cheque, etc."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
