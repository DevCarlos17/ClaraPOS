import { useRef } from 'react'
import { BottomSheet } from '@/components/shared/bottom-sheet'
import { useCompraWizardStore } from '@/stores/compra-wizard-store'
import { CompraWizard } from './compra-wizard'
import { PvpConfirmSheet } from './pvp-confirm-sheet'

/**
 * Wrapper `BottomSheet` del wizard de compra — mobile-only surface, hermana
 * de `CompraForm` (desktop). El caller (W5) decide via `useMobile(1024)`
 * cual de los dos montar; este componente no conoce breakpoints. Navegacion,
 * validacion y submit viven todos en `CompraWizard` (orquestador) — este
 * wrapper solo controla el `Sheet` (mismo patron que `gasto-wizard-sheet.tsx`).
 *
 * `wizardContentRef` apunta al nodo DOM del `SheetContent` de este wizard —
 * se reenvia como `containerRef` a `PvpConfirmSheet` (W4b-ii) para que ese
 * sheet secundario (decision de PVP por nivel, Paso 2) stackee ENCIMA de
 * este, en vez de portalizar a `document.body` y competir en z-index.
 * `PvpConfirmSheet` se monta siempre (hermano de `BottomSheet`, no hijo): su
 * propia visibilidad la gobierna `pvpPendienteLineaIdx` en el store, y para
 * cuando ese indice se setea el wizard ya esta abierto (Paso 2 solo es
 * alcanzable con el sheet montado), asi que `wizardContentRef.current` ya
 * esta poblado.
 */
export function CompraWizardSheet() {
  const { sheetOpen, closeSheet } = useCompraWizardStore()
  const wizardContentRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <BottomSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet()
        }}
        title="Nueva Factura de Compra"
        bodyClassName="px-4 pb-4 pt-2"
        contentRef={wizardContentRef}
      >
        <CompraWizard />
      </BottomSheet>
      <PvpConfirmSheet containerRef={wizardContentRef} />
    </>
  )
}
