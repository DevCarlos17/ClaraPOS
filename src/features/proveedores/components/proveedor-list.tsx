import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple, ToggleLeft, ToggleRight } from '@phosphor-icons/react'
import {
  useProveedores,
  actualizarProveedor,
  type Proveedor,
} from '@/features/proveedores/hooks/use-proveedores'
import { formatUsd } from '@/lib/currency'
import { TableRowContextMenu, type ContextMenuAction } from '@/components/shared/table-row-context-menu'
import { ProveedorForm } from './proveedor-form'

export function ProveedorList() {
  const { proveedores, isLoading } = useProveedores()
  const [formOpen, setFormOpen] = useState(false)
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingProveedor(undefined)
    setFormOpen(true)
  }

  function handleEditar(proveedor: Proveedor) {
    setEditingProveedor(proveedor)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingProveedor(undefined)
  }

  async function handleToggleActivo(proveedor: Proveedor) {
    const nuevoEstado = proveedor.is_active !== 1
    setTogglingId(proveedor.id)
    try {
      await actualizarProveedor(proveedor.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Proveedor activado' : 'Proveedor desactivado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Proveedores</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nuevo Proveedor
        </button>
      </div>

      {proveedores.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay proveedores registrados</p>
          <p className="text-sm mt-1">Crea el primer proveedor para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">RIF</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Razon Social</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Telefono</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Correo</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">IVA</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">ISLR</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Credito</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((prov) => {
                const menuItems: ContextMenuAction[] = [
                  {
                    key: 'editar',
                    label: 'Editar',
                    icon: PencilSimple,
                    onClick: () => handleEditar(prov),
                  },
                  {
                    key: 'toggle',
                    label: prov.is_active === 1 ? 'Desactivar' : 'Activar',
                    icon: prov.is_active === 1 ? ToggleLeft : ToggleRight,
                    onClick: () => handleToggleActivo(prov),
                    separator: true,
                  },
                ]
                return (
                <TableRowContextMenu key={prov.id} items={menuItems}>
                <tr className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{prov.rif}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{prov.razon_social}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{prov.telefono || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{prov.email || '-'}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {prov.retiene_iva === 1 ? (
                      <span className="text-green-600 font-medium">Si</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {prov.retiene_islr === 1 ? (
                      <span className="text-green-600 font-medium">Si</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-foreground text-xs">
                      {prov.dias_credito > 0 ? `${prov.dias_credito}d` : '—'}
                    </span>
                    {parseFloat(prov.limite_credito_usd) > 0 && (
                      <span className="block text-muted-foreground text-xs">
                        {formatUsd(prov.limite_credito_usd)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(prov)}
                      disabled={togglingId === prov.id}
                      className="disabled:opacity-50 cursor-pointer"
                    >
                      {prov.is_active === 1 ? (
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
                      onClick={() => handleEditar(prov)}
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

      <ProveedorForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        proveedor={editingProveedor}
      />
    </div>
  )
}
