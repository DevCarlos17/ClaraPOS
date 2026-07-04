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
import { crearTraspaso } from '../hooks/use-traspasos'
import { traspasoSchema } from '../schemas/tesoreria-schemas'
import type { CuentaTesoreria } from '../hooks/use-cuentas-tesoreria'
import { formatUsd } from '@/lib/currency'

interface Props {
  isOpen: boolean
  onClose: () => void
  cuentas: CuentaTesoreria[]
  cuentaOrigen?: CuentaTesoreria
}

export function TraspasoModal({ isOpen, onClose, cuentas, cuentaOrigen }: Props) {
  const { user } = useCurrentUser()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [montoOrigen, setMontoOrigen] = useState('')
  const [tasaCambio, setTasaCambio] = useState('')
  const [fecha, setFecha] = useState(todayStr())
  const [observacion, setObservacion] = useState('')
  const [referencia, setReferencia] = useState('')

  const cuentaOrigenResolved = cuentaOrigen ?? cuentas.find((c) => c.id === origenId)
  const cuentaDestinoResolved = cuentas.find((c) => c.id === destinoId)
  const isCrossCurrency =
    cuentaOrigenResolved &&
    cuentaDestinoResolved &&
    cuentaOrigenResolved.moneda_id !== cuentaDestinoResolved.moneda_id

  const montoDestinoCalc: number = (() => {
    const m = parseFloat(montoOrigen)
    if (isNaN(m)) return 0
    if (isCrossCurrency) {
      const t = parseFloat(tasaCambio)
      return isNaN(t) ? 0 : m * t
    }
    return m
  })()

  useEffect(() => {
    if (isOpen) {
      setErrors({})
      setOrigenId(cuentaOrigen?.id ?? '')
      setDestinoId('')
      setMontoOrigen('')
      setTasaCambio('')
      setFecha(todayStr())
      setObservacion('')
      setReferencia('')
    }
  }, [isOpen, cuentaOrigen?.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = traspasoSchema.safeParse({
      cuenta_origen_id: cuentaOrigen ? cuentaOrigen.id : origenId,
      cuenta_destino_id: destinoId,
      monto_origen: parseFloat(montoOrigen),
      tasa_cambio: tasaCambio ? parseFloat(tasaCambio) : null,
      fecha,
      observacion: observacion || undefined,
      referencia: referencia || undefined,
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

    if (!cuentaOrigenResolved || !cuentaDestinoResolved) return

    if (isCrossCurrency && (!tasaCambio || parseFloat(tasaCambio) <= 0)) {
      setErrors({ tasa_cambio: 'Ingrese la tasa de cambio' })
      return
    }

    if (!user?.id || !user?.empresa_id) return
    setSaving(true)
    try {
      await crearTraspaso({
        origen: cuentaOrigenResolved,
        destino: cuentaDestinoResolved,
        monto_origen: parsed.data.monto_origen,
        monto_destino: montoDestinoCalc,
        tasa_cambio: isCrossCurrency ? (parsed.data.tasa_cambio ?? undefined) : undefined,
        fecha: parsed.data.fecha,
        observacion: parsed.data.observacion,
        referencia: parsed.data.referencia,
        empresa_id: user.empresa_id,
        usuario_id: user.id,
      })
      toast.success('Traspaso registrado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar traspaso')
    } finally {
      setSaving(false)
    }
  }

  const cuentasDestino = cuentas.filter((c) => c.id !== (cuentaOrigen?.id ?? origenId))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Traspaso entre cuentas</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Cuenta origen *</Label>
            {cuentaOrigen ? (
              // Pre-loaded from selected account — read-only display
              <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                [{cuentaOrigen.moneda_codigo}] {cuentaOrigen.nombre}
              </div>
            ) : (
              // Manual selection when no account pre-selected
              <select
                id="origenId"
                value={origenId}
                onChange={(e) => {
                  setOrigenId(e.target.value)
                  setDestinoId('')
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Seleccione cuenta origen</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.moneda_codigo}] {c.nombre}
                  </option>
                ))}
              </select>
            )}
            {errors.cuenta_origen_id && (
              <p className="text-xs text-destructive">{errors.cuenta_origen_id}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destinoId">Cuenta destino *</Label>
            <select
              id="destinoId"
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              disabled={!cuentaOrigenResolved}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">Seleccione cuenta destino</option>
              {cuentasDestino.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.moneda_codigo}] {c.nombre}
                </option>
              ))}
            </select>
            {errors.cuenta_destino_id && (
              <p className="text-xs text-destructive">{errors.cuenta_destino_id}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="montoOrigen">
              Monto a transferir ({cuentaOrigenResolved?.moneda_codigo ?? '—'}) *
            </Label>
            <Input
              id="montoOrigen"
              type="number"
              step="0.01"
              min="0.01"
              value={montoOrigen}
              onChange={(e) => setMontoOrigen(e.target.value)}
              placeholder="0.00"
              disabled={!cuentaOrigenResolved}
            />
            {errors.monto_origen && (
              <p className="text-xs text-destructive">{errors.monto_origen}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referencia">Referencia</Label>
            <Input
              id="referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nro. de comprobante, transferencia, etc."
              maxLength={100}
            />
          </div>

          {isCrossCurrency && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="tasaCambio">
                  Tasa de cambio ({cuentaOrigenResolved?.moneda_codigo} →{' '}
                  {cuentaDestinoResolved?.moneda_codigo}) *
                </Label>
                <Input
                  id="tasaCambio"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={tasaCambio}
                  onChange={(e) => setTasaCambio(e.target.value)}
                  placeholder="0.0000"
                />
                {errors.tasa_cambio && (
                  <p className="text-xs text-destructive">{errors.tasa_cambio}</p>
                )}
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="text-muted-foreground text-xs">Monto a recibir</p>
                <p className="font-semibold mt-0.5">
                  {cuentaDestinoResolved?.moneda_codigo} {formatUsd(montoDestinoCalc)}
                </p>
              </div>
            </>
          )}

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

          <div className="space-y-1.5">
            <Label htmlFor="observacion">Observacion</Label>
            <Input
              id="observacion"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Observacion opcional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Procesando...' : 'Confirmar traspaso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
