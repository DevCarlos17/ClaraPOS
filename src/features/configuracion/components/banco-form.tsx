import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { bancoSchema } from '@/features/configuracion/schemas/banco-schema'
import {
  createBanco,
  updateBanco,
  useMetodosByBanco,
  type Banco,
} from '@/features/configuracion/hooks/use-bancos'
import {
  createPaymentMethod,
  updatePaymentMethod,
} from '@/features/configuracion/hooks/use-payment-methods'
import {
  DeduccionesEditor,
  type DeduccionRow,
} from '@/features/configuracion/components/deducciones-editor'
import {
  useDeduccionesPorMetodos,
  persistDeduccionesDeMetodo,
  type TipoDeduccion,
} from '@/features/configuracion/hooks/use-metodo-cobro-deducciones'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  useCuentasDetalle,
  useCuentasDetallePorTipo,
  useGrupoComisionesBancarias,
  useGrupoComisionesPasarela,
  crearCuenta,
  agregarSubcuentaAGrupo,
} from '@/features/contabilidad/hooks/use-plan-cuentas'
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
  usa_pos: boolean
  usa_cxc: boolean
  usa_cxp: boolean
  is_active: boolean
  // 0079: solo aplica cuando tipo === 'PUNTO' — consolidar lotes en un
  // traspaso (true) o enviar uno por lote (false) al cerrar caja.
  consolidar_lotes: boolean
  // PR-3c.2: N conceptos de deduccion (reemplaza el input suelto "Comision %").
  // `comision_pct` sigue existiendo como columna en metodos_cobro (deprecada,
  // PR-4 lee metodo_cobro_deducciones) — se envia siempre '0' al guardar.
  deducciones: DeduccionRow[]
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
  /** bancos_empresa.cuenta_gasto_pasarela_id del banco actual — resuelve el sentinel '' de DeduccionesEditor */
  cuentaBasePasarelaId: string | undefined
}

