import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { bancoSchema } from '@/features/configuracion/schemas/banco-schema'
import {
  createBanco,
  updateBanco,
  useMetodosByBanco,
  type Banco,
  type BancoMetodo,
} from '@/features/configuracion/hooks/use-bancos'
import {
  createPaymentMethod,
  updatePaymentMethod,
} from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCuentasDetalle, crearCuenta } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { db } from '@/core/db/powersync/db'
import { Plus, Trash } from '@phosphor-icons/react'
import { NativeSelect } from '@/components/ui/native-select'

// =============================================
// METODO DRAFT TYPES
// =============================================

interface MetodoDraft {
  _key: string
  id?: string          // set when this is an existing method
  nombre: string
  tipo: string
  deposito_directo: boolean
  comision_pct: string
  usa_pos: boolean
  usa_cxc: boolean
  usa_cxp: boolean
  is_active: boolean
}

const TIPOS_METODO_BANCO = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'PUNTO', label: 'Punto de Venta' },
  { value: 'PAGO_MOVIL', label: 'Pago Movil' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'DIVISA_DIGITAL', label: 'Divisa Digital' },
  { value: 'OTRO', label: 'Otro' },
] as const

// =============================================
// METODO DRAFT ROW
// =============================================

interface MetodoDraftRowProps {
  draft: MetodoDraft
  onChange: (updated: MetodoDraft) => void
  onRemove: () => void
}

