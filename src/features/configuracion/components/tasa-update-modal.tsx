import { useEffect, useState } from 'react'
import { TrendUp, Warning, ArrowsClockwise, Clock } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { crearTasa, crearTasaRaw, useTasaActual, useTasasHistorial, useFetchTasaApi } from '../hooks/use-tasas'
import { formatBs, formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface TasaUpdateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TASA_STALE_HOURS = 24

function isTasaDesactualizada(createdAt: string): boolean {
  const createdMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdMs)) return false
  return (Date.now() - createdMs) / (1000 * 60 * 60) > TASA_STALE_HOURS
}

export function TasaUpdateModal({ open, onOpenChange }: TasaUpdateModalProps) {
  const { tasa, tasaValor } = useTasaActual()
  const { tasas } = useTasasHistorial()
  const { user } = useCurrentUser()
  const prevTasas = tasas.filter((t) => t.id !== tasa?.id).slice(0, 4)
  const { fetchTasa, isFetching, apiDateText } = useFetchTasaApi()
  const [valor, setValor] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) setValor('')
  }, [open])

  const desactualizada = tasa ? isTasaDesactualizada(tasa.created_at) : false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseFloat(valor)
    if (!num || num <= 0) {
      toast.error('Ingresa un valor valido mayor a 0')
      return
    }
    if (!user?.empresa_id) {
      toast.error('Sesion no disponible')
      return
    }
    setIsSubmitting(true)
    try {
      await crearTasa(num, user.empresa_id, user.id)
      toast.success('Tasa de cambio actualizada')
      setValor('')
      onOpenChange(false)
    } catch {
      toast.error('Error al registrar la tasa')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAutomatica = async () => {
    if (!user?.empresa_id) {
      toast.error('Sesion no disponible')
      return
    }
    setIsSubmitting(true)
    try {
      const valorApi = await fetchTasa()
      await crearTasaRaw(valorApi, user.empresa_id, user.id)
      toast.success('Tasa actualizada desde BCV')
      setValor('')
      onOpenChange(false)
    } catch (err) {
      console.error('[TasaUpdateModal] Error al consultar API BCV:', err)
      toast.error(err instanceof Error ? err.message : 'Error al consultar la API')
    } finally {
      setIsSubmitting(false)
    }
  }

  const valorPreview = parseFloat(valor)
  const tienePreview = !Number.isNaN(valorPreview) && valorPreview > 0
  const busy = isSubmitting || isFetching

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Tasa de Cambio</DialogTitle>

        {/* ── Hero header ─────────────────────────────────────────── */}
        <div
          className={cn(
            'px-5 pt-5 pb-4 border-b',
            desactualizada
              ? 'bg-amber-50 border-amber-100'
              : 'bg-primary/[0.04] border-primary/10'
          )}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full shrink-0',
                desactualizada ? 'bg-amber-100' : 'bg-primary/10'
              )}
            >
              {desactualizada
                ? <Warning size={18} className="text-amber-600" />
                : <TrendUp size={18} className="text-primary" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Tasa de Cambio</p>
              <p className="text-xs text-muted-foreground mt-0.5">USD / Bolivares</p>
            </div>
          </div>

          {tasa ? (
            <div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    'text-4xl font-bold tabular-nums tracking-tight',
                    desactualizada ? 'text-amber-700' : 'text-foreground'
                  )}
                >
                  {formatTasa(tasa.valor)}
                </span>
                <span className="text-base font-medium text-muted-foreground">Bs/$</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Clock size={11} weight="regular" />
                {formatDateTime(tasa.created_at)}
                {desactualizada && (
                  <span className="text-amber-600 font-medium">· Desactualizada</span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin tasa registrada</p>
          )}
        </div>

        {/* ── Historial reciente ───────────────────────────────────── */}
        {prevTasas.length > 0 && (
          <div className="px-5 py-3 border-b">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Historial
            </p>
            <div className="rounded-lg border divide-y divide-border overflow-hidden">
              {prevTasas.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between px-3 py-1.5 bg-background"
                >
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(t.created_at)}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {formatTasa(parseFloat(t.valor))} Bs/$
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Formulario ──────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="tasa-valor" className="text-xs font-medium text-muted-foreground">
                Nuevo valor manual (Bs por USD)
              </label>
              {apiDateText && (
                <span className="text-[10px] text-primary font-medium">
                  BCV: {apiDateText}
                </span>
              )}
            </div>
            <input
              id="tasa-valor"
              type="number"
              step="0.0001"
              min="0.0001"
              autoFocus
              placeholder={tasaValor ? tasaValor.toFixed(4) : '0.0000'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={busy}
              className="no-spinner flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
          </div>

          {tienePreview && (
            <div className="grid grid-cols-3 gap-px rounded-lg border overflow-hidden bg-border">
              {[1, 10, 100].map((amount) => (
                <div key={amount} className="bg-muted/50 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground">${amount}.00</p>
                  <p className="text-xs font-semibold tabular-nums mt-0.5">
                    {formatBs(valorPreview * amount)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleAutomatica}
              disabled={busy}
              className="flex-1"
            >
              <ArrowsClockwise
                className={cn('h-4 w-4', (isFetching || isSubmitting) && 'animate-spin')}
              />
              {isFetching ? 'Consultando...' : busy ? 'Guardando...' : 'BCV Automatico'}
            </Button>
            <Button
              type="submit"
              disabled={busy || !valor}
              className="flex-1"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
