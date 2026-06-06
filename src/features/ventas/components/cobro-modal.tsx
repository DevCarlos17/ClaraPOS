import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash, ShoppingCart } from '@phosphor-icons/react'
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
  type SafEntry,
} from '../hooks/use-ventas'
import { useFacturasPendientes } from '@/features/cxc/hooks/use-cxc'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
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

type SafSubMode = 'FACTURAS' | 'DIRECTO' | null

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

  // SAF as payment method
  const { disponible: safDisponible, tieneSaf } = useSaldoAFavor(clienteId || null)
  const [safMonto, setSafMonto] = useState(0)
  const [safSeleccionado, setSafSeleccionado] = useState(false)

  // ── Estado de resolución de discrepancias ─────────────────────────────────
  const [discrepancyMode, setDiscrepancyMode] = useState<DiscrepancyMode>(null)
  const [safSubMode, setSafSubMode] = useState<SafSubMode>(null)
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
    setSafSubMode(null)
    setSplitVuelto([])
    setSupervisorAuthorized(false)
    setSupervisorId(null)
    setSafMonto(0)
    setSafSeleccionado(false)
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
  // SAF se cuenta en USD; convertir a Bs para el balance
  const safMontoBsEquiv = safSeleccionado ? safMonto * tasaUsada : 0
  const totalPagadoBs = pagos.reduce((sum, p) => {
    return sum + (p.moneda === 'BS' ? p.monto : p.monto * tasaUsada)
  }, 0) + safMontoBsEquiv
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
    if (Math.abs(pendienteBs4) <= 0.01) {
      setDiscrepancyMode(null)
      return
    }
    if (pendienteBs4 < -0.01) {
      // Overpago: siempre mostrar formulario completo, sin auto-resolver por diferencial
      if (
        discrepancyMode === null ||
        discrepancyMode === 'DIFERENCIAL_SOBRANTE' ||
        discrepancyMode === 'DIFERENCIAL_FALTANTE' ||
        discrepancyMode === 'CREDITO' ||
        discrepancyMode === 'ABSORBER'
      ) {
        setDiscrepancyMode('VUELTO')
      }
    } else if (pendienteBs4 > 0.01) {
      // Faltante: CREDITO por defecto, sin sobreescribir elección activa del cajero
      if (
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
  }, [pendienteBs4])

  // ── Facturas pendientes del cliente para modo SAF "Aplicar a facturas" ───
  const { facturas: facturasPendientesSAF } = useFacturasPendientes(
    discrepancyMode === 'SAF' && clienteId ? clienteId : null
  )
  const tieneFaturasPendientesSAF = facturasPendientesSAF.length > 0

  // Distribución FIFO: cómo se aplica el excedente a las facturas pendientes
  const fifoPreview = useMemo(() => {
    if (safSubMode !== 'FACTURAS' || !facturasPendientesSAF.length) return []
    const montoDisp = Math.abs(montoDiscrepanciaUsd)
    let remaining = montoDisp
    const result: Array<{ ventaId: string; nroFactura: string; aplicar: number }> = []
    for (const f of facturasPendientesSAF) {
      if (remaining <= 0.001) break
      const saldo = parseFloat(f.saldo_pend_usd)
      const aplicar = Number(Math.min(saldo, remaining).toFixed(2))
      if (aplicar > 0.001) {
        result.push({ ventaId: f.id, nroFactura: f.nro_factura, aplicar })
        remaining = Number((remaining - aplicar).toFixed(2))
      }
    }
    return result
  }, [safSubMode, facturasPendientesSAF, montoDiscrepanciaUsd])

  const fifoSobrante = useMemo(() => {
    const totalAplicado = fifoPreview.reduce((s, x) => s + x.aplicar, 0)
    return Math.max(0, Number((Math.abs(montoDiscrepanciaUsd) - totalAplicado).toFixed(2)))
  }, [fifoPreview, montoDiscrepanciaUsd])

  const metodosEfectivo = metodos.filter((m) => m.tipo === 'EFECTIVO')

  // ── Validación de split vuelto ────────────────────────────────────────────
  const splitVueltoSumBs = splitVuelto.reduce((s, e) => s + e.montoBs, 0)
  // Diferencia: positivo = se asigna MÁS que el vuelto (diferencial cambiario por
  // redondeo de denominaciones físicas en USD); negativo = se asigna MENOS (el
  // sobrante queda en caja como diferencial implícito).
  const splitVueltoExceso = splitVueltoSumBs - vueltoMontoBs
  const splitVueltoValid =
    splitVuelto.length === 0 ||
    // Bajo-distribución: siempre válido — el monto no asignado queda en caja
    // Sobre-distribución: válido si el exceso ≤ umbralBs (e.g. redondeo USD→Bs)
    splitVueltoExceso <= umbralBs + 0.01

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
      if (discrepancyMode === 'SAF') {
        if (!safSubMode) return false
        return pagos.length > 0 && !!clienteId
      }
      if (discrepancyMode === 'PROPINA') return pagos.length > 0
      if (discrepancyMode === 'DIFERENCIAL_SOBRANTE') return pagos.length > 0
      return false
    }
    // Faltante: los 3 modos siempre disponibles
    if (discrepancyMode === 'CREDITO') return !!clienteId
    if (discrepancyMode === 'ABSORBER') return supervisorAuthorized
    if (discrepancyMode === 'DIFERENCIAL_FALTANTE') return true
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
    // Validar limite de credito — solo aplica cuando el cajero eligió factura a crédito,
    // NO cuando el modo es faltante de caja (DIFERENCIAL_FALTANTE) o absorción (ABSORBER)
    if (discrepancyMode === 'CREDITO' && clienteData) {
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

    // Asignaciones FIFO para modo SAF "Aplicar a facturas"
    const invoiceAssignments =
      discrepancyMode === 'SAF' && safSubMode === 'FACTURAS' && fifoPreview.length > 0
        ? fifoPreview.map((f) => ({ ventaId: f.ventaId, nroFactura: f.nroFactura, montoUsd: f.aplicar }))
        : undefined

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
          invoiceAssignments,
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

      // Build SAF entry if client is using their credit balance as payment method
      const safEntry: SafEntry | undefined =
        safSeleccionado && safMonto > 0 && clienteId
          ? { clienteId, montoUsd: safMonto, safOrigenRefs: [] }
          : undefined

      const result = await crearVenta({
        cliente_id: clienteId,
        tipo: discrepancyMode === 'ABSORBER' ? 'CONTADO' : tipoDetectado,
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
        safEntry,
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

  // ── Reset safSubMode cuando el modo deja de ser SAF ─────────────────────
  useEffect(() => {
    if (discrepancyMode !== 'SAF') setSafSubMode(null)
  }, [discrepancyMode])

  // ── Referencia estable para handleProcesar (evita stale closure en keydown) ─
  const handleProcesarRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => { handleProcesarRef.current = handleProcesar })

  // ── Referencia estable para selección de modo (F5/F6/F7) ─────────────────
  const selectModeRef = useRef<(key: string) => void>(() => {})
  useEffect(() => {
    selectModeRef.current = (key: string) => {
      if (!estaOverpago && pendienteBs4 > 0.01) {
        // Faltante: F5=Crédito  F6=Faltante caja  F7=Negocio asume
        if (key === 'F5') { setDiscrepancyMode('CREDITO'); setSupervisorAuthorized(false); setSupervisorId(null) }
        if (key === 'F6') { setDiscrepancyMode('DIFERENCIAL_FALTANTE'); setSupervisorAuthorized(false); setSupervisorId(null) }
        if (key === 'F7') setDiscrepancyMode('ABSORBER')
      } else if (estaOverpago && discrepancyMode !== 'DIFERENCIAL_SOBRANTE') {
        // Overpago: F5=Dar vuelto  F6=Saldo a favor  F7=Propina
        if (key === 'F5') setDiscrepancyMode('VUELTO')
        if (key === 'F6' && clienteId) setDiscrepancyMode('SAF')
        if (key === 'F7') setDiscrepancyMode('PROPINA')
      }
    }
  })

  // ── Atajos de teclado: F5/F6/F7 (modo)  F12/Enter (procesar) ─────────────
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
      if (e.key === 'F5' || e.key === 'F6' || e.key === 'F7') {
        e.preventDefault()
        selectModeRef.current(e.key)
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
        {(pagos.length > 0 || safSeleccionado) && (
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

        {/* SAF como método de cobro dinámico — solo si cliente tiene crédito */}
        {tieneSaf && clienteId && (
          <div className="px-5 py-2 border-t shrink-0 bg-blue-50/50">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-blue-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safSeleccionado}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setSafSeleccionado(checked)
                    if (checked) {
                      // Pre-cargar monto: min(disponible, totalVenta)
                      setSafMonto(Number(Math.min(safDisponible, totalEfectivoUsd).toFixed(2)))
                    } else {
                      setSafMonto(0)
                    }
                  }}
                  className="rounded border-blue-300"
                />
                Saldo a favor ({formatUsd(safDisponible)} disponible)
              </label>
              {safSeleccionado && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={safDisponible}
                    value={safMonto || ''}
                    onChange={(e) => setSafMonto(Math.min(parseFloat(e.target.value) || 0, safDisponible))}
                    placeholder="0.00"
                    className="h-7 w-24 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-blue-700">USD</span>
                </div>
              )}
            </div>
          </div>
        )}

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

            {/* Auto-resuelto: diferencial cambiario sobrante */}
            {discrepancyMode === 'DIFERENCIAL_SOBRANTE' && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
                <p className="font-medium text-amber-800">Diferencial cambiario (sobrante)</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  {formatBs(Math.abs(pendienteBs4))} — se registrará como ingreso de diferencial
                </p>
              </div>
            )}

            {/* Overpago manual: VUELTO / SAF / PROPINA */}
            {estaOverpago && discrepancyMode !== 'DIFERENCIAL_SOBRANTE' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Excedente: {formatBs(vueltoMontoBs)} / {formatUsd(Math.abs(montoDiscrepanciaUsd))}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscrepancyMode('VUELTO')}
                    className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors flex flex-col items-center gap-0.5 ${
                      discrepancyMode === 'VUELTO'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>Dar vuelto</span>
                    <kbd className={`rounded border px-1 py-px text-[9px] font-mono leading-none ${discrepancyMode === 'VUELTO' ? 'border-white/30 bg-white/20' : 'border-border bg-muted'}`}>F5</kbd>
                  </button>
                  <button
                    type="button"
                    disabled={!clienteId}
                    onClick={() => setDiscrepancyMode('SAF')}
                    className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-0.5 ${
                      discrepancyMode === 'SAF'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>Saldo a favor</span>
                    <kbd className={`rounded border px-1 py-px text-[9px] font-mono leading-none ${discrepancyMode === 'SAF' ? 'border-white/30 bg-white/20' : 'border-border bg-muted'}`}>F6</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscrepancyMode('PROPINA')}
                    className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors flex flex-col items-center gap-0.5 ${
                      discrepancyMode === 'PROPINA'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>Propina</span>
                    <kbd className={`rounded border px-1 py-px text-[9px] font-mono leading-none ${discrepancyMode === 'PROPINA' ? 'border-white/30 bg-white/20' : 'border-border bg-muted'}`}>F7</kbd>
                  </button>
                </div>

                {/* SAF sub-opciones: cuando SAF está seleccionado */}
                {discrepancyMode === 'SAF' && (
                  <div className="mt-2 space-y-2 border-t border-green-200 pt-2">
                    <p className="text-xs text-muted-foreground">¿Cómo aplicar el excedente?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!tieneFaturasPendientesSAF}
                        onClick={() => setSafSubMode('FACTURAS')}
                        className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-0.5 ${
                          safSubMode === 'FACTURAS'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-foreground border-border hover:bg-muted'
                        }`}
                      >
                        <span>Aplicar a facturas</span>
                        <span className={`text-[10px] ${safSubMode === 'FACTURAS' ? 'text-white/70' : 'text-muted-foreground'}`}>
                          {tieneFaturasPendientesSAF
                            ? `${facturasPendientesSAF.length} pendiente${facturasPendientesSAF.length !== 1 ? 's' : ''}`
                            : 'Sin facturas'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSafSubMode('DIRECTO')}
                        className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors flex flex-col items-center gap-0.5 ${
                          safSubMode === 'DIRECTO'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-foreground border-border hover:bg-muted'
                        }`}
                      >
                        <span>Saldo a Favor</span>
                        <span className={`text-[10px] ${safSubMode === 'DIRECTO' ? 'text-white/70' : 'text-muted-foreground'}`}>
                          Acreditar cuenta
                        </span>
                      </button>
                    </div>

                    {/* Previsualización FIFO */}
                    {safSubMode === 'FACTURAS' && fifoPreview.length > 0 && (
                      <div className="rounded border border-green-200 bg-green-50/50 p-2 text-xs space-y-1">
                        <p className="font-medium text-green-800">Distribución FIFO:</p>
                        {fifoPreview.map((f) => (
                          <div key={f.ventaId} className="flex justify-between text-green-700">
                            <span>Fac. #{f.nroFactura}</span>
                            <span className="font-semibold">
                              {formatBs(f.aplicar * tasaUsada)}
                              <span className="ml-1 text-[10px] font-normal opacity-70">
                                ({formatUsd(f.aplicar)})
                              </span>
                            </span>
                          </div>
                        ))}
                        {fifoSobrante > 0.001 && (
                          <div className="flex justify-between border-t border-green-200 pt-1">
                            <span className="text-green-600">Saldo restante (SAF)</span>
                            <span className="font-semibold text-green-600">{formatUsd(fifoSobrante)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Split vuelto: solo cuando VUELTO seleccionado */}
                {discrepancyMode === 'VUELTO' && (
                  <div className="mt-2 space-y-1.5 pl-4">
                    <p className="text-xs text-muted-foreground">
                      Distribuir vuelto por método (opcional):
                    </p>
                    {metodosEfectivo.map((m) => {
                      const entry = splitVuelto.find((e) => e.metodoCobro_id === m.id)
                      const isUsd = m.moneda === 'USD'
                      const displayValue = entry
                        ? isUsd
                          ? Number((entry.montoBs / tasaUsada).toFixed(2))
                          : entry.montoBs
                        : ''
                      return (
                        <div key={m.id} className="flex items-center gap-2">
                          <label className="text-xs flex-1 truncate">{m.nombre}</label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={displayValue}
                            onChange={(ev) => {
                              const raw = parseFloat(ev.target.value) || 0
                              const montoBsVal = isUsd ? raw * tasaUsada : raw
                              setSplitVuelto((prev) => {
                                const rest = prev.filter((x) => x.metodoCobro_id !== m.id)
                                if (raw <= 0) return rest
                                return [
                                  ...rest,
                                  { metodoCobro_id: m.id, metodoNombre: m.nombre, montoBs: montoBsVal },
                                ]
                              })
                            }}
                            placeholder="0.00"
                            className="h-7 text-xs w-24"
                          />
                          <span className="text-[10px] text-muted-foreground w-4">{isUsd ? '$' : 'Bs'}</span>
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
                            Math.abs(splitVueltoExceso) <= 0.01
                              ? 'text-green-600 font-medium'
                              : splitVueltoValid
                              ? 'text-amber-600 font-medium'
                              : 'text-orange-600 font-medium'
                          }
                        >
                          {Math.abs(splitVueltoExceso) <= 0.01
                            ? '✓ Correcto'
                            : splitVueltoExceso < -0.01
                            ? `Sin asignar: ${formatBs(-splitVueltoExceso)}`
                            : splitVueltoValid
                            ? `Dif. cambio: +${formatBs(splitVueltoExceso)}`
                            : `Excede: +${formatBs(splitVueltoExceso)}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Faltante: 3 botones siempre disponibles */}
            {!estaOverpago && pendienteBs4 > 0.01 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Pendiente: {formatBs(pendienteBs4)} / {formatUsd(montoDiscrepanciaUsd)}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setDiscrepancyMode('CREDITO'); setSupervisorAuthorized(false); setSupervisorId(null) }}
                    className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors flex flex-col items-center gap-0.5 ${
                      discrepancyMode === 'CREDITO'
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-white text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>Factura a crédito</span>
                    <kbd className={`rounded border px-1 py-px text-[9px] font-mono leading-none ${discrepancyMode === 'CREDITO' ? 'border-white/30 bg-white/20' : 'border-border bg-muted'}`}>F5</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDiscrepancyMode('DIFERENCIAL_FALTANTE'); setSupervisorAuthorized(false); setSupervisorId(null) }}
                    className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors flex flex-col items-center gap-0.5 ${
                      discrepancyMode === 'DIFERENCIAL_FALTANTE'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>Faltante de caja</span>
                    <kbd className={`rounded border px-1 py-px text-[9px] font-mono leading-none ${discrepancyMode === 'DIFERENCIAL_FALTANTE' ? 'border-white/30 bg-white/20' : 'border-border bg-muted'}`}>F6</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscrepancyMode('ABSORBER')}
                    className={`rounded border px-2 py-2 text-xs font-medium leading-tight transition-colors flex flex-col items-center gap-0.5 ${
                      discrepancyMode === 'ABSORBER'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>Negocio asume</span>
                    <kbd className={`rounded border px-1 py-px text-[9px] font-mono leading-none ${discrepancyMode === 'ABSORBER' ? 'border-white/30 bg-white/20' : 'border-border bg-muted'}`}>F7</kbd>
                  </button>
                </div>
                {discrepancyMode === 'ABSORBER' && !supervisorAuthorized && (
                  <button
                    type="button"
                    className="text-xs underline text-primary"
                    onClick={() => setShowAbsorberPinDialog(true)}
                  >
                    Autorizar con PIN de supervisor
                  </button>
                )}
                {discrepancyMode === 'ABSORBER' && supervisorAuthorized && (
                  <p className="text-xs text-green-600">✓ Supervisor autorizado</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Panel de vuelto por moneda — visible cuando hay overpago y modo VUELTO */}
        {estaOverpago && discrepancyMode === 'VUELTO' && vueltoMontoBs > 0.01 && (
          <div className="px-5 py-2 border-t shrink-0 bg-amber-50/50">
            <p className="text-xs font-medium text-amber-800 mb-1.5">Desglose de vuelto</p>
            {(() => {
              const tieneUsd = pagos.some((p) => p.moneda === 'USD')
              const tienebs = pagos.some((p) => p.moneda === 'BS')
              const vueltoUsd = Number((vueltoMontoBs / tasaUsada).toFixed(2))

              if (tieneUsd && tienebs) {
                // Métodos mixtos: mostrar ambas denominaciones
                return (
                  <div className="flex gap-4">
                    <div className="text-xs">
                      <span className="text-amber-700">USD: </span>
                      <span className="font-semibold">{formatUsd(vueltoUsd)}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-amber-700">Bs: </span>
                      <span className="font-semibold">{formatBs(vueltoMontoBs)}</span>
                    </div>
                  </div>
                )
              }
              if (tieneUsd) {
                return (
                  <p className="text-xs">
                    <span className="text-amber-700">Vuelto: </span>
                    <span className="font-semibold">{formatUsd(vueltoUsd)}</span>
                  </p>
                )
              }
              return (
                <p className="text-xs">
                  <span className="text-amber-700">Vuelto: </span>
                  <span className="font-semibold">{formatBs(vueltoMontoBs)}</span>
                </p>
              )
            })()}
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
          >
            <ShoppingCart size={14} className="mr-1.5" />
            {submitting ? 'Procesando...' : 'Procesar'}
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
