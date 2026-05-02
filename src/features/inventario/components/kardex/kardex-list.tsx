import { useState, useMemo } from 'react'
import { Plus, MagnifyingGlass } from '@phosphor-icons/react'
import { useMovimientosFiltrados } from '@/features/inventario/hooks/use-kardex'
import { useDepartamentos } from '@/features/inventario/hooks/use-departamentos'
import { formatDateTime } from '@/lib/format'
import { startOfMonth, todayStr } from '@/lib/dates'
import { MovimientoForm } from './movimiento-form'

export function KardexList() {
  const { departamentos } = useDepartamentos()

  // Filtros en edicion (draft)
  const [fechaDesde, setFechaDesde] = useState(() => startOfMonth())
  const [fechaHasta, setFechaHasta] = useState(() => todayStr())
  const [busqueda, setBusqueda] = useState('')
  const [filtroDepto, setFiltroDepto] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'E' | 'S' | ''>('')

  // Filtros aplicados (se fijan al presionar Consultar)
  const [aplicado, setAplicado] = useState(false)
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    desde: startOfMonth(),
    hasta: todayStr(),
    busqueda: '',
    depto: '',
    tipo: '' as 'E' | 'S' | '',
  })

  const [formOpen, setFormOpen] = useState(false)

  const { movimientos, isLoading } = useMovimientosFiltrados(
    filtrosAplicados.desde,
    filtrosAplicados.hasta
  )

  const movimientosFiltrados = useMemo(() => {
    if (!aplicado) return []
    return movimientos.filter((m) => {
      if (filtrosAplicados.tipo && m.tipo !== filtrosAplicados.tipo) return false
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
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar o *"
              onKeyDown={(e) => e.key === 'Enter' && handleConsultar()}
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

          <div className="flex gap-2">
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Nuevo Movimiento
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
