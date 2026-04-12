import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { loteSchema } from '@/features/inventario/schemas/lote-schema'
import { crearLote } from '@/features/inventario/hooks/use-lotes'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface LoteFormProps {
  isOpen: boolean
  onClose: () => void
  productoId: string
}

export function LoteForm({ isOpen, onClose, productoId }: LoteFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { depositos } = useDepositosActivos()
  const { user } = useCurrentUser()

  const [depositoId, setDepositoId] = useState('')
  const [nroLote, setNroLote] = useState('')
  const [fechaFabricacion, setFechaFabricacion] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [cantidadInicial, setCantidadInicial] = useState('')
  const [costoUnitario, setCostoUnitario] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setDepositoId('')
      setNroLote('')
      setFechaFabricacion('')
      setFechaVencimiento('')
      setCantidadInicial('')
      setCostoUnitario('')
      setErrors({})
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    const cantidadNum = parseFloat(cantidadInicial)
    const costoNum = costoUnitario !== '' ? parseFloat(costoUnitario) : undefined

    const parsed = loteSchema.safeParse({
      producto_id: productoId,
      deposito_id: depositoId,
      nro_lote: nroLote,
      fecha_fabricacion: fechaFabricacion || undefined,
      fecha_vencimiento: fechaVencimiento || undefined,
      cantidad_inicial: isNaN(cantidadNum) ? 0 : cantidadNum,
      costo_unitario: costoNum !== undefined && !isNaN(costoNum) ? costoNum : undefined,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      await crearLote({
        producto_id: productoId,
        deposito_id: parsed.data.deposito_id,
        nro_lote: parsed.data.nro_lote,
        fecha_fabricacion: parsed.data.fecha_fabricacion,
        fecha_vencimiento: parsed.data.fecha_vencimiento,
        cantidad_inicial: parsed.data.cantidad_inicial,
        costo_unitario: parsed.data.costo_unitario,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })
      toast.success('Lote creado correctamente')
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Nuevo Lote</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Deposito */}
          <div>
            <label htmlFor="lote-deposito" className="block text-sm font-medium text-gray-700 mb-1">
              Deposito
            </label>
            <select
              id="lote-deposito"
              value={depositoId}
              onChange={(e) => setDepositoId(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.deposito_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">-- Seleccione un deposito --</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
            {errors.deposito_id && (
              <p className="text-red-500 text-xs mt-1">{errors.deposito_id}</p>
            )}
          </div>

          {/* Nro Lote */}
          <div>
            <label htmlFor="lote-nro" className="block text-sm font-medium text-gray-700 mb-1">
              Nro. Lote
            </label>
            <input
              id="lote-nro"
              type="text"
              value={nroLote}
              onChange={(e) => setNroLote(e.target.value.toUpperCase())}
              placeholder="Identificador del lote"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nro_lote ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nro_lote && (
              <p className="text-red-500 text-xs mt-1">{errors.nro_lote}</p>
            )}
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lote-fab" className="block text-sm font-medium text-gray-700 mb-1">
                F. Fabricacion <span className="text-gray-400 font-normal">- Opcional</span>
              </label>
              <input
                id="lote-fab"
                type="date"
                value={fechaFabricacion}
                onChange={(e) => setFechaFabricacion(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="lote-venc" className="block text-sm font-medium text-gray-700 mb-1">
                F. Vencimiento <span className="text-gray-400 font-normal">- Opcional</span>
              </label>
              <input
                id="lote-venc"
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Cantidad inicial */}
          <div>
            <label htmlFor="lote-cantidad" className="block text-sm font-medium text-gray-700 mb-1">
              Cantidad Inicial
            </label>
            <input
              id="lote-cantidad"
              type="number"
              step="0.001"
              min="0.001"
              value={cantidadInicial}
              onChange={(e) => setCantidadInicial(e.target.value)}
              placeholder="0.000"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cantidad_inicial ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.cantidad_inicial && (
              <p className="text-red-500 text-xs mt-1">{errors.cantidad_inicial}</p>
            )}
          </div>

          {/* Costo unitario */}
          <div>
            <label htmlFor="lote-costo" className="block text-sm font-medium text-gray-700 mb-1">
              Costo Unitario (USD) <span className="text-gray-400 font-normal">- Opcional</span>
            </label>
            <input
              id="lote-costo"
              type="number"
              step="0.01"
              min="0"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(e.target.value)}
              placeholder="0.00"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.costo_unitario ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.costo_unitario && (
              <p className="text-red-500 text-xs mt-1">{errors.costo_unitario}</p>
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
              {submitting ? 'Creando...' : 'Crear Lote'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
