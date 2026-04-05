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

  const [bancoName, setBancoName] = useState('')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [cedulaRif, setCedulaRif] = useState('')
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (banco) {
        setBancoName(banco.banco)
        setNumeroCuenta(banco.numero_cuenta)
        setCedulaRif(banco.cedula_rif)
        setActive(banco.activo === 1)
      } else {
        setBancoName('')
        setNumeroCuenta('')
        setCedulaRif('')
        setActive(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, banco])

  function handleBancoChange(value: string) {
    setBancoName(value.toUpperCase())
  }

  function handleCedulaRifChange(value: string) {
    setCedulaRif(value.toUpperCase())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = bancoSchema.safeParse({
      banco: bancoName,
      numero_cuenta: numeroCuenta,
      cedula_rif: cedulaRif,
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
          banco: parsed.data.banco,
          numero_cuenta: parsed.data.numero_cuenta,
          cedula_rif: parsed.data.cedula_rif,
          activo: parsed.data.active,
        })
        toast.success('Banco actualizado correctamente')
      } else {
        await createBanco(
          parsed.data.banco,
          parsed.data.numero_cuenta,
          parsed.data.cedula_rif,
          user!.empresa_id!
        )
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
          {/* Banco */}
          <div>
            <label htmlFor="banco-name" className="block text-sm font-medium text-gray-700 mb-1">
              Banco
            </label>
            <input
              id="banco-name"
              type="text"
              value={bancoName}
              onChange={(e) => handleBancoChange(e.target.value)}
              placeholder="Ej: BANESCO"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.banco ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.banco && (
              <p className="text-red-500 text-xs mt-1">{errors.banco}</p>
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
              value={numeroCuenta}
              onChange={(e) => setNumeroCuenta(e.target.value)}
              placeholder="Ej: 0134-0000-00-0000000000"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.numero_cuenta ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.numero_cuenta && (
              <p className="text-red-500 text-xs mt-1">{errors.numero_cuenta}</p>
            )}
          </div>

          {/* Cedula / RIF */}
          <div>
            <label htmlFor="banco-rif" className="block text-sm font-medium text-gray-700 mb-1">
              Cedula / RIF del Titular
            </label>
            <input
              id="banco-rif"
              type="text"
              value={cedulaRif}
              onChange={(e) => handleCedulaRifChange(e.target.value)}
              placeholder="Ej: J-12345678-9"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cedula_rif ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.cedula_rif && (
              <p className="text-red-500 text-xs mt-1">{errors.cedula_rif}</p>
            )}
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
