import { Receipt } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'

/**
 * Pestana primaria de "Facturas emitidas" (Slice C3a — design.md §Decision
 * 1/3). Placeholder estructural: la tabla real empresa-wide sobre
 * `useFacturasEmpresa` + filtros (fecha, nro_factura, cliente, RIF) llega en
 * Slice C3b. Este slice solo monta la pestana con el shell visual.
 */
export function FacturasEmpresaTab() {
  return (
    <div className="rounded-2xl bg-card shadow-lg">
      <div className="flex flex-col items-center justify-center gap-4 text-center py-16 px-6">
        <div className="p-4 rounded-2xl bg-muted">
          <Receipt className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Listado de facturas emitidas</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            La tabla con filtros por fecha, numero de factura, cliente y RIF se habilita
            en la proxima entrega.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          Proximamente
        </Badge>
      </div>
    </div>
  )
}
