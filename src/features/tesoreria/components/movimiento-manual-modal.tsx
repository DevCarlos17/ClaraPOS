import { useState, useEffect } from 'react'
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
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { todayStr } from '@/lib/dates'
import { crearMovManualBanco, crearMovManualCajaFuerte } from '../hooks/use-conciliacion-tesoreria'
import { movManualSchema } from '../schemas/tesoreria-schemas'
import type { CuentaTesoreria } from '../hooks/use-cuentas-tesoreria'
import { useGastos, type Gasto } from '@/features/contabilidad/hooks/use-gastos'

interface Props {
  isOpen: boolean
  onClose: () => void
  cuenta: CuentaTesoreria
}

export function MovimientoManualModal({ isOpen, onClose, cuenta }: Props) {
  const { user } = useCurrentUser()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>('INGRESO')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [gastoId, setGastoId] = useState('')
  const [fecha, setFecha] = useState(todayStr())

  const { gastos } = useGastos()
  const gastosPendientes = gastos.filter((g: Gasto) => g.status === 'PENDIENTE')

  useEffect(() => {
    if (isOpen) {
      setErrors({})
      setTipo('INGRESO')
      setMonto('')
      setDescripcion('')
      setGastoId('')
      setFecha(todayStr())
    }
  }, [isOpen])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = movManualSchema.safeParse({
      tipo,
      monto: parseFloat(monto),
      descripcion,
      gasto_id: gastoId || null,
      fecha,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as string
        fieldErrors[key] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    if (!user?.id || !user?.empresa_id) return
    setSaving(true)
    try {
      if (cuenta.tipo === 'BANCO') {
        await crearMovManualBanco({
          banco_id: cuenta.id,
          tipo: parsed.data.tipo,
          monto: parsed.data.monto,
          descripcion: parsed.data.descripcion,
          gasto_id: parsed.data.gasto_id ?? undefined,
          fecha: parsed.data.fecha,
          empresa_id: user.empresa_id,
          usuario_id: user.id,
        })
      } else {
        await crearMovManualCajaFuerte({
          caja_fuerte_id: cuenta.id,
          tipo: parsed.data.tipo,
          monto: parsed.data.monto,
          descripcion: parsed.data.descripcion,
          gasto_id: parsed.data.gasto_id ?? undefined,
          fecha: parsed.data.fecha,
          empresa_id: user.empresa_id,
          usuario_id: user.id,
        })
      }
      toast.success('Movimiento registrado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar movimiento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento manual — {cuenta.nombre}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo *</Label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as 'INGRESO' | 'EGRESO')
                setGastoId('')
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="INGRESO">Ingreso</option>
              <option value="EGRESO">Egreso</option>
            </select>
            {errors.tipo && <p className="text-xs text-destructive">{errors.tipo}</p>}
          </div>

          {tipo === 'EGRESO' && gastosPendientes.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="gastoId">Vincular a gasto (opcional)</Label>
              <select
                id="gastoId"
                value={gastoId}
                onChange={(e) => setGastoId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Sin vincular</option>
                {gastosPendientes.map((g: Gasto) => (
                  <option key={g.id} value={g.id}>
                    {g.nro_gasto} — {g.descripcion}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">
              {tipo === 'INGRESO' ? 'Motivo / descripcion *' : 'Descripcion *'}
            </Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={
                tipo === 'INGRESO' ? 'Ej: Deposito de caja menor' : 'Ej: Pago servicios'
              }
            />
            {errors.descripcion && (
              <p className="text-xs text-destructive">{errors.descripcion}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="monto">Monto ({cuenta.moneda_codigo}) *</Label>
            <Input
              id="monto"
              type="number"
              step="0.01"
              min="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
            {errors.monto && <p className="text-xs text-destructive">{errors.monto}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha *</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            {errors.fecha && <p className="text-xs text-destructive">{errors.fecha}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar movimiento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
