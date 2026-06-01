import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash, ShoppingCart, CreditCard } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  crearVenta,
  validarStockServidor,
  type VueltoParam,
  type DiscrepancyOptions,
} from '../hooks/use-ventas'
import type { CargoEspecial } from '../hooks/use-ventas'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'
import type { Cliente } from '@/features/clientes/hooks/use-clientes'
import type { VentaExitosaData } from './venta-exitosa-modal'
import type { PaymentMethod } from '@/features/configuracion/hooks/use-payment-methods'
import { useIgtfConfig } from '@/features/configuracion/hooks/use-igtf-config'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

// ── Tipos para resolución de discrepancias ────────────────────────────────────
type DiscrepancyMode =
  | 'VUELTO' | 'SAF' | 'PROPINA' | 'DIFERENCIAL_SOBRANTE'
  | 'CREDITO' | 'ABSORBER' | 'DIFERENCIAL_FALTANTE'
  | null

interface SplitEntry {
  metodoCobro_id: string
  metodoNombre: string
  montoBs: number
}

interface CobroModalProps {
  isOpen: boolean
  onClose: () => void
  /** Tasa live del parent; se congela internamente al abrir el modal */
  tasa: number
  /** Total bruto de la factura antes del descuento (en USD) */
  totalBrutoUsd: number
  /** Descuento comercial en Bs que se resta al total */
  descuentoBs: number
  descuentoMotivo: string
  clienteId: string
  clienteNombre: string
  clienteData: Cliente | null
  lineas: LineaVentaForm[]
  cargosEspeciales: CargoEspecial[]
  sesionCajaId: string | null
  usuarioId: string
  empresaId: string
  metodos: PaymentMethod[]
  onSuccess: (data: VentaExitosaData) => void
}

