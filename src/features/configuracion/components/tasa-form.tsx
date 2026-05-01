import { useState } from 'react'
import { DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { useTasaActual, crearTasa } from '../hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatTasa, formatBs } from '@/lib/currency'

export function TasaForm() {
  const { tasa, tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const [valor, setValor] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseFloat(valor)
    if (!num || num <= 0) {
      toast.error('Ingresa un valor valido mayor a 0')
      return
    }

    setIsSubmitting(true)
    try {
      await crearTasa(num, user!.empresa_id!, user!.id)
      toast.success('Tasa de cambio registrada')
      setValor('')
    } catch {
      toast.error('Error al registrar la tasa')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Current rate card */}
      <div className="rounded-xl bg-card shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
            <DollarSign className="w-5 h-5" />
          </div>
          <h3 className="font-semibold">Tasa Actual</h3>
        </div>
        {tasa ? (
          <div>
            <p className="text-3xl font-bold tabular-nums">{formatTasa(tasa.valor)} Bs/$</p>
            <p className="text-sm text-muted-foreground mt-1">
              $1.00 = {formatBs(parseFloat(tasa.valor))}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Registrada: {new Date(tasa.fecha).toLocaleString('es-VE')}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No hay tasas registradas</p>
        )}
      </div>

      {/* New rate form */}
      <div className="rounded-xl bg-card shadow-md p-6">
        <h3 className="font-semibold mb-4">Registrar Nueva Tasa</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Valor (Bs por USD)</label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              placeholder={tasaValor ? tasaValor.toFixed(4) : '0.0000'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={isSubmitting}
              className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm tabular-nums placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground mt-1">Precision de 4 decimales</p>
          </div>

          {valor && parseFloat(valor) > 0 && (
            <div className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
              <p>$1.00 = {formatBs(parseFloat(valor))}</p>
              <p>$10.00 = {formatBs(parseFloat(valor) * 10)}</p>
              <p>$100.00 = {formatBs(parseFloat(valor) * 100)}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !valor}
            className="inline-flex items-center justify-center w-full h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting ? 'Registrando...' : 'Registrar Tasa'}
          </button>
        </form>
      </div>
    </div>
  )
}
