import { useEffect, useState } from 'react'
import { CurrencyDollar, ArrowsClockwise, TrendUp } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { crearTasa, useTasaActual, useTasasHistorial, useFetchTasaApi } from '../hooks/use-tasas'
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
  const prevTasas = tasas.filter((t) => t.id !== tasa?.id).slice(0, 5)
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
    try {
      const valorApi = await fetchTasa()
      console.log('[TasaUpdateModal] Respuesta BCV API:', { valorApi, apiDateText })
      setValor(valorApi.toFixed(4))
      toast.success('Tasa obtenida del BCV')
    } catch (err) {
      console.error('[TasaUpdateModal] Error al consultar API BCV:', err)
      toast.error(err instanceof Error ? err.message : 'Error al consultar la API')
    }
  }

  const valorPreview = parseFloat(valor)
  const tienePreview = !Number.isNaN(valorPreview) && valorPreview > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendUp className="h-5 w-5 text-primary" />
            Tasa de Cambio
          </DialogTitle>
          <DialogDescription>
            Actualiza el valor del USD en bolivares
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'rounded-lg border bg-muted/40 p-4',
            desactualizada && 'border-red-300 bg-red-50'
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className={cn(
                'p-1.5 rounded-md',
                desactualizada ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-600'
              )}
            >
              <CurrencyDollar className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Tasa actual
            </span>
          </div>
          {tasa ? (
            <div>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  desactualizada && 'text-red-700'
                )}
              >
                {formatTasa(tasa.valor)} Bs/$
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                $1.00 = {formatBs(tasaValor)}
              </p>
              <p
                className={cn(
                  'text-[11px] mt-2',
                  desactualizada ? 'text-red-600 font-medium' : 'text-muted-foreground'
                )}
              >
                Actualizada: {formatDateTime(tasa.created_at)}
                {desactualizada && ' (desactualizada)'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay tasa registrada</p>
          )}
        </div>

        {prevTasas.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Historial reciente
            </p>
            <div className="rounded-md border divide-y divide-border overflow-hidden">
              {prevTasas.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-1.5 bg-background">
                  <span className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</span>
                  <span className="text-xs font-semibold tabular-nums">{formatTasa(parseFloat(t.valor))} Bs/$</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="tasa-valor" className="text-sm font-medium mb-1.5 block">
              Nuevo valor (Bs por USD)
            </label>
            <input
              id="tasa-valor"
              type="number"
              step="0.0001"
              min="0.0001"
              autoFocus
              placeholder={tasaValor ? tasaValor.toFixed(4) : '0.0000'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={isSubmitting}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {apiDateText ? `BCV: ${apiDateText} · Precision de 4 decimales` : 'Precision de 4 decimales'}
            </p>
          </div>

          {tienePreview && (
            <div className="text-xs text-muted-foreground bg-muted rounded-md p-2.5 space-y-0.5">
              <p>$1.00 = {formatBs(valorPreview)}</p>
              <p>$10.00 = {formatBs(valorPreview * 10)}</p>
              <p>$100.00 = {formatBs(valorPreview * 100)}</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleAutomatica}
              disabled={isSubmitting || isFetching}
              className="sm:w-auto w-full"
            >
              <ArrowsClockwise className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              {isFetching ? 'Consultando...' : 'Automatica'}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !valor}
              className="sm:w-auto w-full"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar manual'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
