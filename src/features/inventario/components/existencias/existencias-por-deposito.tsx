import { useState, useMemo } from 'react'
import { useExistenciasPorDeposito } from '@/features/inventario/hooks/use-inventario-stock'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { ordenarDepositosColumnas } from '@/features/inventario/lib/existencias-pivot'

/**
 * Matriz de existencias producto x deposito, de solo lectura. Mismo look &
 * feel (tabla hand-rolled, filtro de texto, empty states) que `ProductoList`
 * / `TraspasoList` — no usa `DataTable` (decision del proposal: `DataTable`
 * no se usa en ningun lado del codebase).
 *
 * READ-ONLY: no dispara ningun `writeTransaction` (spec EPD/Vista de Solo
 * Lectura).
 */
export function ExistenciasPorDeposito() {
  const { rows, isLoading: rowsLoading } = useExistenciasPorDeposito()
  const { depositos, isLoading: depositosLoading } = useDepositosActivos()
  const [filtroTexto, setFiltroTexto] = useState('')

  const columnas = useMemo(() => ordenarDepositosColumnas(depositos), [depositos])

  const filasFiltradas = useMemo(() => {
    if (!filtroTexto.trim()) return rows
    const q = filtroTexto.toUpperCase()
    return rows.filter((r) => r.nombre.toUpperCase().includes(q) || r.codigo.toUpperCase().includes(q))
  }, [rows, filtroTexto])

  const isLoading = rowsLoading || depositosLoading

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6 space-y-3">
        <div className="h-10 w-64 bg-muted rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg font-semibold">Existencias por Deposito</h2>
        <input
          type="text"
          placeholder="Buscar por nombre o codigo..."
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring w-64"
        />
      </div>

      {columnas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay depositos activos configurados</p>
          <p className="text-sm mt-1">Configura al menos un deposito activo para ver existencias</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay productos almacenables</p>
          <p className="text-sm mt-1">Crea un producto de tipo Producto para ver sus existencias</p>
        </div>
      ) : filasFiltradas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No se encontraron productos</p>
          <p className="text-sm mt-1">Ajusta el termino de busqueda</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Codigo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                {columnas.map((dep) => (
                  <th key={dep.id} className="text-right px-4 py-3 font-medium text-muted-foreground">
                    {dep.nombre}
                    {dep.es_principal === 1 && (
                      <span className="ml-1 text-[10px] text-blue-600 font-semibold">(Principal)</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((row) => (
                <tr key={row.producto_id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-foreground">{row.codigo}</td>
                  <td className="px-4 py-3 text-foreground">{row.nombre}</td>
                  {columnas.map((dep) => (
                    <td key={dep.id} className="px-4 py-3 text-right text-foreground">
                      {row.cantidadPorDeposito[dep.id] ?? '0.000'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
