import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { ajusteSchema } from '@/features/inventario/schemas/ajuste-schema'
import { crearAjuste } from '@/features/inventario/hooks/use-ajustes'
import { useAjusteMotivosActivos } from '@/features/inventario/hooks/use-ajuste-motivos'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface AjusteFormProps {
  isOpen: boolean
  onClose: () => void
}

interface LineaInput {
  producto_id: string
  deposito_id: string
  cantidad: string
  costo_unitario: string
}

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AjusteForm({ isOpen, onClose }: AjusteFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { motivos } = useAjusteMotivosActivos()
  const { productos } = useProductos()
  const { depositos } = useDepositosActivos()
  const { user } = useCurrentUser()

  const [motivoId, setMotivoId] = useState('')
  const [fecha, setFecha] = useState(getTodayIso())
  const [observaciones, setObservaciones] = useState('')
  const [lineas, setLineas] = useState<LineaInput[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lineasError, setLineasError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMotivoId('')
      setFecha(getTodayIso())
      setObservaciones('')
      setLineas([])
      setErrors({})
      setLineasError('')
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  function agregarLinea() {
    setLineas((prev) => [
      ...prev,
      { producto_id: '', deposito_id: '', cantidad: '', costo_unitario: '' },
    ])
  }

  function removerLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }

  function actualizarLinea(index: number, field: keyof LineaInput, value: string) {
    setLineas((prev) =>
      prev.map((linea, i) => (i === index ? { ...linea, [field]: value } : linea))
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    setLineasError('')

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    const lineasParsed = lineas.map((l) => ({
      producto_id: l.producto_id,
      deposito_id: l.deposito_id,
      cantidad: parseFloat(l.cantidad) || 0,
      costo_unitario:
        l.costo_unitario !== '' ? parseFloat(l.costo_unitario) : undefined,
    }))

    const parsed = ajusteSchema.safeParse({
      motivo_id: motivoId,
      fecha,
      observaciones: observaciones.trim() || undefined,
      lineas: lineasParsed,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      let hasLineaError = false

      for (const issue of parsed.error.issues) {
        const path = issue.path[0]?.toString()
        if (path === 'lineas') {
          hasLineaError = true
        } else if (path) {
          fieldErrors[path] = issue.message
        }
      }

      if (hasLineaError) {
        setLineasError('Revise que todas las lineas tengan producto, deposito y cantidad valida')
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      await crearAjuste({
        motivo_id: parsed.data.motivo_id,
        fecha: parsed.data.fecha,
        observaciones: parsed.data.observaciones,
        lineas: parsed.data.lineas,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })
      toast.success('Ajuste creado correctamente')
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Nuevo Ajuste de Inventario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Motivo */}
          <div>
            <label htmlFor="ajuste-motivo" className="block text-sm font-medium text-gray-700 mb-1">
              Motivo
            </label>
            <select
              id="ajuste-motivo"
              value={motivoId}
              onChange={(e) => setMotivoId(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.motivo_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">-- Seleccione un motivo --</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            {errors.motivo_id && (
              <p className="text-red-500 text-xs mt-1">{errors.motivo_id}</p>
            )}
          </div>

          {/* Fecha */}
          <div>
            <label htmlFor="ajuste-fecha" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha
            </label>
            <input
              id="ajuste-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.fecha ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.fecha && (
              <p className="text-red-500 text-xs mt-1">{errors.fecha}</p>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label htmlFor="ajuste-obs" className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones <span className="text-gray-400 font-normal">- Opcional</span>
            </label>
            <textarea
              id="ajuste-obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="Descripcion o comentarios adicionales"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Lineas de detalle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Lineas</label>
              <span className="text-xs text-gray-400">{lineas.length} linea(s)</span>
            </div>

            {lineas.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-x-auto mb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-3 py-2 font-medium text-gray-700 min-w-[140px]">Producto</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700 min-w-[130px]">Deposito</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700 w-24">Cantidad</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700 w-24">Costo</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((linea, index) => (
                      <tr key={index} className="border-b border-gray-100">
                        <td className="px-3 py-2">
                          <select
                            value={linea.producto_id}
                            onChange={(e) => actualizarLinea(index, 'producto_id', e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            <option value="">Seleccionar</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.codigo} - {p.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={linea.deposito_id}
                            onChange={(e) => actualizarLinea(index, 'deposito_id', e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            <option value="">Seleccionar</option>
                            {depositos.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={linea.cantidad}
                            onChange={(e) => actualizarLinea(index, 'cantidad', e.target.value)}
                            placeholder="0.000"
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={linea.costo_unitario}
                            onChange={(e) => actualizarLinea(index, 'costo_unitario', e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removerLinea(index)}
                            className="p-1 text-gray-400 rounded hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Eliminar linea"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              onClick={agregarLinea}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar Linea
            </button>

            {lineasError && (
              <p className="text-red-500 text-xs mt-2">{lineasError}</p>
            )}
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
