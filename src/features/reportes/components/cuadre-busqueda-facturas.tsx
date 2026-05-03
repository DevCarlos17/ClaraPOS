import { useState, useCallback } from 'react'
import { MagnifyingGlass, CaretRight, CaretDown } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { todayStr } from '@/lib/dates'
import {
  useFacturasBusqueda,
  useDetalleVenta,
  type BusquedaParams,
} from '../hooks/use-cuadre'
import { useCurrentUser } from '@/core/hooks/use-current-user'

function formatDateTime(fechaStr: string): string {
  try {
    const parts = fechaStr.split(' ')
    if (parts.length >= 2) return `${parts[0]} ${parts[1].substring(0, 5)}`
    return fechaStr.substring(0, 16)
  } catch {
    return fechaStr
  }
}

function ResultRow({ factura }: {
  factura: {
    id: string
    nroFactura: string
    clienteNombre: string
    clienteIdentificacion: string
    totalUsd: string
    totalBs: string
    tipo: string
    status: string
    fecha: string
  }
}) {
  const [expanded, setExpanded] = useState(false)
  const { detalles, pagos, isLoading } = useDetalleVenta(expanded ? factura.id : null)

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
        <td className="px-2 py-2 text-xs text-muted-foreground">{formatDateTime(factura.fecha)}</td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs">#{factura.nroFactura}</span>
            {factura.tipo === 'CREDITO' && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                CR
              </span>
            )}
            {factura.status === 'ANULADA' && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                ANULADA
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-2 text-xs">
          <div>
            <p className="font-medium truncate max-w-[160px]">{factura.clienteNombre}</p>
            <p className="text-muted-foreground">{factura.clienteIdentificacion}</p>
          </div>
        </td>
        <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
          {formatBs(parseFloat(factura.totalBs))}
        </td>
        <td className="px-2 py-2 text-right text-xs font-bold tabular-nums">
          {formatUsd(parseFloat(factura.totalUsd))}
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={6} className="px-4 pb-3 pt-1">
            {isLoading ? (
              <div className="h-10 bg-muted rounded animate-pulse" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Articulos */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Articulos</p>
                  {detalles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin articulos</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {detalles.map((d, i) => {
                          const cant = parseFloat(d.cantidad)
                          const precio = parseFloat(d.precio_unitario_usd)
                          return (
                            <tr key={i} className="border-b border-muted/30 last:border-0">
                              <td className="py-0.5 font-mono text-muted-foreground w-12">{d.producto_codigo}</td>
                              <td className="py-0.5 pl-1">{d.producto_nombre}</td>
                              <td className="py-0.5 text-right text-muted-foreground w-14">{cant} und</td>
                              <td className="py-0.5 text-right tabular-nums w-20">{formatUsd(cant * precio)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {/* Pagos */}
                {pagos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Pagos</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {pagos.map((p, i) => (
                          <tr key={i} className="border-b border-muted/30 last:border-0">
                            <td className="py-0.5">{p.metodo_nombre}</td>
                            {p.referencia && (
                              <td className="py-0.5 text-muted-foreground px-1">({p.referencia})</td>
                            )}
                            <td className="py-0.5 text-right tabular-nums">
                              {p.moneda === 'BS' ? formatBs(parseFloat(p.monto)) : formatUsd(parseFloat(p.monto))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function CuadreBusquedaFacturas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const [fechaInicio, setFechaInicio] = useState(todayStr)
  const [fechaFin, setFechaFin] = useState(todayStr)
  const [busqFactura, setBusqFactura] = useState('')
  const [busqCliente, setBusqCliente] = useState('')
  const [activeParams, setActiveParams] = useState<BusquedaParams | null>(null)

  const { facturas, isLoading } = useFacturasBusqueda(activeParams)

  const handleBuscar = useCallback(() => {
    setActiveParams({
      empresaId,
      fechaInicio,
      fechaFin: fechaFin < fechaInicio ? fechaInicio : fechaFin,
      busqFactura,
      busqCliente,
    })
  }, [empresaId, fechaInicio, fechaFin, busqFactura, busqCliente])

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-1">Busqueda de Facturas</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Consulta facturas por numero, cliente o rango de fechas (independiente del cuadre)
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Fecha inicio</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => {
              setFechaInicio(e.target.value)
              setActiveParams(null)
            }}
            className="rounded-md border border-input bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Fecha fin</label>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => {
              setFechaFin(e.target.value)
              setActiveParams(null)
            }}
            className="rounded-md border border-input bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Nro. Factura</label>
          <input
            type="text"
            value={busqFactura}
            onChange={(e) => setBusqFactura(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            placeholder="0001"
            className="rounded-md border border-input bg-white px-3 py-1.5 text-sm w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Cliente / Identificacion</label>
          <input
            type="text"
            value={busqCliente}
            onChange={(e) => setBusqCliente(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            placeholder="Nombre o RIF/CI"
            className="rounded-md border border-input bg-white px-3 py-1.5 text-sm w-40"
          />
        </div>
        <button
          onClick={handleBuscar}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <MagnifyingGlass className="w-4 h-4" />
          Buscar
        </button>
      </div>

      {/* Results */}
      {!activeParams ? (
        <div className="text-center py-8 text-muted-foreground">
          <MagnifyingGlass className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Configure los filtros y presione Buscar</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : facturas.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin resultados para los filtros seleccionados</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b">
                  <th className="text-left px-2 py-2 font-medium text-xs w-6"></th>
                  <th className="text-left px-2 py-2 font-medium text-xs">Fecha/Hora</th>
                  <th className="text-left px-2 py-2 font-medium text-xs">Factura</th>
                  <th className="text-left px-2 py-2 font-medium text-xs">Cliente</th>
                  <th className="text-right px-2 py-2 font-medium text-xs">Bs</th>
                  <th className="text-right px-2 py-2 font-medium text-xs">USD</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <ResultRow key={f.id} factura={f} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{facturas.length} resultado(s){facturas.length === 200 ? ' (limite 200)' : ''}</span>
            <span className="font-semibold">
              Total: {formatUsd(facturas.reduce((s, f) => s + parseFloat(f.totalUsd), 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
