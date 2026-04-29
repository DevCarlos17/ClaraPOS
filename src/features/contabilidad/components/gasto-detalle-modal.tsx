import { useRef, useState, useMemo } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import {
  anularGasto,
  useAbonosGasto,
  reversarPagoGasto,
  type Gasto,
} from '@/features/contabilidad/hooks/use-gastos'
import { formatDate } from '@/lib/format'
import { formatUsd, formatBs } from '@/lib/currency'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'

type GastoConJoins = Gasto & {
  cuenta_nombre: string
  proveedor_nombre: string | null
  created_by_nombre: string | null
}

interface GastoDetalleModalProps {
  gasto: GastoConJoins | null
  isOpen: boolean
  onClose: () => void
}

interface GastoPagoRow {
  id: string
  metodo_cobro_id: string
  banco_empresa_id: string | null
  monto_usd: string
  referencia: string | null
  created_at: string
  metodo_nombre: string | null
}

export function GastoDetalleModal({ gasto, isOpen, onClose }: GastoDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()
  const [anulando, setAnulando] = useState(false)
  const [confirmandoAnular, setConfirmandoAnular] = useState(false)
  const [confirmandoAbonoId, setConfirmandoAbonoId] = useState<string | null>(null)
  const [reversandoAbonoId, setReversandoAbonoId] = useState<string | null>(null)

  const puedeAnular = hasPermission(PERMISSIONS.ACCOUNTING_VIEW)
  const puedeReversarAbono = hasPermission(PERMISSIONS.CXP_REVERSE)

  // Abonos desde movimientos_cuenta_proveedor (nueva via, con dual-rate)
  const { abonos, isLoading: loadingAbonos } = useAbonosGasto(gasto?.id ?? '')
  const reversedPagRefs = useMemo(() => {
    const set = new Set<string>()
    for (const a of abonos) {
      if (a.tipo === 'DEV' && a.referencia?.startsWith('DEV-'))
        set.add(a.referencia.slice(4))
    }
    return set
  }, [abonos])

  // Fallback: gasto_pagos (para gastos creados antes de este update)
  const { data: pagosData } = useQuery(
    gasto?.id && abonos.length === 0
      ? `SELECT gp.*, mc.nombre as metodo_nombre
         FROM gasto_pagos gp
         LEFT JOIN metodos_cobro mc ON gp.metodo_cobro_id = mc.id
         WHERE gp.gasto_id = ?
         ORDER BY gp.created_at ASC`
      : '',
    gasto?.id && abonos.length === 0 ? [gasto.id] : []
  )
  const pagosLegacy = (pagosData ?? []) as GastoPagoRow[]

  if (isOpen && dialogRef.current && !dialogRef.current.open) {
    dialogRef.current.showModal()
  }
  if (!isOpen && dialogRef.current?.open) {
    dialogRef.current.close()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  async function handleAnular() {
    if (!gasto || !user) return
    setAnulando(true)
    try {
      await anularGasto(gasto.id, user.id)
      toast.success(`Gasto ${gasto.nro_gasto} anulado exitosamente`)
      setConfirmandoAnular(false)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al anular el gasto')
    } finally {
      setAnulando(false)
    }
  }

  async function handleReversarAbono(abonoId: string) {
    if (!gasto?.proveedor_id || !user?.empresa_id) return
    setReversandoAbonoId(abonoId)
    try {
      await reversarPagoGasto({
        abonoId,
        gastoId: gasto.id,
        proveedorId: gasto.proveedor_id,
        empresaId: user.empresa_id,
        usuarioId: user.id,
      })
      toast.success('Abono reversado exitosamente')
      setConfirmandoAbonoId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar el abono')
    } finally {
      setReversandoAbonoId(null)
    }
  }

  if (!gasto) return null

  const tasa = parseFloat(gasto.tasa)
  const tasaProveedor = gasto.tasa_proveedor ? parseFloat(gasto.tasa_proveedor) : null
  const montoUsd = parseFloat(gasto.monto_usd)
  const montoBs = parseFloat(gasto.monto_bs)
  const saldoPendiente = parseFloat(gasto.saldo_pendiente_usd)
  const esAnulado = gasto.status === 'ANULADO'
  const tieneProveedor = Boolean(gasto.proveedor_id)

  const hayDualRate = gasto.usa_tasa_paralela === 1 && Boolean(gasto.tasa_proveedor)
  const montoFactura = parseFloat(gasto.monto_factura)
  const montoProveedorUsd = (() => {
    if (gasto.moneda_factura === 'USD') return montoFactura
    const tasaRef = hayDualRate && tasaProveedor ? tasaProveedor : tasa
    return tasaRef > 0 ? montoFactura / tasaRef : montoUsd
  })()
  const abonadoUsd = Math.max(0, montoProveedorUsd - saldoPendiente)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Detalle de Gasto</h2>
            <p className="text-sm text-muted-foreground font-mono">{gasto.nro_gasto}</p>
          </div>
          <div className="flex items-center gap-2">
            {!esAnulado && puedeAnular && (
              confirmandoAnular ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAnular}
                    disabled={anulando}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-destructive rounded-md hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {anulando ? 'Anulando...' : 'Confirmar anulacion'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoAnular(false)}
                    className="px-3 py-1.5 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoAnular(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive bg-destructive/10 rounded-md hover:bg-destructive/20 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  Anular
                </button>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex gap-1">
              <span className="text-muted-foreground min-w-[90px]">Nro Factura:</span>
              <span className="font-mono font-medium">{gasto.nro_factura ?? gasto.nro_gasto}</span>
            </div>
            <div className="flex gap-1">
              <span className="text-muted-foreground min-w-[90px]">Fecha:</span>
              <span>{formatDate(gasto.fecha)}</span>
            </div>
            <div className="flex gap-1 col-span-2">
              <span className="text-muted-foreground min-w-[90px]">Cuenta:</span>
              <span className="font-medium">{gasto.cuenta_nombre}</span>
            </div>
            <div className="flex gap-1 col-span-2">
              <span className="text-muted-foreground min-w-[90px]">Proveedor:</span>
              <span>{gasto.proveedor_nombre ?? '—'}</span>
            </div>
            <div className="flex gap-1 col-span-2">
              <span className="text-muted-foreground min-w-[90px]">Descripcion:</span>
              <span>{gasto.descripcion}</span>
            </div>
            <div className="flex gap-1">
              <span className="text-muted-foreground min-w-[90px]">Tasa:</span>
              <span>{tasa.toFixed(4)} Bs/USD</span>
            </div>
            {tasaProveedor && gasto.usa_tasa_paralela === 1 && (
              <div className="flex gap-1">
                <span className="text-muted-foreground min-w-[90px]">T. Proveedor:</span>
                <span>{tasaProveedor.toFixed(4)} Bs/USD</span>
              </div>
            )}
            <div className="flex gap-1">
              <span className="text-muted-foreground min-w-[90px]">Status:</span>
              <span className={`font-medium ${esAnulado ? 'text-destructive' : 'text-green-600'}`}>
                {gasto.status}
              </span>
            </div>
            <div className="flex gap-1">
              <span className="text-muted-foreground min-w-[90px]">Procesado por:</span>
              <span>{gasto.created_by_nombre ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Totales */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4 space-y-1.5">
          {hayDualRate ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monto Factura (Proveedor):</span>
                <span className="font-bold text-foreground">{formatUsd(montoProveedorUsd)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monto Contable:</span>
                <span className="font-medium text-muted-foreground">{formatUsd(montoUsd)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monto USD (contable):</span>
              <span className="font-bold text-foreground">{formatUsd(montoUsd)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monto Bs:</span>
            <span className="font-medium text-muted-foreground">{formatBs(montoBs)}</span>
          </div>
          {abonadoUsd > 0.005 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Abonado:</span>
              <span className="font-medium text-green-600">{formatUsd(abonadoUsd)}</span>
            </div>
          )}
          {saldoPendiente > 0.005 && (
            <div className="flex justify-between text-sm border-t border-border pt-1.5 mt-1">
              <span className="text-muted-foreground">Saldo Pendiente:</span>
              <span className="font-medium text-amber-600">{formatUsd(saldoPendiente)}</span>
            </div>
          )}
        </div>

        {/* Historial de pagos — siempre visible */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Historial de Pagos</h3>
          {loadingAbonos ? (
            <p className="text-sm text-muted-foreground py-2">Cargando...</p>
          ) : abonos.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ref.</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Monto</th>
                    {tieneProveedor && puedeReversarAbono && (
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">Accion</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {abonos.map((a) => {
                    const esBs = a.moneda_pago === 'BS' && a.monto_moneda && a.tasa_pago
                    const esReversado = a.tipo === 'PAG' && reversedPagRefs.has(a.referencia ?? '')
                    return (
                      <tr key={a.id} className={esReversado ? 'line-through opacity-50' : ''}>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {a.fecha?.slice(0, 10)}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`font-medium ${a.tipo === 'PAG' && !esReversado ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {a.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">
                          {a.referencia ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="font-medium tabular-nums">
                            {a.tipo === 'PAG' ? '' : '-'}{formatUsd(parseFloat(a.monto))}
                          </div>
                          {esBs && (
                            <div className="text-muted-foreground text-[10px] leading-tight">
                              {formatBs(parseFloat(a.monto_moneda!))} @ {parseFloat(a.tasa_pago!).toFixed(2)}
                              {a.monto_usd_interno &&
                                Math.abs(parseFloat(a.monto_usd_interno) - parseFloat(a.monto)) > 0.005 && (
                                  <span className="text-slate-400 ml-1">
                                    / {formatUsd(parseFloat(a.monto_usd_interno))} int.
                                  </span>
                                )}
                            </div>
                          )}
                        </td>
                        {tieneProveedor && puedeReversarAbono && (
                          <td className="px-3 py-1.5 text-center">
                            {a.tipo === 'PAG' && !esReversado ? (
                              confirmandoAbonoId === a.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    disabled={reversandoAbonoId === a.id}
                                    onClick={() => handleReversarAbono(a.id)}
                                    className="px-2 py-0.5 text-[10px] font-medium text-white bg-destructive rounded hover:bg-destructive/90 disabled:opacity-50"
                                  >
                                    {reversandoAbonoId === a.id ? '...' : 'Confirmar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmandoAbonoId(null)}
                                    className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted rounded hover:bg-muted/80"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmandoAbonoId(a.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  Reversar
                                </button>
                              )
                            ) : esReversado ? (
                              <span className="text-[10px] text-muted-foreground italic">Reversado</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : pagosLegacy.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Metodo</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Monto USD</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagosLegacy.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{p.metodo_nombre ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatUsd(parseFloat(p.monto_usd))}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{p.referencia ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Sin pagos registrados</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end mt-5 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
