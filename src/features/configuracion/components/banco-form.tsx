import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { bancoSchema } from '@/features/configuracion/schemas/banco-schema'
import {
  createBanco,
  updateBanco,
  type Banco,
} from '@/features/configuracion/hooks/use-bancos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface BancoFormProps {
  isOpen: boolean
  onClose: () => void
  banco?: Banco
}

export function BancoForm({ isOpen, onClose, banco }: BancoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!banco
  const { user } = useCurrentUser()

  const [nombreBanco, setNombreBanco] = useState('')
  const [nroCuenta, setNroCuenta] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<string>('')
  const [titular, setTitular] = useState('')
  const [titularDocumento, setTitularDocumento] = useState('')
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (banco) {
        setNombreBanco(banco.nombre_banco)
        setNroCuenta(banco.nro_cuenta)
        setTipoCuenta(banco.tipo_cuenta ?? '')
        setTitular(banco.titular)
        setTitularDocumento(banco.titular_documento ?? '')
        setActive(banco.is_active === 1)
      } else {
        setNombreBanco('')
        setNroCuenta('')
        setTipoCuenta('')
        setTitular('')
        setTitularDocumento('')
        setActive(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, banco])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = bancoSchema.safeParse({
      nombre_banco: nombreBanco,
      nro_cuenta: nroCuenta,
      tipo_cuenta: tipoCuenta || undefined,
      titular,
      titular_documento: titularDocumento || undefined,
      active,
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
      if (isEditing && banco) {
        await updateBanco(banco.id, {
          nombre_banco: parsed.data.nombre_banco,
          nro_cuenta: parsed.data.nro_cuenta,
          tipo_cuenta: parsed.data.tipo_cuenta,
          titular: parsed.data.titular,
          titular_documento: parsed.data.titular_documento,
          is_active: parsed.data.active,
        })
        toast.success('Banco actualizado correctamente')
      } else {
        await createBanco({
          nombre_banco: parsed.data.nombre_banco,
          nro_cuenta: parsed.data.nro_cuenta,
          tipo_cuenta: parsed.data.tipo_cuenta,
          titular: parsed.data.titular,
          titular_documento: parsed.data.titular_documento,
          empresa_id: user!.empresa_id!,
          usuario_id: user!.id,
        })
        toast.success('Banco creado correctamente')
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? 'Editar Banco' : 'Nuevo Banco'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre del Banco */}
          <div>
            <label htmlFor="banco-name" className="block text-sm font-medium text-gray-700 mb-1">
              Banco
            </label>
            <input
              id="banco-name"
              type="text"
              value={nombreBanco}
              onChange={(e) => setNombreBanco(e.target.value.toUpperCase())}
              placeholder="Ej: BANESCO"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre_banco ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre_banco && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre_banco}</p>
            )}
          </div>

          {/* Numero de Cuenta */}
          <div>
            <label htmlFor="banco-cuenta" className="block text-sm font-medium text-gray-700 mb-1">
              Numero de Cuenta
            </label>
            <input
              id="banco-cuenta"
              type="text"
              value={nroCuenta}
              onChange={(e) => setNroCuenta(e.target.value)}
              placeholder="Ej: 0134-0000-00-0000000000"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nro_cuenta ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nro_cuenta && (
              <p className="text-red-500 text-xs mt-1">{errors.nro_cuenta}</p>
            )}
          </div>

          {/* Tipo de Cuenta */}
          <div>
            <label htmlFor="banco-tipo" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Cuenta
            </label>
            <select
              id="banco-tipo"
              value={tipoCuenta}
              onChange={(e) => setTipoCuenta(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Sin especificar --</option>
              <option value="CORRIENTE">Corriente</option>
              <option value="AHORRO">Ahorro</option>
              <option value="DIGITAL">Digital</option>
            </select>
          </div>

          {/* Titular */}
          <div>
            <label htmlFor="banco-titular" className="block text-sm font-medium text-gray-700 mb-1">
              Titular
            </label>
            <input
              id="banco-titular"
              type="text"
              value={titular}
              onChange={(e) => setTitular(e.target.value.toUpperCase())}
              placeholder="Ej: CLINICA CLARA C.A."
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.titular ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.titular && (
              <p className="text-red-500 text-xs mt-1">{errors.titular}</p>
            )}
          </div>

          {/* Cedula / RIF del Titular */}
          <div>
            <label htmlFor="banco-doc" className="block text-sm font-medium text-gray-700 mb-1">
              Cedula / RIF del Titular
            </label>
            <input
              id="banco-doc"
              type="text"
              value={titularDocumento}
              onChange={(e) => setTitularDocumento(e.target.value.toUpperCase())}
              placeholder="Ej: J-12345678-9"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Activo */}
          <div className="flex items-center gap-2">
            <input
              id="banco-active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="banco-active" className="text-sm font-medium text-gray-700">
              Activo
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
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
