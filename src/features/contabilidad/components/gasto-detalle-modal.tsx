import { useRef, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import { anularGasto, type Gasto } from '@/features/contabilidad/hooks/use-gastos'
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

  const puedeAnular = hasPermission(PERMISSIONS.ACCOUNTING_VIEW)

  const { data: pagosData } = useQuery(
    gasto?.id
      ? `SELECT gp.*, mc.nombre as metodo_nombre
         FROM gasto_pagos gp
         LEFT JOIN metodos_cobro mc ON gp.metodo_cobro_id = mc.id
         WHERE gp.gasto_id = ?
         ORDER BY gp.created_at ASC`
      : '',
    gasto?.id ? [gasto.id] : []
  )
  const pagos = (pagosData ?? []) as GastoPagoRow[]

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

  if (!gasto) return null

  const tasa = parseFloat(gasto.tasa)
  const montoUsd = parseFloat(gasto.monto_usd)
  const montoBs = parseFloat(gasto.monto_bs)
  const esAnulado = gasto.status === 'ANULADO'

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
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monto USD:</span>
            <span className="font-bold text-foreground">{formatUsd(montoUsd)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monto Bs:</span>
            <span className="font-medium text-muted-foreground">{formatBs(montoBs)}</span>
          </div>
        </div>

        {/* Pagos */}
        {pagos.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Detalle de Pagos</h3>
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
                  {pagos.map((p) => (
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
          </div>
        )}

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
