import { formatUsd } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTopProductos } from '../hooks/use-cuadre'

interface TopProductosProps {
  fecha: string
}

export function TopProductos({ fecha }: TopProductosProps) {
  const { productos, isLoading } = useTopProductos(fecha)

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Top Productos</h3>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (productos.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Top Productos</h3>
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Sin productos vendidos en esta fecha</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4">Top Productos Vendidos</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Codigo</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Producto</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cantidad</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total USD</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p, i) => (
              <tr key={p.codigo} className="border-b border-muted">
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.codigo}</td>
                <td className="px-3 py-2 font-medium">{p.nombre}</td>
                <td className="px-3 py-2 text-right">{formatNumber(p.cantidad, 0)}</td>
                <td className="px-3 py-2 text-right font-bold">{formatUsd(p.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
