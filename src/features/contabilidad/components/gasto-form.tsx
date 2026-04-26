import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, UserPlus, X } from 'lucide-react'
import { gastoSchema } from '@/features/contabilidad/schemas/gasto-schema'
import { crearGasto, type GastoPago } from '@/features/contabilidad/hooks/use-gastos'
import { useCuentasDetallePorTipo } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { ProveedorForm } from '@/features/proveedores/components/proveedor-form'
import { formatUsd, formatBs } from '@/lib/currency'
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

const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

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

// ─── Resumen de confirmacion ──────────────────────────────────

interface ResumenConfirmProps {
  cuentaNombre: string
  proveedorNombre: string | null
  nroFactura: string
  descripcion: string
  fecha: string
  montoUsd: number
  montoBs: number
  tasa: number
  pagos: Array<{ metodoNombre: string; monto: string; moneda: string; referencia: string }>
  submitting: boolean
  onConfirm: () => void
  onVolver: () => void
}

function ResumenConfirm({
  cuentaNombre,
  proveedorNombre,
  nroFactura,
  descripcion,
  fecha,
  montoUsd,
  montoBs,
  tasa,
  pagos,
  submitting,
  onConfirm,
  onVolver,
}: ResumenConfirmProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Resumen del Gasto</h3>
        <p className="text-xs text-muted-foreground">Verifique los datos antes de confirmar el registro</p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cuenta:</span>
          <span className="font-medium text-right max-w-[220px] truncate">{cuentaNombre}</span>
        </div>
        {proveedorNombre && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Proveedor:</span>
            <span className="font-medium">{proveedorNombre}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fecha:</span>
          <span className="font-mono">{fecha}</span>
        </div>
        {nroFactura && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nro Factura:</span>
            <span className="font-mono">{nroFactura}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Descripcion:</span>
          <span className="text-right max-w-[220px]">{descripcion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tasa:</span>
          <span className="font-mono">{tasa.toFixed(4)} Bs/USD</span>
        </div>
        <div className="border-t border-border pt-2 mt-1">
          <div className="flex justify-between font-semibold">
            <span>Total USD:</span>
            <span>{formatUsd(montoUsd)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-xs mt-0.5">
            <span>Equivalente Bs:</span>
            <span>{formatBs(montoBs)}</span>
          </div>
        </div>
      </div>

      {/* Detalle de pagos */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pagos</p>
        <div className="space-y-1.5">
          {pagos.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{p.metodoNombre || '—'}</span>
              <div className="flex items-center gap-3">
                {p.referencia && (
                  <span className="font-mono text-xs text-muted-foreground">{p.referencia}</span>
                )}
                <span className="font-medium tabular-nums">
                  {p.monto} {p.moneda}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onVolver}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          Volver a editar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Registrando...' : 'Confirmar y Registrar'}
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function GastoForm({ isOpen, onClose }: GastoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()

  // Dependencias externas
  const { cuentas, isLoading: loadingCuentas } = useCuentasDetallePorTipo('GASTO')
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()
  const { tasa: tasaActual } = useTasaActual()

  // ─── Estado de campos ──────────────────────────────────────

  const [nroFactura, setNroFactura] = useState('')
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

  // ─── Estado de modales secundarios ─────────────────────────

  const [crearProveedorOpen, setCrearProveedorOpen] = useState(false)
  const [showResumen, setShowResumen] = useState(false)
  // Payload validado listo para enviar
  const [payloadConfirmado, setPayloadConfirmado] = useState<ReturnType<typeof gastoSchema.parse> | null>(null)

  // ─── Abrir / cerrar dialogo ───────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setNroFactura('')
      setCuentaId('')
      setProveedorId('')
      setDescripcion('')
      setFecha(new Date().toISOString().slice(0, 10))
      setTasa(tasaActual ? parseFloat(tasaActual.valor).toFixed(4) : '1.0000')
      setMontoUsd('')
      setPagos([nuevoPagoRow()])
      setObservaciones('')
      setErrors({})
      setShowResumen(false)
      setPayloadConfirmado(null)
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

  // ─── Validar y mostrar resumen ────────────────────────────

  function handleMostrarResumen(e: React.FormEvent) {
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

    const totalPagosValidacion = parsed.data.pagos.reduce((sum, p) => sum + p.monto_usd, 0)
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

    setPayloadConfirmado(parsed.data)
    setShowResumen(true)
  }

  // ─── Confirmar y enviar ────────────────────────────────────

  async function handleConfirmar() {
    if (!payloadConfirmado || !user) return

    setSubmitting(true)
    try {
      const { nroGasto } = await crearGasto({
        cuenta_id: payloadConfirmado.cuenta_id,
        proveedor_id: payloadConfirmado.proveedor_id,
        nro_factura: nroFactura.trim() || undefined,
        descripcion: payloadConfirmado.descripcion,
        fecha: payloadConfirmado.fecha,
        moneda_id: 'USD',
        tasa: payloadConfirmado.tasa,
        monto_usd: payloadConfirmado.monto_usd,
        pagos: payloadConfirmado.pagos,
        observaciones: payloadConfirmado.observaciones || undefined,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })
      toast.success(`Gasto ${nroGasto} registrado exitosamente`)
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
      setShowResumen(false)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  // ─── Datos para el resumen ────────────────────────────────

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId)
  const proveedorSeleccionado = proveedores.find((p) => p.id === proveedorId)
  const tasaNum2 = parseFloat(tasa) || 1
  const montoUsdNum = parseFloat(montoUsd) || 0

  const pagosResumen = pagos.map((p) => ({
    metodoNombre: metodos.find((m) => m.id === p.metodo_cobro_id)?.nombre ?? '',
    monto: p.monto,
    moneda: p.moneda,
    referencia: p.referencia,
  }))

  // ─── Render ───────────────────────────────────────────────

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
        className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
      >
        <div className="p-6 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              {showResumen ? 'Confirmar Registro' : 'Nuevo Gasto'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Vista de resumen o formulario */}
          {showResumen ? (
            <ResumenConfirm
              cuentaNombre={cuentaSeleccionada ? `${cuentaSeleccionada.codigo} - ${cuentaSeleccionada.nombre}` : cuentaId}
              proveedorNombre={proveedorSeleccionado?.razon_social ?? null}
              nroFactura={nroFactura.trim()}
              descripcion={descripcion.trim()}
              fecha={fecha}
              montoUsd={montoUsdNum}
              montoBs={montoUsdNum * tasaNum2}
              tasa={tasaNum2}
              pagos={pagosResumen}
              submitting={submitting}
              onConfirm={handleConfirmar}
              onVolver={() => setShowResumen(false)}
            />
          ) : (
            <form onSubmit={handleMostrarResumen} className="space-y-4">
              {/* Nro Factura */}
              <div>
                <label htmlFor="gasto-nro-factura" className="block text-sm font-medium text-muted-foreground mb-1">
                  Nro Factura <span className="text-muted-foreground/60 font-normal">(opcional, se genera automatico)</span>
                </label>
                <input
                  id="gasto-nro-factura"
                  type="text"
                  value={nroFactura}
                  onChange={(e) => setNroFactura(e.target.value.toUpperCase())}
                  placeholder="Ej: 00001234"
                  className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              {/* Cuenta contable */}
              <div>
                <label htmlFor="gasto-cuenta" className="block text-sm font-medium text-muted-foreground mb-1">
                  Cuenta Contable
                </label>
                <select
                  id="gasto-cuenta"
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value)}
                  disabled={loadingCuentas}
                  className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                    errors.cuenta_id ? 'border-destructive' : 'border-input'
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
                  <p className="text-destructive text-xs mt-1">{errors.cuenta_id}</p>
                )}
              </div>

              {/* Proveedor + boton crear */}
              <div>
                <label htmlFor="gasto-proveedor" className="block text-sm font-medium text-muted-foreground mb-1">
                  Proveedor <span className="text-muted-foreground/60 font-normal">(opcional)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    id="gasto-proveedor"
                    value={proveedorId}
                    onChange={(e) => setProveedorId(e.target.value)}
                    disabled={loadingProveedores}
                    className="flex-1 rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
                  <button
                    type="button"
                    onClick={() => setCrearProveedorOpen(true)}
                    title="Crear nuevo proveedor"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-md hover:bg-muted/80 transition-colors whitespace-nowrap"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Descripcion */}
              <div>
                <label htmlFor="gasto-desc" className="block text-sm font-medium text-muted-foreground mb-1">
                  Descripcion
                </label>
                <textarea
                  id="gasto-desc"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Descripcion del gasto..."
                  rows={2}
                  className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none ${
                    errors.descripcion ? 'border-destructive' : 'border-input'
                  }`}
                />
                {errors.descripcion && (
                  <p className="text-destructive text-xs mt-1">{errors.descripcion}</p>
                )}
              </div>

              {/* Fecha */}
              <div>
                <label htmlFor="gasto-fecha" className="block text-sm font-medium text-muted-foreground mb-1">
                  Fecha
                </label>
                <input
                  id="gasto-fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                    errors.fecha ? 'border-destructive' : 'border-input'
                  }`}
                />
                {errors.fecha && (
                  <p className="text-destructive text-xs mt-1">{errors.fecha}</p>
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
                  <label htmlFor="gasto-tasa" className="block text-sm font-medium text-muted-foreground mb-1">
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
                    className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner} ${
                      errors.tasa ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  {errors.tasa && (
                    <p className="text-destructive text-xs mt-1">{errors.tasa}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="gasto-monto" className="block text-sm font-medium text-muted-foreground mb-1">
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
                    className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner} ${
                      errors.monto_usd ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  {errors.monto_usd && (
                    <p className="text-destructive text-xs mt-1">{errors.monto_usd}</p>
                  )}
                </div>
              </div>

              {/* Preview Bs */}
              {montoBsPreview && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                  Equivalente en Bs: <span className="font-mono font-medium">{montoBsPreview}</span>
                </p>
              )}

              {/* Seccion de pagos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Pagos
                  </label>
                  <button
                    type="button"
                    onClick={agregarPago}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar pago
                  </button>
                </div>

                {errors.pagos && (
                  <p className="text-destructive text-xs mb-2">{errors.pagos}</p>
                )}

                <div className="space-y-3">
                  {pagos.map((pago, index) => {
                    const metodoSeleccionado = metodos.find((m) => m.id === pago.metodo_cobro_id)
                    const requiereReferencia = metodoSeleccionado?.requiere_referencia === 1

                    return (
                      <div
                        key={pago.id}
                        className="rounded-md border border-border bg-muted/20 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Pago {index + 1}
                          </span>
                          {pagos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => eliminarPago(pago.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              aria-label="Eliminar pago"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        {/* Metodo de pago */}
                        <select
                          value={pago.metodo_cobro_id}
                          onChange={(e) => actualizarPago(pago.id, 'metodo_cobro_id', e.target.value)}
                          disabled={loadingMetodos}
                          className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
                          onChange={(e) => actualizarPago(pago.id, 'monto', e.target.value)}
                          placeholder={`Monto ${pago.moneda}`}
                          className={`w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
                        />

                        {/* Referencia */}
                        {requiereReferencia && (
                          <input
                            type="text"
                            value={pago.referencia}
                            onChange={(e) =>
                              actualizarPago(pago.id, 'referencia', e.target.value.toUpperCase())
                            }
                            placeholder="Nro de referencia"
                            className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Totalizador */}
                {montoTotalFloat > 0 && (
                  <div
                    className={`mt-2 rounded-md px-3 py-2 text-xs flex justify-between ${
                      pagosDesbalanceados
                        ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                        : 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400'
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
                <label htmlFor="gasto-obs" className="block text-sm font-medium text-muted-foreground mb-1">
                  Observaciones <span className="text-muted-foreground/60 font-normal">(opcional)</span>
                </label>
                <textarea
                  id="gasto-obs"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Notas adicionales..."
                  rows={2}
                  className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {/* Acciones */}
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Revisar y Registrar
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>

      {/* Modal para crear proveedor */}
      <ProveedorForm
        isOpen={crearProveedorOpen}
        onClose={() => setCrearProveedorOpen(false)}
      />
    </>
  )
}
