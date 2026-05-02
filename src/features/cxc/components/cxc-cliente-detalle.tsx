import { useState } from 'react'
import { X, CurrencyDollar, ArrowUp, ArrowDown, CaretUpDown } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useFacturasPendientes, type ClienteConDeuda } from '../hooks/use-cxc'
import { PagoFacturaModal } from './pago-factura-modal'
import { AbonoGlobalModal } from './abono-global-modal'
import { FacturaDetalleCxc } from './factura-detalle-cxc'
import { CxcClienteReporte } from './cxc-cliente-reporte'
import type { VentaPendiente } from '../hooks/use-cxc'

interface CxcClienteDetalleProps {
  onClose: () => void
  cliente: ClienteConDeuda
}

type SortField = 'nro_factura' | 'fecha' | 'total_usd' | 'saldo_pend_usd'
type SortDir = 'asc' | 'desc'

function formatFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha
  }
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <CaretUpDown size={11} className="ml-1 text-muted-foreground/50 inline" />
  return sortDir === 'asc'
    ? <ArrowUp size={11} className="ml-1 text-primary inline" />
    : <ArrowDown size={11} className="ml-1 text-primary inline" />
}

export function CxcClienteDetalle({ onClose, cliente }: CxcClienteDetalleProps) {
  const { tasaValor } = useTasaActual()
  const { facturas, isLoading } = useFacturasPendientes(cliente.id)

  const [facturaSeleccionada, setFacturaSeleccionada] = useState<VentaPendiente | null>(null)
  const [pagoFacturaOpen, setPagoFacturaOpen] = useState(false)
  const [abonoGlobalOpen, setAbonoGlobalOpen] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState(false)

  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handlePagarFactura = (factura: VentaPendiente, e: React.MouseEvent) => {
    e.stopPropagation()
    setFacturaSeleccionada(factura)
    setPagoFacturaOpen(true)
  }

  const handleVerDetalleFactura = (factura: VentaPendiente) => {
    setFacturaSeleccionada(factura)
    setDetalleOpen(true)
  }

  const handlePaymentSuccess = () => {
    // Data refreshes reactively via PowerSync queries
  }

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const facturasSorted = [...facturas].sort((a, b) => {
    let aVal: number | string
    let bVal: number | string
    switch (sortField) {
      case 'nro_factura':
        aVal = parseInt(a.nro_factura, 10) || 0
        bVal = parseInt(b.nro_factura, 10) || 0
        break
      case 'fecha': aVal = a.fecha; bVal = b.fecha; break
      case 'total_usd': aVal = parseFloat(a.total_usd); bVal = parseFloat(b.total_usd); break
      case 'saldo_pend_usd': aVal = parseFloat(a.saldo_pend_usd); bVal = parseFloat(b.saldo_pend_usd); break
    }
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const saldo = parseFloat(cliente.saldo_actual)

  const thSort = (field: SortField, label: string, align: string = 'left') => (
    <th
      className={`text-${align} px-3 py-2 font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors`}
      onClick={() => handleSort(field)}
    >
      {label}
      <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
    </th>
  )

  return (
    <>
      <div className="rounded-xl bg-card shadow-md overflow-hidden lg:sticky lg:top-6">
        <div className="p-5 overflow-y-auto max-h-[calc(100vh-8rem)] space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">
                  {cliente.identificacion}
                </span>
              </div>
              <h2 className="text-xl font-semibold mt-1">{cliente.nombre}</h2>
            </div>
            <div className="flex items-center gap-2">
              <CxcClienteReporte cliente={cliente} facturas={facturas} />
              <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Saldo */}
          <div className="rounded-lg border bg-red-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700/70">Deuda Total</p>
                <p className="text-3xl font-bold text-red-600">{formatUsd(saldo)}</p>
                {tasaValor > 0 && (
                  <p className="text-sm text-red-700/50 mt-0.5">
                    {formatBs(usdToBs(saldo, tasaValor))}
                  </p>
                )}
              </div>
              <Button onClick={() => setAbonoGlobalOpen(true)} disabled={saldo < 0.01}>
                <CurrencyDollar size={16} className="mr-1" />
                Abono Global
              </Button>
            </div>
          </div>

          {/* Facturas pendientes */}
          <div>
            <h3 className="text-sm font-semibold mb-3">
              Facturas Pendientes ({facturas.length})
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                — haz click en una fila para ver el detalle
              </span>
            </h3>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : facturas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                <p className="text-sm font-medium">Sin facturas pendientes</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b bg-muted/50">
                      {thSort('nro_factura', 'Factura', 'left')}
                      {thSort('fecha', 'Fecha', 'left')}
                      {thSort('total_usd', 'Total', 'right')}
                      {thSort('saldo_pend_usd', 'Pendiente', 'right')}
                      <th className="text-right px-3 py-2 font-medium">Bs</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasSorted.map((f) => {
                      const saldoPend = parseFloat(f.saldo_pend_usd)
                      return (
                        <tr
                          key={f.id}
                          className="border-b border-muted hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => handleVerDetalleFactura(f)}
                        >
                          <td className="px-3 py-2 font-mono font-medium">#{f.nro_factura}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {formatFecha(f.fecha)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {formatUsd(f.total_usd)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-red-600">
                            {formatUsd(saldoPend)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                            {tasaValor > 0 ? formatBs(usdToBs(saldoPend, tasaValor)) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handlePagarFactura(f, e)}
                            >
                              Pagar
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <PagoFacturaModal
        isOpen={pagoFacturaOpen}
        onClose={() => setPagoFacturaOpen(false)}
        factura={facturaSeleccionada}
        clienteId={cliente.id}
        onSuccess={handlePaymentSuccess}
      />

      <AbonoGlobalModal
        isOpen={abonoGlobalOpen}
        onClose={() => setAbonoGlobalOpen(false)}
        clienteId={cliente.id}
        clienteNombre={cliente.nombre}
        saldoActual={saldo}
        onSuccess={handlePaymentSuccess}
      />

      <FacturaDetalleCxc
        isOpen={detalleOpen}
        onClose={() => setDetalleOpen(false)}
        factura={facturaSeleccionada}
      />
    </>
  )
}
