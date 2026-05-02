import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple } from '@phosphor-icons/react'
import {
  useImpuestos,
  actualizarImpuesto,
  type Impuesto,
} from '@/features/configuracion/hooks/use-impuestos'
import { ImpuestoForm } from './impuesto-form'

export function ImpuestoList() {
  const { impuestos, isLoading } = useImpuestos()
  const [formOpen, setFormOpen] = useState(false)
  const [editingImpuesto, setEditingImpuesto] = useState<Impuesto | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingImpuesto(undefined)
    setFormOpen(true)
  }

  function handleEditar(impuesto: Impuesto) {
    setEditingImpuesto(impuesto)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingImpuesto(undefined)
  }

  async function handleToggleActivo(impuesto: Impuesto) {
    const nuevoEstado = impuesto.is_active !== 1
    setTogglingId(impuesto.id)
    try {
      await actualizarImpuesto(impuesto.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Impuesto activado' : 'Impuesto desactivado')
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
    <div className="rounded-2xl bg-card shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Impuestos</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nuevo Impuesto
        </button>
      </div>

      {impuestos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay impuestos registrados</p>
          <p className="text-sm mt-1">Crea el primer impuesto para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Porcentaje</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Codigo SENIAT</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {impuestos.map((imp) => (
                <tr key={imp.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-foreground">{imp.nombre}</td>
                  <td className="px-4 py-3">
                    {imp.tipo_tributo === 'IVA' ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                        IVA
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
                        IGTF
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground tabular-nums">
                    {imp.porcentaje}%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{imp.codigo_seniat ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(imp)}
                      disabled={togglingId === imp.id}
                      className="disabled:opacity-50 cursor-pointer"
                    >
                      {imp.is_active === 1 ? (
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
                      onClick={() => handleEditar(imp)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    >
                      <PencilSimple className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImpuestoForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        impuesto={editingImpuesto}
      />
    </div>
  )
}
