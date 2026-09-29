import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCompraWizardStore } from '@/stores/compra-wizard-store'
import { CompraWizard } from './compra-wizard'

/**
 * Contenedor fullscreen del wizard de compra — mobile-only surface, hermana
 * de `CompraForm` (desktop). El caller (W5) decide via `useMobile(1024)` cual
 * de los dos montar; este componente no conoce breakpoints.
 *
 * Usa `Dialog` fullscreen (en vez del `BottomSheet` original) para ocupar toda
 * la pantalla sin la animacion "desde abajo". La decision de PVP ya NO usa un
 * sheet stackeado (`PvpConfirmSheet` eliminado) — ahora se resuelve inline en
 * `paso-productos.tsx`, debajo del producto en configuracion.
 */
export function CompraWizardSheet() {
  const { sheetOpen, closeSheet } = useCompraWizardStore()

  return (
    <Dialog open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet() }}>
      <DialogContent className="p-0 gap-0 max-w-none w-full h-[100dvh] rounded-none flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Nueva Factura de Compra</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <CompraWizard />
        </div>
      </DialogContent>
    </Dialog>
  )
}
