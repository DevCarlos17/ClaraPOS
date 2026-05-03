import { useState } from 'react'
import { CaretRight, CaretDown, MagnifyingGlass } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  useVentasAudit,
  useDetalleVenta,
  type CuadreFilters,
} from '../hooks/use-cuadre'

function formatHora(fechaStr: string): string {
  try {
    const parts = fechaStr.split(' ')
    if (parts.length >= 2) return parts[1].substring(0, 5)
    return ''
  } catch {
    return ''
  }
}

function FacturaRow({ venta, showProductos }: {
  venta: { id: string; nro_factura: string; cliente_nombre: string; cliente_identificacion: string; total_usd: string; total_bs: string; tipo: string; status: string; fecha: string }
  showProductos: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const { detalles, isLoading } = useDetalleVenta(expanded ? venta.id : null)

  return (
    <>
      <tr
        className={`border-b border-muted/50 cursor-pointer transition-colors ${expanded ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-2 py-2 w-6">
          {expanded ? (
            <CaretDown size={12} className="text-muted-foreground" />
          ) : (
            <CaretRight size={12} className="text-muted-foreground" />
          )}
        </td>
        <td className="px-2 py-2 text-xs text-muted-foreground">{formatHora(venta.fecha)}</td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs">#{venta.nro_factura}</span>
            {venta.tipo === 'CREDITO' && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                CR
              </span>
            )}
            {venta.status === 'ANULADA' && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                ANU
              </span>
            )}
          </div>
        </td>
        {showProductos && (
          <td className="px-2 py-2 text-xs truncate max-w-[140px]">
            <span className="font-medium">{venta.cliente_nombre}</span>
            <span className="text-muted-foreground ml-1">({venta.cliente_identificacion})</span>
          </td>
        )}
        {!showProductos && (
          <td className="px-2 py-2 text-xs truncate max-w-[140px]">{venta.cliente_nombre}</td>
        )}
        <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
          {formatBs(parseFloat(venta.total_bs))}
        </td>
        <td className="px-2 py-2 text-right text-xs font-bold tabular-nums">
          {formatUsd(parseFloat(venta.total_usd))}
        </td>
      </tr>

      {/* Expanded product detail */}
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={showProductos ? 6 : 6} className="px-4 pb-2 pt-1">
            {isLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse" />
            ) : detalles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin articulos</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {detalles.map((d, i) => {
                    const cant = parseFloat(d.cantidad)
                    const precio = parseFloat(d.precio_unitario_usd)
                    return (
                      <tr key={i} className="border-b border-muted/30 last:border-0">
                        <td className="py-1 font-mono text-muted-foreground w-12">{d.producto_codigo}</td>
                        <td className="py-1 pl-2">{d.producto_nombre}</td>
                        <td className="py-1 text-right text-muted-foreground w-16">{cant} und.</td>
                        <td className="py-1 text-right tabular-nums w-20">{formatUsd(cant * precio)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

interface DetalleFacturasProps {
  filters: CuadreFilters
}

export function CuadreDetalleFacturas({ filters }: DetalleFacturasProps) {
  const [visible, setVisible] = useState(false)
  const [showTitular, setShowTitular] = useState(true)
  const [showProductos, setShowProductos] = useState(false)
  const [busq, setBusq] = useState('')
  const { ventas, isLoading } = useVentasAudit(visible ? filters : null)

  const filtradas = busq.trim()
    ? ventas.filter(
        (v) =>
          v.nro_factura.toLowerCase().includes(busq.toLowerCase()) ||
          v.cliente_nombre.toLowerCase().includes(busq.toLowerCase()) ||
          v.cliente_identificacion.toLowerCase().includes(busq.toLowerCase())
      )
    : ventas

  return (
    <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={visible}
            onChange={() => {}}
            className="h-4 w-4 rounded border-gray-300 text-primary pointer-events-none"
          />
          <span className="text-sm font-semibold">Detalle de facturas emitidas</span>
          {visible && ventas.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {ventas.length} facturas
            </span>
          )}
        </div>
      </button>

      {visible && (
        <div className="px-5 pb-5">
          {/* Options row */}
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showTitular}
                onChange={(e) => setShowTitular(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-primary"
              />
              Mostrar titular e identificacion
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showProductos}
                onChange={(e) => setShowProductos(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-primary"
              />
              Mostrar detalle de productos (click en fila)
            </label>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nro. factura, nombre o identificacion..."
              value={busq}
              onChange={(e) => setBusq(e.target.value)}
              className="w-full rounded-md border border-input bg-white pl-8 pr-3 py-1.5 text-sm"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {ventas.length === 0 ? 'Sin facturas en este periodo' : 'Sin coincidencias'}
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr className="border-b">
                      <th className="text-left px-2 py-2 font-medium text-xs w-6"></th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Hora</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Factura</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">
                        {showTitular ? 'Titular' : 'Cliente'}
                      </th>
                      <th className="text-right px-2 py-2 font-medium text-xs">Bs</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((v) => (
                      <FacturaRow
                        key={v.id}
                        venta={v}
                        showProductos={showProductos}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{filtradas.length} factura(s)</span>
                <span className="font-semibold">
                  Total: {formatUsd(filtradas.reduce((s, v) => s + parseFloat(v.total_usd), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
