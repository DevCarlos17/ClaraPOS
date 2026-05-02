import { formatDateTime } from '@/lib/format'
import { useMovimientosPeriodo } from '../hooks/use-inventario-reportes'

interface InventarioMovimientosProps {
  fechaDesde: string
  fechaHasta: string
}

function origenLabel(origen: string): string {
  switch (origen) {
    case 'MAN': return 'Manual'
    case 'VEN': return 'Venta'
    case 'COM': return 'Compra'
    case 'ANU': return 'Anulacion'
    case 'AJU': return 'Ajuste'
    case 'NCR': return 'Nota Credito'
    default: return origen
  }
}

export function InventarioMovimientos({ fechaDesde, fechaHasta }: InventarioMovimientosProps) {
  const { movimientos, isLoading } = useMovimientosPeriodo(fechaDesde, fechaHasta)

  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="text-sm font-semibold">Movimientos del Periodo</h3>
      <p className="text-xs text-muted-foreground mb-3">Ultimos 100 movimientos de kardex</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : movimientos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin movimientos en el periodo seleccionado</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Producto</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Origen</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cantidad</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((mov) => (
                <tr key={mov.id} className="border-b border-muted hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {formatDateTime(mov.fecha)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{mov.producto_codigo}</span>
                    <span className="ml-1.5">{mov.producto_nombre}</span>
                  </td>
                  <td className="px-3 py-2">
                    {mov.tipo === 'E' ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        ENTRADA
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                        SALIDA
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{origenLabel(mov.origen)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {parseFloat(mov.cantidad).toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                    {parseFloat(mov.stock_anterior).toFixed(3)}
                    <span className="mx-1 text-muted-foreground/50">&rarr;</span>
                    {parseFloat(mov.stock_nuevo).toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                    {mov.motivo ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
