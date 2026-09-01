import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { paymentMethodSchema } from '@/features/configuracion/schemas/payment-method-schema'
import {
  createPaymentMethod,
  updatePaymentMethod,
  TIPOS_METODO,
  type PaymentMethod,
} from '@/features/configuracion/hooks/use-payment-methods'
import { useBancosActivos } from '@/features/configuracion/hooks/use-bancos'
import {
  useDeduccionesDeMetodo,
  persistDeduccionesDeMetodo,
  type TipoDeduccion,
} from '@/features/configuracion/hooks/use-metodo-cobro-deducciones'
import {
  DeduccionesEditor,
  type DeduccionRow,
} from '@/features/configuracion/components/deducciones-editor'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { NativeSelect } from '@/components/ui/native-select'

interface PaymentMethodFormProps {
  isOpen: boolean
  onClose: () => void
  method?: PaymentMethod
}

export function PaymentMethodForm({ isOpen, onClose, method }: PaymentMethodFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!method
  const { user } = useCurrentUser()
  const { bancos } = useBancosActivos()

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD')
  const [tipo, setTipo] = useState<string>('EFECTIVO')
  const [bancoEmpresaId, setBancoEmpresaId] = useState<string>('')
  const [requiereReferencia, setRequiereReferencia] = useState(false)
  const [active, setActive] = useState(true)
  const [consolidarLotes, setConsolidarLotes] = useState(true)
  const [deducciones, setDeducciones] = useState<DeduccionRow[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const requiereBanco = ['TRANSFERENCIA', 'PUNTO', 'PAGO_MOVIL'].includes(tipo)
  const bancoSeleccionado = bancos.find((b) => b.id === bancoEmpresaId)
  // Fix qa/metodo-pago-hereda-moneda-banco: en creacion, con banco
  // seleccionado, la moneda queda derivada+bloqueada (transparente al
  // usuario). En edicion la moneda es SIEMPRE inmutable (dato ya
  // persistido, puede tener saldo/movimientos en esa moneda — re-derivarla
  // corrompe el saldo sin una conversion real).
  const monedaDerivadaDeBanco = !isEditing && requiereBanco && !!bancoEmpresaId
  // En edicion, solo se ofrecen bancos cuya moneda coincide con la moneda ya
  // fijada del metodo — evita recrear el bug original (reasignar un banco de
  // otra moneda a un metodo existente). El banco YA asignado se conserva en
  // la lista aunque no coincida (dato legado potencialmente desalineado que
  // este fix no corrige de forma silenciosa/forzada).
  const bancosDisponibles = isEditing
    ? bancos.filter((b) => b.moneda === currency || b.id === bancoEmpresaId)
    : bancos
  const { deducciones: deduccionesExistentes } = useDeduccionesDeMetodo(method?.id)
  // Fix W1: evita repetir el warning de "sin cuenta pasarela" en cada
  // render mientras el mismo banco siga seleccionado.
  const warnedNoPasarelaRef = useRef<string | null>(null)
  // Fix W2b: evita repetir el soft-deactivate/aviso mientras el metodo
  // siga sin banco durante la misma apertura del dialogo.
  const detachedBancoRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      if (method) {
        setName(method.nombre)
        setCurrency(method.moneda as 'USD' | 'BS')
        setTipo(method.tipo ?? 'EFECTIVO')
        setBancoEmpresaId(method.banco_empresa_id ?? '')
        setRequiereReferencia(method.requiere_referencia === 1)
        setActive(method.is_active === 1)
        setConsolidarLotes(method.consolidar_lotes !== 0)
        setDeducciones(
          deduccionesExistentes.map((d) => ({
            id: d.id,
            concepto: d.concepto,
            tipo: d.tipo as TipoDeduccion,
            porcentaje: d.porcentaje,
            cuenta_gasto_id: d.cuenta_gasto_id,
            is_active: d.is_active === 1,
          }))
        )
      } else {
        setName('')
        setCurrency('USD')
        setTipo('EFECTIVO')
        setBancoEmpresaId('')
        setRequiereReferencia(false)
        setActive(true)
        setConsolidarLotes(true)
        setDeducciones([])
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, method, deduccionesExistentes])

  // Fix qa/metodo-pago-hereda-moneda-banco: al crear un metodo que requiere
  // banco (TRANSFERENCIA/PUNTO/PAGO_MOVIL) y elegir/cambiar el banco, la
  // moneda se deriva automaticamente de `banco.moneda` — el usuario deja de
  // poder desincronizarla manualmente (root cause del bug: TRANSF VZLA en
  // VES con banco en USD). Guardado explicito por `!isEditing`: en edicion
  // la moneda NUNCA se re-deriva (inmutabilidad post-creacion).
  useEffect(() => {
    if (isEditing || !requiereBanco || !bancoEmpresaId) return
    const banco = bancos.find((b) => b.id === bancoEmpresaId)
    if (banco && (banco.moneda === 'USD' || banco.moneda === 'BS')) {
      setCurrency(banco.moneda)
    }
  }, [isEditing, requiereBanco, bancoEmpresaId, bancos])

  // PR-3 (SC-07) + Fix W2a: al elegir/tener banco asociado (creacion O
  // edicion — ej. una edicion que le agrega banco a un metodo EFECTIVO),
  // precarga 1 slot de comision base apuntando a la cuenta pasarela del
  // banco (editable). Sin defaults por `tipo` de metodo — misma regla para
  // cualquier tipo bancario.
  // Fix W1: si el banco NO tiene cuenta pasarela configurada, el seed se
  // omite (nunca se inserta una fila con cuenta_gasto_id invalida/NULL —
  // evita violar el FK) pero el usuario recibe un warning visible en vez
  // de quedar con un metodo bancario sin ninguna deduccion en silencio
  // (SC-08/SC-30).
  useEffect(() => {
    if (!isOpen || !bancoEmpresaId) {
      warnedNoPasarelaRef.current = null
      return
    }
    if (deducciones.length > 0) return
    const banco = bancos.find((b) => b.id === bancoEmpresaId)
    if (!banco) return
    if (!banco.cuenta_gasto_pasarela_id) {
      if (warnedNoPasarelaRef.current !== bancoEmpresaId) {
        warnedNoPasarelaRef.current = bancoEmpresaId
        toast.warning(
          'El banco no tiene cuenta de comision de pasarela configurada — no se pudo agregar la comision base. Verifica la configuracion del banco.'
        )
      }
      return
    }
    warnedNoPasarelaRef.current = null
    setDeducciones([
      {
        concepto: 'Comision bancaria',
        tipo: 'COMISION',
        porcentaje: '0',
        cuenta_gasto_id: banco.cuenta_gasto_pasarela_id,
        is_active: true,
      },
    ])
  }, [isOpen, bancoEmpresaId, bancos, deducciones.length])

  // SC-09 (creacion) + Fix W2b (edicion): al quedar sin banco, el metodo no
  // debe seguir ofreciendo/aplicando deducciones bancarias. En creacion no
  // hay nada persistido aun — se limpia el array local sin mas. En edicion,
  // las filas YA EXISTENTES no se borran (SC-11/inmutabilidad): se
  // soft-desactivan localmente (is_active=false) y se persisten al guardar
  // (`persistDeduccionesDeMetodo`, PR-3c.2), con aviso visible al usuario.
  useEffect(() => {
    if (!isOpen || bancoEmpresaId) {
      detachedBancoRef.current = false
      return
    }
    if (!isEditing) {
      if (deducciones.length > 0) setDeducciones([])
      return
    }
    if (detachedBancoRef.current) return
    const hayActivas = deducciones.some((d) => d.is_active)
    if (!hayActivas) return
    detachedBancoRef.current = true
    setDeducciones(deducciones.map((d) => (d.is_active ? { ...d, is_active: false } : d)))
    toast.warning(
      'Se desactivaron las deducciones de este metodo porque ya no tiene un banco asociado.'
    )
  }, [isOpen, isEditing, bancoEmpresaId, deducciones])

  function handleNameChange(value: string) {
    setName(value.toUpperCase())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const cuentaBasePasarelaId = bancos.find((b) => b.id === bancoEmpresaId)?.cuenta_gasto_pasarela_id ?? undefined

    // SC-09 (creacion): sin banco, no se arma el array (no se crean filas
    // nuevas). Fix W2b (edicion): SIEMPRE se envian las filas locales, aun
    // sin banco — pueden incluir deducciones YA EXISTENTES que el efecto de
    // desvinculacion dejo con is_active=false y que deben persistirse.
    // PR-3c.2: resuelve el sentinel '' de DeduccionesEditor (filas agregadas
    // manualmente via su boton propio) CONTRA cuentaBasePasarelaId ANTES de
    // la validacion Zod (metodoCobroDeduccionSchema.cuenta_gasto_id exige
    // un uuid real) — el sentinel nunca debe llegar al parse ni a la DB.
    const deduccionesPayload = (isEditing ? deducciones : bancoEmpresaId ? deducciones : []).map(
      (d) => ({ ...d, cuenta_gasto_id: d.cuenta_gasto_id || cuentaBasePasarelaId || '' })
    )

    const parsed = paymentMethodSchema.safeParse({
      name,
      currency,
      tipo,
      banco_empresa_id: bancoEmpresaId || undefined,
      // Remediacion CRITICAL (Engram qa/metodo-pago-hereda-moneda-banco/verify-report
      // #2257): en edicion la moneda es SIEMPRE inmutable (campo disabled), por lo
      // que el refine cruzado de abajo no aporta nada — solo bloquea el submit de
      // metodos legados con banco desalineado (root cause del bug original) sin
      // forma de corregirse. `banco_moneda` se omite en edicion para que el refine
      // lo salte incondicionalmente; createPaymentMethod mantiene su propia defensa
      // en profundidad para el path de creacion.
      banco_moneda: !isEditing && (bancoSeleccionado?.moneda === 'USD' || bancoSeleccionado?.moneda === 'BS')
        ? bancoSeleccionado.moneda
        : undefined,
      requiere_referencia: requiereReferencia,
      active,
      consolidar_lotes: consolidarLotes,
      deducciones: deduccionesPayload,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.')
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (requiereBanco && !bancoEmpresaId) {
      setErrors({ banco_empresa_id: 'Debe seleccionar un banco para este tipo de metodo' })
      return
    }

    setSubmitting(true)
    try {
      if (isEditing && method) {
        await updatePaymentMethod(method.id, {
          nombre: parsed.data.name,
          tipo: parsed.data.tipo,
          banco_empresa_id: bancoEmpresaId || null,
          is_active: parsed.data.active,
          consolidar_lotes: parsed.data.consolidar_lotes,
        })
        // PR-3c.2 (tasks.md 4c.2.8): reemplaza la fila suelta persistDeducciones
        // local por la funcion transaccional compartida (1 writeTransaction,
        // todo o nada). cuentaBasePasarelaId es backstop defensivo — las filas
        // ya llegan resueltas por el map de arriba.
        await persistDeduccionesDeMetodo({
          metodoCobroId: method.id,
          empresaId: user!.empresa_id!,
          usuarioId: user!.id,
          cuentaBasePasarelaId,
          rows: parsed.data.deducciones,
        })
        toast.success('Metodo de pago actualizado correctamente')
      } else {
        await createPaymentMethod({
          nombre: parsed.data.name,
          moneda: parsed.data.currency,
          tipo: parsed.data.tipo,
          banco_empresa_id: bancoEmpresaId || undefined,
          requiere_referencia: parsed.data.requiere_referencia,
          empresa_id: user!.empresa_id!,
          usuario_id: user!.id,
          consolidar_lotes: parsed.data.consolidar_lotes,
          deducciones: parsed.data.deducciones,
        })
        toast.success('Metodo de pago creado correctamente')
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
          {isEditing ? 'Editar Metodo de Pago' : 'Nuevo Metodo de Pago'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="mp-name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="mp-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej: EFECTIVO USD"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label htmlFor="mp-tipo" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <NativeSelect
              id="mp-tipo"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value)
                if (!['TRANSFERENCIA', 'PUNTO', 'PAGO_MOVIL'].includes(e.target.value)) {
                  setBancoEmpresaId('')
                }
              }}
            >
              {TIPOS_METODO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </NativeSelect>
            {errors.tipo && (
              <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>
            )}
          </div>

          {/* Moneda */}
          <div>
            <label htmlFor="mp-currency" className="block text-sm font-medium text-gray-700 mb-1">
              Moneda
            </label>
            <NativeSelect
              id="mp-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'USD' | 'BS')}
              disabled={isEditing || monedaDerivadaDeBanco}
              className={isEditing || monedaDerivadaDeBanco ? 'text-gray-500 cursor-not-allowed' : undefined}
            >
              <option value="USD">USD - Dolares</option>
              <option value="BS">BS - Bolivares</option>
            </NativeSelect>
            {errors.currency && (
              <p className="text-red-500 text-xs mt-1">{errors.currency}</p>
            )}
            {isEditing && (
              <p className="text-gray-400 text-xs mt-1">La moneda no puede modificarse</p>
            )}
            {!isEditing && monedaDerivadaDeBanco && (
              <p className="text-gray-400 text-xs mt-1">
                La moneda se toma del banco seleccionado y no puede cambiarse manualmente
              </p>
            )}
          </div>

          {/* Banco (condicional) */}
          {requiereBanco && (
            <div>
              <label htmlFor="mp-banco" className="block text-sm font-medium text-gray-700 mb-1">
                Banco Asociado
              </label>
              {bancosDisponibles.length === 0 ? (
                <p className="text-amber-600 text-xs bg-amber-50 rounded-md px-3 py-2">
                  No hay bancos registrados. Cree un banco primero en la seccion de Bancos.
                </p>
              ) : (
                <NativeSelect
                  id="mp-banco"
                  value={bancoEmpresaId}
                  onChange={(e) => setBancoEmpresaId(e.target.value)}
                >
                  <option value="">-- Seleccione un banco --</option>
                  {bancosDisponibles.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre_banco} - {b.nro_cuenta}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {errors.banco_empresa_id && (
                <p className="text-red-500 text-xs mt-1">{errors.banco_empresa_id}</p>
              )}
            </div>
          )}

          {/* Deducciones del metodo (PR-3c.2): solo si hay banco asociado (SC-09),
              componente compartido con banco-form.tsx (DeduccionesEditor).
              `errors` (fix de review 3c.2, hallazgo WARNING): restaura el
              display inline por fila que la extraccion a DeduccionesEditor
              habia dejado sin conectar — sin esto, un fallo de
              metodoCobroDeduccionSchema (concepto vacio, porcentaje fuera de
              rango, cuenta_gasto_id sin resolver) bloqueaba el submit en
              total silencio. */}
          {bancoEmpresaId && (
            <div className="border-t border-gray-200 pt-4">
              <DeduccionesEditor
                rows={deducciones}
                onChange={setDeducciones}
                cuentaBasePasarelaId={
                  bancos.find((b) => b.id === bancoEmpresaId)?.cuenta_gasto_pasarela_id ?? undefined
                }
                errors={errors}
              />
            </div>
          )}

          {/* Requiere Referencia */}
          <div className="flex items-center gap-2">
            <input
              id="mp-ref"
              type="checkbox"
              checked={requiereReferencia}
              onChange={(e) => setRequiereReferencia(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="mp-ref" className="text-sm font-medium text-gray-700">
              Requiere numero de referencia
            </label>
          </div>

          {/* Consolidar lotes (condicional, solo POS) */}
          {tipo === 'PUNTO' && (
            <div>
              <div className="flex items-center gap-2">
                <input
                  id="mp-consolidar-lotes"
                  type="checkbox"
                  checked={consolidarLotes}
                  onChange={(e) => setConsolidarLotes(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="mp-consolidar-lotes" className="text-sm font-medium text-gray-700">
                  Consolidar lotes al cerrar caja
                </label>
              </div>
              <p className="text-gray-400 text-xs mt-1 ml-6">
                {consolidarLotes
                  ? 'Los lotes cargados se envian a Tesoreria en UN solo traspaso, con la comision aplicada sobre el total.'
                  : 'Cada lote se envia a Tesoreria en un traspaso independiente, con su propia comision.'}
              </p>
            </div>
          )}

          {/* Activo */}
          <div className="flex items-center gap-2">
            <input
              id="mp-active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="mp-active" className="text-sm font-medium text-gray-700">
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
