import { useState, useMemo } from 'react'
import {
  Plus,
  PencilSimple,
  Stack,
  CurrencyDollar,
  Warning,
  ArrowUp,
  ArrowDown,
  ArrowsDownUp,
  Download,
  Upload,
  FileXls,
  ToggleLeft,
  ToggleRight,
} from '@phosphor-icons/react'
import {
  useProductos,
  useResumenInventario,
  actualizarProducto,
  type Producto,
} from '@/features/inventario/hooks/use-productos'
import { useDepartamentos } from '@/features/inventario/hooks/use-departamentos'
import { useTodasLasRecetas } from '@/features/inventario/hooks/use-recetas'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { PrecioDisplay } from './precio-display'
import { ProductoForm } from './producto-form'
import { StockCriticoModal } from './stock-critico-modal'
import { ValorInventarioModal } from './valor-inventario-modal'
import { ImportProductosModal } from './import-productos-modal'
import { ComboDetalleModal } from '@/features/inventario/components/recetas/combo-detalle-modal'
import {
  exportarProductosCsv,
  exportarProductosExcel,
} from '@/features/inventario/utils/productos-export'
import { toast } from 'sonner'
import { TableRowContextMenu, type ContextMenuAction } from '@/components/shared/table-row-context-menu'

type SortKey =
  | 'codigo'
  | 'tipo'
  | 'nombre'
  | 'departamento'
  | 'costo'
  | 'venta'
  | 'stock'
type SortDir = 'asc' | 'desc'

