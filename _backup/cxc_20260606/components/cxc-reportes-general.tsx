import { useState } from 'react'
import { FileText, CaretDown, CircleNotch } from '@phosphor-icons/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { formatDate, formatDateTime } from '@/lib/format'
import type { ClienteConDeuda } from '../hooks/use-cxc'

interface CxcReportesGeneralProps {
  clientes: ClienteConDeuda[]
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
  .empresa-header { text-align: center; margin-bottom: 6px; }
  .empresa-nombre { font-size: 15px; font-weight: 700; text-transform: uppercase; }
  .empresa-rif { font-size: 10px; color: #444; font-weight: 600; }
  .empresa-direccion { font-size: 9px; color: #666; margin-top: 2px; }
  .report-header {
    text-align: center;
    margin: 10px 0 16px;
    border-top: 1px solid #d1d5db;
    border-bottom: 2px solid #333;
    padding: 10px 0;
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
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }
  .summary-card {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 8px;
    text-align: center;
  }
  .summary-card .label { font-size: 9px; text-transform: uppercase; color: #666; font-weight: 600; margin-bottom: 3px; }
  .summary-card .value { font-size: 14px; font-weight: 700; }
  .summary-card .value-sm { font-size: 10px; color: #555; }
  .value-red { color: #dc2626; }
  .value-blue { color: #1e40af; }
  .value-green { color: #166534; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th {
    background: #f3f4f6;
    text-align: left;
    padding: 4px 6px;
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 600;
    color: #555;
    border-bottom: 1px solid #d1d5db;
  }
  td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  .text-right { text-align: right; }
  .font-mono { font-family: 'Courier New', monospace; }
  .font-bold { font-weight: 700; }
  .font-medium { font-weight: 500; }
  .text-muted { color: #6b7280; }
  .totals-row td { font-weight: 700; background: #f9fafb; border-top: 2px solid #333; }
  .factura-row td { background: #f9fafb; }
  .art-row td { background: #fafbff; padding: 3px 6px 3px 24px; font-size: 9px; color: #555; border-bottom: 1px dashed #e5e7eb; }
  .cliente-header { font-size: 11px; font-weight: 700; margin: 12px 0 4px; padding: 4px 0; border-bottom: 1px solid #d1d5db; }
  .report-footer {
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid #d1d5db;
    font-size: 9px;
    color: #888;
    text-align: center;
  }
  @media print {
    body { padding: 12px; }
    @page { margin: 0.8cm; size: letter; }
  }
`

function openPrintWindow(title: string, html: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) return
  printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${html}</body></html>`)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => { printWindow.print() }, 300)
}

function buildEmpresaHeader(company: { nombre?: string | null; rif?: string | null; direccion?: string | null }) {
  return `
    <div class="empresa-header">
      <div class="empresa-nombre">${company.nombre ?? ''}</div>
      ${company.rif ? `<div class="empresa-rif">RIF: ${company.rif}</div>` : ''}
      ${company.direccion ? `<div class="empresa-direccion">${company.direccion}</div>` : ''}
    </div>
  `
}

export function CxcReportesGeneral({ clientes }: CxcReportesGeneralProps) {
  const { user } = useCurrentUser()
  const { company } = useCompany()
  const { tasaValor } = useTasaActual()
  const [menuOpen, setMenuOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const usuario = user?.nombre ?? user?.email ?? 'Desconocido'
  const totalDeuda = clientes.reduce((s, c) => s + parseFloat(c.saldo_actual), 0)
  const totalFacturas = clientes.reduce((s, c) => s + Number(c.facturas_pendientes), 0)
  const now = formatDateTime(new Date().toISOString())

  function buildResumenHeader(titulo: string) {
    return `
      ${buildEmpresaHeader({ nombre: company?.nombre, rif: company?.rif, direccion: company?.direccion })}
      <div class="report-header">
        <h1>CUENTAS POR COBRAR - ${titulo.toUpperCase()}</h1>
        <p>Generado: ${now}</p>
      </div>
      <div class="report-meta">
        <span>Total clientes con deuda: ${clientes.length}</span>
        <span>Usuario: ${usuario}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">Clientes</div>
          <div class="value value-blue">${clientes.length}</div>
        </div>
        <div class="summary-card">
          <div class="label">Facturas pendientes</div>
          <div class="value">${totalFacturas}</div>
        </div>
        <div class="summary-card">
          <div class="label">Deuda total</div>
          <div class="value value-red">${formatUsd(totalDeuda)}</div>
          ${tasaValor > 0 ? `<div class="value-sm">${formatBs(usdToBs(totalDeuda, tasaValor))}</div>` : ''}
        </div>
      </div>
    `
  }

  function generarResumen() {
    setMenuOpen(false)
    const rows = clientes.map(c => {
      const saldo = parseFloat(c.saldo_actual)
      const limite = parseFloat(c.limite_credito_usd)
      return `
        <tr>
          <td class="font-mono">${c.identificacion}</td>
          <td class="font-medium">${c.nombre}</td>
          <td class="text-right">${c.facturas_pendientes}</td>
          <td class="text-right value-red font-bold">${formatUsd(saldo)}</td>
          <td class="text-right text-muted">${tasaValor > 0 ? formatBs(usdToBs(saldo, tasaValor)) : '-'}</td>
          <td class="text-right">${limite > 0 ? formatUsd(limite) : 'N/A'}</td>
        </tr>
      `
    }).join('')

    const html = `
      ${buildResumenHeader('Resumen por Cliente')}
      <table>
        <thead>
          <tr>
            <th>Identificacion</th>
            <th>Cliente</th>
            <th class="text-right">Facturas</th>
            <th class="text-right">Deuda USD</th>
            <th class="text-right">Deuda Bs</th>
            <th class="text-right">Limite</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="totals-row">
            <td colspan="2">TOTALES (${clientes.length} clientes)</td>
            <td class="text-right">${totalFacturas}</td>
            <td class="text-right value-red">${formatUsd(totalDeuda)}</td>
            <td class="text-right">${tasaValor > 0 ? formatBs(usdToBs(totalDeuda, tasaValor)) : '-'}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div class="report-footer">Reporte generado por ClaraPOS</div>
    `
    openPrintWindow('CXC - Resumen', html)
  }

  async function generarDetallado() {
    setMenuOpen(false)
    setGenerating(true)
    try {
      const clienteIds = clientes.map(c => c.id)
      const facturasMap = new Map<string, Array<{ id: string; nro_factura: string; fecha: string; total_usd: string; saldo_pend_usd: string }>>()

      for (const cid of clienteIds) {
        const rows = await db.getAll<{ id: string; nro_factura: string; fecha: string; total_usd: string; saldo_pend_usd: string }>(
          `SELECT id, nro_factura, fecha, total_usd, saldo_pend_usd FROM ventas
           WHERE cliente_id = ? AND CAST(saldo_pend_usd AS REAL) > 0.01
           ORDER BY fecha ASC`,
          [cid]
        )
        facturasMap.set(cid, rows)
      }

      let bodyHtml = ''
      for (const c of clientes) {
        const facturas = facturasMap.get(c.id) ?? []
        const saldo = parseFloat(c.saldo_actual)
        const facturaRows = facturas.map(f => {
          const totalUsd = parseFloat(f.total_usd)
          const saldoPend = parseFloat(f.saldo_pend_usd)
          const abonado = totalUsd - saldoPend
          return `
            <tr class="factura-row">
              <td class="font-mono">#${f.nro_factura}</td>
              <td>${formatDate(f.fecha)}</td>
              <td class="text-right">${formatUsd(totalUsd)}</td>
              <td class="text-right ${abonado > 0 ? 'value-green' : ''}">${formatUsd(abonado)}</td>
              <td class="text-right value-red font-bold">${formatUsd(saldoPend)}</td>
            </tr>
          `
        }).join('')

        bodyHtml += `
          <div class="cliente-header">${c.nombre} <span class="font-mono" style="font-size:9px;color:#888">(${c.identificacion})</span> — Deuda: ${formatUsd(saldo)}</div>
          ${facturas.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Fecha</th>
                <th class="text-right">Total</th>
                <th class="text-right">Abonado</th>
                <th class="text-right">Pendiente</th>
              </tr>
            </thead>
            <tbody>${facturaRows}</tbody>
          </table>
          ` : '<p style="font-size:9px;color:#888;font-style:italic;margin-bottom:8px">Sin facturas activas</p>'}
        `
      }

      const html = `
        ${buildResumenHeader('Detallado con Facturas')}
        ${bodyHtml}
        <div class="report-footer">Reporte generado por ClaraPOS</div>
      `
      openPrintWindow('CXC - Detallado con Facturas', html)
    } finally {
      setGenerating(false)
    }
  }

  async function generarDetalladoArticulos() {
    setMenuOpen(false)
    setGenerating(true)
    try {
      const clienteIds = clientes.map(c => c.id)

      type FacturaRow = { id: string; nro_factura: string; fecha: string; total_usd: string; saldo_pend_usd: string }
      type ArticuloRow = { venta_id: string; producto_codigo: string; producto_nombre: string; cantidad: string; precio_unitario_usd: string; subtotal_usd: string }

      const facturasMap = new Map<string, FacturaRow[]>()
      const articulosMap = new Map<string, ArticuloRow[]>()

      for (const cid of clienteIds) {
        const facturas = await db.getAll<FacturaRow>(
          `SELECT id, nro_factura, fecha, total_usd, saldo_pend_usd FROM ventas
           WHERE cliente_id = ? AND CAST(saldo_pend_usd AS REAL) > 0.01
           ORDER BY fecha ASC`,
          [cid]
        )
        facturasMap.set(cid, facturas)

        for (const f of facturas) {
          const arts = await db.getAll<ArticuloRow>(
            `SELECT vd.venta_id, p.codigo as producto_codigo, p.nombre as producto_nombre,
               vd.cantidad, vd.precio_unitario_usd, vd.subtotal_usd
             FROM ventas_det vd
             JOIN productos p ON vd.producto_id = p.id
             WHERE vd.venta_id = ?`,
            [f.id]
          )
          articulosMap.set(f.id, arts)
        }
      }

      let bodyHtml = ''
      for (const c of clientes) {
        const facturas = facturasMap.get(c.id) ?? []
        const saldo = parseFloat(c.saldo_actual)

        let facturasHtml = ''
        for (const f of facturas) {
          const totalUsd = parseFloat(f.total_usd)
          const saldoPend = parseFloat(f.saldo_pend_usd)
          const articulos = articulosMap.get(f.id) ?? []

          const artRows = articulos.map(a => `
            <tr class="art-row">
              <td class="font-mono">${a.producto_codigo}</td>
              <td>${a.producto_nombre}</td>
              <td class="text-right">${parseFloat(a.cantidad).toFixed(2)}</td>
              <td class="text-right">${formatUsd(parseFloat(a.precio_unitario_usd))}</td>
              <td class="text-right">${formatUsd(parseFloat(a.subtotal_usd))}</td>
            </tr>
          `).join('')

          facturasHtml += `
            <tr class="factura-row">
              <td class="font-mono font-bold">#${f.nro_factura}</td>
              <td>${formatDate(f.fecha)}</td>
              <td class="text-right">${formatUsd(totalUsd)}</td>
              <td class="text-right value-red font-bold">${formatUsd(saldoPend)}</td>
            </tr>
            ${articulos.length > 0 ? `
            <tr style="background:#f9fafb">
              <th style="font-size:8px;color:#888;padding:2px 6px 2px 24px">Codigo</th>
              <th style="font-size:8px;color:#888;padding:2px 6px">Producto</th>
              <th style="font-size:8px;color:#888;text-align:right;padding:2px 6px">Cant</th>
              <th style="font-size:8px;color:#888;text-align:right;padding:2px 6px">P.Unit</th>
              <th style="font-size:8px;color:#888;text-align:right;padding:2px 6px">Subtotal</th>
            </tr>
            ${artRows}
            ` : ''}
          `
        }

        bodyHtml += `
          <div class="cliente-header">${c.nombre} <span class="font-mono" style="font-size:9px;color:#888">(${c.identificacion})</span> — Deuda: ${formatUsd(saldo)}</div>
          ${facturas.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Fecha</th>
                <th class="text-right">Total</th>
                <th class="text-right">Pendiente</th>
              </tr>
            </thead>
            <tbody>${facturasHtml}</tbody>
          </table>
          ` : '<p style="font-size:9px;color:#888;font-style:italic;margin-bottom:8px">Sin facturas activas</p>'}
        `
      }

      const html = `
        ${buildResumenHeader('Detallado con Articulos')}
        ${bodyHtml}
        <div class="report-footer">Reporte generado por ClaraPOS</div>
      `
      openPrintWindow('CXC - Detallado con Articulos', html)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={generating || clientes.length === 0}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        {generating ? (
          <CircleNotch className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        Reportes
        <CaretDown className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 mt-1 w-72 z-20 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            <button
              onClick={generarResumen}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
            >
              <div className="text-sm font-medium text-foreground">Resumen por cliente</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Solo totales: cliente, facturas pendientes, deuda USD y Bs
              </div>
            </button>
            <button
              onClick={generarDetallado}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
            >
              <div className="text-sm font-medium text-foreground">Detallado con facturas</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Por cliente: lista de facturas con nro, fecha, total, pendiente
              </div>
            </button>
            <button
              onClick={generarDetalladoArticulos}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors"
            >
              <div className="text-sm font-medium text-foreground">Detallado con articulos</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Nivel adicional: articulos vendidos debajo de cada factura
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
