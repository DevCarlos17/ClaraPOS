import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { bancoSchema } from '@/features/configuracion/schemas/banco-schema'
import {
  createBanco,
  updateBanco,
  type Banco,
} from '@/features/configuracion/hooks/use-bancos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCuentasDetalle, crearCuenta } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { db } from '@/core/db/powersync/db'
import { Plus } from '@phosphor-icons/react'

interface BancoFormProps {
  isOpen: boolean
  onClose: () => void
  banco?: Banco
}

export function BancoForm({ isOpen, onClose, banco }: BancoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!banco
  const { user } = useCurrentUser()
  const { cuentas } = useCuentasDetalle()

  const [nombreBanco, setNombreBanco] = useState('')
  const [nroCuenta, setNroCuenta] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<string>('')
  const [titular, setTitular] = useState('')
  const [titularDocumento, setTitularDocumento] = useState('')
  const [cuentaContableId, setCuentaContableId] = useState('')
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [creandoCuenta, setCreandoCuenta] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (banco) {
        setNombreBanco(banco.nombre_banco)
        setNroCuenta(banco.nro_cuenta)
        setTipoCuenta(banco.tipo_cuenta ?? '')
        setTitular(banco.titular)
        setTitularDocumento(banco.titular_documento ?? '')
        setCuentaContableId(banco.cuenta_contable_id ?? '')
        setActive(banco.is_active === 1)
      } else {
        setNombreBanco('')
        setNroCuenta('')
        setTipoCuenta('')
        setTitular('')
        setTitularDocumento('')
        setCuentaContableId('')
        setActive(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, banco])

  async function handleCrearCuentaContable() {
    if (!nombreBanco.trim()) {
      toast.warning('Ingresa el nombre del banco antes de crear la cuenta contable')
      return
    }
    if (!user?.empresa_id) return

    setCreandoCuenta(true)
    try {
      // Buscar cuenta padre "1.1.01" (EFECTIVO Y EQUIVALENTES) u otro prefijo de activos bancarios
      const result = await db.execute(
        `SELECT id, codigo, nivel FROM plan_cuentas
         WHERE empresa_id = ? AND codigo LIKE '1.1.%' AND es_cuenta_detalle = 0
         ORDER BY codigo ASC LIMIT 1`,
        [user.empresa_id]
      )

      let parentId: string | undefined
      let parentNivel = 2
      let codigoPadre = '1.1'

      if (result.rows && result.rows.length > 0) {
        const padre = result.rows.item(0) as { id: string; codigo: string; nivel: number }
        parentId = padre.id
        parentNivel = padre.nivel
        codigoPadre = padre.codigo
      }

      // Buscar hijos existentes del padre para calcular siguiente codigo
      const hijosResult = await db.execute(
        `SELECT codigo FROM plan_cuentas
         WHERE empresa_id = ? AND codigo LIKE ? AND nivel = ?
         ORDER BY codigo DESC LIMIT 1`,
        [user.empresa_id, `${codigoPadre}.%`, parentNivel + 1]
      )

      let siguienteSufijo = 1
      if (hijosResult.rows && hijosResult.rows.length > 0) {
        const ultimoCodigo = (hijosResult.rows.item(0) as { codigo: string }).codigo
        const partes = ultimoCodigo.split('.')
        const ultimoNum = parseInt(partes[partes.length - 1], 10)
        if (!isNaN(ultimoNum)) siguienteSufijo = ultimoNum + 1
      }

      const nuevoCodigo = `${codigoPadre}.${String(siguienteSufijo).padStart(2, '0')}`
      const nombreCuenta = `BANCO ${nombreBanco.trim().toUpperCase()}`

      const nuevaId = await crearCuenta({
        codigo: nuevoCodigo,
        nombre: nombreCuenta,
        tipo: 'ACTIVO',
        naturaleza: 'DEUDORA',
        parent_id: parentId,
        nivel: parentNivel + 1,
        es_cuenta_detalle: true,
        empresa_id: user.empresa_id,
        created_by: user.id,
      })

      setCuentaContableId(nuevaId)
      toast.success(`Cuenta contable ${nuevoCodigo} creada y vinculada`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear la cuenta contable'
      toast.error(message)
    } finally {
      setCreandoCuenta(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = bancoSchema.safeParse({
      nombre_banco: nombreBanco,
      nro_cuenta: nroCuenta,
      tipo_cuenta: tipoCuenta || undefined,
      titular,
      titular_documento: titularDocumento || undefined,
      cuenta_contable_id: cuentaContableId || undefined,
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
          cuenta_contable_id: parsed.data.cuenta_contable_id ?? null,
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
          cuenta_contable_id: parsed.data.cuenta_contable_id,
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

          {/* Cuenta Contable */}
          <div>
            <label htmlFor="banco-cuenta-contable" className="block text-sm font-medium text-gray-700 mb-1">
              Cuenta Contable <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="flex gap-2">
              <select
                id="banco-cuenta-contable"
                value={cuentaContableId}
                onChange={(e) => setCuentaContableId(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Sin asignar --</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCrearCuentaContable}
                disabled={creandoCuenta || !nombreBanco.trim()}
                title={!nombreBanco.trim() ? 'Ingresa el nombre del banco primero' : 'Crear cuenta contable para este banco'}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                {creandoCuenta ? 'Creando...' : 'Crear Cuenta'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Vincula este banco a una cuenta del plan contable para automatizar asientos. O usa "Crear Cuenta" para generar una automaticamente.
            </p>
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
