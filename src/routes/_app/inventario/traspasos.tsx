import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ExistenciasPorDeposito } from '@/features/inventario/components/existencias/existencias-por-deposito'
import { TraspasoList } from '@/features/inventario/components/traspasos/traspaso-list'

export const Route = createFileRoute('/_app/inventario/traspasos')({
  component: TraspasosPage,
})

/** Named export (no default) para poder renderizarse en tests sin harness de
 * router — ver design.md "Testing Strategy". */
export function TraspasosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Traspasos de Inventario" descripcion="Movimientos de stock entre depositos" />
        <Tabs defaultValue="existencias" className="gap-4">
          <TabsList variant="line" className="w-full justify-start border-b border-border rounded-none h-auto p-0">
            <TabsTrigger value="existencias" className="rounded-none px-4 py-2 h-auto">
              Existencias por deposito
            </TabsTrigger>
            <TabsTrigger value="historico" className="rounded-none px-4 py-2 h-auto">
              Historico de traspasos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existencias" className="mt-0">
            <ExistenciasPorDeposito />
          </TabsContent>

          <TabsContent value="historico" className="mt-0">
            <TraspasoList />
          </TabsContent>
        </Tabs>
      </div>
    </RequirePermission>
  )
}
