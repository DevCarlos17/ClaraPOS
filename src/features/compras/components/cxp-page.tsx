import { useState } from 'react'
import { Building2, ChevronRight, DollarSign, ChevronUp, ChevronDown, Printer, X } from 'lucide-react'
import {
  useProveedoresConDeuda,
  useFacturasCompraPendientes,
  type ProveedorConDeuda,
  type FacturaCompraPendiente,
} from '../hooks/use-cxp'
import { useAbonosCompra, useDetalleCompra } from '@/features/inventario/hooks/use-compras'
import { PagoCxPModal } from './pago-cxp-modal'
import { formatUsd, formatBs } from '@/lib/currency'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Sort types ──────────────────────────────────────────────

type SortKey = 'nro_factura' | 'fecha_factura' | 'total_usd' | 'saldo_pend_usd'

function SortIcon({ field, current, dir }: { field: SortKey; current: SortKey; dir: 'asc' | 'desc' }) {
  if (field !== current) return <ChevronDown className="h-3 w-3 opacity-30 inline ml-1" />
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 inline ml-1" />
    : <ChevronDown className="h-3 w-3 inline ml-1" />
}

// ─── Factura Detalle Modal ────────────────────────────────────

interface CxpDetalleModalProps {
  open: boolean
  onClose: () => void
  factura: FacturaCompraPendiente | null
  proveedorNombre: string
  onPagar: (factura: FacturaCompraPendiente) => void
}