function MetodoDraftRow({ draft, onChange, onRemove, cuentaBasePasarelaId }: MetodoDraftRowProps) {
  return (
    <div className="border border-gray-300 rounded-md p-3 space-y-2 bg-white shadow-sm">
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
          {draft.id ? (
            // Existing method: tipo is immutable after creation
            <span className="inline-block text-xs bg-gray-100 text-gray-700 border border-gray-200 rounded px-2 py-1.5 w-full">
              {TIPOS_METODO_BANCO.find((t) => t.value === draft.tipo)?.label ?? draft.tipo}
            </span>
          ) : (
            // New draft: tipo is selectable
            <NativeSelect
              value={draft.tipo}
              onChange={(e) => onChange({ ...draft, tipo: e.target.value })}
              className="text-xs py-1.5"
            >
              {TIPOS_METODO_BANCO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </NativeSelect>
          )}
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

      {/* Row 2: Deposito directo | Usar en */}
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

      {/* Row 3: Consolidar lotes (solo tipo PUNTO) */}
      {draft.tipo === 'PUNTO' && (
        <div className="pt-1 border-t border-gray-100">
          <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.consolidar_lotes}
              onChange={(e) => onChange({ ...draft, consolidar_lotes: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            Consolidar lotes al cerrar caja
          </label>
          <p className="text-gray-400 text-[11px] mt-0.5 ml-5">
            {draft.consolidar_lotes
              ? 'Los lotes se envian a Tesoreria en UN solo traspaso.'
              : 'Cada lote se envia a Tesoreria en un traspaso independiente.'}
          </p>
        </div>
      )}

      {/* Row 4: N-deducciones (PR-3c.2) */}
      <div className="pt-2 border-t border-gray-100">
        <DeduccionesEditor
          rows={draft.deducciones}
          onChange={(deducciones) => onChange({ ...draft, deducciones })}
          cuentaBasePasarelaId={cuentaBasePasarelaId}
        />
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
  const { cuentas: cuentasGasto } = useCuentasDetallePorTipo('GASTO')
  // 0081 (PR-2b): 2 grupos-padre resueltos via cuentas_config, reemplaza el
  // subgrupo plano 6.2.05 (useSubgrupoComisionesBancarias, eliminado)
  const grupoComisionesBancarias = useGrupoComisionesBancarias()
  const grupoComisionesPasarela = useGrupoComisionesPasarela()

  // Basic banco fields
  const [nombreBanco, setNombreBanco] = useState('')
  const [nroCuenta, setNroCuenta] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<string>('')
  const [titular, setTitular] = useState('')
  const [titularDocumento, setTitularDocumento] = useState('')
  const [cuentaContableId, setCuentaContableId] = useState('')
  // 0080: cuenta de gasto para comisiones bancarias (default de metodo_cobro_deducciones)
  const [cuentaGastoComisionId, setCuentaGastoComisionId] = useState('')
  // 0081 (PR-2b): cuenta BASE de comision de pasarela de pago (compartida por
  // los metodos de pago del banco que no especifiquen cuenta propia)
  const [cuentaGastoPasarelaId, setCuentaGastoPasarelaId] = useState('')
  const [active, setActive] = useState(true)

  // 0069: moneda y saldo inicial
  const [moneda, setMoneda] = useState<'USD' | 'BS'>('USD')
  const [saldoInicial, setSaldoInicial] = useState('0')

  // Method drafts
  const [metodoDrafts, setMetodoDrafts] = useState<MetodoDraft[]>([])
  const [userEdited, setUserEdited] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [creandoCuenta, setCreandoCuenta] = useState(false)

  // Load existing methods when editing
  const { data: existingMetodos, isLoading: metodosLoading } = useMetodosByBanco(banco?.id ?? '')
  // PR-3c.2: deducciones de TODOS los metodos existentes del banco, en una
  // sola query reactiva agrupada por metodo_cobro_id (useDeduccionesPorMetodos
  // ya memoiza internamente la clave de ids inestable).
  const {
    deduccionesPorMetodo,
    isLoading: deduccionesLoading,
    isFetching: deduccionesFetching,
  } = useDeduccionesPorMetodos((existingMetodos ?? []).map((m) => m.id))

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
        setCuentaGastoComisionId(banco.cuenta_gasto_comision_id ?? '')
        setCuentaGastoPasarelaId(banco.cuenta_gasto_pasarela_id ?? '')
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
        setCuentaGastoComisionId('')
        setCuentaGastoPasarelaId('')
        setActive(true)
        setMoneda('USD')
        setSaldoInicial('0')
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, banco])

  // Sync drafts from PowerSync reactively — until the user makes a manual edit.
  // FIX W3 (deferred from 3c.1, re-fixed en review de 3c.2): esta
  // sincronizacion tambien adjunta las deducciones reactivas de
  // `deduccionesPorMetodo` (useDeduccionesPorMetodos). Esa query DEPENDE del
  // resultado de `existingMetodos` (sus ids se derivan de el), asi que existe
  // SIEMPRE un render donde `metodosLoading` ya es `false` pero los datos de
  // deducciones para los ids REALES todavia no llegaron — un guard que solo
  // chequeara `metodosLoading` dejaria pasar ese render y sembraria
  // `metodoDrafts` con deducciones VACIAS para metodos que en realidad si
  // las tienen. Si el usuario toca cualquier campo en esa ventana,
  // `userEdited` se congela en true y el submit interpreta las deducciones
  // ausentes como "removidas", soft-desactivando TODAS las deducciones
  // reales del metodo (persistDeduccionesDeMetodo, perdida de datos
  // silenciosa — hallazgo CRITICAL de review).
  //
  // Por eso el guard chequea `deduccionesLoading` Y `deduccionesFetching`
  // (no alcanza con solo `isLoading`): en @powersync/react, `isLoading` es
  // un flag de UNA SOLA VEZ que pasa a `false` la primera vez que la query
  // resuelve y NUNCA vuelve a `true` cuando sus parametros cambian despues
  // (ver comentario en use-metodo-cobro-deducciones.ts). Como los ids de
  // esta query dependen de `existingMetodos`, su primera resolucion suele
  // ocurrir con `ids=[]` (placeholder) ANTES de que `existingMetodos` cargue
  // — en ese momento `deduccionesLoading` YA quedo permanentemente en
  // `false`, aunque los datos reales aun no llegaron. `isFetching` SI se
  // pone en `true` en el mismo render en que los ids cambian (mecanismo
  // `shouldReportCurrentlyFetching` de @powersync/react) y vuelve a `false`
  // solo cuando los datos nuevos ya estan disponibles — es la señal
  // confiable de "esta query esta siendo re-consultada para los ids
  // reales". El efecto no debe sembrar `metodoDrafts` hasta que NINGUNA de
  // las dos queries (metodos, deducciones) este cargando o refrescando.
  //
  // El guard `userEdited` (ya establecido, seteado por CUALQUIER cambio
  // local — incluidos los de DeduccionesEditor via handleUpdateDraft) sigue
  // siendo lo que evita que un re-sync reactivo posterior (ej. otro tab de
  // la misma empresa guardando algo, sync de PowerSync) pise ediciones
  // locales sin guardar: una vez que el usuario toca cualquier campo, el
  // efecto retorna temprano y nunca vuelve a sobreescribir `metodoDrafts`.
  useEffect(() => {
    if (!isOpen || userEdited || metodosLoading || deduccionesLoading || deduccionesFetching) return
    setMetodoDrafts(
      (existingMetodos ?? []).map((m) => {
        const deduccionesExistentes = (deduccionesPorMetodo.get(m.id) ?? []).map((d) => ({
          id: d.id,
          concepto: d.concepto,
          tipo: d.tipo as TipoDeduccion,
          porcentaje: d.porcentaje,
          cuenta_gasto_id: d.cuenta_gasto_id,
          is_active: d.is_active === 1,
        }))
        // QA fix: un metodo existente sin filas guardadas en
        // metodo_cobro_deducciones mostraba "Sin deducciones configuradas"
        // aunque el banco YA tiene una cuenta base de pasarela resuelta.
        // Mismo shape/criterio que Fix W2a (payment-method-form.tsx:120-128)
        // — se siembra 1 fila con la cuenta REAL (no el sentinel ''), asi
        // el usuario ve de entrada la comision base que se va a aplicar. Si
        // el banco no tiene cuenta pasarela aun, se deja vacio (sin cambio
        // de comportamiento — el sentinel '' se resuelve/valida al guardar).
        if (deduccionesExistentes.length === 0 && cuentaGastoPasarelaId) {
          return {
            _key: m.id,
            id: m.id,
            nombre: m.nombre,
            tipo: m.tipo,
            deposito_directo: m.deposito_directo === 1,
            usa_pos: m.usa_pos === 1,
            usa_cxc: m.usa_cxc === 1,
            usa_cxp: m.usa_cxp === 1,
            is_active: m.is_active === 1,
            consolidar_lotes: m.consolidar_lotes !== 0,
            deducciones: [
              {
                concepto: 'Comision bancaria',
                tipo: 'COMISION' as TipoDeduccion,
                porcentaje: '0',
                cuenta_gasto_id: cuentaGastoPasarelaId,
                is_active: true,
              },
            ],
          }
        }
        return {
          _key: m.id,
          id: m.id,
          nombre: m.nombre,
          tipo: m.tipo,
          deposito_directo: m.deposito_directo === 1,
          usa_pos: m.usa_pos === 1,
          usa_cxc: m.usa_cxc === 1,
          usa_cxp: m.usa_cxp === 1,
          is_active: m.is_active === 1,
          consolidar_lotes: m.consolidar_lotes !== 0,
          deducciones: deduccionesExistentes,
        }
      })
    )
  }, [
    isOpen,
    existingMetodos,
    metodosLoading,
    deduccionesLoading,
    deduccionesFetching,
    userEdited,
    deduccionesPorMetodo,
    cuentaGastoPasarelaId,
  ])

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setMetodoDrafts([])
      setUserEdited(false)
    }
  }, [isOpen])

  function handleAgregarMetodo() {
    setUserEdited(true)
    setMetodoDrafts((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        nombre: '',
        tipo: 'TRANSFERENCIA',
        deposito_directo: false,
        usa_pos: true,
        usa_cxc: true,
        usa_cxp: true,
        is_active: true,
        consolidar_lotes: true,
        // Sentinel '' — el banco puede ser nuevo (cuenta pasarela aun no
        // existe), se resuelve en handleSubmit contra cuentaGastoPasarelaFinal.
        deducciones: [
          { concepto: 'Comision bancaria', tipo: 'COMISION', porcentaje: '0', cuenta_gasto_id: '', is_active: true },
        ],
      },
    ])
  }

  function handleUpdateDraft(idx: number, updated: MetodoDraft) {
    setUserEdited(true)
    setMetodoDrafts((prev) => prev.map((d, i) => (i === idx ? updated : d)))
  }

  function handleRemoveDraft(idx: number) {
    setUserEdited(true)
    setMetodoDrafts((prev) => prev.filter((_, i) => i !== idx))
  }

  /**
   * 0081 (PR-2b): crea hasta 3 cuentas segun `opts`: la cuenta de activo
   * (1.1.xx BANCO {nombre}), la leaf de comision BANCARIA (bajo el grupo
   * `Comisiones Bancarias`, cuentas_config['GRUPO_COMISIONES_BANCARIAS']) y
   * la leaf BASE de comision de PASARELA (bajo `Comisiones de Pasarelas de
   * Pago`, cuentas_config['GRUPO_COMISIONES_PASARELA']). Reutilizada tanto
   * por el boton manual "Crear Cuenta" como por el auto-creado silencioso en
   * `handleSubmit` — un banco sin las 3 cuentas es un estado invalido del
   * sistema (decision de usuario, ver apply-progress). Idempotente por
   * diseno: el llamador decide que falta crear via `opts`, esta funcion
   * nunca decide por si misma si algo ya existe.
   *
   * Nombre dinamico de cada leaf de comision (PR-3c.2, resuelve tasks.md
   * 4c.2.7): `COMISION BANCARIA {Banco} {Tipo} {ult4}` / `COMISION PASARELA
   * {Banco} {Tipo} {ult4}` (ej. "COMISION PASARELA VENEZUELA CORRIENTE
   * 5546") — el prefijo distingue el proposito de la cuenta y el tipo de
   * cuenta desambigua cuando dos cuentas propias del mismo banco comparten
   * los mismos ultimos 4 digitos (SC-28). Solo aplica a bancos creados o
   * editados desde este cambio en adelante — los backfilleados por la
   * migracion 0081 conservan el nombre viejo sin prefijo (decision de
   * usuario, sin migracion de rename).
   */
  async function crearCuentasDelBanco(
    datos: { nombreBanco: string; nroCuenta: string; tipoCuenta?: string },
    opts: { crearActivo: boolean; crearComisionBancaria: boolean; crearComisionPasarela: boolean }
  ): Promise<{
    cuentaContableId?: string
    cuentaGastoComisionId?: string
    cuentaGastoPasarelaId?: string
    comisionBancariaOmitida: boolean
    comisionPasarelaOmitida: boolean
  }> {
    const resultado: {
      cuentaContableId?: string
      cuentaGastoComisionId?: string
      cuentaGastoPasarelaId?: string
      comisionBancariaOmitida: boolean
      comisionPasarelaOmitida: boolean
    } = {
      comisionBancariaOmitida: false,
      comisionPasarelaOmitida: false,
    }
    if (!user?.empresa_id) return resultado

    if (opts.crearActivo) {
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
      const nombreCuenta = `BANCO ${datos.nombreBanco.trim().toUpperCase()}`

      resultado.cuentaContableId = await crearCuenta({
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
    }

    if (opts.crearComisionBancaria || opts.crearComisionPasarela) {
      const ult4 = datos.nroCuenta.trim().slice(-4)
      const nombreLeafBase = [datos.nombreBanco.trim(), datos.tipoCuenta?.trim(), ult4]
        .filter((parte): parte is string => !!parte)
        .join(' ')
        .toUpperCase()
      const nombreLeafBancaria = `COMISION BANCARIA ${nombreLeafBase}`
      const nombreLeafPasarela = `COMISION PASARELA ${nombreLeafBase}`
      const empresaId = user.empresa_id
      const userId = user.id

      const crearLeafBajoGrupo = async (
        grupo: { id: string; codigo: string; nivel: number },
        nombreLeaf: string
      ): Promise<string | undefined> => {
        await agregarSubcuentaAGrupo({
          grupoId: grupo.id,
          grupoCodigo: grupo.codigo,
          grupoNivel: grupo.nivel,
          nombreSubcuenta: nombreLeaf,
          empresaId,
          userId,
        })

        const leafResult = await db.execute(
          `SELECT id FROM plan_cuentas
           WHERE empresa_id = ? AND parent_id = ? AND nombre = ?
           ORDER BY created_at DESC LIMIT 1`,
          [empresaId, grupo.id, nombreLeaf]
        )
        if (leafResult.rows && leafResult.rows.length > 0) {
          return (leafResult.rows.item(0) as { id: string }).id
        }
        return undefined
      }

      if (opts.crearComisionBancaria) {
        if (grupoComisionesBancarias) {
          resultado.cuentaGastoComisionId = await crearLeafBajoGrupo(grupoComisionesBancarias, nombreLeafBancaria)
        } else {
          resultado.comisionBancariaOmitida = true
        }
      }

      if (opts.crearComisionPasarela) {
        if (grupoComisionesPasarela) {
          resultado.cuentaGastoPasarelaId = await crearLeafBajoGrupo(grupoComisionesPasarela, nombreLeafPasarela)
        } else {
          resultado.comisionPasarelaOmitida = true
        }
      }
    }

    return resultado
  }

  // Coincide con bancoSchema.nro_cuenta.min(5) — evita que el boton manual
  // "Crear Cuenta" genere un nombre de leaf degradado (ult4 vacio) cuando el
  // numero de cuenta aun no fue completado (hallazgo de review 3b.3).
  const NRO_CUENTA_MIN_LENGTH = 5

  /**
   * Avisa (sin bloquear) cuando `crearCuentasDelBanco` no pudo resolver
   * alguno de los 2 grupos-padre via cuentas_config. Compartido por el boton
   * manual "Crear Cuenta" y por `handleSubmit` (CREATE/EDIT) — en ambos casos
   * el banco/cuenta se guarda igual, pero el usuario debe ver que una de las
   * cuentas de comision quedo sin crear/vincular (hallazgo de review 3b.3:
   * antes solo se avisaba desde el boton manual, `handleSubmit` lo descartaba
   * en silencio).
   */
  function avisarComisionesOmitidas(creadas: {
    comisionBancariaOmitida: boolean
    comisionPasarelaOmitida: boolean
  }) {
    if (creadas.comisionBancariaOmitida) {
      toast.warning(
        'No se pudo resolver el grupo de Comisiones Bancarias — la cuenta de comision bancaria no se creo. Verifica la configuracion contable de la empresa (cuentas_config) o aplica la migracion 0081.'
      )
    }
    if (creadas.comisionPasarelaOmitida) {
      toast.warning(
        'No se pudo resolver el grupo de Comisiones de Pasarelas de Pago — la cuenta base de pasarela no se creo. Verifica la configuracion contable de la empresa (cuentas_config) o aplica la migracion 0081.'
      )
    }
  }

  async function handleCrearCuentaContable() {
    if (!nombreBanco.trim()) {
      toast.warning('Ingresa el nombre del banco antes de crear la cuenta contable')
      return
    }
    if (nroCuenta.trim().length < NRO_CUENTA_MIN_LENGTH) {
      toast.warning(`Ingresa el numero de cuenta (minimo ${NRO_CUENTA_MIN_LENGTH} caracteres) antes de crear la(s) cuenta(s)`)
      return
    }
    if (!user?.empresa_id) return

    const necesitaActivo = !cuentaContableId
    const necesitaComisionBancaria = !cuentaGastoComisionId
    const necesitaComisionPasarela = !cuentaGastoPasarelaId
    if (!necesitaActivo && !necesitaComisionBancaria && !necesitaComisionPasarela) return

    setCreandoCuenta(true)
    try {
      const creadas = await crearCuentasDelBanco(
        { nombreBanco, nroCuenta, tipoCuenta },
        {
          crearActivo: necesitaActivo,
          crearComisionBancaria: necesitaComisionBancaria,
          crearComisionPasarela: necesitaComisionPasarela,
        }
      )

      if (creadas.cuentaContableId) setCuentaContableId(creadas.cuentaContableId)
      if (creadas.cuentaGastoComisionId) setCuentaGastoComisionId(creadas.cuentaGastoComisionId)
      if (creadas.cuentaGastoPasarelaId) setCuentaGastoPasarelaId(creadas.cuentaGastoPasarelaId)

      const cantidadCreadas = [
        creadas.cuentaContableId,
        creadas.cuentaGastoComisionId,
        creadas.cuentaGastoPasarelaId,
      ].filter(Boolean).length

      if (cantidadCreadas === 3) {
        toast.success('Cuenta contable, cuenta de comision bancaria y cuenta de comision de pasarela creadas y vinculadas')
      } else if (cantidadCreadas > 0) {
        toast.success('Cuenta(s) creada(s) y vinculada(s)')
      }

      avisarComisionesOmitidas(creadas)
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
      // PR-3c.2 (tasks.md 4c.2.4): hoisteado fuera de las ramas if/else para
      // que el loop "Save method drafts" lo lea ya resuelto en ambos casos
      // (creacion y edicion) — es el valor que resuelve el sentinel '' de
      // DeduccionesEditor (invariante nunca-huerfano, SC-08/SC-30).
      let cuentaGastoPasarelaFinal = cuentaGastoPasarelaId

      if (isEditing && banco) {
        // Modo edicion: NUNCA auto-crear la cuenta de activo (el banco ya
        // existe con su propio flujo). Excepcion puntual: si alguna de las 2
        // cuentas de comision quedo NULL (bancos creados antes de esta
        // feature o de la migracion 0081), se auto-crea SOLO la faltante,
        // una vez, sin duplicar ni tocar la que ya esta vinculada (SC-15).
        let cuentaGastoComisionFinal = cuentaGastoComisionId
        if (!cuentaGastoComisionFinal || !cuentaGastoPasarelaFinal) {
          const creadas = await crearCuentasDelBanco(
            { nombreBanco: parsed.data.nombre_banco, nroCuenta: parsed.data.nro_cuenta, tipoCuenta: parsed.data.tipo_cuenta },
            {
              crearActivo: false,
              crearComisionBancaria: !cuentaGastoComisionFinal,
              crearComisionPasarela: !cuentaGastoPasarelaFinal,
            }
          )
          if (creadas.cuentaGastoComisionId) {
            cuentaGastoComisionFinal = creadas.cuentaGastoComisionId
            setCuentaGastoComisionId(creadas.cuentaGastoComisionId)
          }
          if (creadas.cuentaGastoPasarelaId) {
            cuentaGastoPasarelaFinal = creadas.cuentaGastoPasarelaId
            setCuentaGastoPasarelaId(creadas.cuentaGastoPasarelaId)
          }
          // El banco se actualiza igual (no bloqueante) — el aviso hace
          // visible que alguna cuenta de comision quedo sin resolver
          // (hallazgo de review 3b.3: antes se descartaba en silencio aqui).
          avisarComisionesOmitidas(creadas)
        }

        await updateBanco(banco.id, {
          nombre_banco: parsed.data.nombre_banco,
          nro_cuenta: parsed.data.nro_cuenta,
          tipo_cuenta: parsed.data.tipo_cuenta,
          titular: parsed.data.titular,
          titular_documento: parsed.data.titular_documento,
          cuenta_contable_id: parsed.data.cuenta_contable_id ?? null,
          cuenta_gasto_comision_id: cuentaGastoComisionFinal || null,
          cuenta_gasto_pasarela_id: cuentaGastoPasarelaFinal || null,
          is_active: parsed.data.active,
        })
        bancoId = banco.id
        toast.success('Banco actualizado correctamente')
      } else {
        // Creacion de banco nuevo: un banco sin las 3 cuentas (activo,
        // comision bancaria, comision de pasarela) es un estado invalido del
        // sistema (decision de usuario) — las 3 se auto-crean y vinculan
        // aqui, sin pasos manuales (SC-13). Idempotente: si el usuario ya
        // uso "Crear Cuenta" o selecciono una cuenta existente en algun
        // select, solo se completa lo que falta.
        let cuentaContableFinal = cuentaContableId
        let cuentaGastoComisionFinal = cuentaGastoComisionId
        if (!cuentaContableFinal || !cuentaGastoComisionFinal || !cuentaGastoPasarelaFinal) {
          const creadas = await crearCuentasDelBanco(
            { nombreBanco: parsed.data.nombre_banco, nroCuenta: parsed.data.nro_cuenta, tipoCuenta: parsed.data.tipo_cuenta },
            {
              crearActivo: !cuentaContableFinal,
              crearComisionBancaria: !cuentaGastoComisionFinal,
              crearComisionPasarela: !cuentaGastoPasarelaFinal,
            }
          )
          if (!cuentaContableFinal && creadas.cuentaContableId) {
            cuentaContableFinal = creadas.cuentaContableId
          }
          if (!cuentaGastoComisionFinal && creadas.cuentaGastoComisionId) {
            cuentaGastoComisionFinal = creadas.cuentaGastoComisionId
          }
          if (!cuentaGastoPasarelaFinal && creadas.cuentaGastoPasarelaId) {
            cuentaGastoPasarelaFinal = creadas.cuentaGastoPasarelaId
          }
          // El banco se crea igual (no bloqueante) — el aviso hace visible
          // que alguna cuenta de comision quedo sin resolver, en vez de
          // guardar cuenta_gasto_pasarela_id/cuenta_gasto_comision_id = NULL
          // en silencio (hallazgo de review 3b.3).
          avisarComisionesOmitidas(creadas)
        }

        // Invariante "ningun metodo queda huerfano" (SC-29/30): al garantizar
        // que cuentaGastoPasarelaFinal SIEMPRE quede resuelta antes de crear
        // el banco, cuenta_gasto_pasarela_id nunca es null para un banco
        // recien creado — precondicion que PR-3 (createPaymentMethod) lee
        // como default para vincular en metodo_cobro_deducciones a los
        // metodos que no especifiquen su propia cuenta de pasarela (contrato
        // PR-2b -> PR-3, design.md linea 25). Este archivo no duplica ese
        // insert, solo garantiza la precondicion.
        bancoId = await createBanco({
          nombre_banco: parsed.data.nombre_banco,
          nro_cuenta: parsed.data.nro_cuenta,
          tipo_cuenta: parsed.data.tipo_cuenta,
          titular: parsed.data.titular,
          titular_documento: parsed.data.titular_documento,
          cuenta_contable_id: cuentaContableFinal || undefined,
          cuenta_gasto_comision_id: cuentaGastoComisionFinal || undefined,
          cuenta_gasto_pasarela_id: cuentaGastoPasarelaFinal || undefined,
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
            comision_pct: '0', // deprecado (PR-4 lee metodo_cobro_deducciones)
            usa_pos: draft.usa_pos,
            usa_cxc: draft.usa_cxc,
            usa_cxp: draft.usa_cxp,
            consolidar_lotes: draft.consolidar_lotes,
          })
          // PR-3c.2 (tasks.md 4c.2.6): un writeTransaction por metodo, todo o
          // nada. cuentaBasePasarelaId resuelve el sentinel '' de filas nuevas
          // agregadas durante esta edicion; el throw interno de la funcion es
          // el backstop final del invariante nunca-huerfano.
          await persistDeduccionesDeMetodo({
            metodoCobroId: draft.id,
            empresaId: user!.empresa_id!,
            usuarioId: user!.id,
            cuentaBasePasarelaId: cuentaGastoPasarelaFinal || undefined,
            rows: draft.deducciones,
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
            comision_pct: '0', // deprecado (PR-4 lee metodo_cobro_deducciones)
            usa_pos: draft.usa_pos,
            usa_cxc: draft.usa_cxc,
            usa_cxp: draft.usa_cxp,
            consolidar_lotes: draft.consolidar_lotes,
            empresa_id: user!.empresa_id!,
            usuario_id: user!.id,
            // PR-3c.2 (tasks.md 4c.2.5): resuelve el sentinel '' ANTES de
            // llegar a createPaymentMethod — nunca persiste cuenta_gasto_id
            // vacio (invariante nunca-huerfano, SC-08/SC-30). Si tras
            // resolver contra cuentaGastoPasarelaFinal sigue vacio (caso
            // extremo: la cuenta de pasarela no pudo crearse, ver
            // avisarComisionesOmitidas arriba), se aborta con un error claro
            // en vez de guardar un huerfano en silencio.
            deducciones: draft.deducciones.map((d) => {
              const cuentaGastoId = d.cuenta_gasto_id || cuentaGastoPasarelaFinal
              if (!cuentaGastoId) {
                throw new Error(
                  'No se puede crear el metodo de pago: la deduccion no tiene cuenta de gasto resuelta (invariante nunca-huerfano)'
                )
              }
              return {
                concepto: d.concepto,
                tipo: d.tipo,
                porcentaje: d.porcentaje,
                cuenta_gasto_id: cuentaGastoId,
              }
            }),
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
              Cuenta Contable
            </label>
            <div className="flex gap-2">
              <NativeSelect
                id="banco-cuenta-contable"
                value={cuentaContableId}
                onChange={(e) => setCuentaContableId(e.target.value)}
                className="flex-1"
              >
                <option value="">-- Se creara automaticamente --</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                ))}
              </NativeSelect>
              <button
                type="button"
                onClick={handleCrearCuentaContable}
                disabled={
                  creandoCuenta ||
                  !nombreBanco.trim() ||
                  nroCuenta.trim().length < NRO_CUENTA_MIN_LENGTH ||
                  (!!cuentaContableId && !!cuentaGastoComisionId && !!cuentaGastoPasarelaId)
                }
                title={
                  !nombreBanco.trim()
                    ? 'Ingresa el nombre del banco primero'
                    : nroCuenta.trim().length < NRO_CUENTA_MIN_LENGTH
                      ? `Ingresa el numero de cuenta (minimo ${NRO_CUENTA_MIN_LENGTH} caracteres) primero`
                      : cuentaContableId && cuentaGastoComisionId && cuentaGastoPasarelaId
                        ? 'Las 3 cuentas ya estan vinculadas'
                        : 'Crear ahora la(s) cuenta(s) faltante(s) para este banco'
                }
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                {creandoCuenta ? 'Creando...' : 'Crear Cuenta'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Si no seleccionas una cuenta existente, se crea y vincula automaticamente al guardar el banco.
              Tambien puedes usar "Crear Cuenta" para generarla antes de guardar.
            </p>
          </div>

          {/* Cuenta de Comision Bancaria (0080/0081) */}
          <div>
            <label htmlFor="banco-cuenta-comision" className="block text-sm font-medium text-gray-700 mb-1">
              Cuenta de Comision Bancaria
            </label>
            <NativeSelect
              id="banco-cuenta-comision"
              value={cuentaGastoComisionId}
              onChange={(e) => setCuentaGastoComisionId(e.target.value)}
            >
              <option value="">-- Se creara automaticamente --</option>
              {cuentasGasto.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
              ))}
            </NativeSelect>
            <p className="text-xs text-gray-500 mt-1">
              Cuenta de gasto financiero usada por defecto para deducciones bancarias (mantenimiento,
              transferencia, etc.) de los metodos de pago de este banco. Si no seleccionas una cuenta
              existente, se crea y vincula automaticamente al guardar el banco. Puedes reasignarla aqui a
              otra cuenta de gasto sin afectar la cuenta de pasarela ni las deducciones ya configuradas.
            </p>
          </div>

          {/* Cuenta de Comision de Pasarela de Pago (0081, PR-2b) */}
          <div>
            <label htmlFor="banco-cuenta-pasarela" className="block text-sm font-medium text-gray-700 mb-1">
              Cuenta de Comision de Pasarela de Pago
            </label>
            <NativeSelect
              id="banco-cuenta-pasarela"
              value={cuentaGastoPasarelaId}
              onChange={(e) => setCuentaGastoPasarelaId(e.target.value)}
            >
              <option value="">-- Se creara automaticamente --</option>
              {cuentasGasto.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
              ))}
            </NativeSelect>
            <p className="text-xs text-gray-500 mt-1">
              Cuenta BASE de gasto de venta para comisiones de pasarela de pago (POS/tarjetas) de este
              banco. Todos los metodos de pago que no especifiquen su propia cuenta de pasarela comparten
              esta cuenta — ningun metodo queda sin cuenta de comision resuelta. Si no seleccionas una
              cuenta existente, se crea y vincula automaticamente al guardar el banco. Puedes reasignarla
              aqui sin afectar la cuenta de comision bancaria ni las deducciones ya configuradas.
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
                    cuentaBasePasarelaId={cuentaGastoPasarelaId || undefined}
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
