import { useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { useRetencionesIslrCompras, type RetencionIslr } from '@/features/compras/hooks/use-ret-islr-compras'
import { RetIslrCompraForm } from './ret-islr-compra-form'

type RetencionIslrConProveedor = RetencionIslr & { proveedor_nombre: string }

export function RetIslrCompraList() {
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const { retenciones, isLoading } = useRetencionesIslrCompras(
    fechaDesde || undefined,
    fechaHasta || undefined
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Retenciones ISLR
            <span className="text-sm font-normal text-muted-foreground ml-2">({retenciones.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <label htmlFor="ret-islr-desde" className="text-sm text-muted-foreground whitespace-nowrap">
              Desde
            </label>
            <input
              id="ret-islr-desde"
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="rounded-md border border-input bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <label htmlFor="ret-islr-hasta" className="text-sm text-muted-foreground whitespace-nowrap">
              Hasta
            </label>
            <input
              id="ret-islr-hasta"
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="rounded-md border border-input bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nueva Retencion
        </button>
      </div>

      {/* Contenido */}
      {retenciones.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay retenciones de ISLR registradas</p>
          <p className="text-sm mt-1">Haz clic en "Nueva Retencion" para registrar una retencion de ISLR</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nro Comprobante</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Proveedor</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Base Imponible (Bs)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">% Ret.</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monto Retenido (Bs)</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {retenciones.map((ret: RetencionIslrConProveedor) => (
                <tr
                  key={ret.id}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(ret.fecha_comprobante).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 font-mono text-foreground">{ret.nro_comprobante}</td>
                  <td className="px-4 py-3 text-foreground">{ret.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {parseFloat(ret.base_imponible_bs).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {parseFloat(ret.porcentaje_retencion).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {parseFloat(ret.monto_retenido_bs).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ret.status === 'PENDIENTE' ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
                        PENDIENTE
                      </span>
                    ) : ret.status === 'DECLARADO' ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        DECLARADO
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                        ANULADO
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RetIslrCompraForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
