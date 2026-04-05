import { useProductosStockCritico } from '../hooks/use-inventario-reportes'

export function InventarioStockCritico() {
  const { productos, isLoading } = useProductosStockCritico()

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">Stock Critico</h3>
      <p className="text-xs text-muted-foreground mb-3">Productos por debajo del minimo</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Sin productos en stock critico</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Codigo</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Producto</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Depto.</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Minimo</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Deficit</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p, i) => (
                <tr key={p.codigo} className="border-b border-muted">
                  <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 font-mono text-xs">{p.codigo}</td>
                  <td className="px-2 py-2 font-medium truncate max-w-[120px]">{p.nombre}</td>
                  <td className="px-2 py-2 text-muted-foreground truncate max-w-[100px]">{p.departamento}</td>
                  <td className="px-2 py-2 text-right">{p.stock.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right">{p.stockMinimo.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right font-bold text-red-600">-{p.deficit.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
