import { useState } from 'react'
import { Buildings, CaretRight, CurrencyDollar, CaretUp, CaretDown, Printer, Receipt } from '@phosphor-icons/react'
import {
  useProveedoresConDeuda,
  useFacturasCompraPendientes,
  type ProveedorConDeuda,
  type FacturaCompraPendiente,
} from '../hooks/use-cxp'
import {
  useGastosPendientesProveedor,
  type GastoPendiente,
} from '@/features/contabilidad/hooks/use-gastos'
import { PagoCxPModal } from './pago-cxp-modal'
import { PagoGastoCxpModal } from './pago-gasto-cxp-modal'
import { FacturaProveedorModal } from './factura-proveedor-modal'
import { formatUsd } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ─── Sort types ──────────────────────────────────────────────

type SortKey = 'nro_factura' | 'fecha_factura' | 'total_usd' | 'saldo_pend_usd'

function SortIcon({ field, current, dir }: { field: SortKey; current: SortKey; dir: 'asc' | 'desc' }) {
  if (field !== current) return <CaretDown className="h-3 w-3 opacity-30 inline ml-1" />
  return dir === 'asc'
    ? <CaretUp className="h-3 w-3 inline ml-1" />
    : <CaretDown className="h-3 w-3 inline ml-1" />
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
  const [gastoSeleccionado, setGastoSeleccionado] = useState<GastoPendiente | null>(null)
  const [pagoGastoOpen, setPagoGastoOpen] = useState(false)
  const [detalleFactura, setDetalleFactura] = useState<{ tipo: 'COMPRA' | 'GASTO'; id: string } | null>(null)

  // Sort state for facturas table
  const [sortKey, setSortKey] = useState<SortKey>('fecha_factura')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { facturas, isLoading: loadingFacturas } = useFacturasCompraPendientes(
    proveedorSeleccionado?.id ?? null
  )

  const { gastosPendientes, isLoading: loadingGastos } = useGastosPendientesProveedor(
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

  function handlePagarGasto(gasto: GastoPendiente) {
    setGastoSeleccionado(gasto)
    setPagoGastoOpen(true)
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
        <Buildings size={40} className="opacity-30" />
        <p className="text-sm">No hay proveedores con saldo pendiente</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card shadow-md p-6">
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
                    <CaretRight size={14} className="text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-1">
                  <Badge variant="outline" className="text-xs">
                    {proveedor.facturas_pendientes} documento(s) pendiente(s)
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
            <CurrencyDollar size={32} className="opacity-30" />
            <p className="text-sm">Seleccione un proveedor para ver sus facturas pendientes</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Facturas Pendientes — {proveedorSeleccionado.razon_social}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-destructive">
                  Deuda: {formatUsd(parseFloat(proveedorSeleccionado.saldo_actual))}
                </span>
                {facturas.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => printReporteProveedor(proveedorSeleccionado, facturasSorted)}
                    className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
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
              <div className="py-6 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                No hay facturas de compra pendientes
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
                        onClick={() => setDetalleFactura({ tipo: 'COMPRA', id: factura.id })}
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
                            onClick={() => handlePagar(factura)}
                            className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
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

            {/* Gastos pendientes del proveedor */}
            {(loadingGastos || gastosPendientes.length > 0) && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Gastos Pendientes
                  </h3>
                </div>
                {loadingGastos ? (
                  <div className="py-4 text-center text-muted-foreground text-sm">
                    Cargando gastos...
                  </div>
                ) : (
                  <div className="overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Gasto</th>
                          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Descripcion</th>
                          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
                          <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                          <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Pendiente</th>
                          <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Accion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {gastosPendientes.map((gasto) => (
                          <tr
                            key={gasto.id}
                            onClick={() => setDetalleFactura({ tipo: 'GASTO', id: gasto.id })}
                            className="hover:bg-muted/30 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3 font-mono text-xs">
                              <div>{gasto.nro_gasto}</div>
                              {gasto.nro_factura && (
                                <div className="text-muted-foreground text-[10px]">{gasto.nro_factura}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-[180px]">
                              <div className="truncate text-xs">{gasto.descripcion}</div>
                              {gasto.cuenta_nombre && (
                                <div className="text-muted-foreground text-[10px] truncate">{gasto.cuenta_nombre}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {gasto.fecha?.slice(0, 10)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatUsd(parseFloat(gasto.monto_usd))}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive">
                              {formatUsd(parseFloat(gasto.saldo_pendiente_usd))}
                            </td>
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                onClick={() => handlePagarGasto(gasto)}
                                className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Pago factura compra modal */}
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

      {/* Pago gasto modal */}
      <PagoGastoCxpModal
        open={pagoGastoOpen}
        onClose={() => {
          setPagoGastoOpen(false)
          setGastoSeleccionado(null)
        }}
        gasto={gastoSeleccionado}
        proveedorId={proveedorSeleccionado?.id ?? ''}
        proveedorNombre={proveedorSeleccionado?.razon_social ?? ''}
      />

      {/* Modal unificado de detalle */}
      <FacturaProveedorModal
        tipo={detalleFactura?.tipo ?? 'COMPRA'}
        id={detalleFactura?.id ?? ''}
        isOpen={!!detalleFactura}
        onClose={() => setDetalleFactura(null)}
      />
    </div>
    </div>
  )
}
