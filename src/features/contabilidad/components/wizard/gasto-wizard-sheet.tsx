import { BottomSheet } from '@/components/shared/bottom-sheet'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { GastoWizard } from './gasto-wizard'

/**
 * Wrapper `BottomSheet` del wizard de gasto — mobile-only surface, hermana de
 * `GastoForm` (desktop). El caller (W5: `gastos-dashboard.tsx`) decide via
 * `useMobile(1024)` cual de los dos montar; este componente no conoce
 * breakpoints. Navegacion, validacion y submit viven todos en `GastoWizard`
 * (orquestador) — este wrapper solo controla el `Sheet` (mismo patron que
 * `nueva-cita-sheet.tsx`, sin usar el prop `footer` de `BottomSheet` para
 * mantener la logica de pasos/resumen/submit en un unico componente).
 */
export function GastoWizardSheet() {
  const { sheetOpen, closeSheet } = useGastoWizardStore()

  return (
    <BottomSheet
      open={sheetOpen}
      onOpenChange={(open) => {
        if (!open) closeSheet()
      }}
      title="Nuevo Gasto"
      bodyClassName="px-4 pb-4 pt-2"
    >
      <GastoWizard />
    </BottomSheet>
  )
}
