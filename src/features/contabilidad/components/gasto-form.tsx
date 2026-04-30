import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, UserPlus, ArrowLeft, AlertTriangle, Info, FileText } from 'lucide-react'
import { gastoSchema } from '@/features/contabilidad/schemas/gasto-schema'
import { crearGasto, type GastoPago } from '@/features/contabilidad/hooks/use-gastos'
import { useCuentasDetallePorTipo } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { ProveedorForm } from '@/features/proveedores/components/proveedor-form'
import { formatUsd, formatBs } from '@/lib/currency'
import { todayStr } from '@/lib/dates'
import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { useGastoBorradorStore } from '@/features/contabilidad/stores/gasto-borrador-store'

// ─── Tipos locales ──────────────────────────────────────────

type MonedaFactura = 'USD' | 'BS'

interface PagoRow {
  id: string
  metodo_cobro_id: string
  banco_empresa_id: string
  moneda: 'USD' | 'BS'
  monto: string
  referencia: string
}

interface GastoFormProps {
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

/** Busca la tasa interna por fecha exacta en tasas_cambio */
async function buscarTasaPorFecha(
  fecha: string,
  empresaId: string
): Promise<number | null> {
  if (!fecha || !empresaId) return null
  try {
    const rows = await db.getAll<{ valor: string }>(
      `SELECT valor FROM tasas_cambio
       WHERE empresa_id = ?
         AND DATE(fecha) = DATE(?)
       ORDER BY created_at DESC LIMIT 1`,
      [empresaId, fecha]
    )
    if (rows.length === 0) return null
    return parseFloat(rows[0].valor)
  } catch {
    return null
  }
}

// ─── Resumen de confirmacion ──────────────────────────────────

interface ResumenConfirmProps {
  cuentaNombre: string
  proveedorNombre: string | null
  nroFactura: string
  nroControl: string
  descripcion: string
  fecha: string
  monedaFactura: MonedaFactura
  usaTasaParalela: boolean
  tasaInterna: number
  tasaProveedor: number | null
  montoFactura: number
  montoContableUsd: number
  montoProveedorUsd: number
  pagos: Array<{ metodoNombre: string; monto: string; moneda: string; referencia: string }>
  saldoPendienteProveedor: number
  saldoPendienteInterno: number
  submitting: boolean
  onConfirm: () => void
  onVolver: () => void
}

function ResumenConfirm({
  cuentaNombre,
  proveedorNombre,
  nroFactura,
  nroControl,
  descripcion,
  fecha,
  monedaFactura,
  usaTasaParalela,
  tasaInterna,
  tasaProveedor,
  montoFactura,
  montoContableUsd,
  montoProveedorUsd,
  pagos,
  saldoPendienteProveedor,
  saldoPendienteInterno,
  submitting,
  onConfirm,
  onVolver,
}: ResumenConfirmProps) {
  const hayDualRate = usaTasaParalela && tasaProveedor && tasaProveedor > 0
  const hayDiferencial = hayDualRate && Math.abs(montoProveedorUsd - montoContableUsd) > 0.01

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Resumen del Gasto</h3>
        <p className="text-xs text-muted-foreground">Verifique los datos antes de confirmar</p>
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
        {nroControl && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nro Control:</span>
            <span className="font-mono">{nroControl}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Descripcion:</span>
          <span className="text-right max-w-[220px]">{descripcion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Factura en:</span>
          <span className="font-medium">{monedaFactura} {usaTasaParalela ? '· Tasa Paralela' : ''}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tasa Interna:</span>
          <span className="font-mono">{tasaInterna.toFixed(4)} Bs/USD</span>
        </div>
        {tasaProveedor && usaTasaParalela && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tasa Proveedor:</span>
            <span className="font-mono">{tasaProveedor.toFixed(4)} Bs/USD</span>
          </div>
        )}
        <div className="border-t border-border pt-2 mt-1">
          {monedaFactura === 'USD' && usaTasaParalela && tasaProveedor && tasaProveedor > 0 ? (
            <>
              <div className="flex justify-between font-medium">
                <span>Total USD:</span>
                <span>{formatUsd(montoFactura)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs mt-0.5">
                <span>Equivalente Bs (tasa proveedor):</span>
                <span>{formatBs(montoFactura * tasaProveedor)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground/70 text-xs mt-0.5">
                <span>Total Contable USD:</span>
                <span>{formatUsd(montoContableUsd)}</span>
              </div>
            </>
          ) : monedaFactura === 'BS' && usaTasaParalela && tasaProveedor && tasaProveedor > 0 ? (
            <>
              <div className="flex justify-between font-medium">
                <span>Total Bs:</span>
                <span>{formatBs(montoFactura)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs mt-0.5">
                <span>Total USD (tasa proveedor):</span>
                <span>{formatUsd(montoProveedorUsd)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground/70 text-xs mt-0.5">
                <span>Total USD (tasa interna):</span>
                <span>{formatUsd(montoContableUsd)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between font-medium">
                <span>Total Factura:</span>
                <span>{montoFactura.toFixed(2)} {monedaFactura}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs mt-0.5">
                <span>Total Contable USD:</span>
                <span>{formatUsd(montoContableUsd)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs mt-0.5">
                <span>Equivalente Bs (interno):</span>
                <span>{formatBs(montoContableUsd * tasaInterna)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Abonos */}
      {pagos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Abonos registrados</p>
          <div className="space-y-1.5">
            {pagos.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{p.metodoNombre || '—'}</span>
                <div className="flex items-center gap-3">
                  {p.referencia && (
                    <span className="font-mono text-xs text-muted-foreground">{p.referencia}</span>
                  )}
                  <span className="font-medium tabular-nums">{p.monto} {p.moneda}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saldo pendiente — dual-rate si aplica */}
      {hayDualRate ? (
        <div className="space-y-1.5">
          {saldoPendienteProveedor > 0.005 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Saldo Proveedor pendiente: {formatUsd(saldoPendienteProveedor)} — CXP
            </div>
          )}
          {hayDiferencial && saldoPendienteProveedor < 0.005 && saldoPendienteInterno > 0.005 && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400">
              {montoContableUsd > montoProveedorUsd
                ? `Diferencial cambiario: +${formatUsd(montoContableUsd - montoProveedorUsd)} (ganancia contable)`
                : `Diferencial cambiario: -${formatUsd(montoProveedorUsd - montoContableUsd)} (perdida contable)`
              }
            </div>
          )}
        </div>
      ) : (
        saldoPendienteProveedor > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Saldo pendiente: {formatUsd(saldoPendienteProveedor)} — quedará en Cuentas por Pagar
          </div>
        )
      )}

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

export function GastoForm({ onClose }: GastoFormProps) {
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { user } = useCurrentUser()
  const { borrador, guardar, limpiar } = useGastoBorradorStore()

  const { cuentas, isLoading: loadingCuentas } = useCuentasDetallePorTipo('GASTO')
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()
  const { tasa: tasaActual } = useTasaActual()

  // ─── Campos básicos ────────────────────────────────────────
  const [nroFactura, setNroFactura] = useState('')
  const [nroControl, setNroControl] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [observaciones, setObservaciones] = useState('')

  // ─── Campos bimonetarios ───────────────────────────────────
  const [monedaFactura, setMonedaFactura] = useState<MonedaFactura>('USD')
  const [usaTasaParalela, setUsaTasaParalela] = useState(false)
  const [tasaInterna, setTasaInterna] = useState('')
  const [tasaInternaManual, setTasaInternaManual] = useState(false)
  const [tasaProveedor, setTasaProveedor] = useState('')
  const [montoFactura, setMontoFactura] = useState('')

  // ─── Pagos/Abonos ──────────────────────────────────────────
  const [pagos, setPagos] = useState<PagoRow[]>([])

  // ─── UI State ─────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [crearProveedorOpen, setCrearProveedorOpen] = useState(false)
  const [showResumen, setShowResumen] = useState(false)
  const [payloadConfirmado, setPayloadConfirmado] = useState<ReturnType<typeof gastoSchema.parse> | null>(null)
  const [mostrarBannerBorrador, setMostrarBannerBorrador] = useState(false)

  // ─── Helper: reset form ────────────────────────────────────

  function resetFormToDefaults(tasaValor?: string) {
    const hoy = todayStr()
    setNroFactura('')
    setNroControl('')
    setCuentaId('')
    setProveedorId('')
    setDescripcion('')
    setFecha(hoy)
    setMonedaFactura('USD')
    setUsaTasaParalela(false)
    setTasaInterna(tasaValor ?? (tasaActual ? parseFloat(tasaActual.valor).toFixed(4) : ''))
    setTasaInternaManual(false)
    setTasaProveedor('')
    setMontoFactura('')
    setPagos([])
    setObservaciones('')
    setErrors({})
    setShowResumen(false)
    setPayloadConfirmado(null)
  }

  // ─── Inicializar al montar ────────────────────────────────

  useEffect(() => {
    const hayBorrador = borrador && borrador.empresaId === user?.empresa_id
    if (hayBorrador) {
      setMostrarBannerBorrador(true)
      resetFormToDefaults()
    } else {
      resetFormToDefaults()
      setMostrarBannerBorrador(false)
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Auto-lookup tasa interna por fecha ───────────────────

  useEffect(() => {
    if (!fecha || !user?.empresa_id) return
    buscarTasaPorFecha(fecha, user.empresa_id).then((val) => {
      if (val !== null) {
        setTasaInterna(val.toFixed(4))
        setTasaInternaManual(false)
      } else {
        setTasaInternaManual(true)
      }
    })
  }, [fecha, user?.empresa_id])

  // ─── Advertencias de fecha ────────────────────────────────

  const hoy = todayStr()
  const fechaEsFutura = Boolean(fecha && fecha > hoy)
  const fechaWarning = (() => {
    if (!fecha || fechaEsFutura) return false
    const [anio, mes] = fecha.split('-').map(Number)
    const now = new Date()
    return anio !== now.getFullYear() || mes !== (now.getMonth() + 1)
  })()

  // ─── Cálculo del monto contable USD ───────────────────────

  const tasaInternaNum = parseFloat(tasaInterna) || 0
  const tasaProveedorNum = parseFloat(tasaProveedor) || 0
  const montoFacturaNum = parseFloat(montoFactura) || 0

  const montoContableUsd = (() => {
    if (montoFacturaNum <= 0 || tasaInternaNum <= 0) return null
    if (monedaFactura === 'BS') {
      return montoFacturaNum / tasaInternaNum
    }
    if (usaTasaParalela && tasaProveedorNum > 0) {
      return (montoFacturaNum * tasaProveedorNum) / tasaInternaNum
    }
    return montoFacturaNum
  })()

  // ─── Monto desde perspectiva proveedor ────────────────────

  const montoProveedorUsd = (() => {
    if (montoFacturaNum <= 0) return null
    if (monedaFactura === 'USD') return montoFacturaNum
    // BS: dividir por tasa proveedor si aplica, sino por interna
    const tasaRef = usaTasaParalela && tasaProveedorNum > 0 ? tasaProveedorNum : tasaInternaNum
    return tasaRef > 0 ? montoFacturaNum / tasaRef : null
  })()

  // ─── Auto-fill monto del primer pago ──────────────────────

  useEffect(() => {
    if (pagos.length === 1 && montoContableUsd !== null) {
      setPagos((prev) =>
        prev.map((p, i) => {
          if (i !== 0) return p
          const monto =
            p.moneda === 'BS'
              ? (montoContableUsd * tasaInternaNum).toFixed(2)
              : montoContableUsd.toFixed(2)
          return { ...p, monto }
        })
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoContableUsd, tasaInterna])

  // ─── Funciones de conversión de abonos ────────────────────

  /** Perspectiva proveedor: BS/tasa_proveedor, USD as-is (para saldo_pendiente) */
  function abonoPagoProveedorUsd(pago: PagoRow): number {
    const val = parseFloat(pago.monto) || 0
    if (pago.moneda === 'USD') return val
    const tasaRef = usaTasaParalela && tasaProveedorNum > 0 ? tasaProveedorNum : tasaInternaNum
    return tasaRef > 0 ? val / tasaRef : 0
  }

  /** Perspectiva contable: BS/tasa_interna, USD as-is (para asientos) */
  function abonoPagoInternoUsd(pago: PagoRow): number {
    const val = parseFloat(pago.monto) || 0
    if (pago.moneda === 'USD') return val
    return tasaInternaNum > 0 ? val / tasaInternaNum : 0
  }

  const totalAbonadoProveedorUsd = pagos.reduce((s, p) => s + abonoPagoProveedorUsd(p), 0)
  const totalAbonadoInternoUsd = pagos.reduce((s, p) => s + abonoPagoInternoUsd(p), 0)

  const saldoPendienteProveedor = montoProveedorUsd !== null
    ? Math.max(0, montoProveedorUsd - totalAbonadoProveedorUsd)
    : 0
  const saldoPendienteInterno = montoContableUsd !== null
    ? Math.max(0, montoContableUsd - totalAbonadoInternoUsd)
    : 0

  const pagosSuperanTotal =
    montoProveedorUsd !== null &&
    montoProveedorUsd > 0 &&
    totalAbonadoProveedorUsd > montoProveedorUsd + 0.01

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

  // ─── Auto-guardado de borrador ────────────────────────────

  useEffect(() => {
    if (!user?.empresa_id || mostrarBannerBorrador) return
    const hasData = Boolean(cuentaId || descripcion.trim() || montoFactura)
    if (!hasData) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      guardar({
        nroFactura, nroControl, cuentaId, proveedorId, descripcion,
        fecha, monedaFactura, usaTasaParalela, tasaInterna, tasaInternaManual,
        tasaProveedor, montoFactura,
        pagos: pagos.map((p) => ({ ...p })),
        observaciones,
        empresaId: user.empresa_id!,
        ultimaActualizacion: new Date().toISOString(),
      })
    }, 1000)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nroFactura, nroControl, cuentaId, proveedorId, descripcion, fecha,
      monedaFactura, usaTasaParalela, tasaInterna, tasaProveedor, montoFactura,
      pagos, observaciones, mostrarBannerBorrador])

  // ─── Restaurar / descartar borrador ───────────────────────

  function restaurarBorrador() {
    if (!borrador) return
    setNroFactura(borrador.nroFactura)
    setNroControl(borrador.nroControl)
    setCuentaId(borrador.cuentaId)
    setProveedorId(borrador.proveedorId)
    setDescripcion(borrador.descripcion)
    setFecha(borrador.fecha)
    setMonedaFactura(borrador.monedaFactura)
    setUsaTasaParalela(borrador.usaTasaParalela)
    setTasaInterna(borrador.tasaInterna)
    setTasaInternaManual(borrador.tasaInternaManual)
    setTasaProveedor(borrador.tasaProveedor)
    setMontoFactura(borrador.montoFactura)
    setPagos(borrador.pagos.map((p) => ({ ...p })))
    setObservaciones(borrador.observaciones)
    setMostrarBannerBorrador(false)
  }

  function descartarBorrador() {
    limpiar()
    setMostrarBannerBorrador(false)
  }

  // ─── Validar y mostrar resumen ────────────────────────────

  function handleMostrarResumen(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!montoContableUsd || montoContableUsd <= 0) {
      setErrors((prev) => ({ ...prev, monto_factura: 'El monto y las tasas deben ser positivos' }))
      return
    }

    if (pagosSuperanTotal) {
      toast.error('Los abonos superan el total de la factura')
      return
    }

    // Construir GastoPago con todos los campos dual-rate
    const pagosPayload: GastoPago[] = pagos.map((p) => {
      const montoMoneda = parseFloat(p.monto) || 0
      const tasaPago = p.moneda === 'BS'
        ? (usaTasaParalela && tasaProveedorNum > 0 ? tasaProveedorNum : tasaInternaNum)
        : tasaInternaNum
      return {
        metodo_cobro_id: p.metodo_cobro_id,
        banco_empresa_id: p.banco_empresa_id || undefined,
        moneda: p.moneda,
        monto_moneda: montoMoneda,
        tasa_pago: tasaPago,
        monto_usd: abonoPagoProveedorUsd(p),
        monto_usd_interno: abonoPagoInternoUsd(p),
        referencia: p.referencia.trim() || undefined,
      }
    })

    const pagosConMetodo = pagosPayload.filter((p) => p.metodo_cobro_id)
    if (pagos.length > 0 && pagosConMetodo.length !== pagos.length) {
      setErrors((prev) => ({ ...prev, pagos: 'Todos los abonos deben tener un método de pago' }))
      return
    }

    const parsed = gastoSchema.safeParse({
      cuenta_id: cuentaId,
      proveedor_id: proveedorId || undefined,
      nro_control: nroControl.trim() || undefined,
      descripcion: descripcion.trim(),
      fecha,
      moneda_id: 'USD',
      moneda_factura: monedaFactura,
      usa_tasa_paralela: usaTasaParalela,
      tasa: parseFloat(tasaInterna) || 0,
      tasa_proveedor: usaTasaParalela ? (parseFloat(tasaProveedor) || undefined) : undefined,
      monto_factura: montoFacturaNum,
      monto_usd: montoContableUsd,
      pagos: pagosConMetodo,
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
        nro_control: payloadConfirmado.nro_control,
        descripcion: payloadConfirmado.descripcion,
        fecha: payloadConfirmado.fecha,
        moneda_id: 'USD',
        moneda_factura: payloadConfirmado.moneda_factura,
        usa_tasa_paralela: payloadConfirmado.usa_tasa_paralela,
        tasa: payloadConfirmado.tasa,
        tasa_proveedor: payloadConfirmado.tasa_proveedor,
        monto_factura: payloadConfirmado.monto_factura,
        monto_usd: payloadConfirmado.monto_usd,
        pagos: payloadConfirmado.pagos as GastoPago[],
        observaciones: payloadConfirmado.observaciones || undefined,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })
      limpiar()
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

  // ─── Datos para el resumen ────────────────────────────────

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId)
  const proveedorSeleccionado = proveedores.find((p) => p.id === proveedorId)

  const pagosResumen = pagos.map((p) => ({
    metodoNombre: metodos.find((m) => m.id === p.metodo_cobro_id)?.nombre ?? '',
    monto: p.monto,
    moneda: p.moneda,
    referencia: p.referencia,
  }))

  // ─── Totalizador dual-rate ────────────────────────────────

  const hayTasaParalelaActiva = usaTasaParalela && tasaProveedorNum > 0
  const hayDiferencial = hayTasaParalelaActiva &&
    montoProveedorUsd !== null &&
    montoContableUsd !== null &&
    Math.abs(montoProveedorUsd - montoContableUsd) > 0.01

  // ─── Render ───────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {showResumen ? 'Confirmar Registro' : 'Nuevo Gasto'}
            </h2>
            <p className="text-sm text-muted-foreground">Registrar gasto o factura de proveedor</p>
          </div>
        </div>

        {showResumen ? (
            <ResumenConfirm
              cuentaNombre={cuentaSeleccionada ? `${cuentaSeleccionada.codigo} - ${cuentaSeleccionada.nombre}` : cuentaId}
              proveedorNombre={proveedorSeleccionado?.razon_social ?? null}
              nroFactura={nroFactura.trim()}
              nroControl={nroControl.trim()}
              descripcion={descripcion.trim()}
              fecha={fecha}
              monedaFactura={monedaFactura}
              usaTasaParalela={usaTasaParalela}
              tasaInterna={parseFloat(tasaInterna) || 0}
              tasaProveedor={usaTasaParalela ? (parseFloat(tasaProveedor) || null) : null}
              montoFactura={montoFacturaNum}
              montoContableUsd={montoContableUsd ?? 0}
              montoProveedorUsd={montoProveedorUsd ?? (montoContableUsd ?? 0)}
              pagos={pagosResumen}
              saldoPendienteProveedor={saldoPendienteProveedor}
              saldoPendienteInterno={saldoPendienteInterno}
              submitting={submitting}
              onConfirm={handleConfirmar}
              onVolver={() => setShowResumen(false)}
            />
          ) : (
            <>
              {/* Banner de borrador */}
              {mostrarBannerBorrador && borrador && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:bg-amber-950/30 dark:border-amber-700">
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-amber-600 mt-0.5 shrink-0 dark:text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Hay un gasto pendiente sin guardar
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        Guardado el {new Date(borrador.ultimaActualizacion).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={restaurarBorrador}
                        className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-200 rounded hover:bg-amber-300 transition-colors dark:text-amber-200 dark:bg-amber-800 dark:hover:bg-amber-700"
                      >
                        Restaurar
                      </button>
                      <button
                        type="button"
                        onClick={descartarBorrador}
                        className="px-2.5 py-1 text-xs font-medium text-muted-foreground bg-muted rounded hover:bg-muted/80 transition-colors"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleMostrarResumen} className="space-y-4">

                {/* ── SECCIÓN 1: Identificación ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Nro Factura <span className="font-normal opacity-60">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={nroFactura}
                      onChange={(e) => setNroFactura(e.target.value.toUpperCase())}
                      placeholder="00001234"
                      className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Nro Control <span className="font-normal opacity-60">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={nroControl}
                      onChange={(e) => setNroControl(e.target.value.toUpperCase())}
                      placeholder="00-0000001"
                      className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                    />
                  </div>
                </div>

                {/* Cuenta contable */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Cuenta Contable <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={cuentaId}
                    onChange={(e) => setCuentaId(e.target.value)}
                    disabled={loadingCuentas}
                    className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                      errors.cuenta_id ? 'border-destructive' : 'border-input'
                    }`}
                  >
                    <option value="">{loadingCuentas ? 'Cargando...' : 'Seleccionar cuenta'}</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                    ))}
                  </select>
                  {errors.cuenta_id && <p className="text-destructive text-xs mt-1">{errors.cuenta_id}</p>}
                </div>

                {/* Proveedor */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Proveedor <span className="font-normal opacity-60">(opcional)</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={proveedorId}
                      onChange={(e) => setProveedorId(e.target.value)}
                      disabled={loadingProveedores}
                      className="flex-1 rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">{loadingProveedores ? 'Cargando...' : 'Sin proveedor'}</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>{p.rif} - {p.razon_social}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setCrearProveedorOpen(true)}
                      title="Crear nuevo proveedor"
                      className="inline-flex items-center px-3 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-md hover:bg-muted/80 transition-colors"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Descripcion */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Descripcion <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Descripcion del gasto..."
                    rows={2}
                    className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none ${
                      errors.descripcion ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  {errors.descripcion && <p className="text-destructive text-xs mt-1">{errors.descripcion}</p>}
                </div>

                {/* Fecha */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Fecha <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                      errors.fecha ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  {errors.fecha && <p className="text-destructive text-xs mt-1">{errors.fecha}</p>}
                  {fechaEsFutura && !errors.fecha && (
                    <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
                      ⚠ La fecha es posterior a hoy. Verifique que sea correcta.
                    </div>
                  )}
                  {fechaWarning && !fechaEsFutura && (
                    <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
                      Advertencia: la fecha no corresponde al mes en curso
                    </div>
                  )}
                </div>

                {/* ── SECCIÓN 2: Tipo de factura y tasas ── */}
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Tipo de Factura
                  </p>

                  {/* Moneda de la factura */}
                  <div className="flex gap-3">
                    {(['USD', 'BS'] as MonedaFactura[]).map((m) => (
                      <label
                        key={m}
                        className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${
                          monedaFactura === m
                            ? 'border-primary bg-primary/5 text-primary font-medium'
                            : 'border-border text-foreground hover:bg-muted/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="moneda_factura"
                          value={m}
                          checked={monedaFactura === m}
                          onChange={() => {
                            setMonedaFactura(m)
                            setMontoFactura('')
                          }}
                          className="accent-primary"
                        />
                        Factura en {m === 'USD' ? 'Dólares (USD)' : 'Bolívares (Bs)'}
                      </label>
                    ))}
                  </div>

                  {/* Checkbox tasa paralela */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={usaTasaParalela}
                      onChange={(e) => {
                        setUsaTasaParalela(e.target.checked)
                        if (!e.target.checked) setTasaProveedor('')
                      }}
                      className="h-4 w-4 accent-primary rounded"
                    />
                    <span className="text-sm text-foreground">La factura usa tasa paralela (dólar paralelo)</span>
                  </label>

                  {/* Tasa del proveedor */}
                  {usaTasaParalela && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Tasa del Proveedor (Bs/USD) <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={tasaProveedor}
                        onChange={(e) => setTasaProveedor(e.target.value)}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        placeholder="0.0000"
                        className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner} ${
                          errors.tasa_proveedor ? 'border-destructive' : 'border-input'
                        }`}
                      />
                      {errors.tasa_proveedor && (
                        <p className="text-destructive text-xs mt-1">{errors.tasa_proveedor}</p>
                      )}
                    </div>
                  )}

                  {/* Tasa interna */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Tasa Interna (Bs/USD) <span className="text-destructive">*</span>
                      </label>
                      {tasaInternaManual && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          Sin tasa registrada para esta fecha
                        </span>
                      )}
                      {!tasaInternaManual && tasaInterna && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                          <Info className="h-3 w-3" />
                          Detectada automáticamente
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={tasaInterna}
                      onChange={(e) => { setTasaInterna(e.target.value); setTasaInternaManual(true) }}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      placeholder="0.0000"
                      className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner} ${
                        errors.tasa ? 'border-destructive' : 'border-input'
                      }`}
                    />
                    {errors.tasa && <p className="text-destructive text-xs mt-1">{errors.tasa}</p>}
                  </div>
                </div>

                {/* ── SECCIÓN 3: Monto ── */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Total de la Factura ({monedaFactura}) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={montoFactura}
                    onChange={(e) => setMontoFactura(e.target.value)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    placeholder={monedaFactura === 'USD' ? '0.00 USD' : '0.00 Bs'}
                    className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner} ${
                      errors.monto_factura ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  {errors.monto_factura && (
                    <p className="text-destructive text-xs mt-1">{errors.monto_factura}</p>
                  )}
                </div>

                {/* Total contable (calculado, solo visual) */}
                {montoContableUsd !== null && montoContableUsd > 0 && (
                  <div className="rounded-md bg-muted/60 border border-border px-4 py-2.5 space-y-1">
                    {monedaFactura === 'USD' && usaTasaParalela && tasaProveedorNum > 0 ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total USD:</span>
                          <span className="font-semibold tabular-nums">{formatUsd(montoFacturaNum)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground/70">
                          <span>Equivalente Bs (tasa proveedor):</span>
                          <span className="tabular-nums">{formatBs(montoFacturaNum * tasaProveedorNum)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground/60">
                          <span>Total Contable USD:</span>
                          <span className="tabular-nums">{formatUsd(montoContableUsd)}</span>
                        </div>
                      </>
                    ) : monedaFactura === 'BS' && usaTasaParalela && tasaProveedorNum > 0 ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Bs:</span>
                          <span className="font-semibold tabular-nums">{formatBs(montoFacturaNum)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground/70">
                          <span>Total USD (tasa proveedor):</span>
                          <span className="tabular-nums">{formatUsd(montoFacturaNum / tasaProveedorNum)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground/60">
                          <span>Total USD (tasa interna):</span>
                          <span className="tabular-nums">{formatUsd(montoContableUsd)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Contable USD:</span>
                          <span className="font-semibold text-muted-foreground tabular-nums">
                            {formatUsd(montoContableUsd)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground/70">
                          <span>Equivalente Bs (tasa interna):</span>
                          <span className="tabular-nums">{formatBs(montoContableUsd * tasaInternaNum)}</span>
                        </div>
                        {monedaFactura === 'BS' && tasaInternaNum > 0 && (
                          <p className="text-[10px] text-muted-foreground/60 pt-0.5">
                            Cálculo: {montoFacturaNum.toFixed(2)} Bs ÷ {tasaInternaNum.toFixed(4)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── SECCIÓN 4: Abonos ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-foreground">
                      Abonos
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (opcional — dejar vacío para registrar a crédito)
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={agregarPago}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar abono
                    </button>
                  </div>

                  {errors.pagos && (
                    <p className="text-destructive text-xs mb-2">{errors.pagos}</p>
                  )}

                  {pagos.length === 0 && (
                    <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        Sin abonos — el gasto quedará pendiente en Cuentas por Pagar
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {pagos.map((pago, index) => {
                      const metodoSeleccionado = metodos.find((m) => m.id === pago.metodo_cobro_id)
                      const requiereReferencia = metodoSeleccionado?.requiere_referencia === 1

                      return (
                        <div key={pago.id} className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              Abono {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => eliminarPago(pago.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              aria-label="Eliminar abono"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <select
                            value={pago.metodo_cobro_id}
                            onChange={(e) => actualizarPago(pago.id, 'metodo_cobro_id', e.target.value)}
                            disabled={loadingMetodos}
                            className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">{loadingMetodos ? 'Cargando...' : 'Seleccionar método'}</option>
                            {metodos.map((m) => (
                              <option key={m.id} value={m.id}>{m.nombre} ({m.moneda})</option>
                            ))}
                          </select>

                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={pago.monto}
                            onChange={(e) => actualizarPago(pago.id, 'monto', e.target.value)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            placeholder={`Monto ${pago.moneda}`}
                            className={`w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
                          />

                          {requiereReferencia && (
                            <input
                              type="text"
                              value={pago.referencia}
                              onChange={(e) => actualizarPago(pago.id, 'referencia', e.target.value.toUpperCase())}
                              placeholder="Nro de referencia"
                              className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Totalizador de abonos — dual-rate cuando aplica */}
                  {pagos.length > 0 && montoProveedorUsd !== null && montoProveedorUsd > 0 && (
                    <div className="mt-2 space-y-1">
                      {hayTasaParalelaActiva ? (
                        // Dual-rate: mostrar perspectiva proveedor y contable
                        <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs space-y-1.5">
                          {/* Fila proveedor */}
                          <div className={`flex justify-between items-center ${
                            pagosSuperanTotal ? 'text-destructive' : ''
                          }`}>
                            <span className="text-muted-foreground">Proveedor</span>
                            <div className="flex gap-4 tabular-nums">
                              <span>Total: {formatUsd(montoProveedorUsd)}</span>
                              <span>Abonado: {formatUsd(totalAbonadoProveedorUsd)}</span>
                              <span className={saldoPendienteProveedor < 0.01 ? 'text-green-600 font-medium' : 'text-amber-600'}>
                                {saldoPendienteProveedor < 0.01 ? 'Cancelado' : `Pend: ${formatUsd(saldoPendienteProveedor)}`}
                              </span>
                            </div>
                          </div>
                          {/* Fila contable */}
                          <div className="flex justify-between items-center text-muted-foreground/80">
                            <span>Contable</span>
                            <div className="flex gap-4 tabular-nums">
                              <span>Total: {formatUsd(montoContableUsd ?? 0)}</span>
                              <span>Abonado: {formatUsd(totalAbonadoInternoUsd)}</span>
                              <span className={saldoPendienteInterno < 0.01 ? 'text-green-600/70' : ''}>
                                {saldoPendienteInterno < 0.01 ? 'OK' : `Pend: ${formatUsd(saldoPendienteInterno)}`}
                              </span>
                            </div>
                          </div>
                          {/* Diferencial */}
                          {hayDiferencial && saldoPendienteProveedor < 0.01 && saldoPendienteInterno > 0.01 && (
                            <div className="pt-1 border-t border-border text-blue-600 dark:text-blue-400">
                              {(montoContableUsd ?? 0) > (montoProveedorUsd ?? 0)
                                ? `Diferencial cambiario: +${formatUsd((montoContableUsd ?? 0) - (montoProveedorUsd ?? 0))} (ganancia)`
                                : `Diferencial cambiario: -${formatUsd((montoProveedorUsd ?? 0) - (montoContableUsd ?? 0))} (perdida)`
                              }
                            </div>
                          )}
                        </div>
                      ) : (
                        // Single-rate: totalizador simple
                        <div
                          className={`rounded-md px-3 py-2 text-xs flex justify-between items-center ${
                            pagosSuperanTotal
                              ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                              : saldoPendienteProveedor < 0.01
                                ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400'
                                : 'bg-muted/50 border border-border text-muted-foreground'
                          }`}
                        >
                          <span>Abonado: {formatUsd(totalAbonadoProveedorUsd)}</span>
                          <span>Total: {formatUsd(montoProveedorUsd)}</span>
                          <span className={pagosSuperanTotal ? 'font-medium' : ''}>
                            {pagosSuperanTotal
                              ? `Excede ${formatUsd(totalAbonadoProveedorUsd - montoProveedorUsd)}`
                              : saldoPendienteProveedor < 0.01
                                ? 'Cancelado'
                                : `Pendiente: ${formatUsd(saldoPendienteProveedor)}`
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Observaciones */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Observaciones <span className="font-normal opacity-60">(opcional)</span>
                  </label>
                  <textarea
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
                    className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Revisar y Registrar
                  </button>
                </div>
              </form>
            </>
          )}
      </div>

      <ProveedorForm
        isOpen={crearProveedorOpen}
        onClose={() => setCrearProveedorOpen(false)}
      />
    </>
  )
}
