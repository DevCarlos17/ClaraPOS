import { formatUsd } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTopProductosVentas, useTopClientesVentas } from '../hooks/use-ventas-reportes'
import type { TopProductoVentas, TopClienteVentas } from '../hooks/use-ventas-reportes'

interface VentasReportesRankingsProps {
  fechaDesde: string
  fechaHasta: string
}

export function VentasReportesRankings({ fechaDesde, fechaHasta }: VentasReportesRankingsProps) {
  const { productos, isLoading: loadingProductos } = useTopProductosVentas(fechaDesde, fechaHasta)
  const { clientes, isLoading: loadingClientes } = useTopClientesVentas(fechaDesde, fechaHasta)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ProductosTable
        productos={productos}
        isLoading={loadingProductos}
      />
      <ClientesTable
        clientes={clientes}
        isLoading={loadingClientes}
      />
    </div>
  )
}

function ProductosTable({
  productos,
  isLoading,
}: {
  productos: TopProductoVentas[]
  isLoading: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">Top 10 Productos</h3>
      <p className="text-xs text-muted-foreground mb-3">Mas vendidos en el periodo</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Sin ventas en este periodo</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Codigo</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Producto</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Cant.</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p, i) => (
                <tr key={p.codigo} className="border-b border-muted">
                  <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 font-mono text-xs">{p.codigo}</td>
                  <td className="px-2 py-2 font-medium truncate max-w-[120px]">{p.nombre}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(p.cantidad, 0)}</td>
                  <td className="px-2 py-2 text-right font-bold">{formatUsd(p.totalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ClientesTable({
  clientes,
  isLoading,
}: {
  clientes: TopClienteVentas[]
  isLoading: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">Top 10 Clientes</h3>
      <p className="text-xs text-muted-foreground mb-3">Mayor volumen de compras</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Sin ventas en este periodo</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Identificacion</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Fact.</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr key={c.identificacion} className="border-b border-muted">
                  <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 font-medium truncate max-w-[120px]">{c.nombre}</td>
                  <td className="px-2 py-2 font-mono text-xs">{c.identificacion}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(c.facturas, 0)}</td>
                  <td className="px-2 py-2 text-right font-bold">{formatUsd(c.totalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
