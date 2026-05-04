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
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { reversarMovBancario, reversarMovCajaFuerte } from '../hooks/use-conciliacion-tesoreria'
import { reversoSchema } from '../schemas/tesoreria-schemas'
import type { MovimientoTesoreria } from './movimientos-table'

interface Props {
  isOpen: boolean
  onClose: () => void
  movimiento: MovimientoTesoreria | null
  monedaSimbolo: string
}

const ORIGEN_LABELS: Record<string, string> = {
  DEPOSITO_CAJA: 'Deposito caja',
  DEPOSITO_CIERRE: 'Cierre caja',
  TRANSFERENCIA_CLIENTE: 'Cobro cliente',
  PAGO_PROVEEDOR: 'Pago proveedor',
  GASTO: 'Gasto',
  TRASPASO: 'Traspaso',
  REVERSO: 'Reverso',
  MANUAL: 'Manual',
}

export function ReversoModal({ isOpen, onClose, movimiento, monedaSimbolo }: Props) {
  const { user } = useCurrentUser()
  const [saving, setSaving] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setMotivo('')
      setMotivoError('')
    }
  }, [isOpen])

  const esTransferenciaCliente =
    movimiento?.origen === 'TRANSFERENCIA_CLIENTE' && movimiento?.doc_origen_tipo === 'PAGO'

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
      if (movimiento._source === 'BANCO') {
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
      toast.error(err instanceof Error ? err.message : 'Error al reversar movimiento')
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
          <DialogTitle>Reversar movimiento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Detalles del movimiento */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha</span>
              <span>{String(movimiento.fecha).slice(0, 10)}</span>
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

          {/* Warning si afecta CxC */}
          {esTransferenciaCliente && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
              <p>
                Este movimiento esta vinculado a un cobro de cliente. Al reversarlo, verifique el
                saldo en Cuentas por Cobrar.
              </p>
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
