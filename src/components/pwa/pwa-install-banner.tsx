import { X, Download, Smartphone, Lightbulb } from 'lucide-react'
import { usePWAInstall } from '@/hooks/use-pwa-install'
import { useState } from 'react'

export function PWAInstallBanner() {
  const { isInstallable, install } = usePWAInstall()
  const [isDismissed, setIsDismissed] = useState(false)

  if (!isInstallable || isDismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-50 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-2xl p-4 border border-blue-400/50">
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-lg transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4 text-white" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1">
            <h3 className="text-white font-bold text-sm mb-1">Instalar Nexo21</h3>
            <p className="text-white/90 text-xs mb-3">
              Instala la app para acceso rapido y funcionamiento offline completo.
            </p>

            <button
              onClick={install}
              className="w-full bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 active:scale-95"
            >
              <Download className="w-4 h-4" />
              Instalar aplicacion
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/20">
          <p className="text-white/80 text-xs flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>Beneficio:</strong> Funciona sin internet y se abre como app nativa.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
