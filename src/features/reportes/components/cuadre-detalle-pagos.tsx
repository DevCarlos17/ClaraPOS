import { useState, useCallback, useEffect } from 'react'
import { CheckCircle, Circle, MagnifyingGlass } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosDetalleCompleto, type CuadreFilters } from '../hooks/use-cuadre'

function formatHora(fechaStr: string): string {
  try {
    const parts = fechaStr.split(' ')
    if (parts.length >= 2) return parts[1].substring(0, 5)
    return ''
  } catch {
    return ''
  }
}

interface DetallePagosProps {
  filters: CuadreFilters
  onVerifiedChange: (amounts: Record<string, number>) => void
}

export function CuadreDetallePagos({ filters, onVerifiedChange }: DetallePagosProps) {
  const [visible, setVisible] = useState(false)
  const [verificados, setVerificados] = useState(new Set<string>())
  const [busq, setBusq] = useState('')
  const { pagos: todosPagos, isLoading } = usePagosDetalleCompleto(visible ? filters : null)

  // Filter to non-EFECTIVO payments only
  const pagos = todosPagos.filter((p) => p.metodoTipo !== 'EFECTIVO')

  const toggleVerificado = useCallback((id: string) => {
    setVerificados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Emit verified amounts by metodo_cobro_id whenever verificados or pagos change.
  // Only runs when visible so closing the section preserves last reported amounts in parent.
  useEffect(() => {
    if (!visible) return
    const amounts: Record<string, number> = {}
    pagos.forEach((p) => {
      if (verificados.has(p.id)) {
        const key = p.metodoCobro_id
        amounts[key] = (amounts[key] ?? 0) + parseFloat(p.montoUsd)
      }
    })
    onVerifiedChange(amounts)
  }, [verificados, pagos, onVerifiedChange, visible])

  const filtrados = busq.trim()
    ? pagos.filter(
        (p) =>
          (p.nroFactura ?? '').toLowerCase().includes(busq.toLowerCase()) ||
          (p.clienteNombre ?? '').toLowerCase().includes(busq.toLowerCase()) ||
          (p.referencia ?? '').toLowerCase().includes(busq.toLowerCase()) ||
          p.metodoNombre.toLowerCase().includes(busq.toLowerCase())
      )
    : pagos

  const totalVerificado = pagos
    .filter((p) => verificados.has(p.id))
    .reduce((sum, p) => sum + parseFloat(p.montoUsd), 0)

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
          <span className="text-sm font-semibold">Detalle de pagos recibidos</span>
          {visible && pagos.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {pagos.length} transacciones
            </span>
          )}
          <span className="text-xs text-muted-foreground">(transferencias y otros)</span>
        </div>
        {visible && verificados.size > 0 && (
          <span className="text-xs text-green-600 font-medium">
            {verificados.size} verificado(s) · {formatUsd(totalVerificado)}
          </span>
        )}
      </button>

      {visible && (
        <div className="px-5 pb-5">
          {/* Search */}
          <div className="relative mb-3">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por factura, cliente, referencia, metodo..."
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
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {pagos.length === 0 ? 'Sin pagos no-efectivo en este periodo' : 'Sin coincidencias'}
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr className="border-b">
                      <th className="text-left px-2 py-2 font-medium text-xs w-8"></th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Hora</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Factura</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Cliente</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Metodo</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Referencia</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">Monto</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((p) => {
                      const esVerificado = verificados.has(p.id)
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-muted/50 transition-colors ${esVerificado ? 'bg-green-50/50' : 'hover:bg-muted/20'}`}
                        >
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => toggleVerificado(p.id)}
                              title={esVerificado ? 'Marcar como no verificado' : 'Marcar como verificado'}
                              className="text-muted-foreground hover:text-green-600 transition-colors"
                            >
                              {esVerificado ? (
                                <CheckCircle size={16} weight="fill" className="text-green-600" />
                              ) : (
                                <Circle size={16} />
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">
                            {formatHora(p.fecha)}
                          </td>
                          <td className="px-2 py-1.5">
                            {p.nroFactura ? (
                              <span className="font-mono text-xs">#{p.nroFactura}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-xs truncate max-w-[120px]">
                            {p.clienteNombre ?? '-'}
                          </td>
                          <td className="px-2 py-1.5 text-xs">{p.metodoNombre}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[100px]">
                            {p.referencia ?? '-'}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs tabular-nums">
                            {p.moneda === 'BS'
                              ? formatBs(parseFloat(p.monto))
                              : formatUsd(parseFloat(p.monto))}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums">
                            {formatUsd(parseFloat(p.montoUsd))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer summary */}
              <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{filtrados.length} pago(s)</span>
                <span className="font-semibold">
                  Total: {formatUsd(filtrados.reduce((s, p) => s + parseFloat(p.montoUsd), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
