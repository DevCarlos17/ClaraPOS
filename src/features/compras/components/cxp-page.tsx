import { useState, useEffect } from 'react'
import {
  Buildings,
  CaretRight,
  CurrencyDollar,
  CaretUp,
  CaretDown,
  MagnifyingGlass,
  Printer,
  Receipt,
} from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DeudaCard } from '@/components/shared/deuda-card'
import {
  useProveedoresConDeuda,
  useBuscarProveedoresDeuda,
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
import Decimal from 'decimal.js'
import { formatUsd } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { localNow } from '@/lib/dates'

// ─── Sort ─────────────────────────────────────────────────────

type SortKey = 'nro_factura' | 'fecha_factura' | 'total_usd' | 'saldo_pend_usd'

function SortIcon({ field, current, dir }: { field: SortKey; current: SortKey; dir: 'asc' | 'desc' }) {
  if (field !== current) return <CaretDown className="h-3 w-3 opacity-30 inline ml-1" />
  return dir === 'asc'
    ? <CaretUp className="h-3 w-3 inline ml-1" />
    : <CaretDown className="h-3 w-3 inline ml-1" />
}

// ─── KPI card ─────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl bg-card shadow-lg p-4 border border-border">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 tabular-nums ${accent ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
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

  const totalPend = facturas.reduce(
    (s, f) => s.plus(new Decimal(f.saldo_pend_usd || '0')),
    new Decimal(0)
  ).toNumber()

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
  <p class="footer">Generado: ${formatDateTime(localNow())}</p>
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

// ─── Panel derecho: facturas + gastos ─────────────────────────

interface DetallePanelProps {
  proveedor: ProveedorConDeuda
  facturas: FacturaCompraPendiente[]
  facturasSorted: FacturaCompraPendiente[]
  gastosPendientes: GastoPendiente[]
  loadingFacturas: boolean
  loadingGastos: boolean
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (k: SortKey) => void
  onPagar: (f: FacturaCompraPendiente) => void
  onPagarGasto: (g: GastoPendiente) => void
  onVerDetalle: (tipo: 'COMPRA' | 'GASTO', id: string) => void
}

function DetallePanel({
  proveedor,
  facturas,
  facturasSorted,
  gastosPendientes,
  loadingFacturas,
  loadingGastos,
  sortKey,
  sortDir,
  onToggleSort,
  onPagar,
  onPagarGasto,
  onVerDetalle,
}: DetallePanelProps) {
  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Card: Facturas Pendientes + Gastos Pendientes */}
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-card shadow-lg overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{proveedor.razon_social}</p>
            <p className="text-xs text-muted-foreground">{proveedor.rif}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deuda total</p>
              <p className="text-sm font-bold text-destructive tabular-nums">
                {formatUsd(parseFloat(proveedor.saldo_actual))}
              </p>
            </div>
            {facturas.length > 0 && (
              <button
                type="button"
                onClick={() => printReporteProveedor(proveedor, facturasSorted)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-background border border-border rounded-xl hover:bg-muted/50 transition-colors"
              >
                <Printer className="h-3.5 w-3.5" />
                Reporte
              </button>
            )}
          </div>
        </div>

        {/* Contenido: scroll interno unico para facturas + gastos
            (fix cxc-cxp-scroll-altura) */}
        <div data-testid="cxp-detalle-scroll" className="flex-1 min-h-0 overflow-y-auto">

        {/* Sub-header: Facturas */}
        <div className="px-4 py-2 border-b border-border/50 bg-muted/20">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Facturas de Compra Pendientes
          </span>
        </div>

        {loadingFacturas ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : facturas.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p className="text-sm">No hay facturas de compra pendientes</p>
          </div>
        ) : (
          <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                    onClick={() => onToggleSort('nro_factura')}
                  >
                    Factura<SortIcon field="nro_factura" current={sortKey} dir={sortDir} />
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                    onClick={() => onToggleSort('fecha_factura')}
                  >
                    Fecha<SortIcon field="fecha_factura" current={sortKey} dir={sortDir} />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tipo
                  </th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                    onClick={() => onToggleSort('total_usd')}
                  >
                    Total<SortIcon field="total_usd" current={sortKey} dir={sortDir} />
                  </th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                    onClick={() => onToggleSort('saldo_pend_usd')}
                  >
                    Pendiente<SortIcon field="saldo_pend_usd" current={sortKey} dir={sortDir} />
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Accion
                  </th>
                </tr>
              </thead>
              <tbody>
                {facturasSorted.map((factura) => (
                  <tr
                    key={factura.id}
                    onClick={() => onVerDetalle('COMPRA', factura.id)}
                    className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {factura.nro_factura}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm whitespace-nowrap">
                      {factura.fecha_factura?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                          factura.tipo === 'CREDITO'
                            ? 'bg-orange-50 text-orange-700 ring-orange-600/20'
                            : 'bg-green-50 text-green-700 ring-green-600/20'
                        }`}
                      >
                        {factura.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground text-sm">
                      {formatUsd(parseFloat(factura.total_usd))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive text-sm">
                      {formatUsd(parseFloat(factura.saldo_pend_usd))}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onPagar(factura)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-colors"
                      >
                        Pagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Fila de total */}
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Total facturas pendientes
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-destructive text-sm">
                    {formatUsd(facturas.reduce((s, f) => s.plus(new Decimal(f.saldo_pend_usd || '0')), new Decimal(0)).toNumber())}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Lista mobile: fila -> card, mismos datos y handler que la tabla */}
          <div data-testid="cxp-mobile-card-list-facturas" className="md:hidden divide-y divide-border">
            {facturasSorted.map((f) => (
              <div key={f.id} className="p-3">
                <DeudaCard
                  id={f.id}
                  numero={f.nro_factura}
                  fecha={f.fecha_factura?.slice(0, 10) ?? ''}
                  tipo={f.tipo}
                  tipoTono={f.tipo === 'CREDITO' ? 'credito' : 'contado'}
                  totalUsd={formatUsd(parseFloat(f.total_usd))}
                  pendienteUsd={formatUsd(parseFloat(f.saldo_pend_usd))}
                  accionLabel="Pagar"
                  onAccion={() => onPagar(f)}
                />
              </div>
            ))}
          </div>
          </>
        )}

        {/* Sub-header: Gastos */}
        {(loadingGastos || gastosPendientes.length > 0) && (
          <>
            <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center gap-2">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Gastos Pendientes
              </span>
            </div>

            {loadingGastos ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Gasto</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Descripcion</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pendiente</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastosPendientes.map((gasto) => (
                      <tr
                        key={gasto.id}
                        onClick={() => onVerDetalle('GASTO', gasto.id)}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-foreground">
                          <div>{gasto.nro_gasto}</div>
                          {gasto.nro_factura && (
                            <div className="text-muted-foreground text-[10px]">{gasto.nro_factura}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="truncate text-sm text-foreground">{gasto.descripcion}</div>
                          {gasto.cuenta_nombre && (
                            <div className="text-muted-foreground text-[10px] truncate">{gasto.cuenta_nombre}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm whitespace-nowrap">
                          {gasto.fecha?.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground text-sm">
                          {formatUsd(parseFloat(gasto.monto_usd))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive text-sm">
                          {formatUsd(parseFloat(gasto.saldo_pendiente_usd))}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onPagarGasto(gasto)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-colors"
                          >
                            Pagar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Total gastos pendientes
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-destructive text-sm">
                        {formatUsd(gastosPendientes.reduce((s, g) => s.plus(new Decimal(g.saldo_pendiente_usd || '0')), new Decimal(0)).toNumber())}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Lista mobile: fila -> card, mismos datos y handler que la tabla */}
              <div data-testid="cxp-mobile-card-list-gastos" className="md:hidden divide-y divide-border">
                {gastosPendientes.map((g) => (
                  <div key={g.id} className="p-3">
                    <DeudaCard
                      id={g.id}
                      numero={g.nro_gasto}
                      detalle={g.descripcion}
                      fecha={g.fecha?.slice(0, 10) ?? ''}
                      totalUsd={formatUsd(parseFloat(g.monto_usd))}
                      pendienteUsd={formatUsd(parseFloat(g.saldo_pendiente_usd))}
                      accionLabel="Pagar"
                      onAccion={() => onPagarGasto(g)}
                    />
                  </div>
                ))}
              </div>
              </>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

interface CxpPageProps {
  initialProveedorId?: string
}

export function CxpPage({ initialProveedorId }: CxpPageProps) {
  const { proveedores, isLoading } = useProveedoresConDeuda()
  const [searchQuery, setSearchQuery] = useState('')
  const { proveedores: searchResults, isLoading: loadingSearch } = useBuscarProveedoresDeuda(searchQuery)
  const isSearching = searchQuery.trim().length >= 2
  // La busqueda opera sobre el arreglo completo. La lista completa filtrada
  // se renderiza entera dentro de un contenedor con scroll interno (altura
  // acotada al viewport) — sin recorte de paginado ni SQL LIMIT (reemplaza
  // el paginado client-side anterior, ver fix cxc-cxp-scroll-altura).
  const proveedoresFiltrados = isSearching ? searchResults : proveedores
  const proveedoresListLoading = isSearching ? loadingSearch : isLoading
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<ProveedorConDeuda | null>(null)

  // Pre-select proveedor from URL param once the list is loaded
  useEffect(() => {
    if (!initialProveedorId || isLoading || proveedores.length === 0) return
    const found = proveedores.find((p) => p.id === initialProveedorId)
    if (found) setProveedorSeleccionado(found)
  }, [initialProveedorId, proveedores, isLoading])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaCompraPendiente | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [gastoSeleccionado, setGastoSeleccionado] = useState<GastoPendiente | null>(null)
  const [pagoGastoOpen, setPagoGastoOpen] = useState(false)
  const [detalleFactura, setDetalleFactura] = useState<{ tipo: 'COMPRA' | 'GASTO'; id: string } | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>('fecha_factura')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { facturas, isLoading: loadingFacturas } = useFacturasCompraPendientes(
    proveedorSeleccionado?.id ?? null
  )
  const { gastosPendientes, isLoading: loadingGastos } = useGastosPendientesProveedor(
    proveedorSeleccionado?.id ?? null
  )

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const facturasSorted = [...facturas].sort((a, b) => {
    const mult = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'total_usd' || sortKey === 'saldo_pend_usd') {
      return (parseFloat(a[sortKey]) - parseFloat(b[sortKey])) * mult
    }
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * mult
  })

  // KPIs globales derivados de la lista de proveedores
  const deudaTotal = proveedores.reduce(
    (sum, p) => sum.plus(new Decimal(p.saldo_actual || '0')),
    new Decimal(0)
  ).toNumber()
  const nroProveedores = proveedores.length
  const proveedorMayorDeuda = proveedores.length > 0
    ? [...proveedores].sort((a, b) => parseFloat(b.saldo_actual) - parseFloat(a.saldo_actual))[0]
    : null

  // ─── Estados de carga / vacío ──────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted/50 animate-pulse" />
      </div>
    )
  }

  if (proveedores.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-16 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Buildings size={48} className="opacity-20" />
        <p className="text-base font-medium">Sin cuentas por pagar</p>
        <p className="text-sm">No hay proveedores con saldo pendiente en este momento</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4">

      {/* KPIs globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Deuda Total"
          value={formatUsd(deudaTotal)}
          sub="Suma de todos los proveedores"
          accent
        />
        <KpiCard
          label="Proveedores con Deuda"
          value={String(nroProveedores)}
          sub={nroProveedores === 1 ? '1 proveedor pendiente' : `${nroProveedores} proveedores pendientes`}
        />
        <KpiCard
          label="Mayor Deuda"
          value={proveedorMayorDeuda ? formatUsd(parseFloat(proveedorMayorDeuda.saldo_actual)) : '—'}
          sub={proveedorMayorDeuda?.razon_social ?? ''}
          accent={!!proveedorMayorDeuda}
        />
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-fr gap-4 flex-1 min-h-0">

        {/* Panel izquierdo: proveedores */}
        <div
          data-testid="cxp-page-panel-izquierdo"
          className="md:col-span-1 rounded-2xl bg-card shadow-lg overflow-hidden flex flex-col min-h-0"
        >
          <div className="px-4 py-3 bg-muted/40 border-b border-border shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Proveedores con Deuda
            </span>
          </div>

          {/* Buscador */}
          <div className="px-3 py-2 border-b border-border/50 shrink-0">
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o rif/cedula..."
                className="w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Lista de proveedores: contenedor con scroll interno, altura
              acotada al espacio restante del panel (fix cxc-cxp-scroll-altura) */}
          <div data-testid="cxp-page-scroll-izquierdo" className="flex-1 min-h-0 overflow-y-auto">
          {proveedoresListLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : proveedoresFiltrados.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">{isSearching ? 'Sin resultados' : 'Sin proveedores con deuda'}</p>
            </div>
          ) : (
          <div className="divide-y divide-border">
            {proveedoresFiltrados.map((proveedor) => {
              const isSelected = proveedorSeleccionado?.id === proveedor.id
              const deuda = parseFloat(proveedor.saldo_actual)
              return (
                <button
                  key={proveedor.id}
                  type="button"
                  onClick={() => setProveedorSeleccionado(proveedor)}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-primary/5 border-l-2 border-primary'
                      : 'hover:bg-muted/30 border-l-2 border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                      {proveedor.razon_social}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {proveedor.rif} · {proveedor.facturas_pendientes} doc{proveedor.facturas_pendientes !== 1 ? 's' : ''} pendiente{proveedor.facturas_pendientes !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${deuda > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {formatUsd(deuda)}
                    </span>
                    <CaretRight size={13} className={isSelected ? 'text-primary' : 'text-muted-foreground/40'} />
                  </div>
                </button>
              )
            })}
          </div>
          )}
          </div>
          {/* Total global al pie */}
          <div className="px-4 py-2.5 bg-muted/30 border-t border-border flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
            <span className="text-sm font-bold text-destructive tabular-nums">{formatUsd(deudaTotal)}</span>
          </div>
        </div>

        {/* Panel derecho: detalle inline del proveedor (SOLO desktop, md:+).
            Siempre hidden md:block, sin depender de la seleccion — en mobile
            el detalle se muestra en un modal (ver Dialog mas abajo), nunca
            inline (mismo patron que cxc-list.tsx). */}
        <div
          data-testid="cxp-page-panel-derecho"
          className="hidden md:block md:col-span-2 min-h-0"
        >
          <div className="h-full flex flex-col min-h-0">
          {!proveedorSeleccionado ? (
            <div className="rounded-2xl bg-card shadow-lg flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <CurrencyDollar size={40} className="opacity-20" />
              <p className="text-sm font-medium">Seleccione un proveedor</p>
              <p className="text-xs">Haga clic en un proveedor de la lista para ver sus documentos pendientes</p>
            </div>
          ) : (
            <DetallePanel
              proveedor={proveedorSeleccionado}
              facturas={facturas}
              facturasSorted={facturasSorted}
              gastosPendientes={gastosPendientes}
              loadingFacturas={loadingFacturas}
              loadingGastos={loadingGastos}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              onPagar={(f) => { setFacturaSeleccionada(f); setModalOpen(true) }}
              onPagarGasto={(g) => { setGastoSeleccionado(g); setPagoGastoOpen(true) }}
              onVerDetalle={(tipo, id) => setDetalleFactura({ tipo, id })}
            />
          )}
          </div>
        </div>
      </div>

      {/* Modal de detalle: SOLO mobile (md:hidden). En desktop el detalle se
          muestra inline en el panel derecho de arriba, nunca en este modal
          (overlay y contenido ocultos via md:hidden en ambos). */}
      <Dialog
        open={!!proveedorSeleccionado}
        onOpenChange={(open) => { if (!open) setProveedorSeleccionado(null) }}
      >
        <DialogContent
          overlayClassName="md:hidden"
          className="md:hidden p-0 gap-0 bg-transparent border-0 shadow-none ring-0 max-h-[85vh] overflow-y-auto sm:max-w-lg"
        >
          <DialogTitle className="sr-only">
            Detalle de cuenta por pagar{proveedorSeleccionado ? ` de ${proveedorSeleccionado.razon_social}` : ''}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Facturas y gastos pendientes del proveedor seleccionado
          </DialogDescription>
          {proveedorSeleccionado && (
            <DetallePanel
              proveedor={proveedorSeleccionado}
              facturas={facturas}
              facturasSorted={facturasSorted}
              gastosPendientes={gastosPendientes}
              loadingFacturas={loadingFacturas}
              loadingGastos={loadingGastos}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              onPagar={(f) => { setFacturaSeleccionada(f); setModalOpen(true) }}
              onPagarGasto={(g) => { setGastoSeleccionado(g); setPagoGastoOpen(true) }}
              onVerDetalle={(tipo, id) => setDetalleFactura({ tipo, id })}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modales */}
      <PagoCxPModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setFacturaSeleccionada(null) }}
        factura={facturaSeleccionada}
        proveedorId={proveedorSeleccionado?.id ?? ''}
        proveedorNombre={proveedorSeleccionado?.razon_social ?? ''}
      />
      <PagoGastoCxpModal
        open={pagoGastoOpen}
        onClose={() => { setPagoGastoOpen(false); setGastoSeleccionado(null) }}
        gasto={gastoSeleccionado}
        proveedorId={proveedorSeleccionado?.id ?? ''}
        proveedorNombre={proveedorSeleccionado?.razon_social ?? ''}
      />
      <FacturaProveedorModal
        tipo={detalleFactura?.tipo ?? 'COMPRA'}
        id={detalleFactura?.id ?? ''}
        isOpen={!!detalleFactura}
        onClose={() => setDetalleFactura(null)}
      />
    </div>
  )
}
