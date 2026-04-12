import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { retIslrCompraSchema } from '@/features/compras/schemas/ret-islr-compra-schema'
import { crearRetencionIslr } from '@/features/compras/hooks/use-ret-islr-compras'
import { useCompras } from '@/features/inventario/hooks/use-compras'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface RetIslrCompraFormProps {
  isOpen: boolean
  onClose: () => void
}

export function RetIslrCompraForm({ isOpen, onClose }: RetIslrCompraFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { compras, isLoading: loadingCompras } = useCompras()
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const { user } = useCurrentUser()

  const [facturaCompraId, setFacturaCompraId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [nroComprobante, setNroComprobante] = useState('')
  const [fechaComprobante, setFechaComprobante] = useState('')
  const [baseImponibleBs, setBaseImponibleBs] = useState('')
  const [porcentajeRetencion, setPorcentajeRetencion] = useState('')
  const [montoRetenidoBs, setMontoRetenidoBs] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFacturaCompraId('')
      setProveedorId('')
      setNroComprobante('')
      setFechaComprobante('')
      setBaseImponibleBs('')
      setPorcentajeRetencion('')
      setMontoRetenidoBs('')
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  // Auto-calcular monto_retenido_bs = base_imponible_bs * porcentaje_retencion / 100
  useEffect(() => {
    const base = parseFloat(baseImponibleBs)
    const pct = parseFloat(porcentajeRetencion)
    if (!isNaN(base) && !isNaN(pct) && base > 0 && pct >= 0) {
      setMontoRetenidoBs((base * pct / 100).toFixed(2))
    }
  }, [baseImponibleBs, porcentajeRetencion])

  // Pre-fill proveedor al seleccionar factura
  function handleFacturaChange(id: string) {
    setFacturaCompraId(id)
    if (id) {
      const compra = compras.find((c) => c.id === id)
      if (compra) {
        setProveedorId(compra.proveedor_id)
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    const parsed = retIslrCompraSchema.safeParse({
      factura_compra_id: facturaCompraId,
      proveedor_id: proveedorId,
      nro_comprobante: nroComprobante.trim(),
      fecha_comprobante: fechaComprobante,
      base_imponible_bs: parseFloat(baseImponibleBs) || 0,
      porcentaje_retencion: parseFloat(porcentajeRetencion) || 0,
      monto_retenido_bs: parseFloat(montoRetenidoBs) || 0,
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
      await crearRetencionIslr({
        ...parsed.data,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })
      toast.success('Retencion de ISLR registrada exitosamente')
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Nueva Retencion ISLR</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Factura de compra */}
          <div>
            <label htmlFor="ret-islr-factura" className="block text-sm font-medium text-gray-700 mb-1">
              Factura de Compra
            </label>
            <select
              id="ret-islr-factura"
              value={facturaCompraId}
              onChange={(e) => handleFacturaChange(e.target.value)}
              disabled={loadingCompras}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.factura_compra_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">
                {loadingCompras ? 'Cargando...' : 'Seleccionar factura de compra'}
              </option>
              {compras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nro_factura} - {c.proveedor_nombre}
                </option>
              ))}
            </select>
            {errors.factura_compra_id && (
              <p className="text-red-500 text-xs mt-1">{errors.factura_compra_id}</p>
            )}
          </div>

          {/* Proveedor */}
          <div>
            <label htmlFor="ret-islr-proveedor" className="block text-sm font-medium text-gray-700 mb-1">
              Proveedor
            </label>
            <select
              id="ret-islr-proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              disabled={loadingProveedores}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.proveedor_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">
                {loadingProveedores ? 'Cargando...' : 'Seleccionar proveedor'}
              </option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rif} - {p.razon_social}
                </option>
              ))}
            </select>
            {errors.proveedor_id && (
              <p className="text-red-500 text-xs mt-1">{errors.proveedor_id}</p>
            )}
          </div>

          {/* Nro Comprobante y Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ret-islr-nro" className="block text-sm font-medium text-gray-700 mb-1">
                Nro Comprobante
              </label>
              <input
                id="ret-islr-nro"
                type="text"
                value={nroComprobante}
                onChange={(e) => setNroComprobante(e.target.value)}
                placeholder="Ej: I-000000001"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.nro_comprobante ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.nro_comprobante && (
                <p className="text-red-500 text-xs mt-1">{errors.nro_comprobante}</p>
              )}
            </div>
            <div>
              <label htmlFor="ret-islr-fecha" className="block text-sm font-medium text-gray-700 mb-1">
                Fecha Comprobante
              </label>
              <input
                id="ret-islr-fecha"
                type="date"
                value={fechaComprobante}
                onChange={(e) => setFechaComprobante(e.target.value)}
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.fecha_comprobante ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.fecha_comprobante && (
                <p className="text-red-500 text-xs mt-1">{errors.fecha_comprobante}</p>
              )}
            </div>
          </div>

          {/* Base Imponible Bs */}
          <div>
            <label htmlFor="ret-islr-base" className="block text-sm font-medium text-gray-700 mb-1">
              Base Imponible (Bs)
            </label>
            <input
              id="ret-islr-base"
              type="number"
              step="0.01"
              min="0"
              value={baseImponibleBs}
              onChange={(e) => setBaseImponibleBs(e.target.value)}
              placeholder="0.00"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.base_imponible_bs ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.base_imponible_bs && (
              <p className="text-red-500 text-xs mt-1">{errors.base_imponible_bs}</p>
            )}
          </div>

          {/* % Retencion y Monto Retenido */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ret-islr-pct" className="block text-sm font-medium text-gray-700 mb-1">
                % Retencion
              </label>
              <input
                id="ret-islr-pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={porcentajeRetencion}
                onChange={(e) => setPorcentajeRetencion(e.target.value)}
                placeholder="3.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.porcentaje_retencion ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.porcentaje_retencion && (
                <p className="text-red-500 text-xs mt-1">{errors.porcentaje_retencion}</p>
              )}
            </div>
            <div>
              <label htmlFor="ret-islr-monto" className="block text-sm font-medium text-gray-700 mb-1">
                Monto Retenido (Bs)
              </label>
              <input
                id="ret-islr-monto"
                type="number"
                step="0.01"
                min="0"
                value={montoRetenidoBs}
                onChange={(e) => setMontoRetenidoBs(e.target.value)}
                placeholder="0.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.monto_retenido_bs ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.monto_retenido_bs && (
                <p className="text-red-500 text-xs mt-1">{errors.monto_retenido_bs}</p>
              )}
            </div>
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
              {submitting ? 'Registrando...' : 'Registrar Retencion'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
