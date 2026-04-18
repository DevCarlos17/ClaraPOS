import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Printer } from 'lucide-react'
import {
  useDepositos,
  actualizarDeposito,
  type Deposito,
} from '@/features/inventario/hooks/use-depositos'
import { DepositoForm } from './deposito-form'

export function DepositoList() {
  const { depositos, isLoading } = useDepositos()
  const [formOpen, setFormOpen] = useState(false)
  const [editingDeposito, setEditingDeposito] = useState<Deposito | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingDeposito(undefined)
    setFormOpen(true)
  }

  function handleEditar(deposito: Deposito) {
    setEditingDeposito(deposito)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingDeposito(undefined)
  }

  async function handleToggleActivo(deposito: Deposito) {
    const nuevoEstado = deposito.is_active !== 1
    setTogglingId(deposito.id)
    try {
      await actualizarDeposito(deposito.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Deposito activado' : 'Deposito desactivado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  function handleReporte() {
    const w = window.open('', '_blank')
    if (!w) return

    const filas = depositos
      .map((d) => `<tr>
        <td>${d.nombre}</td>
        <td>${d.direccion ?? '—'}</td>
        <td style="text-align:center">${d.es_principal === 1 ? 'Si' : 'No'}</td>
        <td style="text-align:center">${d.permite_venta === 1 ? 'Si' : 'No'}</td>
        <td style="text-align:center">${d.is_active === 1 ? 'Activo' : 'Inactivo'}</td>
      </tr>`)
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Depositos</title>
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
  <h1>Reporte de Depositos</h1>
  <p>Total: ${depositos.length} depositos &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-VE')}</p>
  <table>
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Direccion</th>
        <th style="text-align:center">Principal</th>
        <th style="text-align:center">Permite Venta</th>
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
        <h2 className="text-lg font-semibold text-gray-900">Depositos</h2>
        <div className="flex gap-2">
          <button
            onClick={handleReporte}
            disabled={depositos.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Reporte
          </button>
          <button
            onClick={handleNuevo}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo Deposito
          </button>
        </div>
      </div>

      {depositos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay depositos registrados</p>
          <p className="text-sm mt-1">Crea el primer deposito para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Direccion</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Principal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Permite Venta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {depositos.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">{d.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{d.direccion ?? '—'}</td>
                  <td className="px-4 py-3">
                    {d.es_principal === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                        Principal
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.permite_venta === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        Permite Venta
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(d)}
                      disabled={togglingId === d.id}
                      className="disabled:opacity-50"
                    >
                      {d.is_active === 1 ? (
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
                      onClick={() => handleEditar(d)}
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

      <DepositoForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        deposito={editingDeposito}
      />
    </div>
  )
}
