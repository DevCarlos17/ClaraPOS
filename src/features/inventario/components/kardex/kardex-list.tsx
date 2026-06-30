import { useState, useMemo, useEffect } from 'react'
import { Plus, MagnifyingGlass, Printer } from '@phosphor-icons/react'
import { useMovimientosFiltrados } from '@/features/inventario/hooks/use-kardex'
import { useDepartamentos } from '@/features/inventario/hooks/use-departamentos'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { formatDateTime } from '@/lib/format'
import { startOfMonth, todayStr } from '@/lib/dates'
import { MovimientoForm } from './movimiento-form'
import { KardexProductoBuscador } from './kardex-producto-buscador'

export function KardexList() {
  const { departamentos } = useDepartamentos()
  const { company } = useCompany()

  // Filtros en edicion (draft)
  const [fechaDesde, setFechaDesde] = useState(() => startOfMonth())
  const [fechaHasta, setFechaHasta] = useState(() => todayStr())
  const [busqueda, setBusqueda] = useState('')
  const [filtroDepto, setFiltroDepto] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'E' | 'S' | ''>('')
  const [filtroTipoSalida, setFiltroTipoSalida] = useState('')

  // Filtros aplicados (se fijan al presionar Consultar)
  const [aplicado, setAplicado] = useState(true)
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    desde: startOfMonth(),
    hasta: todayStr(),
    busqueda: '',
    depto: '',
    tipo: '' as 'E' | 'S' | '',
    tipoSalida: '',
  })

  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    if (filtroTipo === 'E') setFiltroTipoSalida('')
  }, [filtroTipo])

  const { movimientos, isLoading } = useMovimientosFiltrados(
    filtrosAplicados.desde,
    filtrosAplicados.hasta
  )

  const movimientosFiltrados = useMemo(() => {
    if (!aplicado) return []
    return movimientos.filter((m) => {
      if (filtrosAplicados.tipo && m.tipo !== filtrosAplicados.tipo) return false
      if (filtrosAplicados.tipoSalida) {
        if (filtrosAplicados.tipoSalida === 'FACTURACION') {
          if (m.origen !== 'VEN') return false
        } else {
          if (m.tipo_salida !== filtrosAplicados.tipoSalida) return false
        }
      }
      if (filtrosAplicados.depto && m.departamento_id !== filtrosAplicados.depto) return false
      if (filtrosAplicados.busqueda && filtrosAplicados.busqueda !== '*') {
        const b = filtrosAplicados.busqueda.toLowerCase()
        const matchNombre = m.prod_nombre?.toLowerCase().includes(b)
        const matchCodigo = m.prod_codigo?.toLowerCase().includes(b)
        if (!matchNombre && !matchCodigo) return false
      }
      return true
    })
  }, [movimientos, aplicado, filtrosAplicados])

  function handleConsultar() {
    setFiltrosAplicados({
      desde: fechaDesde,
      hasta: fechaHasta,
      busqueda,
      depto: filtroDepto,
      tipo: filtroTipo,
      tipoSalida: filtroTipoSalida,
    })
    setAplicado(true)
  }

  function origenLabel(origen: string): string {
    switch (origen) {
      case 'MAN': return 'Manual'
      case 'VEN': return 'Venta'
      case 'ANU': return 'Anulacion'
      case 'COM': return 'Compra'
      case 'AJU': return 'Ajuste'
      default: return origen
    }
  }

  function tipoSalidaBadge(tipoSalida: string | null) {
    if (!tipoSalida) return null
    const map: Record<string, { label: string; className: string }> = {
      MERMA:           { label: 'Merma',          className: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
      EXTRAVIO:        { label: 'Extravío',        className: 'bg-red-50 text-red-700 ring-red-600/20' },
      CONSUMO_INTERNO: { label: 'Consumo Interno', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    }
    const cfg = map[tipoSalida]
    if (!cfg) return <span className="text-xs text-muted-foreground">{tipoSalida}</span>
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.className}`}>
        {cfg.label}
      </span>
    )
  }

  function handlePrint() {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return

    const tipoLabel = filtrosAplicados.tipo === 'E' ? 'Entradas' : filtrosAplicados.tipo === 'S' ? 'Salidas' : 'Todos'
    const causaLabel = filtrosAplicados.tipoSalida
      ? ({ MERMA: 'Merma', EXTRAVIO: 'Extravío', CONSUMO_INTERNO: 'Consumo Interno', FACTURACION: 'Facturación' } as Record<string, string>)[filtrosAplicados.tipoSalida] ?? filtrosAplicados.tipoSalida
      : 'Todas'
    const deptoNombre = filtrosAplicados.depto
      ? (departamentos.find((d) => d.id === filtrosAplicados.depto)?.nombre ?? filtrosAplicados.depto)
      : 'Todos'

    const rows = movimientosFiltrados.map((mov) => `
      <tr>
        <td>${mov.fecha}</td>
        <td>${mov.prod_codigo ?? ''} ${mov.prod_nombre ?? mov.producto_id}</td>
        <td>${mov.tipo === 'E' ? 'ENTRADA' : 'SALIDA'}</td>
        <td>${origenLabel(mov.origen)}</td>
        <td>${mov.tipo_salida ? (({ MERMA: 'Merma', EXTRAVIO: 'Extravío', CONSUMO_INTERNO: 'Consumo Interno' } as Record<string, string>)[mov.tipo_salida] ?? mov.tipo_salida) : (mov.origen === 'VEN' ? 'Facturación' : '—')}</td>
        <td style="text-align:right">${parseFloat(mov.cantidad).toFixed(3)}</td>
        <td style="text-align:right">${parseFloat(mov.stock_anterior).toFixed(3)} → ${parseFloat(mov.stock_nuevo).toFixed(3)}</td>
        <td>${mov.motivo ?? '—'}</td>
      </tr>
    `).join('')

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Kardex de Movimientos</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
        h2 { margin-bottom: 4px; }
        .filtros { font-size: 11px; color: #666; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; font-size: 11px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f9fafb; }
        @media print { button { display: none; } }
      </style>
    </head><body>
      ${company?.nombre ? `<h3 style="margin:0 0 2px 0;font-size:14px">${company.nombre}</h3>` : ''}
      <h2 style="margin:0 0 8px 0">Kardex de Movimientos</h2>
      <div class="filtros">
        Período: ${filtrosAplicados.desde} al ${filtrosAplicados.hasta} |
        Tipo: ${tipoLabel} |
        Causa: ${causaLabel} |
        Departamento: ${deptoNombre} |
        ${filtrosAplicados.busqueda && filtrosAplicados.busqueda !== '*' ? `Producto: ${filtrosAplicados.busqueda} |` : ''}
        Total: ${movimientosFiltrados.length} movimiento(s) |
        Generado: ${new Date().toLocaleString('es-VE')}
      </div>
      <table>
        <thead><tr>
          <th>Fecha</th><th>Producto</th><th>Tipo</th><th>Origen</th>
          <th>Causa</th><th style="text-align:right">Cantidad</th>
          <th style="text-align:right">Stock</th><th>Motivo</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.print(); window.onafterprint = () => window.close();</script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="rounded-2xl bg-card shadow-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Producto / Codigo <span className="text-muted-foreground">(* para todos)</span>
            </label>
            <KardexProductoBuscador
              value={busqueda}
              onChange={setBusqueda}
              onKeyDown={(e) => e.key === 'Enter' && handleConsultar()}
              placeholder="Buscar o *"
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Departamento</label>
            <select
              value={filtroDepto}
              onChange={(e) => setFiltroDepto(e.target.value)}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los departamentos</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Tipo:</label>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as 'E' | 'S' | '')}
                className="rounded-md border border-input px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos</option>
                <option value="E">Entradas</option>
                <option value="S">Salidas</option>
              </select>
            </div>
            {filtroTipo !== 'E' && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Causa:</label>
                <select
                  value={filtroTipoSalida}
                  onChange={(e) => setFiltroTipoSalida(e.target.value)}
                  className="rounded-md border border-input px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  <option value="MERMA">Merma</option>
                  <option value="EXTRAVIO">Extravío</option>
                  <option value="CONSUMO_INTERNO">Consumo Interno</option>
                  <option value="FACTURACION">Facturación</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Nuevo Movimiento
            </button>
            <button
              onClick={handlePrint}
              disabled={!aplicado || movimientosFiltrados.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              onClick={handleConsultar}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <MagnifyingGlass className="h-4 w-4" />
              Consultar
            </button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      {!aplicado ? (
        <div className="text-center py-16 text-muted-foreground">
          <MagnifyingGlass className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium text-muted-foreground">Seleccione el rango de fechas y presione Consultar</p>
          <p className="text-sm mt-1">Puede buscar por nombre o codigo de producto. Use * para ver todos.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : movimientosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay movimientos en el periodo seleccionado</p>
          <p className="text-sm mt-1">Ajuste los filtros y vuelva a consultar</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card shadow-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">
            {movimientosFiltrados.length} movimiento(s) encontrado(s)
            {filtrosAplicados.busqueda && filtrosAplicados.busqueda !== '*'
              ? ` para "${filtrosAplicados.busqueda}"`
              : ''}
          </p>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Origen</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Causa</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map((mov) => (
                  <tr key={mov.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(mov.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground mr-1">{mov.prod_codigo}</span>
                      {mov.prod_nombre ?? mov.producto_id}
                    </td>
                    <td className="px-4 py-3">
                      {mov.tipo === 'E' ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                          ENTRADA
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                          SALIDA
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{origenLabel(mov.origen)}</td>
                    <td className="px-4 py-3">{tipoSalidaBadge(mov.tipo_salida) ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {parseFloat(mov.cantidad).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                      {parseFloat(mov.stock_anterior).toFixed(3)}
                      <span className="mx-1 text-muted-foreground">&rarr;</span>
                      {parseFloat(mov.stock_nuevo).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                      {mov.motivo ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <MovimientoForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