export function CobroModal({
  isOpen,
  onClose,
  tasa,
  totalBrutoUsd,
  descuentoBs,
  descuentoMotivo,
  clienteId,
  clienteNombre,
  clienteData,
  lineas,
  cargosEspeciales,
  sesionCajaId,
  usuarioId,
  empresaId,
  metodos,
  onSuccess,
}: CobroModalProps) {
  const tasaFrozen = useRef<number>(0)

  const [pagos, setPagos] = useState<PagoEntryForm[]>([])
  const [metodoId, setMetodoId] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  const [vueltoMetodoId, setVueltoMetodoId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Estado de resolución de discrepancias ─────────────────────────────────
  const [discrepancyMode, setDiscrepancyMode] = useState<DiscrepancyMode>(null)
  const [splitVuelto, setSplitVuelto] = useState<SplitEntry[]>([])
  const [supervisorAuthorized, setSupervisorAuthorized] = useState(false)
  const [supervisorId, setSupervisorId] = useState<string | null>(null)
  const [showAbsorberPinDialog, setShowAbsorberPinDialog] = useState(false)

  // Congelar tasa al abrir el modal; resetear formulario de cobro
  useEffect(() => {
    if (!isOpen) return
    tasaFrozen.current = tasa > 0 ? tasa : 1
    setPagos([])
    setMetodoId('')
    setMontoStr('')
    setReferencia('')
    setVueltoMetodoId('')
    setSubmitting(false)
    setDiscrepancyMode(null)
    setSplitVuelto([])
    setSupervisorAuthorized(false)
    setSupervisorId(null)
  // La tasa se congela solo al abrir (se excluye tasa de deps intencionalmente)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const tasaUsada = tasaFrozen.current || tasa || 1

  // ── Calculo de totales (con tasa congelada) ───────────────────────────────
  // Los cargos especiales con totalCargoBs se suman en su moneda nativa para
  // preservar el monto exacto aunque la tasa haya cambiado desde el modal de avance.
  const totalCargosEnUsd = cargosEspeciales.reduce((s, c) => s + c.montoCargoUsd, 0)
  const totalCargosNativosBs = cargosEspeciales.reduce((s, c) =>
    s + (c.totalCargoBs ?? c.montoCargoUsd * tasaUsada), 0)
  const totalProductosBs = (totalBrutoUsd - totalCargosEnUsd) * tasaUsada
  const totalEfectivoBs = Math.max(0, totalProductosBs + totalCargosNativosBs - descuentoBs)
  const totalEfectivoUsd = Number((totalEfectivoBs / tasaUsada).toFixed(2))

  // ── Umbral de diferencial cambiario ──────────────────────────────────────
  const umbralDiferencialUsd = useMemo(() => {
    const porcentaje = totalEfectivoUsd * 0.01
    return Math.min(0.50, porcentaje)
  }, [totalEfectivoUsd])

  const absorberMaxUsd = 2.00

  // ── Calculo IGTF (antes del balance para que el pendiente lo incluya) ────
  const { aplicaIgtf, tasaIgtf } = useIgtfConfig()
  const totalPagosUsdNativo = pagos
    .filter((p) => p.moneda !== 'BS')
    .reduce((sum, p) => sum + p.monto, 0)
  // Base: solo la porcion de la factura pagada en USD.
  // Se capea en totalEfectivoUsd para evitar recursividad: el propio IGTF
  // no genera un nuevo IGTF si el cliente lo paga en divisas.
  const igtfBase = Math.min(totalPagosUsdNativo, totalEfectivoUsd)
  const igtfUsd =
    aplicaIgtf && igtfBase > 0
      ? Number((igtfBase * tasaIgtf / 100).toFixed(2))
      : 0
  const igtfBs = Number((igtfUsd * tasaUsada).toFixed(2))

  // Ancla en Bs (sin doble conversion USD→Bs→USD)
  const totalPagadoBs = pagos.reduce((sum, p) => {
    return sum + (p.moneda === 'BS' ? p.monto : p.monto * tasaUsada)
  }, 0)
  // El pendiente incluye el IGTF: el cliente debe cubrir factura + IGTF generado
  const pendienteBs4 = totalEfectivoBs + igtfBs - totalPagadoBs
  const umbralBs = tasaUsada * 0.01
  const esPagado = pendienteBs4 <= umbralBs
  const esDiferencialRedondeo = pendienteBs4 > 0.001 && pendienteBs4 <= umbralBs
  const tipoDetectado: 'CONTADO' | 'CREDITO' = esPagado ? 'CONTADO' : 'CREDITO'
  const pendienteUsd = Number((Math.max(0, pendienteBs4) / tasaUsada).toFixed(2))

  // ── Vuelto (cliente pago de mas) ──────────────────────────────────────────
  const estaOverpago = pendienteBs4 < -0.01
  const vueltoMontoBs = estaOverpago ? Math.abs(pendienteBs4) : 0
  // ── Discrepancia en USD (negativo = overpago, positivo = faltante) ────────
  const montoDiscrepanciaUsd = useMemo(() => {
    if (!tasaUsada || tasaUsada <= 0) return 0
    return pendienteBs4 / tasaUsada
  }, [pendienteBs4, tasaUsada])

  // Auto-seleccionar primer metodo efectivo cuando hay vuelto (legado)
  useEffect(() => {
    if (estaOverpago && !vueltoMetodoId) {
      const efectivos = metodos.filter((m) => m.tipo === 'EFECTIVO')
      if (efectivos.length > 0) setVueltoMetodoId(efectivos[0].id)
    } else if (!estaOverpago && vueltoMetodoId) {
      setVueltoMetodoId('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estaOverpago])

  // ── Auto-selección de modo de discrepancia ────────────────────────────────
  useEffect(() => {
    const absUsd = Math.abs(montoDiscrepanciaUsd)
    if (Math.abs(pendienteBs4) <= 0.01) {
      setDiscrepancyMode(null)
      return
    }
    if (pendienteBs4 < -0.01) {
      // Overpago
      if (absUsd <= umbralDiferencialUsd) {
        setDiscrepancyMode('DIFERENCIAL_SOBRANTE')
      } else if (
        discrepancyMode === null ||
        discrepancyMode === 'DIFERENCIAL_FALTANTE' ||
        discrepancyMode === 'CREDITO' ||
        discrepancyMode === 'ABSORBER'
      ) {
        setDiscrepancyMode('VUELTO')
      }
    } else if (pendienteBs4 > 0.01) {
      // Faltante
      if (absUsd <= umbralDiferencialUsd) {
        setDiscrepancyMode('DIFERENCIAL_FALTANTE')
      } else if (
        discrepancyMode === null ||
        discrepancyMode === 'VUELTO' ||
        discrepancyMode === 'SAF' ||
        discrepancyMode === 'PROPINA' ||
        discrepancyMode === 'DIFERENCIAL_SOBRANTE'
      ) {
        setDiscrepancyMode('CREDITO')
      }
    } else {
      setDiscrepancyMode(null)
    }
  // discrepancyMode intencionalmente excluido: evita sobrescribir elección del usuario
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendienteBs4, umbralDiferencialUsd, montoDiscrepanciaUsd])

  const metodosEfectivo = metodos.filter((m) => m.tipo === 'EFECTIVO')

  // ── Validación de split vuelto ────────────────────────────────────────────
  const splitVueltoSumBs = splitVuelto.reduce((s, e) => s + e.montoBs, 0)
  const splitVueltoValid =
    splitVuelto.length === 0 ||
    Math.abs(splitVueltoSumBs - vueltoMontoBs) <= 0.01

  // ── Estado del botón Procesar (modo-aware) ────────────────────────────────
  const puedeProcesar = (() => {
    if (Math.abs(pendienteBs4) <= 0.01) {
      return (
        (pagos.length > 0 && esPagado) ||
        (tipoDetectado === 'CREDITO' && pagos.length > 0) ||
        (tipoDetectado === 'CREDITO' && pagos.length === 0 && !!clienteId)
      )
    }
    if (estaOverpago) {
      if (discrepancyMode === 'VUELTO') return pagos.length > 0 && splitVueltoValid
      if (discrepancyMode === 'SAF') return pagos.length > 0 && !!clienteId
      if (discrepancyMode === 'PROPINA') return pagos.length > 0
      if (discrepancyMode === 'DIFERENCIAL_SOBRANTE') return pagos.length > 0
      return false
    }
    // Faltante
    if (discrepancyMode === 'CREDITO') {
      return pagos.length > 0 || (pagos.length === 0 && !!clienteId)
    }
    if (discrepancyMode === 'ABSORBER') return supervisorAuthorized
    if (discrepancyMode === 'DIFERENCIAL_FALTANTE') return pagos.length > 0
    return false
  })()

  const selectedMetodo = metodos.find((m) => m.id === metodoId)
  const monedaMetodo = selectedMetodo?.moneda as 'USD' | 'BS' | undefined

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddPago = () => {
    const montoNum = parseFloat(montoStr)
    if (!metodoId || isNaN(montoNum) || montoNum <= 0 || !monedaMetodo || !selectedMetodo) return
    setPagos((prev) => [
      ...prev,
      {
        metodo_cobro_id: metodoId,
        metodo_nombre: selectedMetodo.nombre,
        moneda: monedaMetodo,
        monto: montoNum,
        referencia: referencia.trim() || undefined,
      },
    ])
    setMetodoId('')
    setMontoStr('')
    setReferencia('')
  }

  const handleRemovePago = (index: number) => {
    setPagos((prev) => prev.filter((_, i) => i !== index))
  }

  // Rellena el monto pendiente exacto en la moneda del metodo seleccionado
  const handleAutocompletar = () => {
    if (!monedaMetodo) return
    const pendBs = Math.max(0, pendienteBs4)
    const montoPend =
      monedaMetodo === 'BS'
        ? Number(pendBs.toFixed(2))
        : Number((pendBs / tasaUsada).toFixed(2))
    setMontoStr(String(montoPend))
  }

  const handleProcesar = async () => {
    // Validar limite de credito si queda saldo
    if (tipoDetectado === 'CREDITO' && clienteData) {
      const limite = parseFloat(clienteData.limite_credito_usd)
      const saldoActual = parseFloat(clienteData.saldo_actual)
      if (limite <= 0) {
        toast.error('Este cliente no tiene credito asignado. Registra un pago para facturar a contado.')
        return
      }
      const creditoDisponible = Math.max(0, limite - saldoActual)
      if (pendienteUsd > creditoDisponible + 0.01) {
        toast.error(
          `El monto a credito (${formatUsd(pendienteUsd)}) excede el credito disponible (${formatUsd(creditoDisponible)})`
        )
        return
      }
    }

    // Avances deben cubrirse completamente (no se aceptan a credito)
    const totalAvancesUsd = cargosEspeciales
      .filter((c) => c.tipo === 'AVANCE')
      .reduce((sum, c) => sum + c.montoCargoUsd, 0)
    const totalPagadoUsd = pagos.reduce((sum, p) => {
      return sum + (p.moneda === 'BS' ? p.monto / tasaUsada : p.monto)
    }, 0)
    if (totalAvancesUsd > 0.01 && totalPagadoUsd < totalAvancesUsd - 0.01) {
      toast.error(
        `El avance de efectivo debe pagarse en su totalidad. Registra un pago de al menos ${formatUsd(totalAvancesUsd)}.`
      )
      return
    }

    // Validar resolución de discrepancia
    if (estaOverpago && discrepancyMode === null) {
      toast.error('Selecciona cómo manejar el excedente de pago')
      return
    }
    if (!estaOverpago && pendienteBs4 > umbralBs && discrepancyMode === null) {
      toast.error('Selecciona cómo manejar el pago incompleto')
      return
    }
    // ABSORBER requiere supervisor autorizado + ID capturado
    if (discrepancyMode === 'ABSORBER' && (!supervisorAuthorized || !supervisorId)) {
      toast.error('Se requiere autorización de supervisor para absorber la diferencia')
      return
    }
    if (discrepancyMode === 'VUELTO' && splitVuelto.length > 0 && !splitVueltoValid) {
      toast.error('La suma del vuelto asignado no coincide con el total de vuelto')
      return
    }

    // Construir vueltoParam para crearVenta (TASK-006: ampliar a VueltoParam[])
    const vueltoParam: VueltoParam | undefined = (() => {
      if (discrepancyMode !== 'VUELTO') return undefined
      if (splitVuelto.length > 0) {
        const first = splitVuelto[0]
        const metodo = metodos.find((m) => m.id === first.metodoCobro_id)
        if (!metodo) return undefined
        const monto =
          metodo.moneda === 'BS'
            ? Number(first.montoBs.toFixed(2))
            : Number((first.montoBs / tasaUsada).toFixed(2))
        return {
          metodo_cobro_id: first.metodoCobro_id,
          moneda: metodo.moneda as 'BS' | 'USD',
          monto,
        }
      }
      // Fallback: usar primer metodo efectivo disponible
      const efectivo = metodosEfectivo[0]
      if (!efectivo) return undefined
      const monto =
        efectivo.moneda === 'BS'
          ? Number(vueltoMontoBs.toFixed(2))
          : Number((vueltoMontoBs / tasaUsada).toFixed(2))
      return {
        metodo_cobro_id: efectivo.id,
        moneda: efectivo.moneda as 'BS' | 'USD',
        monto,
      }
    })()

    // Build discrepancy param for the data layer
    const discrepancy: DiscrepancyOptions | undefined = discrepancyMode
      ? {
          mode: discrepancyMode,
          montoUsd: Math.abs(montoDiscrepanciaUsd),
          montoBs: Math.abs(pendienteBs4),
          clienteId: clienteId || undefined,
          cajeroId: usuarioId,
          supervisorId: supervisorId ?? undefined,
          vueltoEntries:
            discrepancyMode === 'VUELTO' && splitVuelto.length > 0
              ? splitVuelto.map((e) => ({ metodoCobro_id: e.metodoCobro_id, montoBs: e.montoBs }))
              : undefined,
        }
      : undefined

    setSubmitting(true)
    try {
      // Validar stock en servidor antes de escribir (no bloquea si offline)
      await validarStockServidor(
        lineas
          .filter((l) => l.tipo === 'P')
          .map((l) => ({
            producto_id: l.producto_id,
            cantidad: l.cantidad,
            nombre: l.nombre,
            tipo: l.tipo,
          })),
        empresaId,
      )

      const result = await crearVenta({
        cliente_id: clienteId,
        tipo: tipoDetectado,
        tasa: tasaUsada,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio_unitario_usd: l.precio_unitario_usd,
          tipo_impuesto: (l.tipo_impuesto as string | undefined) ?? 'Exento',
          impuesto_pct: (l.impuesto_pct as number | undefined) ?? 0,
        })),
        pagos: pagos.map((p) => ({
          metodo_cobro_id: p.metodo_cobro_id,
          moneda: p.moneda,
          monto: p.monto,
          referencia: p.referencia,
        })),
        vuelto: vueltoParam,
        usuario_id: usuarioId,
        empresa_id: empresaId,
        sesion_caja_id: sesionCajaId,
        cargosEspeciales,
        descuentoUsd: descuentoBs > 0 ? Number((descuentoBs / tasaUsada).toFixed(4)) : 0,
        descuentoMotivo: descuentoMotivo.trim() || undefined,
        totalIgtfUsd: igtfUsd,
        discrepancy,
      })

      onSuccess({
        nroFactura: result.nroFactura,
        clienteNombre,
        totalUsd: totalEfectivoUsd,
        totalBs: totalEfectivoBs,
        tipo: tipoDetectado,
        pagos: [...pagos],
        tasa: tasaUsada,
        cargosEspeciales: [...cargosEspeciales],
        igtfUsd,
        igtfBs,
        tasaIgtfPct: tasaIgtf,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al procesar la venta')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Referencia estable para handleProcesar (evita stale closure en keydown) ─
  const handleProcesarRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => { handleProcesarRef.current = handleProcesar })

  // ── Atajos de teclado: F12 / Enter (sin foco en input) ───────────────────
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (showAbsorberPinDialog) return
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select'
      if (e.key === 'F12') {
        e.preventDefault()
        if (puedeProcesar) void handleProcesarRef.current()
      }
      if (e.key === 'Enter' && !isInput) {
        e.preventDefault()
        if (puedeProcesar) void handleProcesarRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, showAbsorberPinDialog, puedeProcesar])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !submitting) onClose() }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Cobro</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tasa: {tasaUsada.toFixed(2)} Bs/$ · {clienteNombre || 'Sin cliente'}
          </p>
        </DialogHeader>

        {/* Total factura */}
        <div className="px-5 py-3 bg-primary/5 border-b shrink-0 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-primary/60 uppercase tracking-widest font-semibold mb-0.5">
              {igtfUsd > 0 ? 'Total factura' : 'Total a cobrar'}
            </p>
            <p className="text-2xl font-bold tabular-nums leading-tight">{formatBs(totalEfectivoBs)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(totalEfectivoUsd)}</p>
          </div>
          {descuentoBs > 0 && (
            <div className="text-right text-xs text-orange-600">
              <p className="font-medium">Descuento</p>
              <p>−{formatBs(descuentoBs)}</p>
            </div>
          )}
        </div>

        {/* IGTF + Total general */}
        {aplicaIgtf && igtfUsd > 0 && (
          <>
            <div className="px-5 py-2 border-b shrink-0 bg-amber-50 flex items-center justify-between">
              <p className="text-xs text-amber-800 font-medium">
                IGTF {tasaIgtf}% (sobre pagos en divisas)
              </p>
              <div className="text-right">
                <p className="text-xs font-semibold text-amber-800">+{formatBs(igtfBs)}</p>
                <p className="text-[10px] text-amber-600">{formatUsd(igtfUsd)}</p>
              </div>
            </div>
            <div className="px-5 py-2.5 border-b shrink-0 bg-amber-100/70 flex items-center justify-between">
              <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                Total + IGTF
              </p>
              <div className="text-right">
                <p className="text-base font-bold tabular-nums text-amber-900">
                  {formatBs(totalEfectivoBs + igtfBs)}
                </p>
                <p className="text-xs text-amber-700">{formatUsd(totalEfectivoUsd + igtfUsd)}</p>
              </div>
            </div>
          </>
        )}

        {/* Balance resumen */}
        {pagos.length > 0 && (
          <div className="px-5 py-2 border-b shrink-0 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Abonado</p>
              <p className="font-semibold text-green-600">{formatBs(totalPagadoBs)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pendiente</p>
              {estaOverpago ? (
                <p className="font-semibold text-amber-600">Vuelto {formatBs(vueltoMontoBs)}</p>
              ) : esDiferencialRedondeo ? (
                <p className="font-semibold text-muted-foreground">Dif. redondeo</p>
              ) : (
                <p className={`font-semibold ${pendienteBs4 > umbralBs ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatBs(Math.max(0, pendienteBs4))}
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Estado</p>
              <p className={`font-semibold ${tipoDetectado === 'CREDITO' ? 'text-orange-600' : 'text-green-600'}`}>
                {tipoDetectado}
              </p>
            </div>
          </div>
        )}

        {/* Lista de pagos (scrollable) */}
        <div className="max-h-36 overflow-y-auto divide-y">
          {pagos.length === 0 ? (
            <div className="px-5 py-4 text-xs text-muted-foreground text-center">
              Sin pagos registrados
            </div>
          ) : (
            pagos.map((p, i) => {
              const equiv = p.moneda === 'BS' ? Number((p.monto / tasaUsada).toFixed(2)) : p.monto
              return (
                <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/30">
                  <div className="min-w-0">
                    <span className="text-xs font-medium">{p.metodo_nombre}</span>
                    {p.referencia && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">Ref: {p.referencia}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs">
                      {p.moneda === 'BS' ? formatBs(p.monto) : formatUsd(p.monto)}
                      {p.moneda === 'BS' && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({formatUsd(equiv)})</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePago(i)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Formulario de pago */}
        <div className="px-5 py-3 border-t border-b shrink-0 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Agregar pago</p>
          <NativeSelect value={metodoId} onChange={(e) => setMetodoId(e.target.value)}>
            <option value="">Seleccionar metodo...</option>
            {metodos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} ({m.moneda})
              </option>
            ))}
          </NativeSelect>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={montoStr}
                onChange={(e) => setMontoStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPago()
                  if (e.key === '-') e.preventDefault()
                }}
                placeholder={monedaMetodo ? `Monto (${monedaMetodo})` : 'Monto'}
                className="h-8 text-sm pr-16"
                autoFocus={false}
              />
              {monedaMetodo && pendienteBs4 > umbralBs && (
                <button
                  type="button"
                  onClick={handleAutocompletar}
                  className="absolute right-1.5 top-1.5 text-[10px] text-primary hover:text-primary/80 font-medium px-1 leading-none"
                >
                  Exacto
                </button>
              )}
            </div>
            <Input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddPago() }}
              placeholder="Ref. (opcional)"
              className="h-8 text-sm w-28"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={handleAddPago}
              disabled={!metodoId || !montoStr || parseFloat(montoStr) <= 0}
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>

        {/* Panel de resolución de discrepancias */}
        {Math.abs(pendienteBs4) > 0.01 && (
          <div className="px-5 py-3 border-b shrink-0">

            {/* Auto-resuelto: diferencial cambiario */}
            {(discrepancyMode === 'DIFERENCIAL_SOBRANTE' || discrepancyMode === 'DIFERENCIAL_FALTANTE') && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
                <p className="font-medium text-amber-800">
                  {discrepancyMode === 'DIFERENCIAL_SOBRANTE'
                    ? 'Diferencial cambiario (sobrante)'
                    : 'Diferencial cambiario (faltante)'}
                </p>
                <p className="text-amber-700 text-xs mt-0.5">
                  {formatBs(Math.abs(pendienteBs4))} — se registrará como{' '}
                  {discrepancyMode === 'DIFERENCIAL_SOBRANTE'
                    ? 'ingreso de diferencial'
                    : 'gasto de diferencial'}
                </p>
              </div>
            )}

            {/* Overpago manual: VUELTO / SAF / PROPINA */}
            {estaOverpago && discrepancyMode !== 'DIFERENCIAL_SOBRANTE' && (
              <div className="space-y-2">
                <p className="text-sm font-medium">El cliente pagó de más. ¿Cómo proceder?</p>
                <p className="text-xs text-muted-foreground">
                  Excedente: {formatBs(vueltoMontoBs)} / {formatUsd(Math.abs(montoDiscrepanciaUsd))}
                </p>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="discrepancy"
                    checked={discrepancyMode === 'VUELTO'}
                    onChange={() => setDiscrepancyMode('VUELTO')}
                  />
                  <span className="text-sm">Dar vuelto</span>
                </label>

                {!!clienteId && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="discrepancy"
                      checked={discrepancyMode === 'SAF'}
                      onChange={() => setDiscrepancyMode('SAF')}
                    />
                    <span className="text-sm">Acreditar en cuenta del cliente</span>
                  </label>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="discrepancy"
                    checked={discrepancyMode === 'PROPINA'}
                    onChange={() => setDiscrepancyMode('PROPINA')}
                  />
                  <span className="text-sm">Propina (el cliente dejó el cambio)</span>
                </label>

                {/* Split vuelto: solo cuando VUELTO seleccionado */}
                {discrepancyMode === 'VUELTO' && (
                  <div className="mt-2 space-y-1.5 pl-4">
                    <p className="text-xs text-muted-foreground">
                      Distribuir vuelto por método (opcional):
                    </p>
                    {metodosEfectivo.map((m) => {
                      const entry = splitVuelto.find((e) => e.metodoCobro_id === m.id)
                      return (
                        <div key={m.id} className="flex items-center gap-2">
                          <label className="text-xs flex-1 truncate">{m.nombre}</label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={entry ? entry.montoBs : ''}
                            onChange={(ev) => {
                              const val = parseFloat(ev.target.value) || 0
                              setSplitVuelto((prev) => {
                                const rest = prev.filter((x) => x.metodoCobro_id !== m.id)
                                if (val <= 0) return rest
                                return [
                                  ...rest,
                                  { metodoCobro_id: m.id, metodoNombre: m.nombre, montoBs: val },
                                ]
                              })
                            }}
                            placeholder="0.00"
                            className="h-7 text-xs w-24"
                          />
                          <span className="text-[10px] text-muted-foreground w-4">Bs</span>
                        </div>
                      )
                    })}
                    {splitVuelto.length > 0 && (
                      <div className="flex justify-between text-xs pt-1 border-t">
                        <span className="text-muted-foreground">
                          Asignado: {formatBs(splitVueltoSumBs)}
                        </span>
                        <span
                          className={
                            splitVueltoValid
                              ? 'text-green-600 font-medium'
                              : 'text-orange-600 font-medium'
                          }
                        >
                          {splitVueltoValid
                            ? '✓ Correcto'
                            : `Faltan: ${formatBs(Math.abs(vueltoMontoBs - splitVueltoSumBs))}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Faltante manual: CREDITO / ABSORBER */}
            {!estaOverpago &&
              pendienteBs4 > 0.01 &&
              discrepancyMode !== 'DIFERENCIAL_FALTANTE' && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Pago incompleto. ¿Cómo proceder?</p>
                <p className="text-xs text-muted-foreground">
                  Faltante: {formatBs(pendienteBs4)} / {formatUsd(montoDiscrepanciaUsd)}
                </p>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="discrepancy"
                    checked={discrepancyMode === 'CREDITO'}
                    onChange={() => {
                      setDiscrepancyMode('CREDITO')
                      setSupervisorAuthorized(false)
                      setSupervisorId(null)
                    }}
                  />
                  <span className="text-sm">Dejar a crédito</span>
                </label>

                {montoDiscrepanciaUsd <= absorberMaxUsd && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="discrepancy"
                      checked={discrepancyMode === 'ABSORBER'}
                      onChange={() => setDiscrepancyMode('ABSORBER')}
                    />
                    <span className="text-sm">El negocio asume la diferencia</span>
                  </label>
                )}

                {discrepancyMode === 'ABSORBER' && !supervisorAuthorized && (
                  <button
                    type="button"
                    className="ml-6 text-sm underline text-primary"
                    onClick={() => setShowAbsorberPinDialog(true)}
                  >
                    Autorizar con PIN de supervisor
                  </button>
                )}
                {discrepancyMode === 'ABSORBER' && supervisorAuthorized && (
                  <p className="ml-6 text-sm text-green-600">✓ Autorizado por supervisor</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 shrink-0 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => void handleProcesar()}
            disabled={!puedeProcesar || submitting}
            className={
              tipoDetectado === 'CREDITO'
                ? 'bg-orange-600 hover:bg-orange-700'
                : ''
            }
          >
            {tipoDetectado === 'CREDITO' ? (
              <CreditCard size={14} className="mr-1.5" />
            ) : (
              <ShoppingCart size={14} className="mr-1.5" />
            )}
            {submitting
              ? 'Procesando...'
              : tipoDetectado === 'CREDITO'
              ? 'Factura Credito'
              : 'Procesar'}
            {!submitting && (
              <kbd className="ml-1.5 rounded border bg-muted/40 px-1 py-px text-[10px] font-mono leading-none opacity-70">
                F12
              </kbd>
            )}
          </Button>
        </div>

        {/* Dialogo de autorización de supervisor para ABSORBER */}
        <SupervisorPinDialog
          isOpen={showAbsorberPinDialog}
          onClose={() => setShowAbsorberPinDialog(false)}
          onAuthorized={(supervisorUserId) => {
            setSupervisorAuthorized(true)
            setSupervisorId(supervisorUserId)
            setShowAbsorberPinDialog(false)
          }}
          titulo="Autorizar absorción de diferencia"
          mensaje="Ingresa el PIN de supervisor para autorizar que el negocio asuma la diferencia."
          requiredPermission={PERMISSIONS.SALES_ABSORB_DIFFERENTIAL}
        />
      </DialogContent>
    </Dialog>
  )
}
