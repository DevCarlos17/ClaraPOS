import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { proveedorSchema } from '@/features/proveedores/schemas/proveedor-schema'
import {
  crearProveedor,
  actualizarProveedor,
  type Proveedor,
} from '@/features/proveedores/hooks/use-proveedores'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface ProveedorFormProps {
  isOpen: boolean
  onClose: () => void
  proveedor?: Proveedor
}

export function ProveedorForm({ isOpen, onClose, proveedor }: ProveedorFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!proveedor
  const { user } = useCurrentUser()

  const [razonSocial, setRazonSocial] = useState('')
  const [rif, setRif] = useState('')
  const [direccionFiscal, setDireccionFiscal] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [retieneIva, setRetieneIva] = useState(false)
  const [retieneIslr, setRetieneIslr] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (proveedor) {
        setRazonSocial(proveedor.razon_social)
        setRif(proveedor.rif)
        setDireccionFiscal(proveedor.direccion_fiscal ?? '')
        setTelefono(proveedor.telefono ?? '')
        setCorreo(proveedor.correo ?? '')
        setRetieneIva(proveedor.retiene_iva === 1)
        setRetieneIslr(proveedor.retiene_islr === 1)
      } else {
        setRazonSocial('')
        setRif('')
        setDireccionFiscal('')
        setTelefono('')
        setCorreo('')
        setRetieneIva(false)
        setRetieneIslr(false)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, proveedor])

  function handleRifChange(value: string) {
    setRif(value.toUpperCase())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = proveedorSchema.safeParse({
      razon_social: razonSocial,
      rif,
      direccion_fiscal: direccionFiscal,
      telefono,
      correo,
      retiene_iva: retieneIva,
      retiene_islr: retieneIslr,
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
      if (isEditing && proveedor) {
        await actualizarProveedor(proveedor.id, {
          razon_social: parsed.data.razon_social,
          direccion_fiscal: parsed.data.direccion_fiscal,
          telefono: parsed.data.telefono,
          correo: parsed.data.correo,
          retiene_iva: parsed.data.retiene_iva,
          retiene_islr: parsed.data.retiene_islr,
        })
        toast.success('Proveedor actualizado correctamente')
      } else {
        await crearProveedor({
          razon_social: parsed.data.razon_social,
          rif: parsed.data.rif,
          direccion_fiscal: parsed.data.direccion_fiscal,
          telefono: parsed.data.telefono,
          correo: parsed.data.correo,
          retiene_iva: parsed.data.retiene_iva,
          retiene_islr: parsed.data.retiene_islr,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Proveedor creado correctamente')
      }
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
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Razon Social */}
          <div>
            <label htmlFor="prov-razon" className="block text-sm font-medium text-gray-700 mb-1">
              Razon Social *
            </label>
            <input
              id="prov-razon"
              type="text"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
              placeholder="Nombre de la empresa"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.razon_social ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.razon_social && (
              <p className="text-red-500 text-xs mt-1">{errors.razon_social}</p>
            )}
          </div>

          {/* RIF */}
          <div>
            <label htmlFor="prov-rif" className="block text-sm font-medium text-gray-700 mb-1">
              RIF *
            </label>
            <input
              id="prov-rif"
              type="text"
              value={rif}
              onChange={(e) => handleRifChange(e.target.value)}
              disabled={isEditing}
              placeholder="J-00000000-0"
              maxLength={12}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
              } ${errors.rif ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.rif && (
              <p className="text-red-500 text-xs mt-1">{errors.rif}</p>
            )}
            {isEditing && (
              <p className="text-gray-400 text-xs mt-1">El RIF no puede modificarse</p>
            )}
          </div>

          {/* Direccion Fiscal */}
          <div>
            <label htmlFor="prov-dir" className="block text-sm font-medium text-gray-700 mb-1">
              Direccion Fiscal
            </label>
            <textarea
              id="prov-dir"
              value={direccionFiscal}
              onChange={(e) => setDireccionFiscal(e.target.value)}
              placeholder="Direccion fiscal del proveedor"
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Telefono y Correo en grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prov-tel" className="block text-sm font-medium text-gray-700 mb-1">
                Telefono
              </label>
              <input
                id="prov-tel"
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="0212-1234567"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="prov-correo" className="block text-sm font-medium text-gray-700 mb-1">
                Correo Electronico
              </label>
              <input
                id="prov-correo"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@empresa.com"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.correo ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.correo && (
                <p className="text-red-500 text-xs mt-1">{errors.correo}</p>
              )}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input
                id="prov-iva"
                type="checkbox"
                checked={retieneIva}
                onChange={(e) => setRetieneIva(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="prov-iva" className="text-sm font-medium text-gray-700">
                Retiene IVA
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="prov-islr"
                type="checkbox"
                checked={retieneIslr}
                onChange={(e) => setRetieneIslr(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="prov-islr" className="text-sm font-medium text-gray-700">
                Retiene ISLR
              </label>
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
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
