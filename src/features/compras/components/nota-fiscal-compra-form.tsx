import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { notaFiscalCompraSchema } from '@/features/compras/schemas/nota-fiscal-compra-schema'
import { crearNotaFiscalCompra } from '@/features/compras/hooks/use-notas-fiscales-compra'
import { useCompras } from '@/features/inventario/hooks/use-compras'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { NativeSelect } from '@/components/ui/native-select'

interface NotaFiscalCompraFormProps {
  isOpen: boolean
  onClose: () => void
}

export function NotaFiscalCompraForm({ isOpen, onClose }: NotaFiscalCompraFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { compras, isLoading: loadingCompras } = useCompras()
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()

  const [proveedorId, setProveedorId] = useState('')
  const [facturaCompraId, setFacturaCompraId] = useState('')
  const [tipo, setTipo] = useState<'NC' | 'ND'>('NC')
  const [nroDocumento, setNroDocumento] = useState('')
  const [motivo, setMotivo] = useState('')
  const [tasa, setTasa] = useState('')
  const [afectaInventario, setAfectaInventario] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setProveedorId('')
      setFacturaCompraId('')
      setTipo('NC')
      setNroDocumento('')
      setMotivo('')
      setTasa(tasaValor > 0 ? tasaValor.toFixed(4) : '')
      setAfectaInventario(false)
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, tasaValor])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    const parsed = notaFiscalCompraSchema.safeParse({
      proveedor_id: proveedorId,
      factura_compra_id: facturaCompraId || undefined,
      tipo,
      nro_documento: nroDocumento.trim(),
      motivo: motivo.trim(),
      tasa: parseFloat(tasa) || 0,
      afecta_inventario: afectaInventario,
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
      await crearNotaFiscalCompra({
        proveedor_id: parsed.data.proveedor_id,
        factura_compra_id: parsed.data.factura_compra_id,
        tipo: parsed.data.tipo,
        nro_documento: parsed.data.nro_documento,
        motivo: parsed.data.motivo,
        tasa: parsed.data.tasa,
        afecta_inventario: parsed.data.afecta_inventario,
        total_exento_usd: 0,
        total_base_usd: 0,
        total_iva_usd: 0,
        total_usd: 0,
        total_bs: 0,
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
      })
      toast.success('Nota fiscal registrada exitosamente')
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
        <h2 className="text-lg font-semibold mb-4">Nueva Nota Fiscal</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Proveedor */}
          <div>
            <label htmlFor="nf-proveedor" className="block text-sm font-medium text-gray-700 mb-1">
              Proveedor
            </label>
            <NativeSelect
              id="nf-proveedor"
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

          {/* Factura de compra (opcional) */}
          <div>
            <label htmlFor="nf-factura" className="block text-sm font-medium text-gray-700 mb-1">
              Factura de Compra{' '}
              <span className="text-gray-400 font-normal">- Opcional</span>
            </label>
            <NativeSelect
              id="nf-factura"
              value={facturaCompraId}
              onChange={(e) => setFacturaCompraId(e.target.value)}
              disabled={loadingCompras}
            >
              <option value="">
                {loadingCompras ? 'Cargando...' : 'Sin factura asociada'}
              </option>
              {compras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nro_factura} - {c.proveedor_nombre}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Tipo */}
          <div>
            <label htmlFor="nf-tipo" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <NativeSelect
              id="nf-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'NC' | 'ND')}
            >
              <option value="NC">NC - Nota de Credito</option>
              <option value="ND">ND - Nota de Debito</option>
            </NativeSelect>
            {errors.tipo && (
              <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>
            )}
          </div>

          {/* Nro Documento y Tasa */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="nf-nro" className="block text-sm font-medium text-gray-700 mb-1">
                Nro Documento
              </label>
              <input
                id="nf-nro"
                type="text"
                value={nroDocumento}
                onChange={(e) => setNroDocumento(e.target.value)}
                placeholder="Ej: NC-000001"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.nro_documento ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.nro_documento && (
                <p className="text-red-500 text-xs mt-1">{errors.nro_documento}</p>
              )}
            </div>
            <div>
              <label htmlFor="nf-tasa" className="block text-sm font-medium text-gray-700 mb-1">
                Tasa (Bs/USD)
              </label>
              <input
                id="nf-tasa"
                type="number"
                step="0.0001"
                min="0.0001"
                value={tasa}
                onChange={(e) => setTasa(e.target.value)}
                placeholder="0.0000"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.tasa ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.tasa && (
                <p className="text-red-500 text-xs mt-1">{errors.tasa}</p>
              )}
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label htmlFor="nf-motivo" className="block text-sm font-medium text-gray-700 mb-1">
              Motivo
            </label>
            <textarea
              id="nf-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Descripcion del motivo de la nota fiscal"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                errors.motivo ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.motivo && (
              <p className="text-red-500 text-xs mt-1">{errors.motivo}</p>
            )}
          </div>

          {/* Afecta Inventario */}
          <div className="flex items-center gap-3">
            <input
              id="nf-afecta-inv"
              type="checkbox"
              checked={afectaInventario}
              onChange={(e) => setAfectaInventario(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="nf-afecta-inv" className="text-sm font-medium text-gray-700">
              Afecta inventario
            </label>
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
              {submitting ? 'Registrando...' : 'Registrar Nota'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
