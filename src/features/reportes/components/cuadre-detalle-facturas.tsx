import { useState, useCallback } from 'react'
import { CaretRight, CaretDown, MagnifyingGlass, ArrowsOutSimple, ArrowsInSimple } from '@phosphor-icons/react'
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

function FacturaRow({ venta, expanded, onToggle }: {
  venta: {
    id: string
    nro_factura: string
    cliente_nombre: string
    cliente_identificacion: string
    total_usd: string
    total_bs: string
    tipo: string
    status: string
    fecha: string
    saldo_pend_usd: string
    metodos_pago: string | null
  }
  expanded: boolean
  onToggle: () => void
}) {
  const { detalles, isLoading } = useDetalleVenta(expanded ? venta.id : null)
  const saldo = parseFloat(venta.saldo_pend_usd ?? '0')

  return (
    <>
      <tr
        className={`border-b border-muted/50 cursor-pointer transition-colors ${expanded ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
        onClick={onToggle}
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
        <td className="px-2 py-2 text-xs truncate max-w-[140px]">{venta.cliente_nombre}</td>
        <td className="px-2 py-2 text-xs text-muted-foreground truncate max-w-[120px]">
          {venta.metodos_pago ?? '-'}
        </td>
        <td className="px-2 py-2 text-right text-xs tabular-nums">
          {saldo > 0.005 ? (
            <span className="text-red-600 font-semibold">{formatUsd(saldo)}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
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
          <td colSpan={8} className="px-4 pb-2 pt-1">
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
  const [expandedIds, setExpandedIds] = useState(new Set<string>())
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

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allExpanded = filtradas.length > 0 && filtradas.every((v) => expandedIds.has(v.id))

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedIds(new Set())
    } else {
      setExpandedIds(new Set(filtradas.map((v) => v.id)))
    }
  }, [allExpanded, filtradas])

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
          {/* Controls row */}
          <div className="flex items-center gap-3 mb-3">
            {/* Search */}
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nro. factura, nombre o identificacion..."
                value={busq}
                onChange={(e) => setBusq(e.target.value)}
                className="w-full rounded-md border border-input bg-white pl-8 pr-3 py-1.5 text-sm"
              />
            </div>

            {/* Expand / collapse all button */}
            {filtradas.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors whitespace-nowrap"
              >
                {allExpanded ? (
                  <>
                    <ArrowsInSimple size={13} />
                    Colapsar todo
                  </>
                ) : (
                  <>
                    <ArrowsOutSimple size={13} />
                    Expandir todo
                  </>
                )}
              </button>
            )}
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
                      <th className="text-left px-2 py-2 font-medium text-xs">Cliente</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Pagado con</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">Credito</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">Bs</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((v) => (
                      <FacturaRow
                        key={v.id}
                        venta={v}
                        expanded={expandedIds.has(v.id)}
                        onToggle={() => toggleExpanded(v.id)}
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
