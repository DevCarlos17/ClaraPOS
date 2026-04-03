import { Trash2 } from 'lucide-react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import type { LineaVentaForm } from '../schemas/venta-schema'

interface LineaItemsProps {
  lineas: LineaVentaForm[]
  tasa: number
  onUpdateCantidad: (index: number, cantidad: number) => void
  onUpdatePrecio: (index: number, precio: number) => void
  onRemove: (index: number) => void
}

export function LineaItems({ lineas, tasa, onUpdateCantidad, onUpdatePrecio, onRemove }: LineaItemsProps) {
  const totalUsd = lineas.reduce((sum, l) => sum + l.cantidad * l.precio_unitario_usd, 0)
  const totalBs = usdToBs(totalUsd, tasa)
  const totalItems = lineas.reduce((sum, l) => sum + l.cantidad, 0)

  if (lineas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Busca y agrega productos para comenzar la venta
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium w-8">#</th>
                <th className="text-left px-3 py-2 font-medium">Codigo</th>
                <th className="text-left px-3 py-2 font-medium">Producto</th>
                <th className="text-center px-3 py-2 font-medium w-24">Cant.</th>
                <th className="text-right px-3 py-2 font-medium w-28">Precio USD</th>
                <th className="text-right px-3 py-2 font-medium w-28">Subtotal USD</th>
                <th className="text-right px-3 py-2 font-medium w-28">Subtotal Bs</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((linea, index) => {
                const subtotalUsd = linea.cantidad * linea.precio_unitario_usd
                const subtotalBs = usdToBs(subtotalUsd, tasa)

                return (
                  <tr key={index} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{linea.codigo}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{linea.nombre}</span>
                      {linea.tipo === 'S' && (
                        <span className="ml-1 text-xs text-blue-600">(Servicio)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        value={linea.cantidad}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val) && val > 0) onUpdateCantidad(index, val)
                        }}
                        className="w-full text-center rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linea.precio_unitario_usd}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val) && val >= 0) onUpdatePrecio(index, val)
                        }}
                        className="w-full text-right rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatUsd(subtotalUsd)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatBs(subtotalBs)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer totales */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{totalItems}</span> items
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Total USD: </span>
            <span className="font-bold text-foreground">{formatUsd(totalUsd)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Bs: </span>
            <span className="font-bold text-foreground">{formatBs(totalBs)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
