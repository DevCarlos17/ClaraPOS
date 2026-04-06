import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, FileText, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import {
  useDepartamentos,
  tieneProductosConExistencia,
  actualizarDepartamento,
  type Departamento,
  type DepartamentoConConteo,
} from '@/features/inventario/hooks/use-departamentos'
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
          cmp = a.activo - b.activo
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

  function handleEditar(e: React.MouseEvent, departamento: Departamento) {
    e.stopPropagation()
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

  async function handleToggleActivo(e: React.MouseEvent, departamento: DepartamentoConConteo) {
    e.stopPropagation()
    const nuevoEstado = departamento.activo !== 1

    setTogglingId(departamento.id)
    try {
      if (!nuevoEstado) {
        const conExistencia = await tieneProductosConExistencia(departamento.id)
        if (conExistencia) {
          toast.error('No se puede desactivar: tiene productos con existencia actual')
          return
        }
        await actualizarDepartamento(departamento.id, { activo: false })
        toast.success('Departamento desactivado')
      } else {
        await actualizarDepartamento(departamento.id, { activo: true })
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
      return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-gray-700" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-gray-700" />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end gap-2 mb-4">
          <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end items-center gap-2 mb-4">
        <button
          onClick={() => setReporteOpen(true)}
          disabled={departamentos.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText className="h-4 w-4" />
          Generar Reporte
        </button>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo Departamento
        </button>
      </div>

      {sortedDepartamentos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay departamentos registrados</p>
          <p className="text-sm mt-1">Crea el primer departamento para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  <button
                    onClick={() => handleSort('codigo')}
                    className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                  >
                    Codigo
                    {renderSortIcon('codigo')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  <button
                    onClick={() => handleSort('nombre')}
                    className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                  >
                    Nombre
                    {renderSortIcon('nombre')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  <button
                    onClick={() => handleSort('articulos')}
                    className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                  >
                    Articulos Activos
                    {renderSortIcon('articulos')}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  <button
                    onClick={() => handleSort('estado')}
                    className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                  >
                    Estado
                    {renderSortIcon('estado')}
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedDepartamentos.map((dep) => (
                <tr
                  key={dep.id}
                  onClick={() => handleRowClick(dep)}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-gray-900">{dep.codigo}</td>
                  <td className="px-4 py-3 text-gray-900">{dep.nombre}</td>
                  <td className="px-4 py-3 text-gray-900 tabular-nums">
                    {dep.articulos_activos}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => handleToggleActivo(e, dep)}
                      disabled={togglingId === dep.id}
                      className="disabled:opacity-50"
                    >
                      {dep.activo === 1 ? (
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
                      onClick={(e) => handleEditar(e, dep)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
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