function MetodoDraftRow({ draft, onChange, onRemove }: MetodoDraftRowProps) {
  return (
    <div className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
      {/* Row 1: Nombre | Tipo | Action */}
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <input
            type="text"
            value={draft.nombre}
            onChange={(e) => onChange({ ...draft, nombre: e.target.value.toUpperCase() })}
            placeholder="Nombre del metodo"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-36">
          <NativeSelect
            value={draft.tipo}
            onChange={(e) => onChange({ ...draft, tipo: e.target.value })}
            className="text-xs py-1.5"
          >
            {TIPOS_METODO_BANCO.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </NativeSelect>
        </div>
        {/* Existing methods get active toggle; new drafts get remove button */}
        {draft.id ? (
          <div className="flex items-center gap-1 pt-1">
            <input
              id={`active-${draft._key}`}
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => onChange({ ...draft, is_active: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor={`active-${draft._key}`} className="text-xs text-gray-600">Activo</label>
          </div>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Eliminar metodo"
          >
            <Trash size={14} />
          </button>
        )}
      </div>

      {/* Row 2: Deposito directo | Comision % | Usar en */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.deposito_directo}
            onChange={(e) => onChange({ ...draft, deposito_directo: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
          />
          Deposito directo
        </label>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-600">Comision %</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={draft.comision_pct}
            onChange={(e) => onChange({ ...draft, comision_pct: e.target.value })}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Usar en:</span>
          <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.usa_pos}
              onChange={(e) => onChange({ ...draft, usa_pos: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            POS
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.usa_cxc}
              onChange={(e) => onChange({ ...draft, usa_cxc: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            CxC
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.usa_cxp}
              onChange={(e) => onChange({ ...draft, usa_cxp: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            CxP
          </label>
        </div>
      </div>
    </div>
  )
}

// =============================================
// BANCO FORM
// =============================================

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

  // Basic banco fields
  const [nombreBanco, setNombreBanco] = useState('')
  const [nroCuenta, setNroCuenta] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<string>('')
  const [titular, setTitular] = useState('')
  const [titularDocumento, setTitularDocumento] = useState('')
  const [cuentaContableId, setCuentaContableId] = useState('')
  const [active, setActive] = useState(true)

  // 0069: moneda y saldo inicial
  const [moneda, setMoneda] = useState<'USD' | 'BS'>('USD')
  const [saldoInicial, setSaldoInicial] = useState('0')

  // Method drafts
  const [metodoDrafts, setMetodoDrafts] = useState<MetodoDraft[]>([])
  const methodsInitializedRef = useRef(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [creandoCuenta, setCreandoCuenta] = useState(false)

  // Load existing methods when editing
  const { data: existingMetodos } = useMetodosByBanco(banco?.id ?? '')

  // Initialize form fields
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
        setSaldoInicial('0')

        // Resolve currency code from moneda_id UUID
        db.execute('SELECT codigo_iso FROM monedas WHERE id = ? LIMIT 1', [banco.moneda_id])
          .then((result) => {
            if (result.rows?.length) {
              const iso = (result.rows.item(0) as { codigo_iso: string }).codigo_iso
              setMoneda(iso === 'VES' ? 'BS' : (iso as 'USD' | 'BS'))
            }
          })
          .catch(() => { /* keep default USD */ })
      } else {
        setNombreBanco('')
        setNroCuenta('')
        setTipoCuenta('')
        setTitular('')
        setTitularDocumento('')
        setCuentaContableId('')
        setActive(true)
        setMoneda('USD')
        setSaldoInicial('0')
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
      methodsInitializedRef.current = false
      setMetodoDrafts([])
    }
  }, [isOpen, banco])

  // Initialize method drafts when editing and methods load
  useEffect(() => {
    if (isOpen && banco && existingMetodos && !methodsInitializedRef.current) {
      methodsInitializedRef.current = true
      setMetodoDrafts(
        existingMetodos.map((m: BancoMetodo) => ({
          _key: m.id,
          id: m.id,
          nombre: m.nombre,
          tipo: m.tipo,
          deposito_directo: m.deposito_directo === 1,
          comision_pct: m.comision_pct ?? '0',
          usa_pos: m.usa_pos === 1,
          usa_cxc: m.usa_cxc === 1,
          usa_cxp: m.usa_cxp === 1,
          is_active: m.is_active === 1,
        }))
      )
    }
  }, [isOpen, banco, existingMetodos])

  function handleAgregarMetodo() {
    setMetodoDrafts((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        nombre: '',
        tipo: 'TRANSFERENCIA',
        deposito_directo: false,
        comision_pct: '0',
        usa_pos: true,
        usa_cxc: true,
        usa_cxp: true,
        is_active: true,
      },
    ])
  }

  function handleUpdateDraft(idx: number, updated: MetodoDraft) {
    setMetodoDrafts((prev) => prev.map((d, i) => (i === idx ? updated : d)))
  }

  function handleRemoveDraft(idx: number) {
    setMetodoDrafts((prev) => prev.filter((_, i) => i !== idx))
  }

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
      moneda_id: moneda,
      saldo_inicial: saldoInicial,
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
      let bancoId: string

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
        bancoId = banco.id
        toast.success('Banco actualizado correctamente')
      } else {
        bancoId = await createBanco({
          nombre_banco: parsed.data.nombre_banco,
          nro_cuenta: parsed.data.nro_cuenta,
          tipo_cuenta: parsed.data.tipo_cuenta,
          titular: parsed.data.titular,
          titular_documento: parsed.data.titular_documento,
          cuenta_contable_id: parsed.data.cuenta_contable_id,
          moneda_id: parsed.data.moneda_id,
          saldo_inicial: parsed.data.saldo_inicial,
          empresa_id: user!.empresa_id!,
          usuario_id: user!.id,
        })
        toast.success('Banco creado correctamente')
      }

      // Save method drafts
      for (const draft of metodoDrafts) {
        if (draft.id) {
          // Update existing method
          await updatePaymentMethod(draft.id, {
            nombre: draft.nombre,
            tipo: draft.tipo,
            banco_empresa_id: bancoId,
            is_active: draft.is_active,
            deposito_directo: draft.deposito_directo,
            comision_pct: draft.comision_pct,
            usa_pos: draft.usa_pos,
            usa_cxc: draft.usa_cxc,
            usa_cxp: draft.usa_cxp,
          })
        } else {
          // Skip incomplete new drafts
          if (!draft.nombre.trim() || !draft.tipo) continue
          await createPaymentMethod({
            nombre: draft.nombre,
            moneda,
            tipo: draft.tipo,
            banco_empresa_id: bancoId,
            deposito_directo: draft.deposito_directo,
            comision_pct: draft.comision_pct,
            usa_pos: draft.usa_pos,
            usa_cxc: draft.usa_cxc,
            usa_cxp: draft.usa_cxp,
            empresa_id: user!.empresa_id!,
            usuario_id: user!.id,
          })
        }
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
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

          {/* Moneda — disabled in edit mode */}
          <div>
            <label htmlFor="banco-moneda" className="block text-sm font-medium text-gray-700 mb-1">
              Moneda
            </label>
            <NativeSelect
              id="banco-moneda"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as 'USD' | 'BS')}
              disabled={isEditing}
              className={isEditing ? 'text-gray-500 cursor-not-allowed' : undefined}
            >
              <option value="USD">USD - Dolares</option>
              <option value="BS">BS - Bolivares</option>
            </NativeSelect>
            {isEditing && (
              <p className="text-gray-400 text-xs mt-1">La moneda no puede modificarse</p>
            )}
          </div>

          {/* Saldo inicial — only shown in create mode */}
          {!isEditing && (
            <div>
              <label htmlFor="banco-saldo-inicial" className="block text-sm font-medium text-gray-700 mb-1">
                Saldo inicial
              </label>
              <input
                id="banco-saldo-inicial"
                type="number"
                step="0.01"
                min="0"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Saldo de la cuenta al momento de registrarla en el sistema
              </p>
            </div>
          )}

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
            <NativeSelect
              id="banco-tipo"
              value={tipoCuenta}
              onChange={(e) => setTipoCuenta(e.target.value)}
            >
              <option value="">-- Sin especificar --</option>
              <option value="CORRIENTE">Corriente</option>
              <option value="AHORRO">Ahorro</option>
              <option value="DIGITAL">Digital</option>
            </NativeSelect>
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
              <NativeSelect
                id="banco-cuenta-contable"
                value={cuentaContableId}
                onChange={(e) => setCuentaContableId(e.target.value)}
                className="flex-1"
              >
                <option value="">-- Sin asignar --</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                ))}
              </NativeSelect>
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

          {/* ============================================
              METODOS DE PAGO SECTION
              ============================================ */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm text-gray-800">Metodos de pago</h3>
              <button
                type="button"
                onClick={handleAgregarMetodo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar metodo
              </button>
            </div>

            {metodoDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay metodos de pago configurados para este banco.
              </p>
            ) : (
              <div className="space-y-2">
                {metodoDrafts.map((draft, idx) => (
                  <MetodoDraftRow
                    key={draft._key}
                    draft={draft}
                    onChange={(updated) => handleUpdateDraft(idx, updated)}
                    onRemove={() => handleRemoveDraft(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2 border-t">
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
