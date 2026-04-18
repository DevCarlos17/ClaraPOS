import { createFileRoute } from '@tanstack/react-router'
import { RecetaManager } from '@/features/inventario/components/recetas/receta-manager'
import { ComboList } from '@/features/inventario/components/recetas/combo-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const Route = createFileRoute('/_app/inventario/recetas')({
  component: RecetasPage,
})

function RecetasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Recetas" descripcion="Bill of Materials - Ingredientes por servicio y combos" />
        <Tabs defaultValue="servicios">
          <TabsList>
            <TabsTrigger value="servicios">Servicios</TabsTrigger>
            <TabsTrigger value="combos">Combos / Recetas</TabsTrigger>
          </TabsList>
          <TabsContent value="servicios" className="mt-4">
            <RecetaManager />
          </TabsContent>
          <TabsContent value="combos" className="mt-4">
            <ComboList />
          </TabsContent>
        </Tabs>
      </div>
    </RequirePermission>
  )
}
