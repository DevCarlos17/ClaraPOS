import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { GastoWizard } from './gasto-wizard'

/**
 * Contenedor fullscreen del wizard de gasto — mobile-only surface, hermana de
 * `GastoForm` (desktop). El caller (W5: `gastos-dashboard.tsx`) decide via
 * `useMobile(1024)` cual de los dos montar; este componente no conoce
 * breakpoints.
 *
 * Usa `Dialog` en vez de `BottomSheet` para ocupar toda la pantalla sin la
 * animacion de entrada "desde abajo" propia del Sheet de Radix. El contenido
 * (navegacion, pasos, panel de resumen) vive en `GastoWizard`.
 */
export function GastoWizardSheet() {
  const { sheetOpen, closeSheet } = useGastoWizardStore()

  return (
    <Dialog open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet() }}>
      <DialogContent className="p-0 gap-0 max-w-none w-full h-[100dvh] rounded-none flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Nuevo Gasto</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <GastoWizard />
        </div>
      </DialogContent>
    </Dialog>
  )
}
