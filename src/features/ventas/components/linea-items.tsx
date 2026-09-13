import { useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { toast } from 'sonner'
import { Trash, Minus, Plus } from '@phosphor-icons/react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import type { LineaVentaForm } from '../schemas/venta-schema'

/** Toggle visual (solo mobile): en qué moneda se muestran las 2 columnas comodín
 *  (precio unitario y total). Solo afecta el render — la lógica no cambia. */
export type ModoMonedaPrecio = 'bs' | 'usd'

interface LineaItemsProps {
  lineas: LineaVentaForm[]
  tasa: number
  onUpdateCantidad: (index: number, cantidad: number) => void
  onRemove: (index: number) => void
  onCantidadEnter?: () => void
  /** When true, shows only 5 columns: #, Producto, Cant., Precio USD, delete */
  compact?: boolean
  /** Solo mobile/compact: moneda activa de las 2 columnas comodín. Default 'bs'. */
  modoMonedaPrecio?: ModoMonedaPrecio
}

export interface LineaItemsHandle {
  focusCantidad: (index: number) => void
}

export const LineaItems = forwardRef<LineaItemsHandle, LineaItemsProps>(
function LineaItems({ lineas, tasa, onUpdateCantidad, onRemove, onCantidadEnter, compact = false, modoMonedaPrecio = 'bs' }, ref) {
  const monedaUsd = modoMonedaPrecio === 'usd'
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  // Borrador de texto del input de cantidad por índice: preserva estados
  // intermedios como "0," o "1." que el número controlado colapsaría.
  const [cantDraft, setCantDraft] = useState<Record<number, string>>({})

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
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-center px-1 py-1.5 font-medium w-8">Cod</th>
              <th className="text-left px-2 py-1.5 font-medium">Producto</th>
              <th className="text-center px-1 py-1.5 font-medium w-14 md:w-20 md:px-2">Cant.</th>
              {/* Desktop only: columnas expandidas */}
              <th className="hidden md:table-cell text-center px-2 py-1.5 font-medium w-14">Stock</th>
              <th className="hidden md:table-cell text-right px-3 py-1.5 font-medium w-28">P.Unit $</th>
              <th className="hidden md:table-cell text-right px-3 py-1.5 font-medium w-28">P.Unit Bs</th>
              <th className="hidden md:table-cell text-right px-3 py-1.5 font-medium w-28">Total $</th>
              <th className="hidden md:table-cell text-right px-3 py-1.5 font-medium w-28">Total Bs</th>
              {/* Mobile only: columna comodín Total (segun toggle) */}
              <th className="md:hidden text-right px-2 py-1.5 font-medium w-20">{monedaUsd ? 'Total $' : 'Total Bs'}</th>
              <th className="w-6"></th>
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
                <tr
                  key={index}
                  className={`border-b last:border-b-0 hover:bg-muted/30 ${stockExcedido ? 'bg-destructive/5' : ''}`}
                >
                  <td className="px-1 py-1.5 text-center text-muted-foreground font-mono">{linea.codigo}</td>
                  <td className="px-2 py-1.5 max-w-0 md:max-w-none">
                    <p className="font-medium truncate">
                      {linea.nombre}
                      {esServicio && (
                        <span className="hidden md:inline ml-1 text-xs text-blue-600">(Servicio)</span>
                      )}
                    </p>
                    {/* Mobile only: stock + precio unitario embebidos bajo el nombre */}
                    {esServicio ? (
                      <p className="md:hidden text-[10px] text-blue-600">Servicio</p>
                    ) : (
                      <p className="md:hidden text-[10px]">
                        <span className="text-muted-foreground">Stock: </span>
                        <span
                          className={`font-medium ${
                            stockDisponible !== null && stockDisponible < 0
                              ? 'text-destructive'
                              : stockDisponible !== null && stockDisponible <= 3
                              ? 'text-orange-500'
                              : 'text-gray-900'
                          }`}
                        >
                          {stockDisponible !== null
                            ? stockDisponible.toFixed(linea.es_decimal ? 3 : 0)
                            : '—'}
                        </span>
                      </p>
                    )}
                    <p className="md:hidden text-[10px]">
                      <span className="text-muted-foreground">{monedaUsd ? 'P.Unit $: ' : 'P.Unit Bs: '}</span>
                      <span className="font-medium text-gray-900">
                        {monedaUsd
                          ? formatUsd(linea.precio_unitario_usd)
                          : tasa > 0 ? formatBs(usdToBs(linea.precio_unitario_usd, tasa)) : '—'}
                      </span>
                    </p>
                  </td>
                  <td className="px-0.5 py-1.5 md:px-2">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onUpdateCantidad(index, Math.max(0, Math.ceil(linea.cantidad) - 1))}
                        disabled={linea.cantidad <= 1}
                        className="shrink-0 hidden items-center justify-center h-5 w-5 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                      <input
                        ref={(el) => { inputRefs.current[index] = el }}
                        type="text"
                        inputMode="decimal"
                        value={cantDraft[index] ?? (linea.cantidad === 0 ? '' : String(linea.cantidad))}
                        onChange={(e) => {
                          // Acepta punto o coma; preserva el texto crudo mientras se edita.
                          const raw = e.target.value.replace(',', '.')
                          if (raw === '') {
                            setCantDraft((d) => ({ ...d, [index]: '' }))
                            onUpdateCantidad(index, 0)
                            return
                          }
                          // Enteros si la unidad no permite fracciones; hasta 3 decimales si sí.
                          const patron = linea.es_decimal ? /^\d*\.?\d{0,3}$/ : /^\d*$/
                          if (!patron.test(raw)) return
                          const val = linea.es_decimal ? parseFloat(raw) : parseInt(raw, 10)
                          // Un "." pelado (sin digitos a ningun lado) es un estado intermedio valido
                          // al empezar a tipear ".5": el patron lo acepta pero parseFloat(".") da NaN.
                          // Preservamos el draft crudo (para que el punto no desaparezca) y tratamos el
                          // valor como 0 hasta que el usuario complete el decimal. Sin esto, tipear ".5"
                          // era imposible: el "." daba NaN -> return -> el draft nunca se guardaba.
                          // ("0." y "5." NO caen aca: parseFloat los resuelve a 0 y 5 respectivamente.)
                          if (isNaN(val)) {
                            setCantDraft((d) => ({ ...d, [index]: raw }))
                            onUpdateCantidad(index, 0)
                            return
                          }
                          if (val < 0) return
                          // No permitir superar el stock disponible (solo productos fisicos).
                          // No se setea al maximo silenciosamente: se rechaza el cambio y se avisa.
                          if (linea.tipo === 'P' && val > linea.stock_actual) {
                            toast.error(`Sin stock suficiente de ${linea.nombre}. Disponible: ${linea.stock_actual.toFixed(linea.es_decimal ? 3 : 0)}`, {
                              id: `stock-${index}`,
                            })
                            return
                          }
                          setCantDraft((d) => ({ ...d, [index]: raw }))
                          onUpdateCantidad(index, val)
                        }}
                        onBlur={() => setCantDraft((d) => { const n = { ...d }; delete n[index]; return n })}
                        onKeyDown={(e) => {
                          // Las teclas +/- suman/restan de 1 en 1 (tambien para productos por peso).
                          if (e.key === '+') {
                            e.preventDefault()
                            const nuevo = Math.floor(linea.cantidad) + 1
                            if (linea.tipo === 'P' && nuevo > linea.stock_actual) {
                              toast.error(`Sin stock suficiente de ${linea.nombre}. Disponible: ${linea.stock_actual.toFixed(linea.es_decimal ? 3 : 0)}`, { id: `stock-${index}` })
                              return
                            }
                            setCantDraft((d) => { const n = { ...d }; delete n[index]; return n })
                            onUpdateCantidad(index, nuevo)
                            return
                          }
                          if (e.key === '-') { e.preventDefault(); setCantDraft((d) => { const n = { ...d }; delete n[index]; return n }); onUpdateCantidad(index, Math.max(0, Math.ceil(linea.cantidad) - 1)); return }
                          if (!linea.es_decimal && (e.key === '.' || e.key === ',')) e.preventDefault()
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            onCantidadEnter?.()
                          }
                        }}
                        className={`min-w-0 w-full text-center rounded border bg-white px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring ${
                          cantidadInvalida || stockExcedido ? 'border-destructive text-destructive' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateCantidad(index, Math.floor(linea.cantidad) + 1)}
                        className="shrink-0 hidden items-center justify-center h-5 w-5 rounded border text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                  </td>
                  {/* Desktop only: Stock, P.Unit $, P.Unit Bs, Total $, Total Bs */}
                  <td className="hidden md:table-cell px-3 py-1.5 text-center">
                    {esServicio ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={`font-medium ${
                          stockDisponible !== null && stockDisponible < 0
                            ? 'text-destructive'
                            : stockDisponible !== null && stockDisponible <= 3
                            ? 'text-orange-500'
                            : 'text-gray-900'
                        }`}
                      >
                        {stockDisponible !== null
                          ? stockDisponible.toFixed(linea.es_decimal ? 3 : 0)
                          : '—'}
                      </span>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-3 py-1.5 text-right font-medium text-gray-900">
                    {formatUsd(linea.precio_unitario_usd)}
                  </td>
                  <td className="hidden md:table-cell px-3 py-1.5 text-right font-medium text-gray-900">
                    {tasa > 0 ? formatBs(usdToBs(linea.precio_unitario_usd, tasa)) : '—'}
                  </td>
                  <td className="hidden md:table-cell px-3 py-1.5 text-right font-semibold text-gray-900">
                    {formatUsd(subtotalUsd)}
                  </td>
                  <td className="hidden md:table-cell px-3 py-1.5 text-right font-medium text-gray-900">
                    {tasa > 0 ? formatBs(subtotalBs) : '—'}
                  </td>
                  {/* Mobile only: columna comodín Total (segun toggle) */}
                  <td className="md:hidden px-2 py-1.5 text-right font-semibold text-gray-900">
                    {monedaUsd
                      ? formatUsd(subtotalUsd)
                      : tasa > 0 ? formatBs(subtotalBs) : '—'}
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash size={12} />
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
                <th className="text-left px-3 py-2 font-medium">Codigo</th>
                <th className="text-left px-3 py-2 font-medium">Producto</th>
                <th className="text-center px-3 py-2 font-medium w-24">Cant.</th>
                <th className="text-center px-3 py-2 font-medium w-24">Stock Disp.</th>
                <th className="text-right px-3 py-2 font-medium w-28">Precio Bs</th>
                <th className="text-right px-3 py-2 font-medium w-28">Precio USD</th>
                <th className="text-right px-3 py-2 font-medium w-28">Total Bs</th>
                <th className="text-right px-3 py-2 font-medium w-28">Total USD</th>
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
                    <td className="px-3 py-2 text-muted-foreground text-xs">{linea.codigo}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{linea.nombre}</span>
                      {esServicio && (
                        <span className="ml-1 text-xs text-blue-600">(Servicio)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const step = linea.es_decimal ? 0.001 : 1
                            const minCantidad = linea.es_decimal ? 0.001 : 1
                            onUpdateCantidad(index, Math.max(minCantidad, linea.cantidad - step))
                          }}
                          disabled={linea.cantidad <= (linea.es_decimal ? 0.001 : 1)}
                          className="shrink-0 hidden md:flex items-center justify-center h-6 w-6 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus size={12} />
                        </button>
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
                            const step = linea.es_decimal ? 0.001 : 1
                            const minCantidad = linea.es_decimal ? 0.001 : 1
                            if (e.key === '+') { e.preventDefault(); onUpdateCantidad(index, linea.cantidad + step); return }
                            if (e.key === '-') { e.preventDefault(); onUpdateCantidad(index, Math.max(minCantidad, linea.cantidad - step)); return }
                            if (!linea.es_decimal && (e.key === '.' || e.key === ',')) e.preventDefault()
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              onCantidadEnter?.()
                            }
                          }}
                          className={`min-w-0 w-full text-center rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                            cantidadInvalida || stockExcedido ? 'border-destructive text-destructive' : ''
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const step = linea.es_decimal ? 0.001 : 1
                            onUpdateCantidad(index, linea.cantidad + step)
                          }}
                          className="shrink-0 hidden md:flex items-center justify-center h-6 w-6 rounded border text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
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
                              : 'text-gray-900'
                          }`}
                        >
                          {stockDisponible !== null
                            ? stockDisponible.toFixed(linea.es_decimal ? 3 : 0)
                            : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {tasa > 0 ? formatBs(usdToBs(linea.precio_unitario_usd, tasa)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {formatUsd(linea.precio_unitario_usd)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{formatBs(subtotalBs)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatUsd(subtotalUsd)}</td>
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