export function ProductoList() {
  const { productos, isLoading } = useProductos()
  const { departamentos } = useDepartamentos()
  const { tasaValor } = useTasaActual()
  const { valorTotal, stockCritico } = useResumenInventario()
  const { recetas } = useTodasLasRecetas()

  const productosMap = useMemo(() => {
    const map = new Map<string, Producto>()
    for (const p of productos) map.set(p.id, p)
    return map
  }, [productos])

  const [formOpen, setFormOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | undefined>(undefined)
  const [comboDetalle, setComboDetalle] = useState<Producto | null>(null)
  const [stockCriticoOpen, setStockCriticoOpen] = useState(false)
  const [valorInventarioOpen, setValorInventarioOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  // Filtros
  const [filtroDepartamento, setFiltroDepartamento] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'P' | 'S' | 'C' | ''>('')
  const [filtroActivo, setFiltroActivo] = useState(true)

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('nombre')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const departamentoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const dep of departamentos) {
      map.set(dep.id, dep.nombre)
    }
    return map
  }, [departamentos])

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (filtroActivo && p.is_active !== 1) return false
      if (!filtroActivo && p.is_active === 1) return false
      if (filtroDepartamento && p.departamento_id !== filtroDepartamento) return false
      if (filtroTipo && p.tipo !== filtroTipo) return false
      return true
    })
  }, [productos, filtroDepartamento, filtroTipo, filtroActivo])

  const productosOrdenados = useMemo(() => {
    const items = [...productosFiltrados]
    items.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'codigo':
          cmp = a.codigo.localeCompare(b.codigo)
          break
        case 'tipo':
          cmp = a.tipo.localeCompare(b.tipo)
          break
        case 'nombre':
          cmp = a.nombre.localeCompare(b.nombre)
          break
        case 'departamento': {
          const na = departamentoMap.get(a.departamento_id) ?? ''
          const nb = departamentoMap.get(b.departamento_id) ?? ''
          cmp = na.localeCompare(nb)
          break
        }
        case 'costo':
          cmp = parseFloat(a.costo_usd) - parseFloat(b.costo_usd)
          break
        case 'venta':
          cmp = parseFloat(a.precio_venta_usd) - parseFloat(b.precio_venta_usd)
          break
        case 'stock':
          cmp = parseFloat(a.stock) - parseFloat(b.stock)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return items
  }, [productosFiltrados, sortKey, sortDir, departamentoMap])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function renderSortIcon(key: SortKey) {
    if (sortKey !== key) {
      return <ArrowsDownUp className="h-3.5 w-3.5 text-muted-foreground" />
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" />
    )
  }

  function handleNuevo() {
    setEditingProducto(undefined)
    setFormOpen(true)
  }

  function handleEditar(producto: Producto) {
    setEditingProducto(producto)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingProducto(undefined)
  }

  async function handleToggleActivo(producto: Producto) {
    const nuevoEstado = producto.is_active !== 1
    try {
      await actualizarProducto(producto.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Producto activado' : 'Producto desactivado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    }
  }

  function handleExportCsv() {
    if (productos.length === 0) {
      toast.error('No hay productos para exportar')
      return
    }
    exportarProductosCsv(productos, departamentos, recetas, productosMap)
    toast.success('Inventario exportado a CSV')
    setExportMenuOpen(false)
  }

  function handleExportExcel() {
    if (productos.length === 0) {
      toast.error('No hay productos para exportar')
      return
    }
    exportarProductosExcel(productos, departamentos, recetas, productosMap)
    toast.success('Inventario exportado a Excel')
    setExportMenuOpen(false)
  }

  function isStockBajo(producto: Producto): boolean {
    if (producto.tipo === 'S' || producto.tipo === 'C') return false
    const stock = parseFloat(producto.stock)
    const minimo = parseFloat(producto.stock_minimo)
    return minimo > 0 && stock < minimo
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-muted rounded-lg animate-pulse" />
          <div className="h-24 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-full bg-muted rounded animate-pulse" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Tarjetas resumen (clickeables) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <button
          type="button"
          onClick={() => setValorInventarioOpen(true)}
          className="bg-card border border-border rounded-2xl shadow-sm p-4 flex items-center gap-3 text-left hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <CurrencyDollar className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Valor Total Inventario</p>
            <p className="text-lg font-semibold text-foreground">{formatUsd(valorTotal)}</p>
            {tasaValor > 0 && (
              <p className="text-xs text-muted-foreground">{formatBs(usdToBs(valorTotal, tasaValor))}</p>
            )}
          </div>
          <span className="text-xs text-blue-600 font-medium">Ver detalle</span>
        </button>

        <button
          type="button"
          onClick={() => setStockCriticoOpen(true)}
          className="bg-card border border-border rounded-2xl shadow-sm p-4 flex items-center gap-3 text-left hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
        >
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
            stockCritico > 0 ? 'bg-red-100' : 'bg-muted'
          }`}>
            <Warning className={`h-5 w-5 ${stockCritico > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Stock Critico</p>
            <p className={`text-lg font-semibold ${stockCritico > 0 ? 'text-red-600' : 'text-foreground'}`}>
              {stockCritico} {stockCritico === 1 ? 'producto' : 'productos'}
            </p>
          </div>
          <span className="text-xs text-blue-600 font-medium">Ver reporte</span>
        </button>
      </div>

      {/* Barra de filtros y acciones */}
      <div className="rounded-2xl bg-card shadow-lg p-4 mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={filtroDepartamento}
            onChange={(e) => setFiltroDepartamento(e.target.value)}
            className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos los departamentos</option>
            {departamentos.map((dep) => (
              <option key={dep.id} value={dep.id}>
                {dep.nombre}
              </option>
            ))}
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as 'P' | 'S' | 'C' | '')}
            className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos los tipos</option>
            <option value="P">Productos</option>
            <option value="S">Servicios</option>
            <option value="C">Combos / Recetas</option>
          </select>

          <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={filtroActivo}
              onChange={(e) => setFiltroActivo(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            Solo activos
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Importar
          </button>

          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-md shadow-lg z-20 py-1">
                  <button
                    onClick={handleExportCsv}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 cursor-pointer"
                  >
                    <FileXls className="h-4 w-4 text-green-600" />
                    CSV
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 cursor-pointer"
                  >
                    <FileXls className="h-4 w-4 text-green-700" />
                    Excel (.xlsx)
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleNuevo}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </button>
        </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl bg-card shadow-lg p-4">
        {productosOrdenados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No se encontraron productos</p>
          <p className="text-sm mt-1">Ajusta los filtros o crea un nuevo producto</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('codigo')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Codigo
                    {renderSortIcon('codigo')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('tipo')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Tipo
                    {renderSortIcon('tipo')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('nombre')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Nombre
                    {renderSortIcon('nombre')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('departamento')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Departamento
                    {renderSortIcon('departamento')}
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('costo')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors ml-auto cursor-pointer"
                  >
                    Costo
                    {renderSortIcon('costo')}
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('venta')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors ml-auto cursor-pointer"
                  >
                    Precio Venta
                    {renderSortIcon('venta')}
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('stock')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors ml-auto cursor-pointer"
                  >
                    Stock
                    {renderSortIcon('stock')}
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosOrdenados.map((prod) => {
                const stockBajo = isStockBajo(prod)
                const menuItems: ContextMenuAction[] = [
                  {
                    key: 'editar',
                    label: 'Editar',
                    icon: PencilSimple,
                    onClick: () => handleEditar(prod),
                  },
                  {
                    key: 'componentes',
                    label: 'Ver componentes',
                    icon: Stack,
                    onClick: () => setComboDetalle(prod),
                    hidden: prod.tipo !== 'C',
                    separator: true,
                  },
                  {
                    key: 'toggle',
                    label: prod.is_active === 1 ? 'Desactivar' : 'Activar',
                    icon: prod.is_active === 1 ? ToggleLeft : ToggleRight,
                    onClick: () => handleToggleActivo(prod),
                    separator: true,
                  },
                ]
                return (
                  <TableRowContextMenu key={prod.id} items={menuItems}>
                  <tr className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-foreground">{prod.codigo}</td>
                    <td className="px-4 py-3">
                      {prod.tipo === 'P' ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                          Producto
                        </span>
                      ) : prod.tipo === 'S' ? (
                        <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-600/20 ring-inset">
                          Servicio
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                          Combo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{prod.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {departamentoMap.get(prod.departamento_id) ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PrecioDisplay usd={prod.costo_usd} tasa={tasaValor} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PrecioDisplay usd={prod.precio_venta_usd} tasa={tasaValor} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {prod.tipo === 'S' ? (
                        <span className="text-muted-foreground">N/A</span>
                      ) : prod.tipo === 'C' ? (
                        <span className="text-muted-foreground text-xs">Ver Combos</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={stockBajo ? 'text-red-600 font-medium' : 'text-foreground'}>
                            {parseFloat(prod.stock).toFixed(3)}
                          </span>
                          {stockBajo && (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/20 ring-inset">
                              BAJO
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {prod.tipo === 'C' && (
                          <button
                            onClick={() => setComboDetalle(prod)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors cursor-pointer"
                          >
                            <Stack className="h-3.5 w-3.5" />
                            Componentes
                          </button>
                        )}
                        <button
                          onClick={() => handleEditar(prod)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          <PencilSimple className="h-3.5 w-3.5" />
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                  </TableRowContextMenu>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>

      <ProductoForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        producto={editingProducto}
      />

      <StockCriticoModal
        isOpen={stockCriticoOpen}
        onClose={() => setStockCriticoOpen(false)}
        productos={productos}
        departamentos={departamentos}
      />

      <ValorInventarioModal
        isOpen={valorInventarioOpen}
        onClose={() => setValorInventarioOpen(false)}
        productos={productos}
        departamentos={departamentos}
      />

      <ImportProductosModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        productos={productos}
        departamentos={departamentos}
      />

      <ComboDetalleModal
        combo={comboDetalle}
        onClose={() => setComboDetalle(null)}
      />
    </div>
  )
}
