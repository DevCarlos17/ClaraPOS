import { DownloadSimple } from '@phosphor-icons/react'
import { usePWAUpdate } from '@/hooks/use-pwa-update'

export function PWAUpdateBanner() {
  const { hayActualizacion, actualizar } = usePWAUpdate()

  if (!hayActualizacion) return null

  // Banner NO descartable: no hay boton de cerrar. La unica salida es actualizar.
  return (
    <div className="fixed top-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md z-[60] animate-in slide-in-from-top-4 duration-500">
      <div className="bg-card rounded-2xl shadow-2xl p-4 border border-border">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center flex-shrink-0 pt-0.5">
            <DownloadSimple className="w-8 h-8 text-green-600 dark:text-green-400" weight="bold" />
          </div>

          <div className="flex-1">
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
