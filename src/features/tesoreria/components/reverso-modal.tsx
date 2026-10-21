import { useState, useEffect } from 'react'
import { Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatUsd } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { reversarMovBancario, reversarMovCajaFuerte } from '../hooks/use-conciliacion-tesoreria'
import { reversarTraspaso } from '../hooks/use-traspasos'
import {
  previewFacturasAfectadas,
  type PreviewFacturasAfectadas,
} from '../hooks/use-preview-facturas-afectadas'
import { esTransferenciaCliente } from '../utils/es-transferencia-cliente'
import { reversoSchema } from '../schemas/tesoreria-schemas'
import type { MovimientoTesoreria } from './movimientos-table'

interface Props {
  isOpen: boolean
  onClose: () => void
  movimiento: MovimientoTesoreria | null
  monedaSimbolo: string
  traspasoId?: string
}

const ORIGEN_LABELS: Record<string, string> = {
  DEPOSITO_CAJA: 'Deposito caja',
  DEPOSITO_CIERRE: 'Cierre caja',
  CIERRE_CONSOLIDACION: 'Consolidacion de cierre',
  TRANSFERENCIA_CLIENTE: 'Cobro cliente',
  PAGO_PROVEEDOR: 'Pago proveedor',
  GASTO: 'Gasto',
  TRASPASO: 'Traspaso',
  REVERSO: 'Reverso',
  MANUAL: 'Manual',
}

export function ReversoModal({ isOpen, onClose, movimiento, monedaSimbolo, traspasoId }: Props) {
  const { user } = useCurrentUser()
  const [saving, setSaving] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [preview, setPreview] = useState<PreviewFacturasAfectadas | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMotivo('')
      setMotivoError('')
    }
  }, [isOpen])

  const aplicaPreview = esTransferenciaCliente(movimiento?.origen)
  const empresaId = user?.empresa_id ?? ''
  const movimientoId = movimiento?.id ?? ''

  // Snapshot bajo demanda al abrir el modal — NO una suscripcion reactiva
  // (el preview es un snapshot del estado de las facturas en ese instante,
  // ver spec Requirement "Solo lectura y aislamiento multi-tenant"). Deps
  // primitivos (regla `rerender-dependencies`), no el objeto `movimiento`.
  useEffect(() => {
    if (!isOpen || !aplicaPreview || !movimientoId || !empresaId) {
      setPreview(null)
      return
    }

    let cancelled = false
    setPreviewLoading(true)
    previewFacturasAfectadas(empresaId, movimientoId)
      .then((resultado) => {
        if (!cancelled) setPreview(resultado)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, aplicaPreview, movimientoId, empresaId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMotivoError('')

    const parsed = reversoSchema.safeParse({ motivo })
    if (!parsed.success) {
      setMotivoError(parsed.error.issues[0]?.message ?? 'Motivo invalido')
      return
    }

    if (!user?.id || !user?.empresa_id || !movimiento) return
    setSaving(true)
    try {
      if (traspasoId) {
        // Full traspaso reversal — both sides
        await reversarTraspaso({
          traspasoId,
          motivo: parsed.data.motivo,
          userId: user.id,
          empresaId: user.empresa_id,
        })
        toast.success('Traspaso reversado correctamente')
      } else if (movimiento._source === 'BANCO') {
        const result = await reversarMovBancario({
          movId: movimiento.id,
          motivo: parsed.data.motivo,
          userId: user.id,
          empresaId: user.empresa_id,
        })
        if (result.needsManualCxc) {
          toast.warning(
            'Movimiento reversado. Revise Cuentas por Cobrar para ajustar el saldo del cliente.'
          )
        } else {
          toast.success('Movimiento reversado correctamente')
        }
      } else {
        await reversarMovCajaFuerte({
          movId: movimiento.id,
          motivo: parsed.data.motivo,
          userId: user.id,
          empresaId: user.empresa_id,
        })
        toast.success('Movimiento reversado correctamente')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar')
    } finally {
      setSaving(false)
    }
  }

  if (!movimiento) return null

  const monto = parseFloat(movimiento.monto)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {traspasoId ? 'Reversar traspaso' : 'Reversar movimiento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Detalles del movimiento */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha</span>
              <span>{formatDate(movimiento.fecha)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Origen</span>
              <span>{ORIGEN_LABELS[movimiento.origen] ?? movimiento.origen}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span className={movimiento.tipo === 'INGRESO' ? 'text-green-700' : 'text-red-700'}>
                {movimiento.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}
              </span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Monto</span>
              <span>
                {monedaSimbolo} {formatUsd(monto)}
              </span>
            </div>
          </div>

          {/* Warning si forma parte de un traspaso */}
          {traspasoId && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
              <p>
                Este movimiento forma parte de un traspaso. Al reversarlo, se revertirán{' '}
                <strong>ambos extremos</strong> de la operación automáticamente.
              </p>
            </div>
          )}

          {/* Panel read-only: facturas afectadas por este reverso (solo
              aplica a ingresos TRANSFERENCIA_CLIENTE — slice 1b-panel de
              preview-facturas-afectadas-reverso-tesoreria) */}
          {aplicaPreview && (
            <div
              data-testid="preview-facturas-afectadas"
              className="rounded-lg border p-4 space-y-3 text-sm"
            >
              <p className="font-medium">Facturas afectadas por este reverso</p>

              {previewLoading && (
                <p className="text-muted-foreground">Cargando facturas afectadas...</p>
              )}

              {!previewLoading && preview?.estado === 'LEGACY' && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
                  <p>
                    Sin trazabilidad: este ingreso es anterior al registro de abonos y no se puede
                    determinar automaticamente que facturas afecta. Verifique manualmente el saldo
                    del cliente en Cuentas por Cobrar antes de reversar.
                  </p>
                </div>
              )}

              {!previewLoading &&
                preview?.estado === 'OK' &&
                preview.facturasDirectas.length === 0 &&
                preview.facturasSaf.length === 0 && (
                  <p className="text-muted-foreground">
                    No se encontraron facturas asociadas a este cobro.
                  </p>
                )}

              {!previewLoading &&
                preview?.estado === 'OK' &&
                (preview.facturasDirectas.length > 0 || preview.facturasSaf.length > 0) && (
                  <div className="space-y-3">
                    {preview.facturasDirectas.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Pago directo
                        </p>
                        <ul className="mt-1 space-y-1">
                          {preview.facturasDirectas.map((f) => (
                            <li key={f.ventaId} className="flex justify-between">
                              <span>{f.nroFactura}</span>
                              <span>{formatUsd(f.montoAplicadoUsd)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {preview.facturasSaf.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Afectada por saldo a favor (SAF)
                        </p>
                        <ul className="mt-1 space-y-1">
                          {preview.facturasSaf.map((f) => (
                            <li key={f.ventaId} className="flex justify-between">
                              <span>{f.nroFactura}</span>
                              <span>{formatUsd(f.montoAplicadoUsd)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Total afectado</span>
                      <span>{formatUsd(preview.totalUsd)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este total equivale al monto del reverso.
                    </p>
                  </div>
                )}
            </div>
          )}

          <form id="reverso-form" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="motivo">Motivo del reverso *</Label>
              <Input
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describa el motivo del reverso"
              />
              {motivoError && <p className="text-xs text-destructive">{motivoError}</p>}
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="reverso-form" variant="destructive" disabled={saving}>
            {saving ? 'Reversando...' : 'Confirmar reverso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
