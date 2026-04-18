import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Printer, Package } from 'lucide-react'
import {
  useUnidades,
  actualizarUnidad,
  cargarUnidadesPrefabricadas,
  type Unidad,
} from '@/features/inventario/hooks/use-unidades'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { UnidadForm } from './unidad-form'

export function UnidadList() {
  const { unidades, isLoading } = useUnidades()
  const { user } = useCurrentUser()
  const [formOpen, setFormOpen] = useState(false)
  const [editingUnidad, setEditingUnidad] = useState<Unidad | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [cargandoPrefabricadas, setCargandoPrefabricadas] = useState(false)

  function handleNuevo() {
    setEditingUnidad(undefined)
    setFormOpen(true)
  }

  function handleEditar(unidad: Unidad) {
    setEditingUnidad(unidad)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingUnidad(undefined)
  }

  async function handleToggleActivo(unidad: Unidad) {
    const nuevoEstado = unidad.is_active !== 1
    setTogglingId(unidad.id)
    try {
      await actualizarUnidad(unidad.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Unidad activada' : 'Unidad desactivada')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleCargarPrefabricadas() {
    if (!user?.empresa_id) return
    setCargandoPrefabricadas(true)
    try {
      const insertadas = await cargarUnidadesPrefabricadas(user.empresa_id)
      if (insertadas === 0) {
        toast.info('Todas las unidades predeterminadas ya estan cargadas')
      } else {
        toast.success(`${insertadas} unidad(es) predeterminada(s) cargadas correctamente`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setCargandoPrefabricadas(false)
    }
  }

  function handleReporte() {
    const w = window.open('', '_blank')
    if (!w) return

    const filas = unidades
      .map((u) => `<tr>
        <td>${u.nombre}</td>
        <td style="font-family:monospace">${u.abreviatura}</td>
        <td style="text-align:center">${u.es_decimal === 1 ? 'Si' : 'No'}</td>
        <td style="text-align:center">${u.is_active === 1 ? 'Activo' : 'Inactivo'}</td>
      </tr>`)
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Unidades de Medida</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    p { margin: 2px 0 12px; color: #666; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Reporte de Unidades de Medida</h1>
  <p>Total: ${unidades.length} unidades &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-VE')}</p>
  <table>
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Abreviatura</th>
        <th style="text-align:center">Decimal</th>
        <th style="text-align:center">Estado</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
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
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Unidades de Medida</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleReporte}
            disabled={unidades.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Reporte
          </button>
          <button
            onClick={handleCargarPrefabricadas}
            disabled={cargandoPrefabricadas}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            <Package className="h-4 w-4" />
            {cargandoPrefabricadas ? 'Cargando...' : 'Cargar Predeterminadas'}
          </button>
          <button
            onClick={handleNuevo}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva Unidad
          </button>
        </div>
      </div>

      {unidades.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay unidades registradas</p>
          <p className="text-sm mt-1">
            Crea la primera unidad o usa{' '}
            <button
              onClick={handleCargarPrefabricadas}
              className="text-blue-600 hover:underline"
            >
              Cargar Predeterminadas
            </button>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Abreviatura</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Decimal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">{u.nombre}</td>
                  <td className="px-4 py-3 font-mono text-gray-900">{u.abreviatura}</td>
                  <td className="px-4 py-3">
                    {u.es_decimal === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        Si
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(u)}
                      disabled={togglingId === u.id}
                      className="disabled:opacity-50"
                    >
                      {u.is_active === 1 ? (
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
                      onClick={() => handleEditar(u)}
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

      <UnidadForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        unidad={editingUnidad}
      />
    </div>
  )
}
