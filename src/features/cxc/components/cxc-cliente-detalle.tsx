import { useState, useRef, useEffect } from 'react'
import { X, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useFacturasPendientes, type ClienteConDeuda } from '../hooks/use-cxc'
import { PagoFacturaModal } from './pago-factura-modal'
import { AbonoGlobalModal } from './abono-global-modal'
import type { VentaPendiente } from '../hooks/use-cxc'

interface CxcClienteDetalleProps {
  isOpen: boolean
  onClose: () => void
  cliente: ClienteConDeuda | null
}

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

export function CxcClienteDetalle({ isOpen, onClose, cliente }: CxcClienteDetalleProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()
  const { facturas, isLoading } = useFacturasPendientes(cliente?.id ?? null)

  const [facturaSeleccionada, setFacturaSeleccionada] = useState<VentaPendiente | null>(null)
  const [pagoFacturaOpen, setPagoFacturaOpen] = useState(false)
  const [abonoGlobalOpen, setAbonoGlobalOpen] = useState(false)

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

  const handlePagarFactura = (factura: VentaPendiente) => {
    setFacturaSeleccionada(factura)
    setPagoFacturaOpen(true)
  }

  const handlePaymentSuccess = () => {
    // Data refreshes reactively via PowerSync queries
  }

  if (!cliente) return null

  const saldo = parseFloat(cliente.saldo_actual)

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
        className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">
                  {cliente.identificacion}
                </span>
              </div>
              <h2 className="text-xl font-semibold mt-1">{cliente.nombre}</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Saldo */}
          <div className="rounded-lg border bg-red-50 p-4 mb-4">
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
                <DollarSign size={16} className="mr-1" />
                Abono Global
              </Button>
            </div>
          </div>

          {/* Facturas pendientes */}
          <div>
            <h3 className="text-sm font-semibold mb-3">
              Facturas Pendientes ({facturas.length})
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
                      <th className="text-left px-3 py-2 font-medium">Factura</th>
                      <th className="text-left px-3 py-2 font-medium">Fecha</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                      <th className="text-right px-3 py-2 font-medium">Pendiente</th>
                      <th className="text-right px-3 py-2 font-medium">Bs</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturas.map((f) => {
                      const saldoPend = parseFloat(f.saldo_pend_usd)
                      return (
                        <tr key={f.id} className="border-b border-muted">
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
                              onClick={() => handlePagarFactura(f)}
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

          {/* Cerrar */}
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </dialog>

      {/* Sub-modals */}
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
    </>
  )
}
