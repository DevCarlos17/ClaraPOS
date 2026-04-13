import { useState } from 'react'
import { FileText, ChevronDown, Loader2 } from 'lucide-react'
import { type CompraConProveedor, fetchDetalleParaReporte, type DetalleConProducto } from '@/features/inventario/hooks/use-compras'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate, formatDateTime } from '@/lib/format'

type TipoReporte = 'resumen' | 'detallado' | 'productos'

interface CompraReportesProps {
  compras: CompraConProveedor[]
  fechaDesde: string
  fechaHasta: string
}

interface EmpresaInfo {
  nombre: string
  rif: string
  direccion: string
}

const PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #1a1a1a;
    padding: 24px;
    font-size: 11px;
    line-height: 1.4;
  }
  .empresa-header {
    text-align: center;
    margin-bottom: 6px;
  }
  .empresa-header .empresa-nombre { font-size: 15px; font-weight: 700; text-transform: uppercase; }
  .empresa-header .empresa-rif { font-size: 10px; color: #444; font-weight: 600; }
  .empresa-header .empresa-direccion { font-size: 9px; color: #666; margin-top: 2px; }
  .report-header {
    text-align: center;
    margin-bottom: 16px;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    margin-top: 10px;
    border-top: 1px solid #d1d5db;
    padding-top: 10px;
  }
  .report-header h1 { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
  .report-header p { font-size: 10px; color: #666; }
  .report-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
    font-size: 10px;
    color: #555;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
    margin-bottom: 18px;
  }
  .summary-card {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 10px;
    text-align: center;
  }
  .summary-card .label { font-size: 9px; text-transform: uppercase; color: #666; font-weight: 600; margin-bottom: 4px; }
  .summary-card .value { font-size: 15px; font-weight: 700; }
  .summary-card .value-sm { font-size: 11px; color: #555; }
  .value-green { color: #166534; }
  .value-red { color: #dc2626; }
  .value-blue { color: #1e40af; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
  th {
    background: #f3f4f6;
    text-align: left;
    padding: 5px 6px;
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 600;
    color: #555;
    border-bottom: 1px solid #d1d5db;
  }
  td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-mono { font-family: 'Courier New', monospace; }
  .font-bold { font-weight: 700; }
  .font-medium { font-weight: 500; }
  .text-muted { color: #6b7280; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
  }
  .badge-contado { background: #dcfce7; color: #166534; }
  .badge-credito { background: #fff7ed; color: #9a3412; }
  .totals-row td { font-weight: 700; background: #f9fafb; border-top: 2px solid #333; }
  .detail-products { background: #fafbfc; }
  .detail-products td { padding: 3px 6px 3px 30px; font-size: 9px; color: #555; border-bottom: 1px dashed #e5e7eb; }
  .detail-products .prod-header td { font-weight: 600; font-size: 8px; text-transform: uppercase; color: #888; }
  .report-footer {
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid #d1d5db;
    font-size: 9px;
    color: #888;
    text-align: center;
  }
  .breakdown-section { margin-bottom: 16px; }
  .breakdown-title { font-size: 11px; font-weight: 600; margin-bottom: 6px; color: #333; }
  @media print {
    body { padding: 12px; }
    @page { margin: 0.8cm; size: letter; }
  }
`

function buildEmpresaHeader(empresa: EmpresaInfo) {
  return `
    <div class="empresa-header">
      <div class="empresa-nombre">${empresa.nombre}</div>
      ${empresa.rif ? `<div class="empresa-rif">RIF: ${empresa.rif}</div>` : ''}
      ${empresa.direccion ? `<div class="empresa-direccion">${empresa.direccion}</div>` : ''}
    </div>
  `
}

function calcTotals(compras: CompraConProveedor[]) {
  let totalUsd = 0
  let totalBs = 0
  let totalAbonado = 0
  let totalPendiente = 0
  let countContado = 0
  let countCredito = 0

  for (const c of compras) {
    const usd = parseFloat(c.total_usd) || 0
    const bs = parseFloat(c.total_bs) || 0
    const pend = parseFloat(c.saldo_pend_usd) || 0
    totalUsd += usd
    totalBs += bs
    totalPendiente += pend
    if (c.tipo === 'CREDITO') {
      countCredito++
      totalAbonado += usd - pend
    } else {
      countContado++
    }
  }

  return { totalUsd, totalBs, totalAbonado, totalPendiente, countContado, countCredito }
}

function buildSummaryHtml(
  compras: CompraConProveedor[],
  fechaDesde: string,
  fechaHasta: string,
  usuario: string,
  empresa: EmpresaInfo
) {
  const t = calcTotals(compras)
  const now = formatDateTime(new Date().toISOString())

  return `
    ${buildEmpresaHeader(empresa)}
    <div class="report-header">
      <h1>REPORTE DE COMPRAS - RESUMEN</h1>
      <p>Periodo: ${formatDate(fechaDesde)} al ${formatDate(fechaHasta)}</p>
    </div>
    <div class="report-meta">
      <span>Generado: ${now}</span>
      <span>Usuario: ${usuario}</span>
    </div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Facturas</div>
        <div class="value value-blue">${compras.length}</div>
        <div class="value-sm">${t.countContado} contado / ${t.countCredito} credito</div>
      </div>
      <div class="summary-card">
        <div class="label">Total General USD</div>
        <div class="value">${formatUsd(t.totalUsd)}</div>
        <div class="value-sm">${formatBs(t.totalBs)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Abonado</div>
        <div class="value value-green">${formatUsd(t.totalAbonado)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Pendiente</div>
        <div class="value ${t.totalPendiente > 0 ? 'value-red' : 'value-green'}">${formatUsd(t.totalPendiente)}</div>
      </div>
    </div>
    <div class="breakdown-section">
      <div class="breakdown-title">Desglose por Tipo</div>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th class="text-right">Cantidad</th>
            <th class="text-right">Total USD</th>
            <th class="text-right">Total Bs</th>
            <th class="text-right">Pendiente USD</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge badge-contado">CONTADO</span></td>
            <td class="text-right">${t.countContado}</td>
            <td class="text-right font-bold">${formatUsd(compras.filter(c => c.tipo === 'CONTADO').reduce((s, c) => s + (parseFloat(c.total_usd) || 0), 0))}</td>
            <td class="text-right text-muted">${formatBs(compras.filter(c => c.tipo === 'CONTADO').reduce((s, c) => s + (parseFloat(c.total_bs) || 0), 0))}</td>
            <td class="text-right">-</td>
          </tr>
          <tr>
            <td><span class="badge badge-credito">CREDITO</span></td>
            <td class="text-right">${t.countCredito}</td>
            <td class="text-right font-bold">${formatUsd(compras.filter(c => c.tipo === 'CREDITO').reduce((s, c) => s + (parseFloat(c.total_usd) || 0), 0))}</td>
            <td class="text-right text-muted">${formatBs(compras.filter(c => c.tipo === 'CREDITO').reduce((s, c) => s + (parseFloat(c.total_bs) || 0), 0))}</td>
            <td class="text-right font-bold ${t.totalPendiente > 0 ? 'value-red' : ''}">${formatUsd(t.totalPendiente)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="totals-row">
            <td>TOTAL</td>
            <td class="text-right">${compras.length}</td>
            <td class="text-right">${formatUsd(t.totalUsd)}</td>
            <td class="text-right">${formatBs(t.totalBs)}</td>
            <td class="text-right ${t.totalPendiente > 0 ? 'value-red' : ''}">${formatUsd(t.totalPendiente)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="report-footer">Reporte generado por ClaraPOS</div>
  `
}

function buildDetailHtml(
  compras: CompraConProveedor[],
  fechaDesde: string,
  fechaHasta: string,
  usuario: string,
  empresa: EmpresaInfo
) {
  const t = calcTotals(compras)
  const now = formatDateTime(new Date().toISOString())

  const rows = compras.map(c => {
    const pend = parseFloat(c.saldo_pend_usd) || 0
    return `
      <tr>
        <td class="font-mono">${c.nro_factura}</td>
        <td>${formatDate(c.fecha_factura)}</td>
        <td>${c.proveedor_nombre}</td>
        <td class="text-center"><span class="badge ${c.tipo === 'CREDITO' ? 'badge-credito' : 'badge-contado'}">${c.tipo}</span></td>
        <td class="text-right">${parseFloat(c.tasa).toFixed(4)}</td>
        <td class="text-right font-bold">${formatUsd(c.total_usd)}</td>
        <td class="text-right text-muted">${formatBs(c.total_bs)}</td>
        <td class="text-right ${pend > 0 ? 'value-red font-bold' : ''}">${c.tipo === 'CREDITO' ? formatUsd(pend) : '-'}</td>
        <td class="text-muted">${c.creado_por_nombre ?? '-'}</td>
      </tr>
    `
  }).join('')

  return `
    ${buildEmpresaHeader(empresa)}
    <div class="report-header">
      <h1>REPORTE DE COMPRAS - DETALLADO</h1>
      <p>Periodo: ${formatDate(fechaDesde)} al ${formatDate(fechaHasta)}</p>
    </div>
    <div class="report-meta">
      <span>Generado: ${now}</span>
      <span>Usuario: ${usuario}</span>
    </div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Facturas</div>
        <div class="value value-blue">${compras.length}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total General USD</div>
        <div class="value">${formatUsd(t.totalUsd)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Abonado</div>
        <div class="value value-green">${formatUsd(t.totalAbonado)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Pendiente</div>
        <div class="value ${t.totalPendiente > 0 ? 'value-red' : 'value-green'}">${formatUsd(t.totalPendiente)}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Nro Factura</th>
          <th>Fecha</th>
          <th>Proveedor</th>
          <th class="text-center">Tipo</th>
          <th class="text-right">Tasa</th>
          <th class="text-right">Total USD</th>
          <th class="text-right">Total Bs</th>
          <th class="text-right">Pendiente</th>
          <th>Registrado por</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td colspan="5">TOTALES (${compras.length} facturas)</td>
          <td class="text-right">${formatUsd(t.totalUsd)}</td>
          <td class="text-right">${formatBs(t.totalBs)}</td>
          <td class="text-right ${t.totalPendiente > 0 ? 'value-red' : ''}">${formatUsd(t.totalPendiente)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div class="report-footer">Reporte generado por ClaraPOS</div>
  `
}

function buildProductsHtml(
  compras: CompraConProveedor[],
  detalleMap: Map<string, DetalleConProducto[]>,
  fechaDesde: string,
  fechaHasta: string,
  usuario: string,
  empresa: EmpresaInfo
) {
  const t = calcTotals(compras)
  const now = formatDateTime(new Date().toISOString())

  let totalItems = 0
  for (const items of detalleMap.values()) {
    totalItems += items.length
  }

  const rows = compras.map(c => {
    const pend = parseFloat(c.saldo_pend_usd) || 0
    const items = detalleMap.get(c.id) ?? []

    const mainRow = `
      <tr style="background: #f9fafb;">
        <td class="font-mono font-bold">${c.nro_factura}</td>
        <td>${formatDate(c.fecha_factura)}</td>
        <td class="font-medium">${c.proveedor_nombre}</td>
        <td class="text-center"><span class="badge ${c.tipo === 'CREDITO' ? 'badge-credito' : 'badge-contado'}">${c.tipo}</span></td>
        <td class="text-right">${parseFloat(c.tasa).toFixed(4)}</td>
        <td class="text-right font-bold">${formatUsd(c.total_usd)}</td>
        <td class="text-right text-muted">${formatBs(c.total_bs)}</td>
        <td class="text-right ${pend > 0 ? 'value-red font-bold' : ''}">${c.tipo === 'CREDITO' ? formatUsd(pend) : '-'}</td>
        <td class="text-muted">${c.creado_por_nombre ?? '-'}</td>
      </tr>
    `

    if (items.length === 0) return mainRow

    const productHeader = `
      <tr class="detail-products prod-header">
        <td></td>
        <td>Codigo</td>
        <td colspan="2">Producto</td>
        <td class="text-right">Cantidad</td>
        <td class="text-right">Costo USD</td>
        <td class="text-right">Subtotal USD</td>
        <td class="text-right">Subtotal Bs</td>
        <td></td>
      </tr>
    `

    const productRows = items.map(d => {
      const cant = parseFloat(d.cantidad)
      const costo = parseFloat(d.costo_unitario_usd)
      const subtUsd = cant * costo
      const tasaVal = parseFloat(c.tasa)
      const subtBs = subtUsd * tasaVal
      return `
        <tr class="detail-products">
          <td></td>
          <td class="font-mono">${d.producto_codigo}</td>
          <td colspan="2">${d.producto_nombre}</td>
          <td class="text-right">${cant.toFixed(3)}</td>
          <td class="text-right">${formatUsd(costo)}</td>
          <td class="text-right">${formatUsd(subtUsd)}</td>
          <td class="text-right">${formatBs(subtBs)}</td>
          <td></td>
        </tr>
      `
    }).join('')

    return mainRow + productHeader + productRows
  }).join('')

  return `
    ${buildEmpresaHeader(empresa)}
    <div class="report-header">
      <h1>REPORTE DE COMPRAS - CON PRODUCTOS</h1>
      <p>Periodo: ${formatDate(fechaDesde)} al ${formatDate(fechaHasta)}</p>
    </div>
    <div class="report-meta">
      <span>Generado: ${now}</span>
      <span>Usuario: ${usuario}</span>
    </div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Facturas</div>
        <div class="value value-blue">${compras.length}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Productos</div>
        <div class="value value-blue">${totalItems}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total General USD</div>
        <div class="value">${formatUsd(t.totalUsd)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Abonado</div>
        <div class="value value-green">${formatUsd(t.totalAbonado)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Pendiente</div>
        <div class="value ${t.totalPendiente > 0 ? 'value-red' : 'value-green'}">${formatUsd(t.totalPendiente)}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Nro Factura</th>
          <th>Fecha</th>
          <th>Proveedor</th>
          <th class="text-center">Tipo</th>
          <th class="text-right">Tasa</th>
          <th class="text-right">Total USD</th>
          <th class="text-right">Total Bs</th>
          <th class="text-right">Pendiente</th>
          <th>Registrado por</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td colspan="5">TOTALES (${compras.length} facturas, ${totalItems} productos)</td>
          <td class="text-right">${formatUsd(t.totalUsd)}</td>
          <td class="text-right">${formatBs(t.totalBs)}</td>
          <td class="text-right ${t.totalPendiente > 0 ? 'value-red' : ''}">${formatUsd(t.totalPendiente)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div class="report-footer">Reporte generado por ClaraPOS</div>
  `
}

function openPrintWindow(title: string, html: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) return

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>${PRINT_STYLES}</style>
    </head>
    <body>${html}</body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => { printWindow.print() }, 300)
}

export function CompraReportes({ compras, fechaDesde, fechaHasta }: CompraReportesProps) {
  const { user } = useCurrentUser()
  const { company } = useCompany()
  const [menuOpen, setMenuOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const usuario = user?.nombre ?? user?.email ?? 'Desconocido'
  const empresaId = user?.empresa_id ?? ''

  const empresaInfo: EmpresaInfo = {
    nombre: company?.nombre ?? '',
    rif: company?.rif ?? '',
    direccion: company?.direccion ?? '',
  }

  async function handleGenerarReporte(tipo: TipoReporte) {
    setMenuOpen(false)

    if (tipo === 'resumen') {
      const html = buildSummaryHtml(compras, fechaDesde, fechaHasta, usuario, empresaInfo)
      openPrintWindow('Reporte Compras - Resumen', html)
      return
    }

    if (tipo === 'detallado') {
      const html = buildDetailHtml(compras, fechaDesde, fechaHasta, usuario, empresaInfo)
      openPrintWindow('Reporte Compras - Detallado', html)
      return
    }

    if (tipo === 'productos') {
      setGenerating(true)
      try {
        const compraIds = compras.map(c => c.id)
        const detalleMap = await fetchDetalleParaReporte(compraIds, empresaId)
        const html = buildProductsHtml(compras, detalleMap, fechaDesde, fechaHasta, usuario, empresaInfo)
        openPrintWindow('Reporte Compras - Con Productos', html)
      } finally {
        setGenerating(false)
      }
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={generating}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        Reportes
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 mt-1 w-72 z-20 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            <button
              onClick={() => handleGenerarReporte('resumen')}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
            >
              <div className="text-sm font-medium text-foreground">Resumen General</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Totales: general, abonado, pendiente, desglose por tipo
              </div>
            </button>
            <button
              onClick={() => handleGenerarReporte('detallado')}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
            >
              <div className="text-sm font-medium text-foreground">Detallado por Factura</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Incluye fecha, nro. factura, proveedor, tasa, montos, registrado por
              </div>
            </button>
            <button
              onClick={() => handleGenerarReporte('productos')}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors"
            >
              <div className="text-sm font-medium text-foreground">Con Productos</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Detalle completo con productos por factura: codigo, nombre, cantidad, precio
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
