import { useRef, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { formatUsd } from '@/lib/currency'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'

interface ValorInventarioModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  departamentos: Departamento[]
}

const BAR_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#4f46e5',
  '#be123c',
]

interface DeptoData {
  nombre: string
  valor: number
  items: number
}

export function ValorInventarioModal({
  isOpen,
  onClose,
  productos,
  departamentos,
}: ValorInventarioModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const { data, total } = useMemo(() => {
    const depMap = new Map<string, string>()
    for (const d of departamentos) depMap.set(d.id, d.nombre)

    const acc = new Map<string, DeptoData>()

    for (const p of productos) {
      if (p.tipo !== 'P' || p.activo !== 1) continue
      const costo = parseFloat(p.costo_usd)
      const stock = parseFloat(p.stock)
      if (isNaN(costo) || isNaN(stock) || stock <= 0) continue

      const valor = costo * stock
      const nombre = depMap.get(p.departamento_id) ?? 'Sin departamento'
      const current = acc.get(p.departamento_id) ?? {
        nombre,
        valor: 0,
        items: 0,
      }
      current.valor += valor
      current.items += 1
      acc.set(p.departamento_id, current)
    }

    const sorted = Array.from(acc.values()).sort((a, b) => b.valor - a.valor)
    const total = sorted.reduce((sum, d) => sum + d.valor, 0)
    return { data: sorted, total }
  }, [productos, departamentos])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-3xl shadow-xl max-h-[90vh]"
    >
      <div className="flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">
              Distribucion del Inventario
            </h2>
            <p className="text-xs text-muted-foreground">
              Valor en USD por departamento - Total: {formatUsd(total)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {data.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">
                No hay productos con existencia para mostrar
              </p>
            </div>
          ) : (
            <>
              {/* Grafico de barras */}
              <div className="h-72 w-full mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data}
                    margin={{ top: 10, right: 20, left: 10, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="nombre"
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      tick={{ fontSize: 11, fill: '#475569' }}
                      height={70}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#475569' }}
                      tickFormatter={(v) => `$${v.toFixed(0)}`}
                    />
                    <Tooltip
                      formatter={(value) => [
                        formatUsd(Number(value ?? 0)),
                        'Valor',
                      ]}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                      {data.map((_, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={BAR_COLORS[i % BAR_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabla resumen */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-2 font-medium text-gray-700">
                        Departamento
                      </th>
                      <th className="text-right px-4 py-2 font-medium text-gray-700">
                        Productos
                      </th>
                      <th className="text-right px-4 py-2 font-medium text-gray-700">
                        Valor USD
                      </th>
                      <th className="text-right px-4 py-2 font-medium text-gray-700">
                        % del Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d, i) => {
                      const pct = total > 0 ? (d.valor / total) * 100 : 0
                      return (
                        <tr
                          key={d.nombre}
                          className="border-b border-gray-100 last:border-0"
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-sm"
                                style={{
                                  backgroundColor:
                                    BAR_COLORS[i % BAR_COLORS.length],
                                }}
                              />
                              <span className="text-gray-900">{d.nombre}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                            {d.items}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">
                            {formatUsd(d.valor)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-900 bg-gray-50 font-semibold">
                      <td className="px-4 py-2 text-gray-900">Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {data.reduce((sum, d) => sum + d.items, 0)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatUsd(total)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        100.0%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  )
}
