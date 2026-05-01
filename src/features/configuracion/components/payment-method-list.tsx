import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import {
  usePaymentMethods,
  updatePaymentMethod,
  type PaymentMethod,
} from '@/features/configuracion/hooks/use-payment-methods'
import { PaymentMethodForm } from './payment-method-form'

export function PaymentMethodList() {
  const { methods, isLoading } = usePaymentMethods()
  const [formOpen, setFormOpen] = useState(false)
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingMethod(undefined)
    setFormOpen(true)
  }

  function handleEditar(method: PaymentMethod) {
    setEditingMethod(method)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingMethod(undefined)
  }

  async function handleToggleActivo(method: PaymentMethod) {
    const nuevoEstado = method.is_active !== 1
    setTogglingId(method.id)
    try {
      await updatePaymentMethod(method.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Metodo de pago activado' : 'Metodo de pago desactivado')
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
        <h2 className="text-lg font-semibold text-foreground">Metodos de Pago</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nuevo Metodo de Pago
        </button>
      </div>

      {methods.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay metodos de pago registrados</p>
          <p className="text-sm mt-1">Crea el primer metodo de pago para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Moneda</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Banco</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-foreground font-medium">{m.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {m.tipo?.replace('_', ' ') ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    {m.moneda === 'USD' ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                        USD
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                        BS
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {m.banco_nombre ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(m)}
                      disabled={togglingId === m.id}
                      className="disabled:opacity-50 cursor-pointer"
                    >
                      {m.is_active === 1 ? (
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
                      onClick={() => handleEditar(m)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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

      <PaymentMethodForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        method={editingMethod}
      />
    </div>
  )
}
