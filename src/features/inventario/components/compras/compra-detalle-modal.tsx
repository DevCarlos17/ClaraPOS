import { useRef, useState } from 'react'
import { X, Printer, RotateCcw } from 'lucide-react'
import {
  useDetalleCompra,
  useAbonosCompra,
  type CompraConProveedor,
} from '@/features/inventario/hooks/use-compras'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { CompraDevolucionModal } from './compra-devolucion-modal'

interface CompraDetalleModalProps {
  compra: CompraConProveedor
  isOpen: boolean
  onClose: () => void
}

export function CompraDetalleModal({ compra, isOpen, onClose }: CompraDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [showDevolucion, setShowDevolucion] = useState(false)
  const { detalle, isLoading: loadingDetalle } = useDetalleCompra(compra.id)
  const { abonos, isLoading: loadingAbonos } = useAbonosCompra(
    compra.tipo === 'CREDITO' ? compra.id : ''
  )

  const tasa = parseFloat(compra.tasa)
  const totalUsd = parseFloat(compra.total_usd)
  const totalBs = parseFloat(compra.total_bs)
  const saldoPend = parseFloat(compra.saldo_pend_usd)
  const totalAbonado = abonos.reduce((sum, a) => sum + parseFloat(a.monto), 0)

  // Determinar si la factura puede ser reversada totalmente
  const puedeReversar = compra.status === 'PROCESADA' && (
    compra.tipo === 'CONTADO' ||
    (compra.tipo === 'CREDITO' && Math.abs(saldoPend - totalUsd) < 0.01)
  )
  const bloqueadoPorAbonos = compra.status === 'PROCESADA' &&
    compra.tipo === 'CREDITO' && saldoPend < totalUsd - 0.01

  // Dialog open/close via ref
  if (isOpen && dialogRef.current && !dialogRef.current.open) {
    dialogRef.current.showModal()
  }
  if (!isOpen && dialogRef.current?.open) {
    dialogRef.current.close()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  function handlePrint() {
    if (!printRef.current) return

    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) return

    const content = printRef.current.innerHTML

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Compra ${compra.nro_factura}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #1a1a1a;
            padding: 24px;
            font-size: 12px;
            line-height: 1.5;
          }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 12px; }
          .header h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
          .header p { font-size: 11px; color: #666; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
          .info-item { display: flex; gap: 4px; }
          .info-label { font-weight: 600; color: #555; min-width: 100px; }
          .info-value { color: #1a1a1a; }
          .badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
          .badge-contado { background: #dcfce7; color: #166534; }
          .badge-credito { background: #fff7ed; color: #9a3412; }
          .badge-procesada { background: #dbeafe; color: #1e40af; }
          .badge-anulada { background: #fee2e2; color: #991b1b; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; font-weight: 600; color: #555; border-bottom: 1px solid #d1d5db; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .font-mono { font-family: 'Courier New', monospace; }
          .font-bold { font-weight: 700; }
          .totals-section { border-top: 2px solid #333; padding-top: 12px; margin-top: 8px; }
          .total-row { display: flex; justify-content: flex-end; gap: 24px; margin-bottom: 4px; }
          .total-label { font-weight: 600; color: #555; min-width: 120px; text-align: right; }
          .total-value { font-weight: 700; min-width: 100px; text-align: right; }
          .saldo-pendiente { color: #dc2626; }
          .section-title { font-size: 13px; font-weight: 600; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
          @media print {
            body { padding: 12px; }
            @page { margin: 1cm; }
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  const isLoading = loadingDetalle || loadingAbonos

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-3xl shadow-xl"
    >
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Detalle de Compra</h2>
          <div className="flex items-center gap-2">
            {puedeReversar && (
              <button
                type="button"
                onClick={() => setShowDevolucion(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive bg-destructive/10 rounded-md hover:bg-destructive/20 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reversar
              </button>
            )}
            {bloqueadoPorAbonos && (
              <span
                title="La factura tiene abonos. Reverse los abonos desde CxP para poder reversar la factura."
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md cursor-help dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
              >
                <RotateCcw className="h-3 w-3" />
                Tiene abonos
              </span>
            )}
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-24 bg-muted/50 rounded animate-pulse" />
            <div className="h-40 bg-muted/50 rounded animate-pulse" />
            <div className="h-16 bg-muted/50 rounded animate-pulse" />
          </div>
        ) : (
          /* Printable content */
          <div ref={printRef}>
            {/* Document header (for print) */}
            <div className="header hidden">
              <h1>FACTURA DE COMPRA</h1>
              <p>Nro. {compra.nro_factura}</p>
            </div>

            {/* Info section */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
              <div className="info-grid grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="info-item flex gap-1">
                  <span className="info-label text-sm font-medium text-muted-foreground">Nro. Factura:</span>
                  <span className="info-value text-sm font-semibold text-foreground font-mono">{compra.nro_factura}</span>
                </div>
                {compra.nro_control && (
                  <div className="info-item flex gap-1">
                    <span className="info-label text-sm font-medium text-muted-foreground">Nro. Control:</span>
                    <span className="info-value text-sm text-foreground font-mono">{compra.nro_control}</span>
                  </div>
                )}
                <div className="info-item flex gap-1">
                  <span className="info-label text-sm font-medium text-muted-foreground">Fecha:</span>
                  <span className="info-value text-sm text-foreground">{formatDate(compra.fecha_factura)}</span>
                </div>
                <div className="info-item flex gap-1">
                  <span className="info-label text-sm font-medium text-muted-foreground">Proveedor:</span>
                  <span className="info-value text-sm text-foreground">{compra.proveedor_nombre}</span>
                </div>
                <div className="info-item flex gap-1">
                  <span className="info-label text-sm font-medium text-muted-foreground">Tasa:</span>
                  <span className="info-value text-sm text-foreground">{tasa.toFixed(4)} Bs/USD</span>
                </div>
                <div className="info-item flex gap-1">
                  <span className="info-label text-sm font-medium text-muted-foreground">Tipo:</span>
                  <span
                    className={`badge inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                      compra.tipo === 'CREDITO'
                        ? 'badge-credito bg-orange-50 text-orange-700 ring-orange-600/20'
                        : 'badge-contado bg-green-50 text-green-700 ring-green-600/20'
                    }`}
                  >
                    {compra.tipo}
                  </span>
                </div>
                <div className="info-item flex gap-1">
                  <span className="info-label text-sm font-medium text-muted-foreground">Status:</span>
                  <span
                    className={`badge inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                      compra.status === 'ANULADA'
                        ? 'badge-anulada bg-red-50 text-red-700 ring-red-600/20'
                        : compra.status === 'REVERSADA'
                          ? 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-950 dark:text-purple-300'
                          : 'badge-procesada bg-blue-50 text-blue-700 ring-blue-600/20'
                    }`}
                  >
                    {compra.status}
                  </span>
                </div>
                <div className="info-item flex gap-1">
                  <span className="info-label text-sm font-medium text-muted-foreground">Registrado por:</span>
                  <span className="info-value text-sm text-foreground">{compra.creado_por_nombre ?? '-'}</span>
                </div>
              </div>
            </div>

            {/* Detail lines */}
            <div className="section-title text-sm font-semibold text-foreground mb-2">Detalle de Productos</div>
            {detalle.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Sin lineas de detalle</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border mb-4">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Codigo</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Producto</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Cantidad</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Costo USD</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Subtotal USD</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Subtotal Bs</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {detalle.map((d) => {
                      const cantidad = parseFloat(d.cantidad)
                      const costo = parseFloat(d.costo_unitario_usd)
                      const subtotalUsd = cantidad * costo
                      const subtotalBs = subtotalUsd * tasa
                      return (
                        <tr key={d.id}>
                          <td className="px-3 py-2 text-sm font-mono text-muted-foreground">{d.producto_codigo}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{d.producto_nombre}</td>
                          <td className="px-3 py-2 text-sm text-right text-foreground">{cantidad.toFixed(3)}</td>
                          <td className="px-3 py-2 text-sm text-right text-foreground">{formatUsd(costo)}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium text-foreground">{formatUsd(subtotalUsd)}</td>
                          <td className="px-3 py-2 text-sm text-right text-muted-foreground">{formatBs(subtotalBs)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="totals-section rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="total-row flex justify-between items-center">
                <span className="total-label text-sm font-medium text-muted-foreground">Total USD:</span>
                <span className="total-value text-lg font-bold text-foreground">{formatUsd(totalUsd)}</span>
              </div>
              <div className="total-row flex justify-between items-center">
                <span className="total-label text-sm font-medium text-muted-foreground">Total Bs:</span>
                <span className="total-value text-lg font-bold text-foreground">{formatBs(totalBs)}</span>
              </div>
              {compra.tipo === 'CREDITO' && (
                <>
                  <div className="border-t border-border my-2" />
                  <div className="total-row flex justify-between items-center">
                    <span className="total-label text-sm font-medium text-muted-foreground">Total abonado:</span>
                    <span className="total-value text-sm font-semibold text-green-600">{formatUsd(totalAbonado)}</span>
                  </div>
                  <div className="total-row flex justify-between items-center">
                    <span className="total-label text-sm font-medium text-muted-foreground">Saldo pendiente:</span>
                    <span className={`total-value text-lg font-bold ${saldoPend > 0 ? 'saldo-pendiente text-red-600' : 'text-green-600'}`}>
                      {formatUsd(saldoPend)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Abonos section (only for CREDITO) */}
            {compra.tipo === 'CREDITO' && abonos.length > 0 && (
              <div className="mt-4">
                <div className="section-title text-sm font-semibold text-foreground mb-2">Abonos Realizados</div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Fecha</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Referencia</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Monto USD</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Observacion</th>
                      </tr>
                    </thead>
                    <tbody className="bg-background divide-y divide-border">
                      {abonos.map((abono) => (
                        <tr key={abono.id}>
                          <td className="px-3 py-2 text-sm text-foreground">{formatDate(abono.fecha)}</td>
                          <td className="px-3 py-2 text-sm font-mono text-foreground">{abono.referencia}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium text-foreground">{formatUsd(abono.monto)}</td>
                          <td className="px-3 py-2 text-sm text-muted-foreground">{abono.observacion ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end mt-6 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

      {showDevolucion && (
        <CompraDevolucionModal
          compra={compra}
          isOpen={showDevolucion}
          onClose={() => setShowDevolucion(false)}
          onSuccess={() => {
            setShowDevolucion(false)
            onClose()
          }}
        />
      )}
    </dialog>
  )
}
