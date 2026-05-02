import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { retIvaCompraSchema } from '@/features/compras/schemas/ret-iva-compra-schema'
import { crearRetencionIva } from '@/features/compras/hooks/use-ret-iva-compras'
import { useCompras } from '@/features/inventario/hooks/use-compras'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { NativeSelect } from '@/components/ui/native-select'

interface RetIvaCompraFormProps {
  isOpen: boolean
  onClose: () => void
}

export function RetIvaCompraForm({ isOpen, onClose }: RetIvaCompraFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { compras, isLoading: loadingCompras } = useCompras()
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const { user } = useCurrentUser()

  const [facturaCompraId, setFacturaCompraId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [nroComprobante, setNroComprobante] = useState('')
  const [fechaComprobante, setFechaComprobante] = useState('')
  const [baseImponible, setBaseImponible] = useState('')
  const [porcentajeIva, setPorcentajeIva] = useState('')
  const [montoIva, setMontoIva] = useState('')
  const [porcentajeRetencion, setPorcentajeRetencion] = useState('')
  const [montoRetenido, setMontoRetenido] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFacturaCompraId('')
      setProveedorId('')
      setNroComprobante('')
      setFechaComprobante('')
      setBaseImponible('')
      setPorcentajeIva('')
      setMontoIva('')
      setPorcentajeRetencion('')
      setMontoRetenido('')
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  // Auto-calcular monto_iva cuando cambian base_imponible o porcentaje_iva
  useEffect(() => {
    const base = parseFloat(baseImponible)
    const pctIva = parseFloat(porcentajeIva)
    if (!isNaN(base) && !isNaN(pctIva) && base > 0 && pctIva >= 0) {
      setMontoIva((base * pctIva / 100).toFixed(2))
    }
  }, [baseImponible, porcentajeIva])

  // Auto-calcular monto_retenido cuando cambian monto_iva o porcentaje_retencion
  useEffect(() => {
    const mIva = parseFloat(montoIva)
    const pctRet = parseFloat(porcentajeRetencion)
    if (!isNaN(mIva) && !isNaN(pctRet) && mIva > 0 && pctRet >= 0) {
      setMontoRetenido((mIva * pctRet / 100).toFixed(2))
    }
  }, [montoIva, porcentajeRetencion])

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

    const parsed = retIvaCompraSchema.safeParse({
      factura_compra_id: facturaCompraId,
      proveedor_id: proveedorId,
      nro_comprobante: nroComprobante.trim(),
      fecha_comprobante: fechaComprobante,
      base_imponible: parseFloat(baseImponible) || 0,
      porcentaje_iva: parseFloat(porcentajeIva) || 0,
      monto_iva: parseFloat(montoIva) || 0,
      porcentaje_retencion: parseFloat(porcentajeRetencion) || 0,
      monto_retenido: parseFloat(montoRetenido) || 0,
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
      await crearRetencionIva({
        ...parsed.data,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })
      toast.success('Retencion de IVA registrada exitosamente')
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
        <h2 className="text-lg font-semibold mb-4">Nueva Retencion IVA</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Factura de compra */}
          <div>
            <label htmlFor="ret-iva-factura" className="block text-sm font-medium text-gray-700 mb-1">
              Factura de Compra
            </label>
            <NativeSelect
              id="ret-iva-factura"
              value={facturaCompraId}
              onChange={(e) => handleFacturaChange(e.target.value)}
              disabled={loadingCompras}
            >
              <option value="">
                {loadingCompras ? 'Cargando...' : 'Seleccionar factura de compra'}
              </option>
              {compras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nro_factura} - {c.proveedor_nombre}
                </option>
              ))}
            </NativeSelect>
            {errors.factura_compra_id && (
              <p className="text-red-500 text-xs mt-1">{errors.factura_compra_id}</p>
            )}
          </div>

          {/* Proveedor */}
          <div>
            <label htmlFor="ret-iva-proveedor" className="block text-sm font-medium text-gray-700 mb-1">
              Proveedor
            </label>
            <NativeSelect
              id="ret-iva-proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              disabled={loadingProveedores}
            >
              <option value="">
                {loadingProveedores ? 'Cargando...' : 'Seleccionar proveedor'}
              </option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rif} - {p.razon_social}
                </option>
              ))}
            </NativeSelect>
            {errors.proveedor_id && (
              <p className="text-red-500 text-xs mt-1">{errors.proveedor_id}</p>
            )}
          </div>

          {/* Nro Comprobante y Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ret-iva-nro" className="block text-sm font-medium text-gray-700 mb-1">
                Nro Comprobante
              </label>
              <input
                id="ret-iva-nro"
                type="text"
                value={nroComprobante}
                onChange={(e) => setNroComprobante(e.target.value)}
                placeholder="Ej: Z-000000001"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.nro_comprobante ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.nro_comprobante && (
                <p className="text-red-500 text-xs mt-1">{errors.nro_comprobante}</p>
              )}
            </div>
            <div>
              <label htmlFor="ret-iva-fecha" className="block text-sm font-medium text-gray-700 mb-1">
                Fecha Comprobante
              </label>
              <input
                id="ret-iva-fecha"
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

          {/* Base Imponible y % IVA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ret-iva-base" className="block text-sm font-medium text-gray-700 mb-1">
                Base Imponible
              </label>
              <input
                id="ret-iva-base"
                type="number"
                step="0.01"
                min="0"
                value={baseImponible}
                onChange={(e) => setBaseImponible(e.target.value)}
                placeholder="0.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.base_imponible ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.base_imponible && (
                <p className="text-red-500 text-xs mt-1">{errors.base_imponible}</p>
              )}
            </div>
            <div>
              <label htmlFor="ret-iva-pct-iva" className="block text-sm font-medium text-gray-700 mb-1">
                % IVA
              </label>
              <input
                id="ret-iva-pct-iva"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={porcentajeIva}
                onChange={(e) => setPorcentajeIva(e.target.value)}
                placeholder="16.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.porcentaje_iva ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.porcentaje_iva && (
                <p className="text-red-500 text-xs mt-1">{errors.porcentaje_iva}</p>
              )}
            </div>
          </div>

          {/* Monto IVA y % Retencion */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ret-iva-monto-iva" className="block text-sm font-medium text-gray-700 mb-1">
                Monto IVA
              </label>
              <input
                id="ret-iva-monto-iva"
                type="number"
                step="0.01"
                min="0"
                value={montoIva}
                onChange={(e) => setMontoIva(e.target.value)}
                placeholder="0.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.monto_iva ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.monto_iva && (
                <p className="text-red-500 text-xs mt-1">{errors.monto_iva}</p>
              )}
            </div>
            <div>
              <label htmlFor="ret-iva-pct-ret" className="block text-sm font-medium text-gray-700 mb-1">
                % Retencion
              </label>
              <input
                id="ret-iva-pct-ret"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={porcentajeRetencion}
                onChange={(e) => setPorcentajeRetencion(e.target.value)}
                placeholder="75.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.porcentaje_retencion ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.porcentaje_retencion && (
                <p className="text-red-500 text-xs mt-1">{errors.porcentaje_retencion}</p>
              )}
            </div>
          </div>

          {/* Monto Retenido */}
          <div>
            <label htmlFor="ret-iva-monto-ret" className="block text-sm font-medium text-gray-700 mb-1">
              Monto Retenido
            </label>
            <input
              id="ret-iva-monto-ret"
              type="number"
              step="0.01"
              min="0"
              value={montoRetenido}
              onChange={(e) => setMontoRetenido(e.target.value)}
              placeholder="0.00"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.monto_retenido ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.monto_retenido && (
              <p className="text-red-500 text-xs mt-1">{errors.monto_retenido}</p>
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
              {submitting ? 'Registrando...' : 'Registrar Retencion'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
