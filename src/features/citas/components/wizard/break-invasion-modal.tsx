import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { Coffee, Warning } from '@phosphor-icons/react'
import type { AgendaConfig } from '../../hooks/use-agenda-config'

interface BreakInvasionModalProps {
  isOpen: boolean
  horaInicio: string
  horaFin: string
  manejoConfig: AgendaConfig['manejo_descanso_invadido']
  onConfirmed: (politica: AgendaConfig['manejo_descanso_invadido'], supervisorId: string) => void
  onCancel: () => void
}

export function BreakInvasionModal({
  isOpen,
  horaInicio,
  horaFin,
  manejoConfig,
  onConfirmed,
  onCancel,
}: BreakInvasionModalProps) {
  const [politica, setPolitica] = useState<AgendaConfig['manejo_descanso_invadido']>(manejoConfig)
  const [showPin, setShowPin] = useState(false)

  const handleSolicitarAutorizacion = () => {
    setShowPin(true)
  }

  const handleAutorizado = (supervisorId: string) => {
    setShowPin(false)
    onConfirmed(politica, supervisorId)
  }

  return (
    <>
      <Dialog open={isOpen && !showPin} onOpenChange={(v) => !v && onCancel()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Coffee size={18} />
              Horario de Descanso
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 flex gap-2">
              <Warning size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                El horario <strong>{horaInicio} - {horaFin}</strong> cae dentro del descanso del profesional.
                Se requiere autorización de supervisor para agendar en este horario.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Politica para el descanso invadido</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="DESPLAZAR"
                    checked={politica === 'DESPLAZAR'}
                    onChange={() => setPolitica('DESPLAZAR')}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">Desplazar descanso</p>
                    <p className="text-xs text-muted-foreground">
                      El descanso se acorta para que termine antes de esta cita.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="TIEMPO_EXTRA"
                    checked={politica === 'TIEMPO_EXTRA'}
                    onChange={() => setPolitica('TIEMPO_EXTRA')}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">Agregar tiempo extra</p>
                    <p className="text-xs text-muted-foreground">
                      El profesional recupera el tiempo al final de su jornada.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
                Cancelar
              </Button>
              <Button size="sm" className="flex-1" onClick={handleSolicitarAutorizacion}>
                Autorizar con PIN
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SupervisorPinDialog
        isOpen={showPin}
        onClose={() => { setShowPin(false); onCancel() }}
        onAuthorized={handleAutorizado}
        titulo="Autorizar Invasion de Descanso"
        mensaje="Se requiere autorización de supervisor para agendar en el horario de descanso del profesional."
        requiredPermission="citas.gestionar"
      />
    </>
  )
}