function CxpDetalleModal({ open, onClose, factura, proveedorNombre, onPagar }: CxpDetalleModalProps) {
  const { abonos, isLoading: loadingAbonos } = useAbonosCompra(factura?.id ?? '')
  const { detalle, isLoading: loadingDetalle } = useDetalleCompra(factura?.id ?? '')
  const { tasaValor } = useTasaActual()
  const [nuevaTasaStr, setNuevaTasaStr] = useState('')

  if (!factura) return null

  const total = parseFloat(factura.total_usd)
  const saldo = parseFloat(factura.saldo_pend_usd)
  const abonado = total - saldo

  // Tasa del ultimo pago registrado (para mostrar pendiente en Bs)
  const ultimaTasaPago = [...abonos]
    .filter((a) => a.tipo === 'PAG' && a.tasa_pago)
    .at(-1)?.tasa_pago

  const nuevaTasaNum = parseFloat(nuevaTasaStr) || 0
  const tasaParaPendiente = nuevaTasaNum > 0
    ? nuevaTasaNum
    : ultimaTasaPago
      ? parseFloat(ultimaTasaPago)
      : tasaValor

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle Factura de Compra</DialogTitle>
        </DialogHeader>

        {/* Invoice summary */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
          <div className="font-semibold text-base">{proveedorNombre}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="text-muted-foreground">Nro. Factura</div>
            <div className="font-mono font-medium">{factura.nro_factura}</div>
            <div className="text-muted-foreground">Fecha</div>
            <div>{factura.fecha_factura?.slice(0, 10)}</div>
            <div className="text-muted-foreground">Tipo</div>
            <div>
              <Badge variant="outline" className="text-xs">{factura.tipo}</Badge>
            </div>
            <div className="text-muted-foreground">Total Factura</div>
            <div className="font-semibold">{formatUsd(total)}</div>
            <div className="text-muted-foreground">Abonado</div>
            <div className="text-green-600 font-medium">{formatUsd(abonado)}</div>
            <div className="text-muted-foreground">Saldo Pendiente</div>
            <div className="text-destructive font-bold">{formatUsd(saldo)}</div>
          </div>
        </div>

        {/* Pendiente en Bs con tasa editable */}
        {saldo > 0.01 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pendiente en Bs:</span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {tasaParaPendiente > 0 ? formatBs(saldo * tasaParaPendiente) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Tasa Bs/USD:</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={nuevaTasaStr}
                onChange={(e) => setNuevaTasaStr(e.target.value)}
                placeholder={tasaParaPendiente > 0 ? tasaParaPendiente.toFixed(4) : '0.0000'}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {!nuevaTasaStr && (
              <p className="text-xs text-muted-foreground">
                {ultimaTasaPago
                  ? `Usando tasa del ultimo pago (${parseFloat(ultimaTasaPago).toFixed(2)})`
                  : `Usando tasa actual del sistema (${tasaValor.toFixed(2)})`}
              </p>
            )}
          </div>
        )}

        {/* Articulos comprados */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Articulos Comprados
          </h4>
          {loadingDetalle ? (
            <p className="text-sm text-muted-foreground py-2">Cargando...</p>
          ) : detalle.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sin detalle disponible</p>
          ) : (
            <div className="overflow-auto rounded-md border max-h-36">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Producto</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Costo USD</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detalle.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-muted-foreground text-[10px]">{d.producto_codigo}</span>
                        {' '}
                        <span>{d.producto_nombre}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {parseFloat(d.cantidad).toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatUsd(parseFloat(d.costo_unitario_usd))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {formatUsd(parseFloat(d.cantidad) * parseFloat(d.costo_unitario_usd))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Historial de pagos */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Historial de Pagos
          </h4>
          {loadingAbonos ? (
            <p className="text-sm text-muted-foreground py-2">Cargando...</p>
          ) : abonos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sin pagos registrados</p>
          ) : (
            <div className="overflow-auto rounded-md border max-h-44">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ref.</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {abonos.map((a) => {
                    const esBs = a.moneda_pago === 'BS' && a.monto_moneda && a.tasa_pago
                    return (
                      <tr key={a.id}>
                        <td className="px-3 py-1.5 text-muted-foreground">{a.fecha?.slice(0, 10)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`font-medium ${a.tipo === 'PAG' ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {a.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">{a.referencia ?? '-'}</td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="font-medium">
                            {a.tipo === 'PAG' ? '+' : ''}{formatUsd(parseFloat(a.monto))}
                          </div>
                          {esBs && (
                            <div className="text-muted-foreground text-[10px] leading-tight">
                              {formatBs(parseFloat(a.monto_moneda!))} a {parseFloat(a.tasa_pago!).toFixed(2)}
                              {a.monto_usd_interno && Math.abs(parseFloat(a.monto_usd_interno) - parseFloat(a.monto)) > 0.005 && (
                                <span className="text-slate-400 ml-1">
                                  / {formatUsd(parseFloat(a.monto_usd_interno))} int.
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Cerrar
          </Button>
          {saldo > 0.01 && (
            <Button onClick={() => { onClose(); onPagar(factura) }}>
              Registrar Pago
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Print helper ─────────────────────────────────────────────

function printReporteProveedor(
  proveedor: ProveedorConDeuda,
  facturas: FacturaCompraPendiente[]
) {
  const rows = facturas
    .map(
      (f) =>
        `<tr>
          <td>${f.nro_factura}</td>
          <td>${f.fecha_factura?.slice(0, 10) ?? ''}</td>
          <td>${f.tipo}</td>
          <td style="text-align:right">$${parseFloat(f.total_usd).toFixed(2)}</td>
          <td style="text-align:right;color:#dc2626;font-weight:bold">$${parseFloat(f.saldo_pend_usd).toFixed(2)}</td>
        </tr>`
    )
    .join('')

  const totalPend = facturas.reduce((s, f) => s + parseFloat(f.saldo_pend_usd), 0)

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>CxP - ${proveedor.razon_social}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h2 { margin: 0 0 4px; font-size: 18px; }
    .sub { color: #555; margin-bottom: 20px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f3f4f6; font-weight: 600; }
    th, td { border: 1px solid #e5e7eb; padding: 7px 10px; }
    .total-row td { background: #fffbeb; font-weight: bold; }
    .footer { margin-top: 16px; font-size: 11px; color: #9ca3af; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h2>Cuentas por Pagar</h2>
  <p class="sub">
    ${proveedor.razon_social} &nbsp;|&nbsp; RIF: ${proveedor.rif} &nbsp;|&nbsp;
    Deuda total: <strong>$${parseFloat(proveedor.saldo_actual).toFixed(2)}</strong>
  </p>
  <table>
    <thead>
      <tr>
        <th>Nro. Factura</th><th>Fecha</th><th>Tipo</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">Pendiente</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4">TOTAL PENDIENTE</td>
        <td style="text-align:right">$${totalPend.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  <p class="footer">Generado: ${new Date().toLocaleString('es-VE')}</p>
</body>
</html>`

  const win = window.open('', '_blank', 'width=820,height=640')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }
}

// ─── Main page ────────────────────────────────────────────────

export function CxpPage() {
  const { proveedores, isLoading } = useProveedoresConDeuda()
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<ProveedorConDeuda | null>(null)
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaCompraPendiente | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState(false)
  const [facturaDetalle, setFacturaDetalle] = useState<FacturaCompraPendiente | null>(null)

  // Sort state for facturas table
  const [sortKey, setSortKey] = useState<SortKey>('fecha_factura')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { facturas, isLoading: loadingFacturas } = useFacturasCompraPendientes(
    proveedorSeleccionado?.id ?? null
  )

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const facturasSorted = [...facturas].sort((a, b) => {
    const mult = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'total_usd' || sortKey === 'saldo_pend_usd') {
      return (parseFloat(a[sortKey]) - parseFloat(b[sortKey])) * mult
    }
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * mult
  })

  function handlePagar(factura: FacturaCompraPendiente) {
    setFacturaSeleccionada(factura)
    setModalOpen(true)
  }

  function handleVerDetalle(factura: FacturaCompraPendiente) {
    setFacturaDetalle(factura)
    setDetalleOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Cargando proveedores con deuda...
      </div>
    )
  }

  if (proveedores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Building2 size={40} className="opacity-30" />
        <p className="text-sm">No hay proveedores con saldo pendiente</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Lista de proveedores con deuda */}
      <div className="md:col-span-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Proveedores con Deuda
        </h3>
        <div className="space-y-2">
          {proveedores.map((proveedor) => {
            const isSelected = proveedorSeleccionado?.id === proveedor.id
            return (
              <button
                key={proveedor.id}
                onClick={() => setProveedorSeleccionado(proveedor)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{proveedor.razon_social}</div>
                    <div className="text-xs text-muted-foreground">{proveedor.rif}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-sm font-semibold text-destructive">
                      {formatUsd(parseFloat(proveedor.saldo_actual))}
                    </span>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-1">
                  <Badge variant="outline" className="text-xs">
                    {proveedor.facturas_pendientes} factura(s) pendiente(s)
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Facturas pendientes del proveedor seleccionado */}
      <div className="md:col-span-2">
        {!proveedorSeleccionado ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 border border-dashed rounded-lg">
            <DollarSign size={32} className="opacity-30" />
            <p className="text-sm">Seleccione un proveedor para ver sus facturas pendientes</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Facturas Pendientes — {proveedorSeleccionado.razon_social}
              </h3>
              <div className="flex items-center gap-2">
                <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                  Deuda: {formatUsd(parseFloat(proveedorSeleccionado.saldo_actual))}
                </Badge>
                {facturas.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => printReporteProveedor(proveedorSeleccionado, facturasSorted)}
                    className="gap-1.5 text-xs"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Reporte
                  </Button>
                )}
              </div>
            </div>

            {loadingFacturas ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Cargando facturas...
              </div>
            ) : facturas.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                No hay facturas pendientes
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th
                        className="text-left px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort('nro_factura')}
                      >
                        Factura
                        <SortIcon field="nro_factura" current={sortKey} dir={sortDir} />
                      </th>
                      <th
                        className="text-left px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort('fecha_factura')}
                      >
                        Fecha
                        <SortIcon field="fecha_factura" current={sortKey} dir={sortDir} />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
                      <th
                        className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort('total_usd')}
                      >
                        Total
                        <SortIcon field="total_usd" current={sortKey} dir={sortDir} />
                      </th>
                      <th
                        className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort('saldo_pend_usd')}
                      >
                        Pendiente
                        <SortIcon field="saldo_pend_usd" current={sortKey} dir={sortDir} />
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {facturasSorted.map((factura) => (
                      <tr
                        key={factura.id}
                        onClick={() => handleVerDetalle(factura)}
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs">{factura.nro_factura}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {factura.fecha_factura?.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">
                            {factura.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatUsd(parseFloat(factura.total_usd))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive">
                          {formatUsd(parseFloat(factura.saldo_pend_usd))}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePagar(factura)}
                            className="text-xs"
                          >
                            Pagar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pago modal */}
      <PagoCxPModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setFacturaSeleccionada(null)
        }}
        factura={facturaSeleccionada}
        proveedorId={proveedorSeleccionado?.id ?? ''}
        proveedorNombre={proveedorSeleccionado?.razon_social ?? ''}
      />

      {/* Detalle modal */}
      <CxpDetalleModal
        open={detalleOpen}
        onClose={() => {
          setDetalleOpen(false)
          setFacturaDetalle(null)
        }}
        factura={facturaDetalle}
        proveedorNombre={proveedorSeleccionado?.razon_social ?? ''}
        onPagar={handlePagar}
      />
    </div>
  )
}
