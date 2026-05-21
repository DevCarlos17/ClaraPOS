import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CalendarDots, X } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export interface DragConfirmState {
  citaId: string
  clienteNombre: string
  nuevaFechaInicio: Date
  nuevaFechaFin: Date
  revert: () => void
  tieneOverlap?: boolean
}

interface DragConfirmPopoverProps {
  state: DragConfirmState
  onConfirm: () => Promise<void>
  onCancel: () => void
}

const TIMEOUT_MS = 8000

export function DragConfirmPopover({ state, onConfirm, onCancel }: DragConfirmPopoverProps) {
  const [progress, setProgress] = useState(100)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / TIMEOUT_MS) * 100)
      setProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onCancel()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [onCancel])

  const handleConfirm = async () => {
    setConfirming(true)
    await onConfirm()
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-xl shadow-xl p-4 max-w-xs w-full animate-in slide-in-from-bottom-5">
      <div className="flex items-start gap-3">
        <CalendarDots size={18} className="text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Confirmar reprogramacion</p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium">{state.clienteNombre}</span>{' '}
            &rarr; {format(state.nuevaFechaInicio, "EEE d 'de' MMM 'a las' HH:mm", { locale: es })}
            {' - '}{format(state.nuevaFechaFin, 'HH:mm')}
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? 'Guardando...' : 'Confirmar'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex-1"
              onClick={onCancel}
              disabled={confirming}
            >
              Cancelar
            </Button>
          </div>
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${progress}%`, transition: 'width 0.1s linear' }}
            />
          </div>
        </div>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground shrink-0"
          disabled={confirming}
          aria-label="Cerrar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
