import { formatUsd } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTopProductosRango, type TopProductoRango } from '@/features/dashboard/hooks/use-dashboard'

export function DashboardTopRotacion() {
  const { productos: mayorRotacion, isLoading: loadingMayor } = useTopProductosRango(30, 10, 'DESC')
  const { productos: menorRotacion, isLoading: loadingMenor } = useTopProductosRango(30, 10, 'ASC')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <RotacionTable
        titulo="Mayor Rotacion"
        subtitulo="Top 10 mas vendidos (ultimos 30 dias)"
        productos={mayorRotacion}
        isLoading={loadingMayor}
        emptyMsg="Sin ventas en los ultimos 30 dias"
      />
      <RotacionTable
        titulo="Menor Rotacion"
        subtitulo="Top 10 menos vendidos (ultimos 30 dias)"
        productos={menorRotacion}
        isLoading={loadingMenor}
        emptyMsg="Sin ventas en los ultimos 30 dias"
      />
    </div>
  )
}

function RotacionTable({
  titulo,
  subtitulo,
  productos,
  isLoading,
  emptyMsg,
}: {
  titulo: string
  subtitulo: string
  productos: TopProductoRango[]
  isLoading: boolean
  emptyMsg: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="text-xs text-muted-foreground mb-3">{subtitulo}</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">{emptyMsg}</p>
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
