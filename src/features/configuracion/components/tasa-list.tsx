import { useTasasHistorial } from '../hooks/use-tasas'
import { formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'

export function TasaList() {
  const { tasas, isLoading } = useTasasHistorial()

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6">
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (tasas.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6 text-center">
        <p className="text-muted-foreground">No hay tasas registradas</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold">Historial de Tasas (ultimas 10)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Valor (Bs/$)
              </th>
            </tr>
          </thead>
          <tbody>
            {tasas.map((tasa, index) => (
              <tr
                key={tasa.id}
                className={`border-b last:border-0 ${index === 0 ? 'bg-primary/5 font-medium' : ''}`}
              >
                <td className="px-6 py-3 text-sm">{formatDateTime(tasa.fecha)}</td>
                <td className="px-6 py-3 text-sm text-right tabular-nums">
                  {formatTasa(tasa.valor)}
                  {index === 0 && (
                    <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Actual
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
