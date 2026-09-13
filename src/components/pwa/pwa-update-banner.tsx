import { useState } from 'react'
import { DownloadSimple, X } from '@phosphor-icons/react'
import { usePWAUpdate } from '@/hooks/use-pwa-update'

export function PWAUpdateBanner() {
  const { hayActualizacion, actualizar } = usePWAUpdate()
  // Minimizado: el usuario cerro el banner grande (p. ej. estaba en un
  // formulario y le tapaba el trabajo). El update NO se cancela — se colapsa a
  // un FAB flotante que reabre el banner. Asi nunca se pierde el acceso a
  // actualizar. Estado local: se reinicia si el componente se re-monta, pero
  // mientras haya actualizacion pendiente el usuario siempre tiene una via.
  const [minimizado, setMinimizado] = useState(false)

  if (!hayActualizacion) return null

  // Estado minimizado: FAB abajo a la derecha. Se eleva a bottom-20 (no bottom-4)
  // para que, en el caso raro de coexistir con el banner de instalacion PWA
  // (que vive en bottom-4 right-4), queden APILADOS y no encimados.
  // Un toque reabre el banner completo — NO actualiza directo, para evitar
  // recargas accidentales que borren un formulario a medio llenar.
  if (minimizado) {
    return (
      <button
        onClick={() => setMinimizado(false)}
        aria-label="Ver actualizacion disponible"
        className="fixed bottom-14 right-10 z-[60] w-12 h-12 rounded-full bg-card border border-green-200 dark:border-green-900 shadow-2xl flex items-center justify-center hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors active:scale-95 animate-in zoom-in-50 duration-300"
      >
        <DownloadSimple className="w-6 h-6 text-green-600 dark:text-green-400" weight="bold" />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 ring-2 ring-card" />
      </button>
    )
  }

  // Banner completo: centrado en X, a ~1/3 de la altura. Descartable (X) para no
  // bloquear al usuario que esta trabajando; cerrarlo minimiza al FAB.
  return (
    <div className="fixed top-1/3 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md z-[60] animate-in slide-in-from-top-4 duration-500">
      <div className="relative bg-card rounded-2xl shadow-2xl p-4 border border-border">
        <button
          onClick={() => setMinimizado(true)}
          aria-label="Cerrar (seguir despues)"
          className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors active:scale-95"
        >
          <X className="w-4 h-4" weight="bold" />
        </button>

        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center flex-shrink-0 pt-0.5">
            <DownloadSimple className="w-8 h-8 text-green-600 dark:text-green-400" weight="bold" />
          </div>

          <div className="flex-1 pr-6">
            <h3 className="text-foreground font-bold text-sm mb-1">Nueva version disponible</h3>
            <p className="text-muted-foreground text-xs mb-3">
              Hay una actualizacion lista. Guarda lo que estes haciendo y actualiza para
              usar la ultima version.
            </p>

            <button
              onClick={actualizar}
              className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center active:scale-95"
            >
              Actualizar ahora
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
