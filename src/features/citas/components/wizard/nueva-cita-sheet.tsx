import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NuevaCitaWizard } from './nueva-cita-wizard'
import { RequirePermission } from '@/components/shared/require-permission'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { useCitaWizardStore } from '@/stores/cita-wizard-store'

export function NuevaCitaSheet() {
  const { sheetOpen, closeSheet } = useCitaWizardStore()

  return (
    <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg lg:max-w-[672px] flex flex-col overflow-hidden p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle>Nueva Cita</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-0">
          <RequirePermission permission={PERMISSIONS.CITAS_CREATE}>
            <NuevaCitaWizard />
          </RequirePermission>
        </div>
      </SheetContent>
    </Sheet>
  )
}
