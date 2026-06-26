import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import {
  registrarPagoFactura,
  registrarAbonoPrestamo,
  registrarDiscrepanciaCxC,
  registrarSafExcedente,
  registrarDiferencialCxC,
  type VentaPendiente,
  type VencimientoVenta,
  type VencimientoPrestamo,
} from '../hooks/use-cxc'
import Decimal from 'decimal.js'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'

type OverpayMode = 'VUELTO' | 'SAF' | 'PROPINA' | null

interface PagoFacturaModalProps {
  isOpen: boolean
  onClose: () => void
  factura: VentaPendiente | null
  clienteId: string
  clienteNombre?: string
  onSuccess: () => void
  /** Préstamos activos de esta venta (de useVencimientosVenta) */
  vencimientos?: VencimientoVenta[]
  defaultDestino?: 'FACTURA' | 'PRESTAMO'
  vencimientoInicial?: VencimientoPrestamo
}

export function PagoFacturaModal({
  isOpen,
  onClose,
  factura,
  clienteId,
  clienteNombre,
  onSuccess,
  vencimientos = [],
  defaultDestino = 'FACTURA',
  vencimientoInicial,
}: PagoFacturaModalProps) {
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { tasaValor } = useTasaActual()
  const { disponible: safDisponible, tieneSaf } = useSaldoAFavor(clienteId || null)

  const today = localNow().slice(0, 10)

  const [destino, setDestino] = useState<'FACTURA' | 'PRESTAMO'>('FACTURA')
  const [vencimientoId, setVencimientoId] = useState('')
  const [fechaPago, setFechaPago] = useState(today)
  const [tasaStr, setTasaStr] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  // Tasa interna auto-cargada de la DB para la fecha seleccionada
  const [tasaInternaNum, setTasaInternaNum] = useState(0)
  const [loading, setLoading] = useState(false)
  const [microBalance, setMicroBalance] = useState<{ saldoUsd: Decimal; saldoBs: Decimal; tasa: number } | null>(null)
  const [loadingDiferencial, setLoadingDiferencial] = useState(false)

  // Manual SAF application state
  const [usarSaf, setUsarSaf] = useState(false)
  const [montoSafStr, setMontoSafStr] = useState('')

  // Overpayment
  const [overpayMode, setOverpayMode] = useState<OverpayMode>(null)

  // Préstamos con saldo pendiente — incluye vencimientoInicial si no está en vencimientos
  const effectiveVencimientos: VencimientoVenta[] = vencimientoInicial && !vencimientos.some((v) => v.id === vencimientoInicial.id)
    ? [...vencimientos, vencimientoInicial]
    : vencimientos
  const prestamosActivos = effectiveVencimientos.filter(
    (v) => v.status !== 'PAGADO' && parseFloat(v.saldo_pendiente_usd) > 0.01
  )
  const tienePrestamoActivo = prestamosActivos.length > 0

  // Auto-cargar tasa interna de la DB cada vez que cambia la fecha
  useEffect(() => {
    if (!user?.empresa_id || !fechaPago) return
    db.execute(
      'SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND DATE(fecha) <= ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
      [user.empresa_id, fechaPago]
    ).then((res) => {
      const row = res.rows?.item(0) as { valor: string } | undefined
      const val = row ? parseFloat(row.valor) : 0
      setTasaInternaNum(val)
      setTasaStr(val > 0 ? val.toFixed(4) : '')
    }).catch(() => {
      setTasaInternaNum(0)
      setTasaStr('')
    })
  }, [fechaPago, user?.empresa_id])

  // Resetear form al abrir
  useEffect(() => {
    if (isOpen) {
      setDestino(defaultDestino ?? 'FACTURA')
      setVencimientoId(vencimientoInicial?.id ?? (prestamosActivos.length === 1 ? prestamosActivos[0].id : ''))
      setFechaPago(today)
      setMetodoCobro('')
      setMontoStr('')
      setReferencia('')
      setOverpayMode(null)
      setUsarSaf(false)
      setMontoSafStr('')
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-seleccionar préstamo al cambiar destino
  useEffect(() => {
    if (destino === 'PRESTAMO' && prestamosActivos.length === 1) {
      setVencimientoId(prestamosActivos[0].id)
    }
    setMontoStr('')
    setOverpayMode(null)
    setUsarSaf(false)
    setMontoSafStr('')
  }, [destino]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setDestino('FACTURA')
    setVencimientoId('')
    setFechaPago(today)
    setTasaStr('')
    setMetodoCobro('')
    setMontoStr('')
    setReferencia('')
    setTasaInternaNum(0)
    setOverpayMode(null)
    setUsarSaf(false)
    setMontoSafStr('')
    setMicroBalance(null)
    setLoadingDiferencial(false)
    onClose()
  }

  async function handleDiferencial() {
    if (!factura || !user?.empresa_id || !user.id) return
    setLoadingDiferencial(true)
    try {
      await registrarDiferencialCxC({
        ventaId: factura.id,
        clienteId,
        empresaId: user.empresa_id,
        procesadoPor: user.id,
        tasa: microBalance?.tasa ?? tasaNum,
      })
      toast.success(`Diferencial cambiario registrado. Factura ${factura.nro_factura} saldada.`)
      onSuccess()
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar diferencial cambiario')
    } finally {
      setLoadingDiferencial(false)
    }
  }

  if (!factura && defaultDestino !== 'PRESTAMO') return null

  const saldoPend = factura ? parseFloat(factura.saldo_pend_usd) : 0
  const totalFactura = factura ? parseFloat(factura.total_usd) : 0

  // Préstamo seleccionado
  const vencSeleccionado = prestamosActivos.find((v) => v.id === vencimientoId) ?? null
  const saldoPrestamo = vencSeleccionado ? parseFloat(vencSeleccionado.saldo_pendiente_usd) : 0

  // Saldo activo según destino
  const saldoEfectivo = destino === 'PRESTAMO' ? saldoPrestamo : saldoPend

  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobro)
  const moneda = (metodoSeleccionado?.moneda ?? 'USD') as 'USD' | 'BS'
  const montoNum = parseFloat(montoStr) || 0
  const tasaNum = parseFloat(tasaStr) || 0

  // SAF manual calculations
  const montoSafNum = usarSaf ? (parseFloat(montoSafStr) || 0) : 0
  const maxSaf = Math.min(safDisponible, saldoEfectivo)
  // Required payment via method = saldo - SAF
  // Do NOT use toFixed(2) here — that truncates small USD amounts like $0.022 → $0.02
  const saldoRequeridoConSaf = Math.max(0, saldoEfectivo - montoSafNum)

  // Para pago USD: monto directo. Para pago BS: se divide por la tasa
  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaNum).toNumber() : montoNum
  const montoBs = moneda === 'USD' ? usdToBs(montoNum, tasaNum).toNumber() : montoNum

  // Overpayment para destino FACTURA
  const estaOverpago = destino === 'FACTURA' && montoUsd > saldoRequeridoConSaf + 0.01
  const excedenteUsd = estaOverpago ? Number((montoUsd - saldoRequeridoConSaf).toFixed(2)) : 0

  // Overpayment para destino PRESTAMO — muestra panel en lugar de bloquear
  const estaOverpagoPrestamo = destino === 'PRESTAMO' && montoUsd > saldoRequeridoConSaf + 0.01
  const excedentePrestamo = estaOverpagoPrestamo ? Number((montoUsd - saldoRequeridoConSaf).toFixed(2)) : 0

  const overpayResuelto = (!estaOverpago && !estaOverpagoPrestamo) || overpayMode !== null

  const sinTasa = tasaNum <= 0
  const destinoPrestamoInvalido = destino === 'PRESTAMO' && !vencimientoId
  // SAF covers full saldo and no method needed
  const safCubreTodo = usarSaf && montoSafNum >= saldoEfectivo - 0.001
  const canSubmit =
    (safCubreTodo || (!!metodoCobro && montoNum > 0)) &&
    !loading &&
    tasaNum > 0 && !destinoPrestamoInvalido && overpayResuelto &&
    (!usarSaf || montoSafNum > 0)

  function handlePayMax() {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoRequeridoConSaf, tasaNum > 0 ? tasaNum : tasaValor).toFixed(2))
    } else {
      // Preserve sub-cent precision (e.g. $0.022 for a Bs-denominated loan at 500 Bs/USD)
      // Round to 6 decimals then strip trailing zeros for a clean display
      setMontoStr(parseFloat(saldoRequeridoConSaf.toFixed(6)).toString())
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !user?.empresa_id || !user.id) return

    setLoading(true)
    try {
      if (destino === 'PRESTAMO') {
        if (estaOverpagoPrestamo && overpayMode) {
          // Overpago: pagar el saldo exacto del préstamo y gestionar el excedente
          const montoSaldoExacto = moneda === 'BS' ? usdToBs(saldoRequeridoConSaf, tasaNum).toNumber() : saldoRequeridoConSaf
          const montoExcedentePrestamo = moneda === 'BS' ? usdToBs(excedentePrestamo, tasaNum).toNumber() : excedentePrestamo
          await registrarAbonoPrestamo({
            vencimiento_id: vencimientoId,
            metodo_cobro_id: metodoCobro,
            moneda,
            tasa: tasaNum,
            monto: montoSaldoExacto,
            fechaPago,
            referencia: referencia.trim() || undefined,
            empresa_id: user.empresa_id,
            procesado_por: user.id,
            procesado_por_nombre: user.nombre,
            aplicarSaf: usarSaf && montoSafNum > 0,
            montoSaf: usarSaf ? montoSafNum : undefined,
            safOrigenRefs: usarSaf ? [`PREST-${vencimientoId.slice(0, 8).toUpperCase()}`] : undefined,
          })
          if (overpayMode === 'SAF') {
            await registrarSafExcedente({
              cliente_id: clienteId,
              venta_id: factura?.id ?? vencimientoId,
              nro_factura: factura?.nro_factura ?? `PREST-${vencimientoId.slice(0, 8).toUpperCase()}`,
              excedenteUsd: excedentePrestamo,
              tasa: tasaNum,
              empresa_id: user.empresa_id,
              procesado_por: user.id,
            })
            toast.success(`Préstamo saldado. Excedente de ${formatUsd(excedentePrestamo)} registrado como saldo a favor.`)
          } else if (overpayMode === 'VUELTO') {
            await registrarDiscrepanciaCxC({
              metodo_cobro_id: metodoCobro,
              tipo: 'VUELTO',
              monto: montoExcedentePrestamo,
              moneda,
              tasa: tasaNum,
              empresa_id: user.empresa_id,
              doc_origen_id: vencimientoId,
              doc_origen_ref: factura?.nro_factura ?? `PREST-${vencimientoId.slice(0, 8).toUpperCase()}`,
              referencia: referencia.trim() || undefined,
              procesado_por: user.id,
            })
            toast.success(`Préstamo saldado. Vuelto: ${formatUsd(excedentePrestamo)}`)
          }
        } else {
          // Pago normal al préstamo (sin overpago)
          const montoMetodoPrestamo = safCubreTodo ? 0 : montoNum
          await registrarAbonoPrestamo({
            vencimiento_id: vencimientoId,
            metodo_cobro_id: metodoCobro,
            moneda,
            tasa: tasaNum,
            monto: montoMetodoPrestamo,
            fechaPago,
            referencia: referencia.trim() || undefined,
            empresa_id: user.empresa_id,
            procesado_por: user.id,
            procesado_por_nombre: user.nombre,
            aplicarSaf: usarSaf && montoSafNum > 0,
            montoSaf: usarSaf ? montoSafNum : undefined,
            safOrigenRefs: usarSaf ? [`PREST-${vencimientoId.slice(0, 8).toUpperCase()}`] : undefined,
          })
          const labels: string[] = []
          if (usarSaf && montoSafNum > 0) labels.push(`SAF ${formatUsd(montoSafNum)}`)
          if (montoMetodoPrestamo > 0) labels.push(formatUsd(montoUsd))
          toast.success(`Abono${labels.length ? ` (${labels.join(' + ')})` : ` de ${formatUsd(montoUsd)}`} registrado al préstamo`)
        }
      } else {
        if (!factura) return

        if (estaOverpago && overpayMode) {
          // Calcular monto exacto del saldo requerido en la moneda original
          const montoSaldo = moneda === 'BS' ? usdToBs(saldoRequeridoConSaf, tasaNum).toNumber() : saldoRequeridoConSaf
          const montoExcedente = moneda === 'BS' ? usdToBs(excedenteUsd, tasaNum).toNumber() : excedenteUsd

          if (overpayMode === 'SAF') {
            // Pagar solo el saldo exacto de la factura (excedente queda como crédito)
            await registrarPagoFactura({
              venta_id: factura.id,
              cliente_id: clienteId,
              metodo_cobro_id: metodoCobro,
              moneda,
              tasa: tasaNum,
              monto: montoSaldo,
              fechaPago,
              referencia: referencia.trim() || undefined,
              empresa_id: user.empresa_id,
              procesado_por: user.id,
              procesado_por_nombre: user.nombre,
              aplicarSaf: usarSaf && montoSafNum > 0,
              montoSaf: usarSaf ? montoSafNum : undefined,
              safOrigenRefs: usarSaf ? [`PAG-${factura.nro_factura}`] : undefined,
            })
            // Registrar el excedente como crédito SAF en el cliente
            await registrarSafExcedente({
              cliente_id: clienteId,
              venta_id: factura.id,
              nro_factura: factura.nro_factura,
              excedenteUsd,
              tasa: tasaNum,
              empresa_id: user.empresa_id,
              procesado_por: user.id,
            })
            // El excedente queda como crédito en la cuenta — sin auto-FIFO
            toast.success(`Factura pagada. Crédito registrado como saldo a favor (${formatUsd(excedenteUsd)})`)
          } else {
            // VUELTO o PROPINA: pagar solo el saldo exacto
            await registrarPagoFactura({
              venta_id: factura.id,
              cliente_id: clienteId,
              metodo_cobro_id: metodoCobro,
              moneda,
              tasa: tasaNum,
              monto: montoSaldo,
              fechaPago,
              referencia: referencia.trim() || undefined,
              empresa_id: user.empresa_id,
              procesado_por: user.id,
              procesado_por_nombre: user.nombre,
              aplicarSaf: usarSaf && montoSafNum > 0,
              montoSaf: usarSaf ? montoSafNum : undefined,
              safOrigenRefs: usarSaf ? [`PAG-${factura.nro_factura}`] : undefined,
            })
            await registrarDiscrepanciaCxC({
              metodo_cobro_id: metodoCobro,
              tipo: overpayMode as 'VUELTO' | 'PROPINA',
              monto: montoExcedente,
              moneda,
              tasa: tasaNum,
              empresa_id: user.empresa_id,
              doc_origen_id: factura.id,
              doc_origen_ref: factura.nro_factura,
              referencia: referencia.trim() || undefined,
              procesado_por: user.id,
            })
            const label = overpayMode === 'VUELTO' ? 'Vuelto' : 'Propina'
            toast.success(`Factura pagada. ${label}: ${formatUsd(excedenteUsd)}`)
          }
        } else {
          // Pago normal (sin overpago) — puede incluir SAF manual
          const montoMetodo = safCubreTodo ? 0 : montoNum
          await registrarPagoFactura({
            venta_id: factura.id,
            cliente_id: clienteId,
            metodo_cobro_id: metodoCobro,
            moneda,
            tasa: tasaNum,
            monto: montoMetodo,
            fechaPago,
            referencia: referencia.trim() || undefined,
            empresa_id: user.empresa_id,
            procesado_por: user.id,
            procesado_por_nombre: user.nombre,
            aplicarSaf: usarSaf && montoSafNum > 0,
            montoSaf: usarSaf ? montoSafNum : undefined,
            safOrigenRefs: usarSaf ? [`PAG-${factura.nro_factura}`] : undefined,
          })
          const labels: string[] = []
          if (usarSaf && montoSafNum > 0) labels.push(`SAF ${formatUsd(montoSafNum)}`)
          if (montoMetodo > 0) labels.push(formatUsd(montoUsd))
          toast.success(`Pago registrado a factura ${factura.nro_factura}${labels.length ? ` (${labels.join(' + ')})` : ''}`)

          // Detectar micro-saldo residual sub-centavo
          const totalAbonado = new Decimal(montoUsd).plus(new Decimal(usarSaf ? montoSafNum : 0))
          const saldoRestante = new Decimal(saldoEfectivo).minus(totalAbonado)
          if (saldoRestante.gt(new Decimal('0')) && saldoRestante.lt(new Decimal('0.01'))) {
            setMicroBalance({
              saldoUsd: saldoRestante,
              saldoBs: saldoRestante.times(new Decimal(tasaNum)),
              tasa: tasaNum,
            })
            return  // No cerrar el modal todavía
          }
        }
      }
      onSuccess()
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago CxC</DialogTitle>
        </DialogHeader>

        {/* ── Panel de micro-saldo residual post-pago ── */}
        {microBalance ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 space-y-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Pago registrado. Queda un residual sub-centavo:
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                  {formatBs(microBalance.saldoBs.toNumber())}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                  = {microBalance.saldoUsd.toFixed(8)} USD @ {microBalance.tasa.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Este monto no es cobrable en USD (menor a $0.01).
              </p>
            </div>
            <p className="text-sm font-medium text-foreground">¿Qué hacemos con este residual?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleDiferencial}
                disabled={loadingDiferencial}
                className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/30"
              >
                {loadingDiferencial ? 'Procesando...' : 'Diferencial cambiario'}
              </Button>
              <Button variant="outline" onClick={() => { onSuccess(); handleClose() }} disabled={loadingDiferencial}>
                Dejar pendiente en Bs
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Diferencial cambiario:</strong> cierra la factura asumiendo la diferencia como pérdida cambiaria.<br />
              <strong>Dejar pendiente:</strong> la factura queda con {formatBs(microBalance.saldoBs.toNumber())} adeudados, pagables en Bs.
            </p>
          </div>
        ) : (
        <>
        {/* Selector de destino (solo cuando hay factura Y préstamos activos) */}
        {factura && tienePrestamoActivo && (
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setDestino('FACTURA')}
              className={`flex-1 px-3 py-2 font-medium transition-colors ${
                destino === 'FACTURA'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              Factura #{factura.nro_factura}
            </button>
            <button
              type="button"
              onClick={() => setDestino('PRESTAMO')}
              className={`flex-1 px-3 py-2 font-medium transition-colors ${
                destino === 'PRESTAMO'
                  ? 'bg-purple-600 text-white'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              Préstamo
            </button>
          </div>
        )}

        {/* Resumen dinámico según destino */}
        {destino === 'FACTURA' && factura ? (
          <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
            {clienteNombre && <div className="font-medium">{clienteNombre}</div>}
            <div className="text-muted-foreground text-xs">
              Factura: #{factura.nro_factura}
              {' · '}
              <span>Tasa factura: {parseFloat(factura.tasa).toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total factura:</span>
              <span>{formatUsd(totalFactura)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Saldo pendiente:</span>
              <span className="text-destructive">{formatUsd(saldoPend)}</span>
            </div>
            {tasaNum > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Equivalente Bs:</span>
                <span>{formatBs(usdToBs(saldoPend, tasaNum))}</span>
              </div>
            )}
          </div>
        ) : destino === 'PRESTAMO' ? (
          <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 space-y-2 text-sm">
            {clienteNombre && <div className="font-medium text-purple-900">{clienteNombre}</div>}
            <div className="text-purple-700 text-xs">
              {factura
                ? `Préstamo vinculado a factura #${factura.nro_factura}`
                : 'Préstamo sin factura asociada'
              }
            </div>

            {/* Selector de préstamo si hay más de uno */}
            {prestamosActivos.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-purple-800">Seleccionar préstamo</label>
                <select
                  value={vencimientoId}
                  onChange={(e) => { setVencimientoId(e.target.value); setMontoStr('') }}
                  className="w-full rounded-md border border-purple-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Seleccionar...</option>
                  {prestamosActivos.map((v) => (
                    <option key={v.id} value={v.id}>
                      Cuota {v.nro_cuota} — Saldo: {formatUsd(parseFloat(v.saldo_pendiente_usd))} — Vence: {v.fecha_vencimiento}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Datos del préstamo seleccionado */}
            {vencSeleccionado && (
              <>
                {/* Total c/interés */}
                <div className="flex justify-between">
                  <span className="text-purple-700">Total c/interés:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatUsd(parseFloat(vencSeleccionado.monto_original_usd))}</div>
                    {tasaNum > 0 && (
                      <div className="text-xs text-purple-500">
                        {formatBs(usdToBs(parseFloat(vencSeleccionado.monto_original_usd), tasaNum))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Pagado */}
                <div className="flex justify-between">
                  <span className="text-purple-700">Pagado:</span>
                  <div className="text-right">
                    <div className="text-green-700">{formatUsd(parseFloat(vencSeleccionado.monto_pagado_usd))}</div>
                    {tasaNum > 0 && parseFloat(vencSeleccionado.monto_pagado_usd) > 0 && (
                      <div className="text-xs text-green-600/70">
                        {formatBs(usdToBs(parseFloat(vencSeleccionado.monto_pagado_usd), tasaNum))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Saldo pendiente */}
                <div className="flex justify-between font-semibold border-t border-purple-200 pt-1.5">
                  <span className="text-purple-800">Saldo pendiente:</span>
                  <div className="text-right">
                    <div className="text-destructive">{formatUsd(saldoPrestamo)}</div>
                    {tasaNum > 0 && saldoPrestamo > 0 && (
                      <div className="text-xs font-normal text-destructive/70">
                        {formatBs(usdToBs(saldoPrestamo, tasaNum))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-purple-700 text-xs">
                  <span>Fecha vencimiento:</span>
                  <span>{vencSeleccionado.fecha_vencimiento}</span>
                </div>
              </>
            )}

            {!vencimientoId && prestamosActivos.length > 1 && (
              <p className="text-xs text-purple-600">Seleccione un préstamo para continuar</p>
            )}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Fecha del abono */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fecha del abono</label>
            <Input
              type="date"
              value={fechaPago}
              onChange={(e) => {
                setFechaPago(e.target.value)
                setMontoStr('')
              }}
              max={today}
            />
            {tasaInternaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Tasa interna a esta fecha:{' '}
                <span className="font-medium">{tasaInternaNum.toFixed(4)}</span>
              </p>
            )}
          </div>

          {/* Aviso cuando no hay tasa para la fecha */}
          {tasaInternaNum === 0 && fechaPago && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-xs text-amber-700 font-medium">
                No hay tasa registrada para esta fecha. Ingrese la tasa manualmente.
              </p>
            </div>
          )}

          {/* Tasa de cobro (editable) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tasa de cobro (Bs/USD)
              </label>
              {tasaValor > 0 && tasaNum !== tasaValor && (
                <button
                  type="button"
                  onClick={() => setTasaStr(tasaValor.toFixed(4))}
                  className="text-xs text-primary hover:underline"
                >
                  Usar tasa actual ({tasaValor.toFixed(2)})
                </button>
              )}
            </div>
            <Input
              type="number"
              step="0.0001"
              min="0.0001"
              value={tasaStr}
              onChange={(e) => setTasaStr(e.target.value)}
              placeholder="0.0000"
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {sinTasa && (
              <p className="text-xs text-destructive">
                {tasaNum < 0 ? 'La tasa debe ser mayor a 0' : 'Se requiere la tasa de cambio para registrar el pago'}
              </p>
            )}
          </div>

          {/* Metodo de pago */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Metodo de pago</label>
            <NativeSelect
              value={metodoCobro}
              onChange={(e) => {
                setMetodoCobro(e.target.value)
                setMontoStr('')
              }}
            >
              <option value="">Seleccionar...</option>
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.moneda})
                </option>
              ))}
            </NativeSelect>

            {/* Aviso efectivo */}
            {metodoSeleccionado?.tipo === 'EFECTIVO' && (
              <div className="p-2 rounded-md bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-700">
                  Este cobro es en efectivo. Si querés registrarlo en caja, hacelo desde el módulo POS con "Ingreso de efectivo".
                </p>
              </div>
            )}
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Monto ({moneda})
              </label>
              <button
                type="button"
                onClick={handlePayMax}
                className="text-xs text-primary hover:underline"
              >
                Pagar total
              </button>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={montoStr}
              onChange={(e) => {
                setMontoStr(e.target.value)
                // Reset overpay cuando cambia el monto
                setOverpayMode(null)
              }}
              placeholder="0.00"
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {montoNum > 0 && moneda === 'USD' && tasaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Equivale a {formatBs(montoBs)} a tasa {tasaNum.toFixed(2)}
              </p>
            )}
            {montoNum > 0 && moneda === 'BS' && tasaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Equivale a {formatUsd(montoUsd)} a tasa {tasaNum.toFixed(2)}
              </p>
            )}
            {montoStr !== '' && montoNum === 0 && (
              <p className="text-xs text-destructive">
                Ingresá un monto válido mayor a 0
              </p>
            )}

          </div>

          {/* Sección SAF manual — visible cuando cliente tiene crédito (factura o préstamo) */}
          {tieneSaf && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-800">
                  Saldo a favor disponible: {formatUsd(safDisponible)}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usarSaf}
                    onChange={(e) => {
                      setUsarSaf(e.target.checked)
                      if (!e.target.checked) setMontoSafStr('')
                      else setMontoSafStr(Math.min(safDisponible, saldoEfectivo).toFixed(2))
                    }}
                    className="rounded border-blue-300"
                  />
                  Usar saldo a favor
                </label>
              </div>
              {usarSaf && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-blue-700">Monto SAF a aplicar (USD)</label>
                    <button
                      type="button"
                      onClick={() => setMontoSafStr(maxSaf.toFixed(2))}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Aplicar máximo ({formatUsd(maxSaf)})
                    </button>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={maxSaf}
                    value={montoSafStr}
                    onChange={(e) => setMontoSafStr(e.target.value)}
                    placeholder="0.00"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {montoSafNum > 0 && saldoRequeridoConSaf > 0.001 && (
                    <p className="text-xs text-blue-600">
                      Resta a cobrar por método: {formatUsd(saldoRequeridoConSaf)}
                    </p>
                  )}
                  {montoSafNum > 0 && saldoRequeridoConSaf <= 0.001 && (
                    <p className="text-xs text-green-600 font-medium">
                      El SAF cubre el saldo completo — no se requiere método de cobro
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Panel de overpayment — solo para destino FACTURA, sin sub-modo FIFO automático */}
          {estaOverpago && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">
                Excedente: {formatUsd(excedenteUsd)} — ¿Cómo se gestiona?
              </p>
              <div className="flex gap-2">
                {([
                  { mode: 'VUELTO' as OverpayMode, label: 'Dar vuelto' },
                  { mode: 'SAF' as OverpayMode, label: 'Saldo a favor' },
                  { mode: 'PROPINA' as OverpayMode, label: 'Propina' },
                ] as { mode: OverpayMode; label: string }[]).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOverpayMode(mode)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ${
                      overpayMode === mode
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Info SAF overpay — excedente queda como crédito, sin FIFO automático */}
              {overpayMode === 'SAF' && (
                <p className="text-xs text-amber-700">
                  El excedente de {formatUsd(excedenteUsd)} quedará como crédito en la cuenta del cliente.
                  Puede aplicarlo manualmente en el próximo cobro.
                </p>
              )}

              {/* Info VUELTO */}
              {overpayMode === 'VUELTO' && (
                <p className="text-xs text-amber-700">
                  Se registrará un egreso de {formatUsd(excedenteUsd)} por concepto de vuelto.
                </p>
              )}

              {/* Info PROPINA */}
              {overpayMode === 'PROPINA' && (
                <p className="text-xs text-amber-700">
                  El excedente de {formatUsd(excedenteUsd)} queda a favor del negocio.
                </p>
              )}
            </div>
          )}

          {/* Panel de overpayment para destino PRESTAMO */}
          {estaOverpagoPrestamo && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">
                Excedente: {formatUsd(excedentePrestamo)} — ¿Cómo se gestiona?
              </p>
              <div className="flex gap-2">
                {([
                  { mode: 'SAF' as OverpayMode, label: 'Saldo a favor' },
                  { mode: 'VUELTO' as OverpayMode, label: 'Dar vuelto' },
                ] as { mode: OverpayMode; label: string }[]).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOverpayMode(mode)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ${
                      overpayMode === mode
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {overpayMode === 'SAF' && (
                <p className="text-xs text-amber-700">
                  El excedente de {formatUsd(excedentePrestamo)} quedará como crédito en la cuenta del cliente.
                </p>
              )}
              {overpayMode === 'VUELTO' && (
                <p className="text-xs text-amber-700">
                  Se registrará un egreso de {formatUsd(excedentePrestamo)} por concepto de vuelto.
                </p>
              )}
            </div>
          )}

          {/* Referencia */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Referencia (opcional)
            </label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nro. transferencia, etc."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {loading ? 'Registrando...' : `Pagar ${formatUsd(montoUsd)}`}
            </Button>
          </div>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
