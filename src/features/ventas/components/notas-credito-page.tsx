import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FacturasEmpresaTab } from './facturas-empresa-tab'
import { NotasCreditoTab } from './notas-credito-tab'

/**
 * Ruta "Facturas emitidas" (design.md §Decision 1, mismo patron que
 * `traspasos.tsx`/`gastos-dashboard.tsx`/`horarios-staff-page.tsx`: `Tabs`
 * shadcn sin rutas anidadas ni search param). Pestana "Facturas" primaria y
 * activa por defecto; "Notas de credito" secundaria conserva el
 * comportamiento existente sin cambios (Slice C3a — estructura + contenido
 * movido; filtros nuevos llegan en Slice C3b).
 */
export function NotasCreditoPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Facturas emitidas" descripcion="Consulta de facturas y notas de credito" />

      <Tabs defaultValue="facturas" className="gap-0">
        <div className="w-full rounded-t-2xl bg-card">
          <TabsList variant="line" className="justify-start rounded-none h-auto p-0">
            <TabsTrigger value="facturas" className="rounded-none px-4 py-2 h-auto after:bg-primary">
              Facturas
            </TabsTrigger>
            <TabsTrigger value="notas-credito" className="rounded-none px-4 py-2 h-auto after:bg-primary">
              Notas de credito
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="facturas">
          <FacturasEmpresaTab />
        </TabsContent>

        <TabsContent value="notas-credito">
          <NotasCreditoTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
