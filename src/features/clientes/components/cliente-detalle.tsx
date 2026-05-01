import { useRef, useEffect, useState, useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { X, Phone, MapPin, CreditCard, RotateCcw, Printer, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import {
  useMovimientosClienteFiltrados,
  useCountMovimientosCliente,
  type Cliente,
  type MovimientoCuenta,
} from '@/features/clientes/hooks/use-clientes'
import { usePagosCliente, registrarReversoAbono, type PagoClienteCxc } from '@/features/cxc/hooks/use-cxc'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

interface ClienteDetalleProps {
  isOpen: boolean
  onClose: () => void
  cliente?: Cliente
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  FAC: { label: 'Factura', color: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  PAG: { label: 'Pago', color: 'bg-green-50 text-green-700 ring-green-600/20' },
  NCR: { label: 'Nota Credito', color: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  NDB: { label: 'Nota Debito', color: 'bg-red-50 text-red-700 ring-red-600/20' },
  REV: { label: 'Reverso', color: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
}

function formatFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return fecha
  }
}

function formatFechaCorta(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha
  }
}

// =============================================
// Generar reporte imprimible
// =============================================

function generarReporteEstadoCuenta(
  cliente: Cliente,
  movimientos: MovimientoCuenta[],
  opts: { fechaDesde?: string; fechaHasta?: string; tasaValor: number; saldoActual: number }
) {
  const { fechaDesde, fechaHasta, tasaValor, saldoActual } = opts
  const periodoLabel = fechaDesde || fechaHasta
    ? `${fechaDesde ? formatFechaCorta(fechaDesde) : 'Inicio'} — ${fechaHasta ? formatFechaCorta(fechaHasta) : 'Hoy'}`
    : 'Todos los registros'

  const filas = movimientos.map((mov) => {
    const tipo = TIPO_LABELS[mov.tipo] ?? { label: mov.tipo, color: '' }
    let detallePago = '-'
    if ((mov.tipo === 'PAG' || mov.tipo === 'REV') && mov.moneda_pago && mov.monto_moneda && mov.tasa_pago) {
      const montoOrigFmt = mov.moneda_pago === 'BS'
        ? formatBs(parseFloat(mov.monto_moneda))
        : formatUsd(parseFloat(mov.monto_moneda))
      detallePago = `${montoOrigFmt} @ ${parseFloat(mov.tasa_pago).toFixed(4)}`
    }
    return `
      <tr>
        <td>${formatFecha(mov.fecha)}</td>
        <td><span class="badge badge-${mov.tipo.toLowerCase()}">${tipo.label}</span></td>
        <td class="mono">${mov.referencia}</td>
        <td class="right">${formatUsd(mov.monto)}</td>
        <td class="right">${formatUsd(mov.saldo_anterior)}</td>
        <td class="right bold">${formatUsd(mov.saldo_nuevo)}</td>
        <td class="obs">${detallePago}</td>
        <td class="obs">${mov.observacion || '-'}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Estado de Cuenta — ${cliente.nombre}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
  .header { margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; }
  .header h1 { font-size: 18px; font-weight: bold; }
  .header .sub { color: #555; margin-top: 2px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .info-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; }
  .info-box .label { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: .5px; }
  .info-box .value { font-size: 14px; font-weight: bold; margin-top: 2px; }
  .info-box .value.deuda { color: #dc2626; }
  .info-box .value.ok { color: #16a34a; }
  h2 { font-size: 13px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead tr { background: #f3f4f6; }
  th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; font-weight: bold; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .mono { font-family: monospace; }
  .obs { color: #666; max-width: 180px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 12px; font-size: 9.5px; font-weight: 600; }
  .badge-fac { background: #eff6ff; color: #1d4ed8; }
  .badge-pag { background: #f0fdf4; color: #166534; }
  .badge-ncr { background: #fffbeb; color: #92400e; }
  .badge-ndb { background: #fef2f2; color: #991b1b; }
  .badge-rev { background: #fff1f2; color: #be123c; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; color: #888; font-size: 10px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Estado de Cuenta</h1>
    <div class="sub">${cliente.nombre} — ${cliente.identificacion}</div>
    <div class="sub">Periodo: ${periodoLabel}</div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="label">Saldo actual</div>
      <div class="value ${saldoActual > 0 ? 'deuda' : 'ok'}">${formatUsd(saldoActual)}</div>
      ${tasaValor > 0 ? `<div style="color:#999;font-size:10px;margin-top:2px">${formatBs(usdToBs(saldoActual, tasaValor))}</div>` : ''}
    </div>
    <div class="info-box">
      <div class="label">Limite de credito</div>
      <div class="value">${formatUsd(cliente.limite_credito_usd)}</div>
    </div>
    <div class="info-box">
      <div class="label">Movimientos en reporte</div>
      <div class="value">${movimientos.length}</div>
    </div>
  </div>

  <h2>Movimientos</h2>
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Tipo</th>
        <th>Referencia</th>
        <th class="right">Monto</th>
        <th class="right">Saldo Ant.</th>
        <th class="right">Saldo Nuevo</th>
        <th>Detalle Pago</th>
        <th>Observacion</th>
      </tr>
    </thead>
    <tbody>
      ${filas || '<tr><td colspan="8" style="text-align:center;color:#999;padding:16px">Sin movimientos en el periodo</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    Generado el ${new Date().toLocaleString('es-VE')} · ClaraPOS
  </div>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

// =============================================
// ReversarAbonoDialog — inline (native dialog)
// =============================================

interface ReversarAbonoDialogProps {
  isOpen: boolean
  pago: PagoClienteCxc | null
  onClose: () => void
  onConfirm: (reason: string) => void
  loading: boolean
}

function ReversarAbonoDialog({ isOpen, pago, onClose, onConfirm, loading }: ReversarAbonoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setReason('')
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  if (!pago) return null

  const montoUsd = parseFloat(pago.monto_usd)

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current && !loading) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/60 rounded-xl shadow-2xl p-0 w-full max-w-sm mx-4 border bg-card"
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <RotateCcw size={18} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Reversar abono</h3>
            <p className="text-xs text-muted-foreground">
              {formatUsd(montoUsd)} — {pago.metodo_nombre}
              {pago.nro_factura ? ` · Fac. #${pago.nro_factura}` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Razon del reverso <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Error en el monto registrado, pago duplicado..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(reason)}
              disabled={loading || !reason.trim()}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Reversando...' : 'Confirmar reverso'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}

// =============================================
// ClienteDetalle
// =============================================

export function ClienteDetalle({ isOpen, onClose, cliente }: ClienteDetalleProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()

  // Date filter state
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const { movimientos, isLoading } = useMovimientosClienteFiltrados(
    isOpen ? cliente?.id : undefined,
    { fechaDesde: fechaDesde || undefined, fechaHasta: fechaHasta || undefined }
  )
  const { total: totalMovimientos } = useCountMovimientosCliente(isOpen ? cliente?.id : undefined)
  const { pagos } = usePagosCliente(isOpen ? (cliente?.id ?? null) : null)

  // Live saldo — reacts to changes after reversals
  const { data: saldoData } = useQuery(
    cliente?.id ? 'SELECT saldo_actual FROM clientes WHERE id = ?' : '',
    cliente?.id ? [cliente.id] : []
  )
  const saldo = parseFloat(
    (saldoData?.[0] as { saldo_actual: string } | undefined)?.saldo_actual ??
    cliente?.saldo_actual ??
    '0'
  )

  // Build pago lookup: key = "venta_id:fecha" → pago
  // Matches PAG movements (from registrarPagoFactura) to their individual pago record.
  // ABONO-GLOBAL movements have venta_id = null so they won't match — no reversal for those.
  const pagoMap = useMemo(() => {
    const map = new Map<string, PagoClienteCxc>()
    pagos.forEach((p) => {
      if (p.venta_id) {
        map.set(`${p.venta_id}:${p.fecha}`, p)
      }
    })
    return map
  }, [pagos])

  // Reverso state
  const [pagoAReverse, setPagoAReverse] = useState<PagoClienteCxc | null>(null)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [showReasonDialog, setShowReasonDialog] = useState(false)
  const [supervisorId, setSupervisorId] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
      setFechaDesde('')
      setFechaHasta('')
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  // ---- Reverso flow ----
  function handleReversar(pago: PagoClienteCxc) {
    setPagoAReverse(pago)
    if (hasPermission(PERMISSIONS.CXC_REVERSE)) {
      setSupervisorId(user!.id)
      setShowReasonDialog(true)
    } else {
      setShowPinDialog(true)
    }
  }

  function handlePinAuthorized(supId: string) {
    setSupervisorId(supId)
    setShowPinDialog(false)
    setShowReasonDialog(true)
  }

  async function handleConfirmReverso(reason: string) {
    if (!pagoAReverse || !supervisorId || !user) return
    setReversing(true)
    try {
      const reversedByNombre = hasPermission(PERMISSIONS.CXC_REVERSE) ? user.nombre : 'Supervisor'
      await registrarReversoAbono({
        pago_id: pagoAReverse.id,
        reason,
        reversed_by: supervisorId,
        reversed_by_nombre: reversedByNombre,
        empresa_id: user.empresa_id!,
      })
      toast.success(`Abono de ${formatUsd(parseFloat(pagoAReverse.monto_usd))} reversado exitosamente`)
      setShowReasonDialog(false)
      setPagoAReverse(null)
      setSupervisorId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al reversar el abono')
    } finally {
      setReversing(false)
    }
  }

  function handleCloseReason() {
    if (reversing) return
    setShowReasonDialog(false)
    setPagoAReverse(null)
    setSupervisorId(null)
  }

  function handleClosePin() {
    setShowPinDialog(false)
    setPagoAReverse(null)
  }

  // ---- Report ----
  function handleGenerarReporte() {
    if (!cliente) return
    generarReporteEstadoCuenta(cliente, movimientos, {
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      tasaValor,
      saldoActual: saldo,
    })
  }

  if (!cliente) return null

  const hasFilter = !!fechaDesde || !!fechaHasta

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
        className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl"
      >
        <div className="p-6 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{cliente.identificacion}</span>
                {cliente.is_active === 1 ? (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                    Activo
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                    Inactivo
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold mt-1">{cliente.nombre}</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Info + Saldo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="sm:col-span-2 space-y-2">
              {cliente.telefono && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 text-muted-foreground/60" />
                  {cliente.telefono}
                </div>
              )}
              {cliente.direccion && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                  {cliente.direccion}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="h-4 w-4 text-muted-foreground/60" />
                Limite: {formatUsd(cliente.limite_credito_usd)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground mb-1">Saldo Actual</p>
              <p className={`text-2xl font-bold ${saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatUsd(saldo)}
              </p>
              {tasaValor > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatBs(usdToBs(saldo, tasaValor))}
                </p>
              )}
            </div>
          </div>

          {/* Filtro de fechas + Reporte */}
          <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg border bg-muted/20">
            <Calendar size={15} className="text-muted-foreground mb-0.5" />
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                autoComplete="off"
                className="rounded-md border border-input bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                autoComplete="off"
                className="rounded-md border border-input bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {hasFilter && (
              <button
                type="button"
                onClick={() => { setFechaDesde(''); setFechaHasta('') }}
                className="text-xs text-muted-foreground hover:text-foreground underline mb-1.5"
              >
                Limpiar filtro
              </button>
            )}
            <div className="ml-auto">
              <button
                type="button"
                onClick={handleGenerarReporte}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors cursor-pointer"
              >
                <Printer size={14} />
                Generar reporte
              </button>
            </div>
          </div>

          {/* Estado de Cuenta */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Estado de Cuenta</h3>
              <span className="text-xs text-muted-foreground">
                {hasFilter
                  ? `${movimientos.length} movimiento(s) en el periodo`
                  : `Ultimos 5 de ${totalMovimientos} movimientos`}
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : movimientos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                <p className="text-sm font-medium">Sin movimientos</p>
                <p className="text-xs mt-1">
                  {hasFilter
                    ? 'No hay movimientos en el rango de fechas seleccionado'
                    : 'Los movimientos se crearan automaticamente al registrar ventas y pagos'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium text-xs whitespace-nowrap">Fecha</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Tipo</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Referencia</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Monto</th>
                      <th className="text-right px-3 py-2 font-medium text-xs whitespace-nowrap">Saldo</th>
                      <th className="text-left px-3 py-2 font-medium text-xs whitespace-nowrap">Procesado por</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Observacion</th>
                      <th className="px-3 py-2 font-medium text-xs w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((mov) => {
                      const tipo = TIPO_LABELS[mov.tipo] ?? {
                        label: mov.tipo,
                        color: 'bg-gray-50 text-gray-700 ring-gray-600/20',
                      }
                      // Match PAG movements with venta_id to their individual pago record
                      const matchedPago =
                        mov.tipo === 'PAG' && mov.venta_id
                          ? pagoMap.get(`${mov.venta_id}:${mov.fecha}`)
                          : undefined
                      const isReversed = matchedPago?.is_reversed === 1

                      return (
                        <tr
                          key={mov.id}
                          className={`border-b border-muted ${isReversed ? 'opacity-50' : ''}`}
                        >
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {formatFecha(mov.fecha)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tipo.color}`}
                            >
                              {tipo.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{mov.referencia}</td>
                          <td
                            className={`px-3 py-2 text-right font-medium text-xs ${isReversed ? 'line-through text-muted-foreground' : ''}`}
                          >
                            {formatUsd(mov.monto)}
                            {(mov.tipo === 'PAG' || mov.tipo === 'REV') && mov.moneda_pago === 'BS' && mov.monto_moneda && mov.tasa_pago && (
                              <div className="text-muted-foreground font-normal text-[10px] leading-tight whitespace-nowrap">
                                {formatBs(parseFloat(mov.monto_moneda))} @ {parseFloat(mov.tasa_pago).toFixed(4)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {formatUsd(mov.saldo_anterior)} → {formatUsd(mov.saldo_nuevo)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {matchedPago?.procesado_por_nombre ?? '-'}
                          </td>
                          <td
                            className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate"
                            title={mov.observacion ?? ''}
                          >
                            {mov.observacion || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {matchedPago ? (
                              isReversed ? (
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive whitespace-nowrap">
                                    REVERSADO
                                  </span>
                                  {matchedPago.reversed_reason && (
                                    <span
                                      className="text-xs text-muted-foreground max-w-[100px] truncate"
                                      title={matchedPago.reversed_reason}
                                    >
                                      {matchedPago.reversed_reason}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleReversar(matchedPago)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors whitespace-nowrap"
                                >
                                  <RotateCcw size={12} />
                                  Reversar
                                </button>
                              )
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>

      {/* PIN supervisor dialog */}
      <SupervisorPinDialog
        isOpen={showPinDialog}
        onClose={handleClosePin}
        onAuthorized={handlePinAuthorized}
        titulo="Autorización requerida"
        mensaje="Ingresa el PIN de supervisor para reversar este abono."
        requiredPermission={PERMISSIONS.CXC_REVERSE}
      />

      {/* Reason dialog */}
      <ReversarAbonoDialog
        isOpen={showReasonDialog}
        pago={pagoAReverse}
        onClose={handleCloseReason}
        onConfirm={handleConfirmReverso}
        loading={reversing}
      />
    </>
  )
}
