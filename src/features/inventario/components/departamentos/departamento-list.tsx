import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple, FileText, ArrowUp, ArrowDown, ArrowsDownUp, ListBullets, ToggleLeft, ToggleRight } from '@phosphor-icons/react'
import {
  useDepartamentos,
  tieneProductosConExistencia,
  actualizarDepartamento,
  type Departamento,
  type DepartamentoConConteo,
} from '@/features/inventario/hooks/use-departamentos'
import { TableRowContextMenu, type ContextMenuAction } from '@/components/shared/table-row-context-menu'
import { DepartamentoForm } from './departamento-form'
import { DepartamentoArticulosModal } from './departamento-articulos-modal'
import { DepartamentoReporte } from './departamento-reporte'

type SortKey = 'codigo' | 'nombre' | 'estado' | 'articulos'
type SortDir = 'asc' | 'desc'

export function DepartamentoList() {
  const { departamentos, isLoading } = useDepartamentos()
  const [formOpen, setFormOpen] = useState(false)
  const [editingDepartamento, setEditingDepartamento] = useState<Departamento | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [articulosModalOpen, setArticulosModalOpen] = useState(false)
  const [selectedDepartamento, setSelectedDepartamento] = useState<Departamento | null>(null)
  const [reporteOpen, setReporteOpen] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('codigo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sortedDepartamentos = useMemo(() => {
    const items = [...departamentos]
    items.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'codigo': {
          const na = parseInt(a.codigo, 10)
          const nb = parseInt(b.codigo, 10)
          const aValid = !isNaN(na)
          const bValid = !isNaN(nb)
          if (aValid && bValid) cmp = na - nb
          else if (aValid) cmp = -1
          else if (bValid) cmp = 1
          else cmp = a.codigo.localeCompare(b.codigo)
          break
        }
        case 'nombre':
          cmp = a.nombre.localeCompare(b.nombre)
          break
        case 'estado':
          cmp = a.is_active - b.is_active
          break
        case 'articulos':
          cmp = a.articulos_activos - b.articulos_activos
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return items
  }, [departamentos, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function handleNuevo() {
    setEditingDepartamento(undefined)
    setFormOpen(true)
  }

  function handleEditar(departamento: Departamento) {
    setEditingDepartamento(departamento)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingDepartamento(undefined)
  }

  function handleRowClick(departamento: Departamento) {
    setSelectedDepartamento(departamento)
    setArticulosModalOpen(true)
  }

  function handleCloseArticulosModal() {
    setArticulosModalOpen(false)
    setSelectedDepartamento(null)
  }

  async function handleToggleActivo(departamento: DepartamentoConConteo) {
    const nuevoEstado = departamento.is_active !== 1

    setTogglingId(departamento.id)
    try {
      if (!nuevoEstado) {
        const conExistencia = await tieneProductosConExistencia(departamento.id)
        if (conExistencia) {
          toast.error('No se puede desactivar: tiene productos con existencia actual')
          return
        }
        await actualizarDepartamento(departamento.id, { is_active: false })
        toast.success('Departamento desactivado')
      } else {
        await actualizarDepartamento(departamento.id, { is_active: true })
        toast.success('Departamento activado')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  function renderSortIcon(key: SortKey) {
    if (sortKey !== key) {
      return <ArrowsDownUp className="h-3.5 w-3.5 text-muted-foreground" />
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card shadow-md p-6">
        <div className="flex justify-end gap-2 mb-4">
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card shadow-md p-6">
      <div className="flex justify-end items-center gap-2 mb-4">
        <button
          onClick={() => setReporteOpen(true)}
          disabled={departamentos.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <FileText className="h-4 w-4" />
          Generar Reporte
        </button>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nuevo Departamento
        </button>
      </div>

      {sortedDepartamentos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay departamentos registrados</p>
          <p className="text-sm mt-1">Crea el primer departamento para comenzar</p>
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
                    onClick={() => handleSort('nombre')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Nombre
                    {renderSortIcon('nombre')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('articulos')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Articulos Activos
                    {renderSortIcon('articulos')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('estado')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Estado
                    {renderSortIcon('estado')}
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedDepartamentos.map((dep) => {
                const menuItems: ContextMenuAction[] = [
                  {
                    key: 'ver-productos',
                    label: 'Ver productos',
                    icon: ListBullets,
                    onClick: () => handleRowClick(dep),
                  },
                  {
                    key: 'editar',
                    label: 'Editar',
                    icon: PencilSimple,
                    onClick: () => handleEditar(dep),
                    separator: true,
                  },
                  {
                    key: 'toggle',
                    label: dep.is_active === 1 ? 'Desactivar' : 'Activar',
                    icon: dep.is_active === 1 ? ToggleLeft : ToggleRight,
                    onClick: () => handleToggleActivo(dep),
                  },
                ]
                return (
                <TableRowContextMenu key={dep.id} items={menuItems}>
                <tr
                  onClick={() => handleRowClick(dep)}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono">{dep.codigo}</td>
                  <td className="px-4 py-3">{dep.nombre}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {dep.articulos_activos}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleToggleActivo(dep) }}
                      disabled={togglingId === dep.id}
                      className="disabled:opacity-50 cursor-pointer"
                    >
                      {dep.is_active === 1 ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                          Inactivo
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditar(dep) }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <PencilSimple className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </td>
                </tr>
                </TableRowContextMenu>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <DepartamentoForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        departamento={editingDepartamento}
      />

      <DepartamentoArticulosModal
        isOpen={articulosModalOpen}
        onClose={handleCloseArticulosModal}
        departamento={selectedDepartamento}
      />

      <DepartamentoReporte
        isOpen={reporteOpen}
        onClose={() => setReporteOpen(false)}
        departamentos={sortedDepartamentos}
      />
    </div>
  )
}
