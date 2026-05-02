import { useState } from 'react'
import { X, CurrencyDollar, CaretUp, CaretDown } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useFacturasPendientes, type ClienteConDeuda, type VentaPendiente } from '../hooks/use-cxc'
import { PagoFacturaModal } from './pago-factura-modal'
import { AbonoGlobalModal } from './abono-global-modal'
import { FacturaDetalleCxc } from './factura-detalle-cxc'
import { CxcClienteReporte } from './cxc-cliente-reporte'

interface CxcClienteDetalleProps {
  onClose: () => void
  cliente: ClienteConDeuda
}

type SortField = 'nro_factura' | 'fecha' | 'total_usd' | 'saldo_pend_usd'

function SortIcon({
  field,
  current,
  dir,
}: {
  field: SortField
  current: SortField
  dir: 'asc' | 'desc'
}) {
  if (field !== current) return <CaretDown className="h-3 w-3 opacity-30 inline ml-1" />
  return dir === 'asc'
    ? <CaretUp className="h-3 w-3 inline ml-1" />
    : <CaretDown className="h-3 w-3 inline ml-1" />
}

export function CxcClienteDetalle({ onClose, cliente }: CxcClienteDetalleProps) {
  const { tasaValor } = useTasaActual()
  const { facturas, isLoading } = useFacturasPendientes(cliente.id)

  const [facturaSeleccionada, setFacturaSeleccionada] = useState<VentaPendiente | null>(null)
  const [pagoFacturaOpen, setPagoFacturaOpen] = useState(false)
  const [abonoGlobalOpen, setAbonoGlobalOpen] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState(false)
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(key: SortField) {
    if (key === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(key); setSortDir('asc') }
  }

  const facturasSorted = [...facturas].sort((a, b) => {
    const mult = sortDir === 'asc' ? 1 : -1
    if (sortField === 'total_usd' || sortField === 'saldo_pend_usd') {
      return (parseFloat(a[sortField]) - parseFloat(b[sortField])) * mult
    }
    if (sortField === 'nro_factura') {
      return ((parseInt(a.nro_factura, 10) || 0) - (parseInt(b.nro_factura, 10) || 0)) * mult
    }
    return String(a[sortField]).localeCompare(String(b[sortField])) * mult
  })

  const saldo = parseFloat(cliente.saldo_actual)

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-2xl bg-card shadow-lg overflow-hidden">

          {/* Toolbar */}
          <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{cliente.nombre}</p>
              <p className="text-xs text-muted-foreground">{cliente.identificacion}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deuda total</p>
                <p className="text-sm font-bold text-destructive tabular-nums">
                  {formatUsd(saldo)}
                </p>
                {tasaValor > 0 && (
                  <p className="text-[10px] text-muted-foreground/70">
                    {formatBs(usdToBs(saldo, tasaValor))}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => setAbonoGlobalOpen(true)}
                disabled={saldo < 0.01}
              >
                <CurrencyDollar size={14} className="mr-1" />
                Abono Global
              </Button>
              <CxcClienteReporte cliente={cliente} facturas={facturas} />
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-muted/60 transition-colors text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Sub-header */}
          <div className="px-4 py-2 border-b border-border/50 bg-muted/20">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Facturas Pendientes
            </span>
          </div>

          {/* Tabla */}
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : facturas.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">No hay facturas pendientes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th
                      className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('nro_factura')}
                    >
                      Factura<SortIcon field="nro_factura" current={sortField} dir={sortDir} />
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('fecha')}
                    >
                      Fecha<SortIcon field="fecha" current={sortField} dir={sortDir} />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Tipo
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('total_usd')}
                    >
                      Total<SortIcon field="total_usd" current={sortField} dir={sortDir} />
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('saldo_pend_usd')}
                    >
                      Pendiente<SortIcon field="saldo_pend_usd" current={sortField} dir={sortDir} />
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                      Equiv. Bs
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Accion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {facturasSorted.map((f) => {
                    const saldoPend = parseFloat(f.saldo_pend_usd)
                    return (
                      <tr
                        key={f.id}
                        onClick={() => { setFacturaSeleccionada(f); setDetalleOpen(true) }}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-foreground">
                          #{f.nro_factura}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(f.fecha).toLocaleDateString('es-VE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                              f.tipo === 'CREDITO'
                                ? 'bg-orange-50 text-orange-700 ring-orange-600/20'
                                : 'bg-green-50 text-green-700 ring-green-600/20'
                            }`}
                          >
                            {f.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground text-sm">
                          {formatUsd(parseFloat(f.total_usd))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive text-sm">
                          {formatUsd(saldoPend)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground text-xs hidden md:table-cell">
                          {tasaValor > 0 ? formatBs(usdToBs(saldoPend, tasaValor)) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => { setFacturaSeleccionada(f); setPagoFacturaOpen(true) }}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-colors"
                          >
                            Pagar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Fila total */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Total pendiente
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-destructive text-sm">
                      {formatUsd(facturas.reduce((s, f) => s + parseFloat(f.saldo_pend_usd), 0))}
                    </td>
                    <td className="hidden md:table-cell" />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <PagoFacturaModal
        isOpen={pagoFacturaOpen}
        onClose={() => setPagoFacturaOpen(false)}
        factura={facturaSeleccionada}
        clienteId={cliente.id}
        onSuccess={() => {}}
      />

      <AbonoGlobalModal
        isOpen={abonoGlobalOpen}
        onClose={() => setAbonoGlobalOpen(false)}
        clienteId={cliente.id}
        clienteNombre={cliente.nombre}
        saldoActual={saldo}
        onSuccess={() => {}}
      />

      <FacturaDetalleCxc
        isOpen={detalleOpen}
        onClose={() => setDetalleOpen(false)}
        factura={facturaSeleccionada}
      />
    </>
  )
}
