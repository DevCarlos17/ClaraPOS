import { useState } from 'react'
import { CheckCircle, Warning, FileXls } from '@phosphor-icons/react'
import { useBalanceComprobacion, type FiltrosBalance } from '../hooks/use-balance-comprobacion'
import { formatUsd } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TIPO_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  PASIVO: 'Pasivo',
  PATRIMONIO: 'Patrimonio',
  INGRESO: 'Ingreso',
  COSTO: 'Costo',
  GASTO: 'Gasto',
}

const TIPO_COLORS: Record<string, string> = {
  ACTIVO: 'bg-blue-50 text-blue-700',
  PASIVO: 'bg-orange-50 text-orange-700',
  PATRIMONIO: 'bg-purple-50 text-purple-700',
  INGRESO: 'bg-green-50 text-green-700',
  COSTO: 'bg-red-50 text-red-700',
  GASTO: 'bg-rose-50 text-rose-700',
}

export function BalanceComprobacion() {
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [filtrosActivos, setFiltrosActivos] = useState<FiltrosBalance>({})

  const { filas, totales, isLoading, cuadrado } = useBalanceComprobacion(filtrosActivos)

  function handleConsultar() {
    setFiltrosActivos({
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    })
  }

  function handleLimpiar() {
    setFechaDesde('')
    setFechaHasta('')
    setFiltrosActivos({})
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end p-4 bg-muted/30 rounded-lg border">
        <div className="space-y-1.5">
          <Label className="text-xs">Desde</Label>
          <Input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="w-40 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Hasta</Label>
          <Input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="w-40 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleConsultar} size="sm">
            Consultar
          </Button>
          {(filtrosActivos.fechaDesde || filtrosActivos.fechaHasta) && (
            <Button onClick={handleLimpiar} size="sm" variant="outline">
              Limpiar
            </Button>
          )}
        </div>
        {filtrosActivos.fechaDesde && (
          <div className="text-xs text-muted-foreground self-end pb-2">
            Periodo: {filtrosActivos.fechaDesde} al {filtrosActivos.fechaHasta ?? 'hoy'}
          </div>
        )}
      </div>

      {/* Indicador de cuadre */}
      {filas.length > 0 && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
            cuadrado
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {cuadrado ? (
            <>
              <CheckCircle size={16} />
              Partida doble correcta: DEBE ({formatUsd(totales.totalDebe)}) = HABER ({formatUsd(totales.totalHaber)})
            </>
          ) : (
            <>
              <Warning size={16} />
              Advertencia: DEBE ({formatUsd(totales.totalDebe)}) no iguala HABER ({formatUsd(totales.totalHaber)})
            </>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-28">Codigo</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cuenta</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-28">Tipo</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground w-36">DEBE</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground w-36">HABER</th>
              <th className="text-right px-4 py-3 font-semibold text-blue-600 w-36">Saldo Deudor</th>
              <th className="text-right px-4 py-3 font-semibold text-emerald-600 w-36">Saldo Acreedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && filas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileXls size={32} className="opacity-30" />
                    <span className="text-sm">No hay asientos contables en el periodo seleccionado</span>
                  </div>
                </td>
              </tr>
            )}
            {filas.map((fila) => (
              <tr key={fila.cuenta_id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {fila.codigo}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    style={{ paddingLeft: `${(fila.nivel - 1) * 12}px` }}
                    className="font-medium"
                  >
                    {fila.nombre}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      TIPO_COLORS[fila.tipo] ?? 'bg-gray-50 text-gray-700'
                    }`}
                  >
                    {TIPO_LABELS[fila.tipo] ?? fila.tipo}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fila.total_debe > 0 ? formatUsd(fila.total_debe) : '-'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fila.total_haber > 0 ? formatUsd(fila.total_haber) : '-'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-blue-700 font-medium">
                  {fila.saldo_deudor > 0 ? formatUsd(fila.saldo_deudor) : '-'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-medium">
                  {fila.saldo_acreedor > 0 ? formatUsd(fila.saldo_acreedor) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot className="bg-muted/50 border-t-2 border-border">
              <tr className="font-semibold">
                <td colSpan={3} className="px-4 py-3 text-right text-muted-foreground">
                  TOTALES
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatUsd(totales.totalDebe)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatUsd(totales.totalHaber)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-blue-700">
                  {formatUsd(totales.totalSaldoDeudor)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                  {formatUsd(totales.totalSaldoAcreedor)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
