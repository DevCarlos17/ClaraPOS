import { CheckCircle, Warning, Clock, Handshake, Vault, Bank } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatUsd } from '@/lib/currency'
import {
  useHistorialPrestamo,
  type VencimientoPrestamo,
} from '@/features/cxc/hooks/use-cxc'

// ─── Helpers ──────────────────────────────────────────────────

function getDiasRestantes(fechaVenc: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const venc = new Date(fechaVenc + 'T00:00:00')
  return Math.floor((venc.getTime() - today.getTime()) / 86400000)
}

function formatFecha(fecha: string): string {
  try {
    const dateStr = fecha.length === 10 ? fecha + 'T00:00:00' : fecha
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha.slice(0, 10)
  }
}

function OrigenFondosBadge({ tipo }: { tipo: string }) {
  if (!tipo || tipo === 'CAJA') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Caja activa
      </span>
    )
  }
  if (tipo === 'EFECTIVO_EMPRESA') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
        <Vault size={11} weight="fill" />
        Efectivo empresa
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-600">
      <Bank size={11} weight="fill" />
      Banco
    </span>
  )
}

function StatusBadge({ status, fechaVenc }: { status: string; fechaVenc: string }) {
  const dias = getDiasRestantes(fechaVenc)
  const isPagado = status === 'PAGADO'
  const isVencido = dias < 0 && status === 'PENDIENTE'
  const isProximo = dias >= 0 && dias <= 7 && status === 'PENDIENTE'
  const diasAbs = Math.abs(dias)

  if (isPagado) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
        <CheckCircle size={12} weight="fill" /> Pagado
      </span>
    )
  }
  if (isVencido) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
          <Warning size={12} weight="fill" /> Vencido
        </span>
        <span className="text-xs text-red-500 pl-1">hace {diasAbs} día{diasAbs !== 1 ? 's' : ''}</span>
      </div>
    )
  }
  if (isProximo) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          <Clock size={12} weight="fill" /> Próximo a vencer
        </span>
        <span className="text-xs text-amber-500 pl-1">en {diasAbs} día{diasAbs !== 1 ? 's' : ''}</span>
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
      Pendiente
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────

interface PrestamoDetalleModalProps {
  isOpen: boolean
  onClose: () => void
  prestamo: VencimientoPrestamo | null
}

// ─── Componente ───────────────────────────────────────────────

export function PrestamoDetalleModal({ isOpen, onClose, prestamo }: PrestamoDetalleModalProps) {
  const { historial, isLoading } = useHistorialPrestamo(prestamo?.id ?? null)

  if (!prestamo) return null

  const montoOriginal = parseFloat(prestamo.monto_original_usd)
  const montoPagado = parseFloat(prestamo.monto_pagado_usd)
  const saldoPend = parseFloat(prestamo.saldo_pendiente_usd)
  const porcentajePagado = montoOriginal > 0 ? (montoPagado / montoOriginal) * 100 : 0

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 shrink-0">
              <Handshake size={16} className="text-purple-600" />
            </div>
            <div>
              <DialogTitle>Detalle de Préstamo</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cuota {prestamo.nro_cuota}
                {prestamo.nro_factura ? ` · Factura #${prestamo.nro_factura}` : ' · Sin factura asociada'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── Encabezado del préstamo ─────────────────── */}
          <div className="rounded-lg bg-purple-50/60 border border-purple-200/60 p-4 space-y-3">
            <div>
              <div className="text-base font-semibold text-foreground">
                {prestamo.cliente_nombre}
              </div>
              <div className="text-xs text-muted-foreground">
                {prestamo.nro_factura
                  ? `Factura de referencia: #${prestamo.nro_factura}`
                  : 'Sin factura asociada'
                }
              </div>
            </div>

            <div className="flex items-start justify-between">
              <StatusBadge status={prestamo.status} fechaVenc={prestamo.fecha_vencimiento} />
              <div className="text-right text-xs text-muted-foreground space-y-1">
                <div>
                  <div>Fecha vencimiento</div>
                  <div className="font-medium text-foreground">{formatFecha(prestamo.fecha_vencimiento)}</div>
                </div>
                <OrigenFondosBadge tipo={prestamo.origen_fondos_tipo} />
              </div>
            </div>

            {/* Montos */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="rounded-md bg-white/80 border border-purple-100 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Total c/interés</div>
                <div className="font-semibold text-sm">{formatUsd(montoOriginal)}</div>
              </div>
              <div className="rounded-md bg-white/80 border border-purple-100 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Pagado</div>
                <div className="font-semibold text-sm text-green-600">{formatUsd(montoPagado)}</div>
              </div>
              <div className="rounded-md bg-white/80 border border-purple-100 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Saldo pendiente</div>
                <div className={`font-semibold text-sm ${saldoPend > 0.005 ? 'text-destructive' : 'text-green-600'}`}>
                  {saldoPend > 0.005 ? formatUsd(saldoPend) : '—'}
                </div>
              </div>
            </div>

            {/* Barra de progreso */}
            {montoPagado > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progreso de pago</span>
                  <span>{porcentajePagado.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-purple-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all"
                    style={{ width: `${Math.min(100, porcentajePagado)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Historial de abonos ─────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Historial de Abonos
            </h4>

            {isLoading ? (
              <div className="h-20 bg-muted/50 rounded animate-pulse" />
            ) : historial.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Sin abonos registrados</p>
            ) : (
              <div className="overflow-auto rounded-md border max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Método</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Abono</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Saldo antes</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Saldo después</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {historial.map((a) => {
                      const saldoAntes = parseFloat(a.saldo_anterior)
                      const saldoDespues = parseFloat(a.saldo_nuevo)
                      const monto = parseFloat(a.monto)
                      return (
                        <tr key={a.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {formatFecha(a.fecha)}
                          </td>
                          <td className="px-3 py-2">{a.metodo_nombre}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-green-600">
                            {formatUsd(monto)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {saldoAntes > 0 ? formatUsd(saldoAntes) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {saldoDespues > 0.005
                              ? <span className="text-orange-600">{formatUsd(saldoDespues)}</span>
                              : <span className="text-green-600 font-medium">Saldado</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {historial.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Total abonado
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-green-600 tabular-nums">
                          {formatUsd(historial.reduce((s, a) => s + parseFloat(a.monto), 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* ── Concepto de cada abono (si existe) ─────── */}
          {historial.some((a) => a.concepto) && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Notas de abonos
              </h4>
              <div className="space-y-1">
                {historial.map((a) => a.concepto ? (
                  <p key={a.id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{formatFecha(a.fecha)}:</span>{' '}
                    {a.concepto}
                  </p>
                ) : null)}
              </div>
            </div>
          )}

          {/* ── Footer ─────────────────────────────────── */}
          <div className="flex justify-end pt-3 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
