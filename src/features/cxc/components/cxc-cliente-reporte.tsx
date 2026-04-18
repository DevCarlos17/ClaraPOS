import { useState } from 'react'
import { FileText, ChevronDown, Loader2 } from 'lucide-react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { formatDate, formatDateTime } from '@/lib/format'
import type { ClienteConDeuda, VentaPendiente } from '../hooks/use-cxc'

interface CxcClienteReporteProps {
  cliente: ClienteConDeuda
  facturas: VentaPendiente[]
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
  .cliente-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
    padding: 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
  }
  .cliente-info-item .label { font-size: 9px; text-transform: uppercase; color: #888; font-weight: 600; }
  .cliente-info-item .value { font-size: 11px; font-weight: 600; }
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
  .text-center { text-align: center; }
  .font-mono { font-family: 'Courier New', monospace; }
  .font-bold { font-weight: 700; }
  .font-medium { font-weight: 500; }
  .text-muted { color: #6b7280; }
  .value-red { color: #dc2626; }
  .totals-row td { font-weight: 700; background: #f9fafb; border-top: 2px solid #333; }
  .abono-row td { background: #fafbff; padding: 3px 6px 3px 20px; font-size: 9px; color: #555; border-bottom: 1px dashed #e5e7eb; }
  .section-title { font-size: 11px; font-weight: 700; margin: 14px 0 6px; color: #111; }
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

export function CxcClienteReporte({ cliente, facturas }: CxcClienteReporteProps) {
  const { user } = useCurrentUser()
  const { company } = useCompany()
  const { tasaValor } = useTasaActual()
  const [menuOpen, setMenuOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const usuario = user?.nombre ?? user?.email ?? 'Desconocido'
  const saldo = parseFloat(cliente.saldo_actual)
  const limite = parseFloat(cliente.limite_credito_usd)
  const now = formatDateTime(new Date().toISOString())

  function buildClienteInfo() {
    return `
      <div class="cliente-info">
        <div class="cliente-info-item">
          <div class="label">Cliente</div>
          <div class="value">${cliente.nombre}</div>
        </div>
        <div class="cliente-info-item">
          <div class="label">Identificacion</div>
          <div class="value font-mono">${cliente.identificacion}</div>
        </div>
        ${cliente.telefono ? `
        <div class="cliente-info-item">
          <div class="label">Telefono</div>
          <div class="value">${cliente.telefono}</div>
        </div>
        ` : ''}
        <div class="cliente-info-item">
          <div class="label">Limite credito</div>
          <div class="value">${limite > 0 ? formatUsd(limite) : 'Sin credito'}</div>
        </div>
      </div>
    `
  }

  function buildResumenDeuda() {
    return `
      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">Facturas pendientes</div>
          <div class="value">${facturas.length}</div>
        </div>
        <div class="summary-card">
          <div class="label">Deuda total USD</div>
          <div class="value value-red">${formatUsd(saldo)}</div>
          ${tasaValor > 0 ? `<div class="value-sm">${formatBs(usdToBs(saldo, tasaValor))}</div>` : ''}
        </div>
        ${limite > 0 ? `
        <div class="summary-card">
          <div class="label">Credito disponible</div>
          <div class="value ${saldo > limite ? 'value-red' : 'value-green'}">${formatUsd(Math.max(0, limite - saldo))}</div>
        </div>
        ` : ''}
      </div>
    `
  }

  async function generarFacturasPendientes() {
    setMenuOpen(false)
    setGenerating(true)
    try {
      // Fetch pagos for each factura
      const facturaIds = facturas.map(f => f.id)
      const pagosMap = new Map<string, Array<{ metodo_nombre: string; moneda_label: string; monto: string; monto_usd: string; referencia: string | null; fecha: string }>>()

      for (const fid of facturaIds) {
        const rows = await db.getAll<{ metodo_nombre: string; moneda_label: string; monto: string; monto_usd: string; referencia: string | null; fecha: string }>(
          `SELECT mc.nombre as metodo_nombre,
             CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE 'USD' END as moneda_label,
             pg.monto, pg.monto_usd, pg.referencia, pg.fecha
           FROM pagos pg
           JOIN metodos_cobro mc ON pg.metodo_cobro_id = mc.id
           LEFT JOIN monedas mon ON pg.moneda_id = mon.id
           WHERE pg.venta_id = ?
           ORDER BY pg.fecha ASC`,
          [fid]
        )
        pagosMap.set(fid, rows)
      }

      const rows = facturas.map(f => {
        const totalUsd = parseFloat(f.total_usd)
        const saldoPend = parseFloat(f.saldo_pend_usd)
        const abonado = totalUsd - saldoPend
        const pagos = pagosMap.get(f.id) ?? []

        const abonosHtml = pagos.length > 0
          ? pagos.map(p => {
              const montoOrig = parseFloat(p.monto)
              const montoUsd = parseFloat(p.monto_usd)
              return `
                <tr class="abono-row">
                  <td colspan="2">${formatDate(p.fecha)} - ${p.metodo_nombre} (${p.moneda_label})</td>
                  <td class="text-right">${p.moneda_label === 'BS' ? formatBs(montoOrig) : formatUsd(montoOrig)}</td>
                  <td class="text-right text-muted">${formatUsd(montoUsd)}</td>
                  <td>${p.referencia ?? '-'}</td>
                </tr>
              `
            }).join('')
          : `<tr class="abono-row"><td colspan="5" class="text-muted" style="font-style:italic">Sin abonos registrados</td></tr>`

        return `
          <tr>
            <td class="font-mono font-medium">#${f.nro_factura}</td>
            <td>${formatDate(f.fecha)}</td>
            <td class="text-right">${formatUsd(totalUsd)}</td>
            <td class="text-right ${abonado > 0 ? 'value-green' : ''}">${formatUsd(abonado)}</td>
            <td class="text-right value-red font-bold">${formatUsd(saldoPend)}</td>
          </tr>
          ${abonosHtml}
        `
      }).join('')

      const html = `
        ${buildEmpresaHeader({ nombre: company?.nombre, rif: company?.rif, direccion: company?.direccion })}
        <div class="report-header">
          <h1>ESTADO DE CUENTA - FACTURAS PENDIENTES</h1>
          <p>${cliente.nombre} (${cliente.identificacion})</p>
        </div>
        <div class="report-meta">
          <span>Generado: ${now}</span>
          <span>Usuario: ${usuario}</span>
        </div>
        ${buildClienteInfo()}
        ${buildResumenDeuda()}
        <div class="section-title">Detalle de Facturas Pendientes</div>
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
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="3">TOTALES (${facturas.length} factura${facturas.length !== 1 ? 's' : ''})</td>
              <td class="text-right">${formatUsd(facturas.reduce((s, f) => s + parseFloat(f.total_usd) - parseFloat(f.saldo_pend_usd), 0))}</td>
              <td class="text-right value-red">${formatUsd(saldo)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="report-footer">Reporte generado por ClaraPOS</div>
      `

      openPrintWindow(`Estado de cuenta - ${cliente.nombre}`, html)
    } finally {
      setGenerating(false)
    }
  }

  async function generarKardexCliente() {
    setMenuOpen(false)
    setGenerating(true)
    try {
      const movimientos = await db.getAll<{
        tipo: string
        referencia: string
        monto: string
        saldo_anterior: string
        saldo_nuevo: string
        observacion: string | null
        fecha: string
      }>(
        `SELECT tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, fecha
         FROM movimientos_cuenta
         WHERE cliente_id = ?
         ORDER BY fecha ASC`,
        [cliente.id]
      )

      const rows = movimientos.map(m => {
        const monto = parseFloat(m.monto)
        const tipo = m.tipo
        const esCredito = tipo === 'VTA' || tipo === 'NDR'
        return `
          <tr>
            <td class="text-xs text-muted">${formatDateTime(m.fecha)}</td>
            <td><span style="background:${esCredito ? '#fef3c7' : '#dcfce7'};color:${esCredito ? '#92400e' : '#166534'};padding:1px 5px;border-radius:3px;font-size:9px;font-weight:600">${tipo}</span></td>
            <td class="font-mono">${m.referencia}</td>
            <td>${m.observacion ?? '-'}</td>
            <td class="text-right ${esCredito ? 'value-red' : 'value-green'} font-medium">${esCredito ? '+' : '-'}${formatUsd(monto)}</td>
            <td class="text-right font-mono">${formatUsd(parseFloat(m.saldo_nuevo))}</td>
          </tr>
        `
      }).join('')

      const html = `
        ${buildEmpresaHeader({ nombre: company?.nombre, rif: company?.rif, direccion: company?.direccion })}
        <div class="report-header">
          <h1>KARDEX - MOVIMIENTOS DE CUENTA</h1>
          <p>${cliente.nombre} (${cliente.identificacion})</p>
        </div>
        <div class="report-meta">
          <span>Generado: ${now}</span>
          <span>Usuario: ${usuario}</span>
        </div>
        ${buildClienteInfo()}
        ${buildResumenDeuda()}
        <div class="section-title">Historial de Movimientos (${movimientos.length} registros)</div>
        ${movimientos.length === 0
          ? '<p style="text-align:center;color:#888;font-style:italic">Sin movimientos registrados</p>'
          : `
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Referencia</th>
                <th>Observacion</th>
                <th class="text-right">Monto</th>
                <th class="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="5">Saldo Actual</td>
                <td class="text-right value-red">${formatUsd(saldo)}</td>
              </tr>
            </tfoot>
          </table>
          `
        }
        <div class="report-footer">Reporte generado por ClaraPOS</div>
      `

      openPrintWindow(`Kardex - ${cliente.nombre}`, html)
    } finally {
      setGenerating(false)
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
        Imprimir
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 z-20 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            <button
              onClick={generarFacturasPendientes}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
            >
              <div className="text-sm font-medium text-foreground">Facturas pendientes</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Estado de cuenta con abonos por factura
              </div>
            </button>
            <button
              onClick={generarKardexCliente}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors"
            >
              <div className="text-sm font-medium text-foreground">Kardex del cliente</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Historial completo de movimientos de cuenta
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
