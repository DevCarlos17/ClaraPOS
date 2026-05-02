import { useRef, useEffect, useState } from 'react'
import { X, Package, CreditCard, RotateCcw, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useDetalleFactura, usePagosFactura, useCargosEspecialesVenta, registrarReversoAbono, type VentaPendiente, type PagoFacturaCxc } from '../hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'

interface FacturaDetalleCxcProps {
  isOpen: boolean
  onClose: () => void
  factura: VentaPendiente | null
}

function formatFecha(fecha: string): string {
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

function formatFechaHora(fecha: string): string {
  try {
    return new Date(fecha).toLocaleString('es-VE', {
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

// =============================================
// ReversarAbonoDialog — inline
// =============================================

interface ReversarAbonoDialogProps {
  isOpen: boolean
  pago: PagoFacturaCxc | null
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
// FacturaDetalleCxc
// =============================================

export function FacturaDetalleCxc({ isOpen, onClose, factura }: FacturaDetalleCxcProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()
  const { detalle, isLoading: loadingDetalle } = useDetalleFactura(factura?.id ?? null)
  const { pagos, isLoading: loadingPagos } = usePagosFactura(factura?.id ?? null)
  const { cargos: cargosEspeciales } = useCargosEspecialesVenta(factura?.id ?? null)

  // Reverso state
  const [pagoAReverse, setPagoAReverse] = useState<PagoFacturaCxc | null>(null)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [showReasonDialog, setShowReasonDialog] = useState(false)
  const [supervisorId, setSupervisorId] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  if (!factura) return null

  const totalUsd = parseFloat(factura.total_usd)
  const totalBs = parseFloat(factura.total_bs)
  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const totalAbonado = totalUsd - saldoPend

  // Solo pagos activos (no reversados) cuentan para el total pagado
  const totalPagado = pagos
    .filter((p) => !p.is_reversed)
    .reduce((sum, p) => sum + parseFloat(p.monto_usd), 0)

  // ---- Flujo de reverso ----
  function handleReversar(pago: PagoFacturaCxc) {
    setPagoAReverse(pago)
    if (hasPermission(PERMISSIONS.CXC_REVERSE)) {
      // Tiene permiso directo → pedir razon
      setSupervisorId(user!.id)
      setShowReasonDialog(true)
    } else {
      // Sin permiso → pedir PIN supervisor
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
      // Obtener nombre del que autoriza
      const reversedByNombre = hasPermission(PERMISSIONS.CXC_REVERSE)
        ? user.nombre
        : 'Supervisor'

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

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
        className="backdrop:bg-black/60 rounded-lg p-0 w-full max-w-3xl shadow-xl"
      >
        <div className="p-6 max-h-[85vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Factura #{factura.nro_factura}</h2>
              <p className="text-sm text-muted-foreground">{formatFecha(factura.fecha)}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Resumen de montos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Total</p>
              <p className="font-bold">{formatUsd(totalUsd)}</p>
              {tasaValor > 0 && <p className="text-xs text-muted-foreground">{formatBs(totalBs)}</p>}
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Tasa usada</p>
              <p className="font-bold text-sm">{parseFloat(factura.tasa).toFixed(4)}</p>
            </div>
            <div className="rounded-lg border bg-green-50 p-3 text-center">
              <p className="text-xs text-green-700/70 mb-0.5">Abonado</p>
              <p className="font-bold text-green-700">{formatUsd(totalAbonado)}</p>
            </div>
            <div className="rounded-lg border bg-red-50 p-3 text-center">
              <p className="text-xs text-red-700/70 mb-0.5">Pendiente</p>
              <p className="font-bold text-red-600">{formatUsd(saldoPend)}</p>
              {tasaValor > 0 && (
                <p className="text-xs text-red-700/50">{formatBs(usdToBs(saldoPend, tasaValor))}</p>
              )}
            </div>
          </div>

          {/* Articulos */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Package size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold">Articulos</h3>
            </div>
            {loadingDetalle ? (
              <div className="h-20 bg-muted rounded animate-pulse" />
            ) : detalle.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin detalle disponible</p>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium text-xs">Codigo</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Producto</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Cant</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">P.Unit</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((d) => {
                      const cant = parseFloat(d.cantidad)
                      const precio = parseFloat(d.precio_unitario_usd)
                      const subt = parseFloat(d.subtotal_usd)
                      return (
                        <tr key={d.id} className="border-b border-muted">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {d.producto_codigo}
                          </td>
                          <td className="px-3 py-2">{d.producto_nombre}</td>
                          <td className="px-3 py-2 text-right">
                            {cant % 1 === 0 ? cant.toFixed(0) : cant.toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatUsd(precio)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatUsd(subt)}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-muted/30">
                      <td colSpan={4} className="px-3 py-2 text-right font-semibold text-xs uppercase">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-bold">{formatUsd(totalUsd)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cargos especiales (avance / prestamo) */}
          {cargosEspeciales.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={14} className="text-amber-600" />
                <h3 className="text-sm font-semibold">Cargos especiales</h3>
              </div>
              <div className="overflow-x-auto border border-amber-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-amber-50">
                      <th className="text-left px-3 py-2 font-medium text-xs">Tipo</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Concepto</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Fecha</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Efectivo entregado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargosEspeciales.map((c) => (
                      <tr key={c.id} className="border-b border-amber-100">
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            c.tipo === 'PRESTAMO'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {c.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{c.concepto}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {formatFecha(c.fecha)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatUsd(parseFloat(c.monto))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Abonos recibidos */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold">Abonos recibidos</h3>
            </div>
            {loadingPagos ? (
              <div className="h-16 bg-muted rounded animate-pulse" />
            ) : pagos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                Sin pagos registrados
              </p>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium text-xs">Fecha</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Metodo</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Moneda</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Monto orig.</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Equiv. USD</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Tasa</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Ref.</th>
                      <th className="text-left px-3 py-2 font-medium text-xs">Procesado por</th>
                      <th className="px-3 py-2 font-medium text-xs"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => {
                      const montoOrig = parseFloat(p.monto)
                      const montoUsdVal = parseFloat(p.monto_usd)
                      const tasaPago = parseFloat(p.tasa)
                      const isReversed = p.is_reversed === 1
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-muted transition-opacity ${isReversed ? 'opacity-50' : ''}`}
                        >
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {formatFechaHora(p.fecha)}
                          </td>
                          <td className={`px-3 py-2 ${isReversed ? 'line-through text-muted-foreground' : ''}`}>
                            {p.metodo_nombre}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              p.moneda_label === 'BS' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                            }`}>
                              {p.moneda_label}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${isReversed ? 'line-through text-muted-foreground' : ''}`}>
                            {p.moneda_label === 'BS' ? formatBs(montoOrig) : formatUsd(montoOrig)}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${isReversed ? 'line-through text-muted-foreground' : 'text-green-700'}`}>
                            {formatUsd(montoUsdVal)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                            {tasaPago.toFixed(4)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {p.referencia || '-'}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {p.procesado_por_nombre || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {isReversed ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive whitespace-nowrap">
                                  REVERSADO
                                </span>
                                {p.reversed_reason && (
                                  <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={p.reversed_reason}>
                                    {p.reversed_reason}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleReversar(p)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors whitespace-nowrap"
                              >
                                <RotateCcw size={12} />
                                Reversar
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="bg-muted/30">
                      <td colSpan={4} className="px-3 py-2 text-right font-semibold text-xs uppercase">
                        Total pagado
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-green-700">
                        {formatUsd(totalPagado)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Resumen saldo */}
            {pagos.length > 0 && (
              <div className="mt-3 flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">
                  Pagado: <span className="font-medium text-green-700">{formatUsd(totalPagado)}</span>
                </span>
                <span className="text-muted-foreground">
                  Pendiente:{' '}
                  <span className={`font-bold ${saldoPend > 0.001 ? 'text-red-600' : 'text-green-700'}`}>
                    {formatUsd(saldoPend)}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-5">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
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
