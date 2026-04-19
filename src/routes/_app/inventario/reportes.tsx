import { useState } from 'react'
import { Printer } from 'lucide-react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { startOfMonth, todayStr } from '@/lib/dates'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import {
  useInventarioKpis,
  useValorPorDepto,
  useProductosStockCritico,
} from '@/features/reportes/hooks/use-inventario-reportes'
import { InventarioKpiCards } from '@/features/reportes/components/inventario-kpi-cards'
import { InventarioStockCritico } from '@/features/reportes/components/inventario-stock-critico'
import { DashboardTopRotacion } from '@/features/dashboard/components/dashboard-top-rotacion'
import { InventarioMovimientosModal } from '@/features/reportes/components/inventario-movimientos-modal'
import { InventarioValorModal } from '@/features/reportes/components/inventario-valor-modal'
import { InventarioRotacionModal } from '@/features/reportes/components/inventario-rotacion-modal'

export const Route = createFileRoute('/_app/inventario/reportes')({
  component: InventarioReportesPage,
})

function InventarioReportesPage() {
  const [fechaDesde, setFechaDesde] = useState(startOfMonth)
  const [fechaHasta, setFechaHasta] = useState(todayStr)

  const [valorOpen, setValorOpen] = useState(false)
  const [movimientosOpen, setMovimientosOpen] = useState(false)
  const [rotacionModal, setRotacionModal] = useState<'mayor' | 'menor' | null>(null)

  // Datos para PDF general
  const { valorTotalUsd, productosActivos, stockCritico, movimientosPeriodo } = useInventarioKpis(fechaDesde, fechaHasta)
  const { deptos } = useValorPorDepto()
  const { productos: stockCriticoItems } = useProductosStockCritico()
  const { tasaValor } = useTasaActual()

  function handleGenerarReporte() {
    const w = window.open('', '_blank')
    if (!w) return

    const totalBs = usdToBs(valorTotalUsd, tasaValor)

    const filasDepto = deptos
      .map((d) => {
        const total = deptos.reduce((s, x) => s + x.valorUsd, 0)
        const pct = total > 0 ? ((d.valorUsd / total) * 100).toFixed(1) : '0'
        return `<tr><td>${d.departamento}</td><td style="text-align:right">${formatUsd(d.valorUsd)}</td><td style="text-align:right">${pct}%</td></tr>`
      })
      .join('')

    const filasCritico = stockCriticoItems
      .map(
        (p) =>
          `<tr><td style="font-family:monospace">${p.codigo}</td><td>${p.nombre}</td><td>${p.departamento}</td>
          <td style="text-align:right">${p.stock.toFixed(3)}</td>
          <td style="text-align:right">${p.stockMinimo.toFixed(3)}</td>
          <td style="text-align:right;color:#dc2626">${p.deficit.toFixed(3)}</td></tr>`
      )
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Inventario</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 8px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
    .kpi-label { color: #6b7280; font-size: 10px; }
    .kpi-value { font-size: 18px; font-weight: 700; margin: 2px 0; }
    .kpi-sub { color: #9ca3af; font-size: 10px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tr:nth-child(even) td { background: #f9fafb; }
    .periodo { color: #6b7280; font-size: 11px; margin-bottom: 16px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Reporte de Inventario</h1>
  <p class="periodo">Periodo: ${fechaDesde} al ${fechaHasta} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-VE')}</p>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Valor Inventario</div>
      <div class="kpi-value">${formatUsd(valorTotalUsd)}</div>
      <div class="kpi-sub">${tasaValor > 0 ? formatBs(totalBs) : ''}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Productos Activos</div>
      <div class="kpi-value">${formatNumber(productosActivos, 0)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Stock Critico</div>
      <div class="kpi-value" style="color:#dc2626">${formatNumber(stockCritico, 0)}</div>
      <div class="kpi-sub">bajo minimo</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Movimientos</div>
      <div class="kpi-value">${formatNumber(movimientosPeriodo, 0)}</div>
      <div class="kpi-sub">en el periodo</div>
    </div>
  </div>

  ${deptos.length > 0 ? `
  <h2>Valoracion por Departamento</h2>
  <table>
    <thead><tr><th>Departamento</th><th style="text-align:right">Valor (USD)</th><th style="text-align:right">Participacion</th></tr></thead>
    <tbody>${filasDepto}</tbody>
    <tfoot><tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${formatUsd(deptos.reduce((s, d) => s + d.valorUsd, 0))}</strong></td><td></td></tr></tfoot>
  </table>` : ''}

  ${stockCriticoItems.length > 0 ? `
  <h2>Productos con Stock Critico (${stockCriticoItems.length})</h2>
  <table>
    <thead><tr><th>Codigo</th><th>Producto</th><th>Depto</th><th style="text-align:right">Stock</th><th style="text-align:right">Minimo</th><th style="text-align:right">Deficit</th></tr></thead>
    <tbody>${filasCritico}</tbody>
  </table>` : '<h2>Stock Critico</h2><p>Sin productos bajo minimo.</p>'}
</body>
</html>`)
    w.document.close()
    w.print()
  }

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Reportes de Inventario" descripcion="Valoracion, stock critico, rotacion y movimientos">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <label className="text-sm text-muted-foreground">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={handleGenerarReporte}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Generar Reporte
            </button>
          </div>
        </PageHeader>

        <InventarioKpiCards
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          onValorClick={() => setValorOpen(true)}
          onMovimientosClick={() => setMovimientosOpen(true)}
        />

        <InventarioStockCritico />

        <DashboardTopRotacion
          onMayorClick={() => setRotacionModal('mayor')}
          onMenorClick={() => setRotacionModal('menor')}
        />

        <InventarioMovimientosModal
          isOpen={movimientosOpen}
          onClose={() => setMovimientosOpen(false)}
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
        />

        <InventarioValorModal
          isOpen={valorOpen}
          onClose={() => setValorOpen(false)}
        />

        {rotacionModal && (
          <InventarioRotacionModal
            isOpen={rotacionModal !== null}
            onClose={() => setRotacionModal(null)}
            tipo={rotacionModal}
          />
        )}
      </div>
    </RequirePermission>
  )
}
