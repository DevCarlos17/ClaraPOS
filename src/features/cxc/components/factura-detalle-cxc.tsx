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
      className="m-auto backdrop:bg-black/60 rounded-xl shadow-2xl p-0 w-full max-w-sm border bg-card"
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
        className="m-auto backdrop:bg-black/60 rounded-xl p-0 w-full max-w-3xl shadow-2xl bg-card border"
      >
        <div className="max-h-[88vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <CreditCard size={16} className="text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Factura #{factura.nro_factura}</h2>
                <p className="text-xs text-muted-foreground">{formatFecha(factura.fecha)}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="p-6 space-y-6">
          {/* Resumen de montos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-card border shadow-sm p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total factura</p>
              <p className="text-lg font-bold">{formatUsd(totalUsd)}</p>
              {tasaValor > 0 && <p className="text-xs text-muted-foreground mt-0.5">{formatBs(totalBs)}</p>}
            </div>
            <div className="rounded-xl bg-card border shadow-sm p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Tasa usada</p>
              <p className="text-lg font-bold">{parseFloat(factura.tasa).toFixed(4)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Bs/USD</p>
            </div>
            <div className="rounded-xl bg-green-50 border border-green-200/60 shadow-sm p-3 text-center">
              <p className="text-xs text-green-700/70 mb-1">Abonado</p>
              <p className="text-lg font-bold text-green-700">{formatUsd(totalAbonado)}</p>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-200/60 shadow-sm p-3 text-center">
              <p className="text-xs text-red-700/70 mb-1">Pendiente</p>
              <p className="text-lg font-bold text-red-600">{formatUsd(saldoPend)}</p>
              {tasaValor > 0 && (
                <p className="text-xs text-red-700/50 mt-0.5">{formatBs(usdToBs(saldoPend, tasaValor))}</p>
              )}
            </div>
          </div>

          {/* Articulos */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold">Articulos</h3>
            </div>
            {loadingDetalle ? (
              <div className="h-20 bg-muted rounded animate-pulse" />
            ) : detalle.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin detalle disponible</p>
            ) : (
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Codigo</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Producto</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Cant</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">P.Unit USD</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((d) => {
                      const cant = parseFloat(d.cantidad)
                      const precio = parseFloat(d.precio_unitario_usd)
                      const subt = parseFloat(d.subtotal_usd)
                      return (
                        <tr key={d.id} className="border-b border-muted hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                            {d.producto_codigo}
                          </td>
                          <td className="px-3 py-2.5 font-medium">{d.producto_nombre}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">
                            {cant % 1 === 0 ? cant.toFixed(0) : cant.toFixed(3)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{formatUsd(precio)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold">{formatUsd(subt)}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-primary/5 border-t-2 border-primary/20">
                      <td colSpan={4} className="px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                        Total factura
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-base">{formatUsd(totalUsd)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cargos especiales (avance / prestamo) */}
          {cargosEspeciales.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Wallet size={14} className="text-amber-600" />
                <h3 className="text-sm font-semibold">Cargos especiales</h3>
              </div>
              <div className="overflow-x-auto border border-amber-200/60 rounded-xl bg-amber-50/30">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-200/60 bg-amber-50">
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-amber-800">Tipo</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-amber-800">Concepto</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-amber-800">Fecha</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-amber-800">Efectivo entregado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargosEspeciales.map((c) => (
                      <tr key={c.id} className="border-b border-amber-100">
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            c.tipo === 'PRESTAMO'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {c.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{c.concepto}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatFecha(c.fecha)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
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
            <div className="flex items-center gap-2 mb-3">
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
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Fecha</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Metodo</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Moneda</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Monto orig.</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Equiv. USD</th>
                      <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Tasa</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Ref.</th>
                      <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Procesado por</th>
                      <th className="px-3 py-2.5 font-medium text-xs"></th>
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
                    <tr className="bg-green-50 border-t-2 border-green-200/60">
                      <td colSpan={4} className="px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                        Total pagado
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-700">
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
              <div className="mt-3 flex items-center justify-end gap-6 rounded-lg bg-muted/40 border px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">
                  Pagado: <span className="font-semibold text-green-700">{formatUsd(totalPagado)}</span>
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

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
          </div>{/* end p-6 space-y-6 */}
        </div>{/* end max-h overflow-y-auto */}
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
