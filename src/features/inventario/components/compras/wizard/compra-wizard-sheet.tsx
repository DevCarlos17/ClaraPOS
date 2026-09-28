import { BottomSheet } from '@/components/shared/bottom-sheet'
import { useCompraWizardStore } from '@/stores/compra-wizard-store'
import { CompraWizard } from './compra-wizard'

/**
 * Wrapper `BottomSheet` del wizard de compra — mobile-only surface, hermana
 * de `CompraForm` (desktop). El caller (W5) decide via `useMobile(1024)`
 * cual de los dos montar; este componente no conoce breakpoints. Navegacion,
 * validacion y submit viven todos en `CompraWizard` (orquestador) — este
 * wrapper solo controla el `Sheet` (mismo patron que `gasto-wizard-sheet.tsx`).
 */
export function CompraWizardSheet() {
  const { sheetOpen, closeSheet } = useCompraWizardStore()

  return (
    <BottomSheet
      open={sheetOpen}
      onOpenChange={(open) => {
        if (!open) closeSheet()
      }}
      title="Nueva Factura de Compra"
      bodyClassName="px-4 pb-4 pt-2"
    >
      <CompraWizard />
    </BottomSheet>
  )
}
