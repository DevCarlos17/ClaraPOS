import { useRef, forwardRef, useImperativeHandle } from 'react'
import { Trash } from '@phosphor-icons/react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import type { LineaVentaForm } from '../schemas/venta-schema'

interface LineaItemsProps {
  lineas: LineaVentaForm[]
  tasa: number
  onUpdateCantidad: (index: number, cantidad: number) => void
  onRemove: (index: number) => void
  onCantidadEnter?: () => void
  /** When true, shows only 5 columns: #, Producto, Cant., Precio USD, delete */
  compact?: boolean
}

export interface LineaItemsHandle {
  focusCantidad: (index: number) => void
}

export const LineaItems = forwardRef<LineaItemsHandle, LineaItemsProps>(
function LineaItems({ lineas, tasa, onUpdateCantidad, onRemove, onCantidadEnter, compact = false }, ref) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useImperativeHandle(ref, () => ({
    focusCantidad: (index: number) => {
      const el = inputRefs.current[index]
      if (el) {
        el.focus()
        el.select()
      }
    },
  }))

  if (lineas.length === 0) {
    return (
      <div className={`rounded-2xl bg-card shadow-lg border border-dashed text-center text-sm text-muted-foreground ${compact ? 'p-6' : 'p-8'}`}>
        {compact
          ? 'Agrega productos para iniciar la venta'
          : 'Busca y agrega productos para comenzar la venta'}
      </div>
    )
  }

  if (compact) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium w-8">#</th>
              <th className="text-left px-3 py-2 font-medium">Producto</th>
              <th className="text-center px-3 py-2 font-medium w-20">Cant.</th>
              <th className="text-right px-3 py-2 font-medium w-24">Precio USD</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea, index) => {
              const cantidadInvalida = linea.cantidad <= 0
              const esServicio = linea.tipo === 'S'
              const stockDisponible = esServicio ? null : linea.stock_actual - linea.cantidad
              const stockExcedido = !esServicio && stockDisponible !== null && stockDisponible < 0

              return (
                <tr
                  key={index}
                  className={`border-b last:border-b-0 hover:bg-muted/30 ${stockExcedido ? 'bg-destructive/5' : ''}`}
                >
                  <td className="px-3 py-1.5 text-muted-foreground text-xs">{index + 1}</td>
                  <td className="px-3 py-1.5 max-w-0">
                    <p className="font-medium text-xs truncate">{linea.nombre}</p>
                    {esServicio && (
                      <p className="text-[10px] text-blue-600">Servicio</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      ref={(el) => { inputRefs.current[index] = el }}
                      type="number"
                      min="0"
                      step={linea.es_decimal ? 'any' : '1'}
                      value={linea.cantidad === 0 ? '' : linea.cantidad}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          onUpdateCantidad(index, 0)
                          return
                        }
                        const val = linea.es_decimal ? parseFloat(raw) : parseInt(raw, 10)
                        if (!isNaN(val) && val >= 0) onUpdateCantidad(index, val)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === '-') e.preventDefault()
                        if (!linea.es_decimal && (e.key === '.' || e.key === ',')) e.preventDefault()
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          onCantidadEnter?.()
                        }
                      }}
                      className={`w-full text-center rounded border bg-white px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
                        cantidadInvalida || stockExcedido ? 'border-destructive text-destructive' : ''
                      }`}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                    {formatUsd(linea.precio_unitario_usd)}
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium w-8">#</th>
                <th className="text-left px-3 py-2 font-medium">Codigo</th>
                <th className="text-left px-3 py-2 font-medium">Producto</th>
                <th className="text-center px-3 py-2 font-medium w-24">Cant.</th>
                <th className="text-center px-3 py-2 font-medium w-24">Stock Disp.</th>
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
                const cantidadInvalida = linea.cantidad <= 0
                const esServicio = linea.tipo === 'S'
                const stockDisponible = esServicio ? null : linea.stock_actual - linea.cantidad
                const stockExcedido = !esServicio && stockDisponible !== null && stockDisponible < 0

                return (
                  <tr key={index} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{linea.codigo}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{linea.nombre}</span>
                      {esServicio && (
                        <span className="ml-1 text-xs text-blue-600">(Servicio)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        ref={(el) => { inputRefs.current[index] = el }}
                        type="number"
                        min="0"
                        step={linea.es_decimal ? 'any' : '1'}
                        value={linea.cantidad === 0 ? '' : linea.cantidad}
                        onChange={(e) => {
                          const raw = e.target.value
                          if (raw === '') {
                            onUpdateCantidad(index, 0)
                            return
                          }
                          const val = linea.es_decimal ? parseFloat(raw) : parseInt(raw, 10)
                          if (!isNaN(val) && val >= 0) onUpdateCantidad(index, val)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === '-') e.preventDefault()
                          if (!linea.es_decimal && (e.key === '.' || e.key === ',')) e.preventDefault()
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            onCantidadEnter?.()
                          }
                        }}
                        className={`w-full text-center rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                          cantidadInvalida || stockExcedido ? 'border-destructive text-destructive' : ''
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {esServicio ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`text-xs font-medium ${
                            stockDisponible !== null && stockDisponible < 0
                              ? 'text-destructive'
                              : stockDisponible !== null && stockDisponible <= 3
                              ? 'text-orange-500'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {stockDisponible !== null
                            ? stockDisponible.toFixed(linea.es_decimal ? 3 : 0)
                            : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {formatUsd(linea.precio_unitario_usd)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatUsd(subtotalUsd)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatBs(subtotalBs)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
})
