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
  aplicarSaldoFavor,
  useFacturasPendientes,
  type VentaPendiente,
  type VencimientoVenta,
  type VencimientoPrestamo,
} from '../hooks/use-cxc'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'

type OverpayMode = 'VUELTO' | 'SAF' | 'PROPINA' | null
type SafSubMode = 'FIFO' | 'DIRECTO' | null

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

  // Overpayment
  const [overpayMode, setOverpayMode] = useState<OverpayMode>(null)
  const [safSubMode, setSafSubMode] = useState<SafSubMode>(null)

  // Cargar otras facturas pendientes para preview FIFO (solo cuando hay overpago)
  const { facturas: todasFacturas } = useFacturasPendientes(clienteId || null)

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
      setSafSubMode(null)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-seleccionar préstamo al cambiar destino
  useEffect(() => {
    if (destino === 'PRESTAMO' && prestamosActivos.length === 1) {
      setVencimientoId(prestamosActivos[0].id)
    }
    setMontoStr('')
    setOverpayMode(null)
    setSafSubMode(null)
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
    setSafSubMode(null)
    onClose()
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

  // Para pago USD: monto directo. Para pago BS: se divide por la tasa
  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaNum) : montoNum
  const montoBs = moneda === 'USD' ? usdToBs(montoNum, tasaNum) : montoNum

  // Overpayment — solo aplica para destino FACTURA
  const estaOverpago = destino === 'FACTURA' && montoUsd > saldoEfectivo + 0.01
  const excedenteUsd = estaOverpago ? Number((montoUsd - saldoEfectivo).toFixed(2)) : 0

  // Para PRESTAMO: mantener el bloqueo actual
  const excedeSaldoPrestamo = destino === 'PRESTAMO' && montoUsd > saldoEfectivo + 0.01
  const overpayResuelto = !estaOverpago || (
    overpayMode !== null &&
    (overpayMode !== 'SAF' || safSubMode !== null)
  )

  const sinTasa = tasaNum <= 0
  const destinoPrestamoInvalido = destino === 'PRESTAMO' && !vencimientoId
  const canSubmit =
    !!metodoCobro && montoNum > 0 && !excedeSaldoPrestamo && !loading &&
    tasaNum > 0 && !destinoPrestamoInvalido && overpayResuelto

  // Otras facturas para FIFO preview (excluir la actual)
  const otrasFacturas = todasFacturas.filter(f => f.id !== factura?.id)

  // Calcular FIFO preview para el excedente sobre otras facturas
  const fifoPreviewSaf = (() => {
    if (!estaOverpago || excedenteUsd <= 0) return []
    let restante = excedenteUsd
    const result: { id: string; nro_factura: string; saldo: number; aplicar: number }[] = []
    for (const f of otrasFacturas) {
      if (restante <= 0.01) break
      const saldo = parseFloat(f.saldo_pend_usd)
      const aplicar = Math.min(saldo, restante)
      result.push({ id: f.id, nro_factura: f.nro_factura, saldo, aplicar })
      restante = Number((restante - aplicar).toFixed(2))
    }
    return result
  })()

  function handlePayMax() {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoEfectivo, tasaNum > 0 ? tasaNum : tasaValor).toFixed(2))
    } else {
      setMontoStr(saldoEfectivo.toFixed(2))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !user?.empresa_id || !user.id) return

    setLoading(true)
    try {
      if (destino === 'PRESTAMO') {
        await registrarAbonoPrestamo({
          vencimiento_id: vencimientoId,
          metodo_cobro_id: metodoCobro,
          moneda,
          tasa: tasaNum,
          monto: montoNum,
          fechaPago,
          referencia: referencia.trim() || undefined,
          empresa_id: user.empresa_id,
          procesado_por: user.id,
          procesado_por_nombre: user.nombre,
        })
        toast.success(`Abono de ${formatUsd(montoUsd)} registrado al préstamo`)
      } else {
        if (!factura) return

        if (estaOverpago && overpayMode) {
          // Calcular monto exacto del saldo en la moneda original
          const montoSaldo = moneda === 'BS' ? usdToBs(saldoEfectivo, tasaNum) : saldoEfectivo
          const montoExcedente = moneda === 'BS' ? usdToBs(excedenteUsd, tasaNum) : excedenteUsd

          if (overpayMode === 'SAF') {
            // Pagar solo el saldo exacto de la factura
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
            // Si FIFO: aplicar el crédito generado a otras facturas
            if (safSubMode === 'FIFO' && fifoPreviewSaf.length > 0) {
              const assignments = fifoPreviewSaf.map(f => ({
                ventaId: f.id,
                nroFactura: f.nro_factura,
                montoAplicarUsd: f.aplicar,
              }))
              await aplicarSaldoFavor({
                clienteId,
                empresaId: user.empresa_id,
                cajeroId: user.id,
                tasa: tasaNum,
                facturas: assignments,
                totalAplicadoUsd: fifoPreviewSaf.reduce((sum, f) => sum + f.aplicar, 0),
              })
            }
            const safLabel = safSubMode === 'FIFO' ? 'SAF aplicado a facturas pendientes' : 'Crédito registrado como saldo a favor'
            toast.success(`Factura pagada. ${safLabel} (${formatUsd(excedenteUsd)})`)
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
          // Pago normal (sin overpago)
          await registrarPagoFactura({
            venta_id: factura.id,
            cliente_id: clienteId,
            metodo_cobro_id: metodoCobro,
            moneda,
            tasa: tasaNum,
            monto: montoNum,
            fechaPago,
            referencia: referencia.trim() || undefined,
            empresa_id: user.empresa_id,
            procesado_por: user.id,
            procesado_por_nombre: user.nombre,
          })
          toast.success(`Pago de ${formatUsd(montoUsd)} registrado a factura ${factura.nro_factura}`)
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
                <div className="flex justify-between">
                  <span className="text-purple-700">Total c/interés:</span>
                  <span className="font-medium">{formatUsd(parseFloat(vencSeleccionado.monto_original_usd))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700">Pagado:</span>
                  <span className="text-green-700">{formatUsd(parseFloat(vencSeleccionado.monto_pagado_usd))}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-purple-800">Saldo pendiente:</span>
                  <span className="text-destructive">{formatUsd(saldoPrestamo)}</span>
                </div>
                <div className="flex justify-between text-purple-700 text-xs">
                  <span>Fecha vencimiento:</span>
                  <span>{vencSeleccionado.fecha_vencimiento}</span>
                </div>
                {tasaNum > 0 && (
                  <div className="flex justify-between text-purple-600 text-xs">
                    <span>Equivalente Bs:</span>
                    <span>{formatBs(usdToBs(saldoPrestamo, tasaNum))}</span>
                  </div>
                )}
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
                setSafSubMode(null)
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
            {excedeSaldoPrestamo && (
              <p className="text-xs text-destructive">
                El monto excede el saldo pendiente del préstamo
              </p>
            )}
          </div>

          {/* Panel de overpayment — solo para destino FACTURA */}
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
                    onClick={() => { setOverpayMode(mode); setSafSubMode(null) }}
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

              {/* Sub-opciones SAF */}
              {overpayMode === 'SAF' && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSafSubMode('DIRECTO')}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ${
                        safSubMode === 'DIRECTO'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      Dejar como crédito
                    </button>
                    <button
                      type="button"
                      onClick={() => setSafSubMode('FIFO')}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ${
                        safSubMode === 'FIFO'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      Aplicar a facturas (FIFO)
                    </button>
                  </div>

                  {/* Preview FIFO */}
                  {safSubMode === 'FIFO' && fifoPreviewSaf.length > 0 && (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-2 py-1 font-medium">Factura</th>
                            <th className="text-right px-2 py-1 font-medium">Aplicar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fifoPreviewSaf.map(p => (
                            <tr key={p.nro_factura} className="border-b border-muted">
                              <td className="px-2 py-1 font-mono">#{p.nro_factura}</td>
                              <td className="px-2 py-1 text-right text-green-600 font-medium">
                                {formatUsd(p.aplicar)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {safSubMode === 'FIFO' && fifoPreviewSaf.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No hay otras facturas pendientes. El excedente quedará como crédito.
                    </p>
                  )}
                </div>
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
      </DialogContent>
    </Dialog>
  )
}
