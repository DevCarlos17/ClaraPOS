import {
  AbstractPowerSyncDatabase,
  BaseObserver,
  CrudEntry,
  type PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials,
} from '@powersync/web'

import { type Session, SupabaseClient, createClient } from '@supabase/supabase-js'
import { isValidCedula, isValidRif } from '@/lib/identity'
import { uploadRetryStore } from '@/lib/upload-retry-store'

/**
 * Logging de la capa de sincronización, solo en desarrollo.
 * En producción no ensucia la consola del cliente; en dev conserva la
 * trazabilidad del upload PowerSync → Supabase para diagnosticar syncs fallidos.
 */
function debugLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args)
}

export type SupabaseConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  powersyncUrl: string
}

const FATAL_RESPONSE_CODES = [
  new RegExp('^22...$'),  // Data exception (valor inválido, overflow, etc.)
  new RegExp('^23...$'),  // Integrity constraint violation (FK, unique, not null)
  new RegExp('^42501$'),  // Insufficient privilege (RLS)
  new RegExp('^P0001$'),  // RAISE EXCEPTION de trigger/función PL/pgSQL (rechazo de lógica de negocio)
]

// Tablas con clave natural única distinta al PK (empresa_id+usuario_id+dia_semana, etc.)
// Para estas tablas el PUT usa onConflict para hacer upsert real en lugar de insertar y fallar
//
// inventario_stock: clave natural UNIQUE(empresa_id, producto_id, deposito_id)
// (migrations/0004_inventario.sql, `uq_stock_empresa_producto_deposito`). Sin esta entrada,
// dos filas locales distintas para el MISMO (empresa,producto,deposito) — ej. el backfill de
// arranque (recalcularStockDesdeKardex) y una compra multi-deposito casi simultánea, cada una
// con su propio UUID local — generan dos PUT independientes. El upsert genérico (por `id`) no
// detecta el conflicto real y el segundo PUT choca contra la constraint UNIQUE en Supabase
// (23505 duplicate key), PowerSync lo descarta como FATAL y el registro local diverge del
// servidor. Con clave natural, el PUT intenta UPDATE por (empresa_id,producto_id,deposito_id)
// primero — si ya existe una fila con esa clave (de cualquier origen), converge sobre ella en
// vez de intentar un segundo INSERT.
const TABLE_NATURAL_KEYS: Record<string, string> = {
  horarios_staff: 'empresa_id,usuario_id,dia_semana',
  inventario_stock: 'empresa_id,producto_id,deposito_id',
}

// Columnas BOOLEAN en Supabase que SQLite almacena como 0/1
// El connector convierte integers a booleans antes de enviar a Supabase
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  horarios_staff: ['is_active', 'cruza_medianoche'],
  citas: ['ejecucion_paralela'],
}

// Columnas que NO se deben actualizar en un UPDATE (son inmutables o son el filtro del match)
const IMMUTABLE_COLUMNS: Record<string, string[]> = {
  horarios_staff: ['created_at', 'empresa_id', 'usuario_id', 'dia_semana'],
  // inventario_stock no tiene created_at — la clave natural completa ya viaja en
  // TABLE_NATURAL_KEYS y se excluye automáticamente del payload de UPDATE, pero se
  // repite aquí explícitamente para que quede documentado en el mismo lugar que
  // horarios_staff (ninguna columna adicional a proteger además de la clave).
  inventario_stock: ['empresa_id', 'producto_id', 'deposito_id'],
}

// Columnas gestionadas por triggers de PostgreSQL — se actualizan server-side
// como efecto secundario de INSERTs en otras tablas.
// El conector las stripea del PATCH antes de subir para evitar que el trigger
// levante P0001 al recibir un UPDATE directo.
// (La escritura local en SQLite sigue ocurriendo para mantener la UI reactiva.)
const TRIGGER_MANAGED_PATCH_COLUMNS: Record<string, string[]> = {
  // saldo_actual se actualiza via trigger actualizar_saldo_cliente
  // disparado por INSERT en movimientos_cuenta
  clientes: ['saldo_actual'],
}

// Tablas con triggers PostgreSQL que bloquean UPDATE (total o parcialmente).
// Para estas tablas, un PUT de reintento usa INSERT ... ON CONFLICT DO NOTHING
// en lugar del upsert estándar (INSERT ... ON CONFLICT DO UPDATE).
// Esto previene que el trigger de inmutabilidad dispare como error fatal P0001
// cuando PowerSync reintenta cargar una operación ya persistida en Supabase.
const IMMUTABLE_TABLES = new Set([
  'movimientos_inventario',       // trg_kardex_no_update
  'movimientos_cuenta',           // trg_mov_cuenta_no_update
  'movimientos_cuenta_proveedor', // trg_mov_cuenta_prov_no_update
  'tasas_cambio',                 // trg_tasas_cambio_no_update
  'ventas_det',                   // trg_ventas_det_no_update
  'pagos',                        // trg_pagos_no_update
  'notas_credito',                // trg_notas_credito_no_update
  'notas_credito_det',            // trg_nc_det_no_update
  'notas_debito',                 // trg_notas_debito_no_update
  'notas_debito_det',             // trg_nd_det_no_update
  'facturas_compra_det',          // trg_fact_compra_det_no_update
  'retenciones_iva',              // trg_ret_iva_compra_protect
  'retenciones_islr',             // trg_ret_islr_compra_protect
  'retenciones_iva_ventas',       // trigger inmutabilidad retenciones ventas
  'retenciones_islr_ventas',      // trigger inmutabilidad retenciones ventas
  'notas_fiscales_compra',        // trg_nf_compra_no_update
  'notas_fiscales_compra_det',    // trg_nf_compra_det_no_update
  'libro_contable',               // trg_libro_contable_protect
])

function convertBooleans(table: string, payload: Record<string, unknown>): Record<string, unknown> {
  const boolCols = BOOLEAN_COLUMNS[table]
  if (!boolCols) return payload
  const result = { ...payload }
  for (const col of boolCols) {
    if (col in result) {
      result[col] = result[col] === 1 || result[col] === true
    }
  }
  return result
}

export type UploadFailedInfo = {
  table: string
  op: string
  id: string
  code: string
  message: string
  /** Motivo del descarte:
   *  - 'db_error'    → PostgreSQL rechazó el dato (constraint, trigger, RLS)
   *  - 'max_retries' → Se agotaron los reintentos por errores transitorios
   *  - 'validation'  → Dato inválido detectado en el conector antes de enviar
   */
  reason: 'db_error' | 'max_retries' | 'validation'
}

export type SupabaseConnectorListener = {
  initialized: () => void
  sessionStarted: (session: Session) => void
  /**
   * Se emite cuando una operación offline es descartada permanentemente por el servidor.
   * Códigos fatales: 22xxx (data exception), 23xxx (constraint violation),
   * 42501 (RLS), P0001 (trigger raise exception).
   * El registro existe en SQLite local pero NO en Supabase — el usuario debe re-ingresar el dato.
   */
  uploadFailed: (info: UploadFailedInfo) => void
}

export class SupabaseConnector
  extends BaseObserver<SupabaseConnectorListener>
  implements PowerSyncBackendConnector
{
  readonly client: SupabaseClient
  readonly config: SupabaseConfig

  ready: boolean
  currentSession: Session | null

  /**
   * Suscripción al onAuthStateChange de supabase-js. Se guarda para poder
   * limpiarla y, sobre todo, para no registrar listeners duplicados si init()
   * se llegara a invocar más de una vez (ver guard eager de `ready` en init()).
   */
  private authSubscription: { unsubscribe: () => void } | null = null

  /**
   * Reintentos por transacción (clave = ID del primer op de la tx).
   * Permite abandonar transacciones que fallan repetidamente con errores
   * transitorios (red caída, token expirado) en lugar de bloquear la cola.
   *
   * El conteo se persiste vía `uploadRetryStore` (localStorage) en lugar de
   * memoria: PowerSync re-invoca `uploadData` en cada arranque de la app,
   * y un contador en memoria se resetearía en cada reload, permitiendo que
   * un error transitorio recurrente bloquee la cola de sync para siempre.
   */
  private readonly MAX_UPLOAD_RETRIES = 5

  constructor() {
    super()
    this.config = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      powersyncUrl: import.meta.env.VITE_POWERSYNC_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    }

    this.client = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: {
        // persistSession: guarda la sesión (incluido refresh_token) en localStorage
        // para sobrevivir reloads y cierres de la PWA.
        persistSession: true,
        // autoRefreshToken: true (default) — supabase-js corre un timer que renueva
        // el access_token ANTES de que expire (JWT vive 1h) y también al reconectar
        // tras estar offline. Es el ÚNICO mecanismo de refresh: NO refrescar a mano
        // en paralelo, porque la rotación de refresh tokens está activada en el
        // proyecto (un token rotado invalida el anterior → refresh concurrente = logout).
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
    this.currentSession = null
    this.ready = false
  }

  async init() {
    if (this.ready) {
      return
    }
    // Guard EAGER: marcamos ready ANTES del primer await. init() se invoca desde
    // varios lugares (bootstrap en main.tsx, PowerSyncProvider, AuthProvider). Como
    // son async y ceden el event loop en el await de getSession(), un flag seteado
    // recién al final dejaría pasar llamadas concurrentes → doble getSession() y,
    // peor, doble suscripción a onAuthStateChange. Setearlo acá hace el guard atómico.
    this.ready = true

    try {
      // getSession() lee la sesión persistida desde localStorage. Funciona OFFLINE
      // (no hace request de red): devuelve la sesión guardada aunque el access_token
      // esté vencido. supabase-js la refresca solo cuando vuelva la conexión.
      // Reemplaza la lectura manual de localStorage, que no validaba expiración y
      // duplicaba (mal) la lógica interna de supabase-js.
      const {
        data: { session },
      } = await this.client.auth.getSession()

      if (session) {
        this.updateSession(session)
      }
    } catch (error) {
      console.warn('No se pudo cargar sesion persistida:', error)
    }

    // onAuthStateChange: mantiene currentSession sincronizado con los refreshes
    // automáticos de supabase-js. Sin esto, cuando el timer interno renueva el
    // access_token, el connector seguiría usando el token viejo hasta el próximo
    // reload. TOKEN_REFRESHED/SIGNED_IN/INITIAL_SESSION actualizan; SIGNED_OUT limpia.
    // Guardamos la suscripción para evitar duplicados y permitir cleanup.
    // Defensa extra: si ya había una suscripción (init() reentrante), la liberamos.
    this.authSubscription?.unsubscribe()
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this.currentSession = null
        return
      }
      if (session) {
        this.updateSession(session)
      }
    })
    this.authSubscription = subscription

    this.iterateListeners((cb) => cb.initialized?.())
  }

  /**
   * Libera la suscripción a onAuthStateChange. Para un singleton que vive toda la
   * app no es estrictamente necesario, pero evita listeners colgados en escenarios
   * de teardown (tests, hot-reload) y documenta el ciclo de vida de la suscripción.
   */
  dispose() {
    this.authSubscription?.unsubscribe()
    this.authSubscription = null
  }

  async login(username: string, password: string) {
    const {
      data: { session },
      error,
    } = await this.client.auth.signInWithPassword({
      email: username,
      password: password,
    })

    if (error) {
      throw error
    }

    this.updateSession(session)
  }

  async registerOwner(nombre: string, email: string, password: string, nombreEmpresa: string) {
    const res = await fetch(`${this.config.supabaseUrl}/functions/v1/register-owner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.supabaseAnonKey,
        Authorization: `Bearer ${this.config.supabaseAnonKey}`,
      },
      body: JSON.stringify({ nombre, email, password, nombre_empresa: nombreEmpresa }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? 'Error al registrar')
    }
    return data as { success: boolean; userId: string; empresaId: string }
  }

  async createEmployee(
    nombre: string,
    email: string,
    password: string,
    rolId: string,
    telefono?: string
  ) {
    if (!this.currentSession) throw new Error('No hay sesion activa')

    const res = await fetch(`${this.config.supabaseUrl}/functions/v1/create-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.supabaseAnonKey,
        Authorization: `Bearer ${this.currentSession.access_token}`,
      },
      body: JSON.stringify({ nombre, email, password, rol_id: rolId, telefono }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? 'Error al crear empleado')
    }
    return data as { success: boolean; userId: string }
  }

  async updateEmployee(
    userId: string,
    updates: { rol_id?: string; is_active?: boolean; nombre?: string; telefono?: string; password?: string }
  ) {
    if (!this.currentSession) throw new Error('No hay sesion activa')

    const res = await fetch(`${this.config.supabaseUrl}/functions/v1/update-employee`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.supabaseAnonKey,
        Authorization: `Bearer ${this.currentSession.access_token}`,
      },
      body: JSON.stringify({ userId, ...updates }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? 'Error al actualizar empleado')
    }
    return data as { success: boolean }
  }

  async createRole(nombre: string, descripcion: string, permisoIds: string[]) {
    if (!this.currentSession) throw new Error('No hay sesion activa')

    const res = await fetch(`${this.config.supabaseUrl}/functions/v1/create-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.supabaseAnonKey,
        Authorization: `Bearer ${this.currentSession.access_token}`,
      },
      body: JSON.stringify({ nombre, descripcion, permiso_ids: permisoIds }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? 'Error al crear rol')
    }
    return data as { success: boolean; roleId: string }
  }

  async logout() {
    await this.client.auth.signOut()
    this.updateSession(null)
  }

  async fetchCredentials() {
    // getSession() lee de localStorage y funciona online y offline sin lógica
    // condicional. Online y con token por vencer, supabase-js lo refresca acá
    // mismo (autoRefreshToken:true). Offline devuelve la sesión persistida con el
    // token actual (posiblemente vencido): PowerSync no podrá conectar al servicio
    // de sync mientras no haya red, pero NO desloguea al usuario — reintenta
    // fetchCredentials al reconectar. El error solo se lanza si NO hay sesión.
    const {
      data: { session },
      error,
    } = await this.client.auth.getSession()

    if (!session || error) {
      throw new Error('Sin sesion disponible. Conecta a internet e inicia sesion.')
    }

    // Offline con token ya vencido: lanzar en vez de devolver credenciales muertas.
    // Devolver un token expirado haría que PowerSync intente conectar, reciba 401 y
    // pueda reintentar en caliente (quema batería del dispositivo del cajero). Al
    // lanzar, PowerSync aplica backoff y reintenta fetchCredentials al reconectar,
    // momento en que autoRefreshToken ya habrá renovado el access_token.
    const isExpired = session.expires_at ? Date.now() / 1000 >= session.expires_at : false
    if (!navigator.onLine && isExpired) {
      throw new Error('Sin conexion y token vencido — reintentando al reconectar.')
    }

    return {
      endpoint: this.config.powersyncUrl,
      token: session.access_token ?? '',
      // expiresAt permite a PowerSync pre-renovar credenciales ~30s antes de
      // que el token expire, evitando un hueco de autenticación durante el sync.
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    } satisfies PowerSyncCredentials
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()

    if (!transaction) {
      return
    }

    debugLog('⬆️ [PowerSync upload] Procesando transaccion con', transaction.crud.length, 'operaciones')

    // Clave estable para esta transacción a través de reintentos
    const txKey = transaction.crud[0]?.id ?? 'tx_unknown'
    const retryCount = uploadRetryStore.get(txKey)

    let lastOp: CrudEntry | null = null
    try {
      for (const op of transaction.crud) {
        lastOp = op
        debugLog('⬆️ [PowerSync upload] Op:', op.op, op.table, op.id)

        // Validacion de identidad fiscal (middle layer)
        if (op.op === UpdateType.PUT) {
          if (op.table === 'clientes') {
            const identificacion = String(op.opData?.identificacion ?? '')
            if (!isValidCedula(identificacion)) {
              console.error('[PowerSync upload] FATAL - identificacion invalida en clientes:', identificacion)
              this.iterateListeners((cb) => cb.uploadFailed?.({
                table: op.table, op: op.op, id: op.id,
                code: 'VALIDATION', message: `Cédula inválida: ${identificacion}`,
                reason: 'validation',
              }))
              uploadRetryStore.clear(txKey)
              await transaction.complete()
              return
            }
          }
          if (op.table === 'proveedores') {
            const rif = String(op.opData?.rif ?? '')
            if (!isValidRif(rif)) {
              console.error('[PowerSync upload] FATAL - RIF invalido en proveedores:', rif)
              this.iterateListeners((cb) => cb.uploadFailed?.({
                table: op.table, op: op.op, id: op.id,
                code: 'VALIDATION', message: `RIF inválido: ${rif}`,
                reason: 'validation',
              }))
              uploadRetryStore.clear(txKey)
              await transaction.complete()
              return
            }
          }
          if (op.table === 'ventas') {
            const depositoId = op.opData?.deposito_id
            if (!depositoId) {
              console.error('[PowerSync upload] FATAL - deposito_id nulo en ventas, descartando:', op.id)
              this.iterateListeners((cb) => cb.uploadFailed?.({
                table: op.table, op: op.op, id: op.id,
                code: 'VALIDATION', message: 'Venta sin depósito asignado',
                reason: 'validation',
              }))
              uploadRetryStore.clear(txKey)
              await transaction.complete()
              return
            }
          }
        }

        const table = this.client.from(op.table)
        let result: { error: { message: string; code?: string; details?: string; hint?: string } | null }

        switch (op.op) {
          case UpdateType.PUT: {
            const record = { ...op.opData, id: op.id }
            const naturalKey = TABLE_NATURAL_KEYS[op.table]

            if (naturalKey) {
              // Para tablas con clave natural: UPDATE primero, INSERT si no existe.
              // El upsert estandar intenta actualizar el PK (id) en conflictos,
              // lo que viola FKs en tablas hijas (ej. horarios_descansos).
              const keyColumns = naturalKey.split(',').map((k) => k.trim())
              const matchFilter: Record<string, unknown> = {}
              for (const k of keyColumns) {
                matchFilter[k] = record[k as keyof typeof record]
              }
              // Excluir 'id', columnas de match y columnas inmutables del payload de actualizacion
              const immutable = new Set(['id', ...keyColumns, ...(IMMUTABLE_COLUMNS[op.table] ?? [])])
              let updatePayload = { ...op.opData } as Record<string, unknown>
              for (const col of immutable) {
                delete updatePayload[col]
              }
              // Convertir enteros 0/1 a booleanos para columnas BOOLEAN en Supabase
              updatePayload = convertBooleans(op.table, updatePayload)

              if (op.table === 'horarios_staff') {
                debugLog('⬆️ [upload PUT horarios_staff] matchFilter:', matchFilter, '| payload:', updatePayload)
              }

              const { data: updatedRows, error: updateErr } = await table
                .update(updatePayload)
                .match(matchFilter)
                .select('id')

              if (updateErr) {
                if (op.table === 'horarios_staff') console.error('⬆️ [upload PUT horarios_staff] UPDATE error:', updateErr)
                result = { error: updateErr }
              } else if (!updatedRows || updatedRows.length === 0) {
                // No existe en Supabase → INSERT con el UUID del cliente
                if (op.table === 'horarios_staff') debugLog('⬆️ [upload PUT horarios_staff] 0 filas por clave natural → INSERT id:', op.id)
                const insertRecord = convertBooleans(op.table, record as Record<string, unknown>)
                const insertResult = await table.insert(insertRecord)
                if (op.table === 'horarios_staff') {
                  if (insertResult.error) console.error('⬆️ [upload PUT horarios_staff] INSERT error:', insertResult.error)
                  else debugLog('⬆️ [upload PUT horarios_staff] INSERT OK')
                }
                result = insertResult
              } else {
                if (op.table === 'horarios_staff') debugLog('⬆️ [upload PUT horarios_staff] UPDATE OK, filas afectadas:', updatedRows.length, '| ids Supabase:', updatedRows.map((r: any) => r.id))
                result = { error: null }
              }
            } else {
              const convertedRecord = convertBooleans(op.table, record as Record<string, unknown>)
              result = IMMUTABLE_TABLES.has(op.table)
                ? await table.upsert(convertedRecord, { ignoreDuplicates: true })
                : await table.upsert(convertedRecord)
            }
            break
          }
          case UpdateType.PATCH: {
            const naturalKey = TABLE_NATURAL_KEYS[op.table]
            let patchPayload = convertBooleans(op.table, op.opData as Record<string, unknown>)

            // Strip columns managed by server-side triggers (updated automatically
            // as a side-effect of INSERTs in other tables; direct UPDATE is rejected with P0001)
            const triggerManagedCols = TRIGGER_MANAGED_PATCH_COLUMNS[op.table]
            if (triggerManagedCols?.length) {
              patchPayload = Object.fromEntries(
                Object.entries(patchPayload).filter(([k]) => !triggerManagedCols.includes(k))
              )
              // If nothing left to update, skip the PATCH entirely
              if (Object.keys(patchPayload).length === 0) {
                result = { error: null }
                break
              }
            }

            if (naturalKey) {
              // Para tablas con clave natural: intentar por UUID primero,
              // luego caer en clave natural si no se encontro la fila.
              // Ocurre cuando el UUID local no llego a Supabase (ciclo PUT previo
              // actualizo por clave natural manteniendo el UUID de Supabase).
              if (op.table === 'horarios_staff') {
                debugLog('⬆️ [upload PATCH horarios_staff] id:', op.id, '| payload:', patchPayload)
              }

              const { data: updatedRows, error: patchErr } = await table
                .update(patchPayload)
                .eq('id', op.id)
                .select('id')

              if (patchErr) {
                if (op.table === 'horarios_staff') console.error('⬆️ [upload PATCH horarios_staff] error:', patchErr)
                result = { error: patchErr }
              } else if (!updatedRows || updatedRows.length === 0) {
                if (op.table === 'horarios_staff') console.warn('⬆️ [upload PATCH horarios_staff] 0 filas por UUID → intentando fallback clave natural')
                // 0 filas por UUID → buscar la fila local para obtener la clave natural
                const localRow = await database.getOptional<Record<string, unknown>>(
                  `SELECT * FROM ${op.table} WHERE id = ?`,
                  [op.id]
                )
                if (localRow) {
                  const keyColumns = naturalKey.split(',').map((k) => k.trim())
                  const matchFilter: Record<string, unknown> = {}
                  for (const k of keyColumns) {
                    matchFilter[k] = localRow[k]
                  }
                  debugLog('⬆️ [upload PATCH horarios_staff] fallback matchFilter:', matchFilter)
                  const fallbackResult = await table.update(patchPayload).match(matchFilter)
                  if (op.table === 'horarios_staff') {
                    if (fallbackResult.error) console.error('⬆️ [upload PATCH horarios_staff] fallback error:', fallbackResult.error)
                    else debugLog('⬆️ [upload PATCH horarios_staff] fallback OK')
                  }
                  result = fallbackResult
                } else {
                  if (op.table === 'horarios_staff') console.error('⬆️ [upload PATCH horarios_staff] fila local no encontrada para id:', op.id)
                  result = { error: null }
                }
              } else {
                if (op.table === 'horarios_staff') debugLog('⬆️ [upload PATCH horarios_staff] UPDATE por UUID OK')
                result = { error: null }
              }
            } else {
              // Use select('id') to detect silent 0-row updates (e.g. RLS blocking the update
              // without returning an error). If 0 rows are affected, Supabase will return
              // { data: [], error: null } instead of silently discarding the change.
              const { data: patchedRows, error: patchErr } = await table
                .update(patchPayload)
                .eq('id', op.id)
                .select('id')

              if (patchErr) {
                result = { error: patchErr }
              } else if (!patchedRows || patchedRows.length === 0) {
                // 0 rows affected — most likely causes:
                //   1. Row was deleted in Supabase (ok to ignore)
                //   2. RLS is silently blocking the update (data will NOT persist)
                console.warn(
                  '⬆️ [PowerSync upload] PATCH afecto 0 filas — posible bloqueo RLS o fila eliminada:',
                  { table: op.table, id: op.id }
                )
                result = { error: null }
              } else {
                result = { error: null }
              }
            }
            break
          }
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id)
            break
          default:
            continue
        }

        if (result.error) {
          console.error('[PowerSync upload] Supabase error', {
            table: op.table,
            op: op.op,
            id: op.id,
            opData: op.opData,
            code: result.error.code,
            message: result.error.message,
            details: result.error.details,
            hint: result.error.hint,
          })
          throw result.error
        }
      }

      await transaction.complete()
      uploadRetryStore.clear(txKey)  // éxito — limpiar contador
    } catch (ex: unknown) {
      const error = ex as { code?: string; message?: string }
      const isFatal =
        typeof error.code === 'string' &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(error.code!))

      if (isFatal) {
        console.error('[PowerSync upload] FATAL - descartando operacion:', {
          op: lastOp, code: error.code, message: error.message,
        })
        this.iterateListeners((cb) => cb.uploadFailed?.({
          table: lastOp?.table ?? 'desconocida',
          op: lastOp?.op ?? 'desconocida',
          id: lastOp?.id ?? 'desconocido',
          code: error.code ?? 'desconocido',
          message: error.message ?? 'Error desconocido',
          reason: 'db_error',
        }))
        uploadRetryStore.clear(txKey)
        await transaction.complete()
      } else {
        const attempts = retryCount + 1

        if (attempts >= this.MAX_UPLOAD_RETRIES) {
          // La transacción falló demasiadas veces con errores transitorios.
          // Descartarla para desbloquear la cola y notificar al usuario.
          console.error('[PowerSync upload] MAX REINTENTOS alcanzado - descartando:', {
            txKey, attempts, op: lastOp, code: error.code, message: error.message,
          })
          this.iterateListeners((cb) => cb.uploadFailed?.({
            table: lastOp?.table ?? 'desconocida',
            op: lastOp?.op ?? 'desconocida',
            id: lastOp?.id ?? 'desconocido',
            code: error.code ?? 'desconocido',
            message: error.message ?? 'Error desconocido',
            reason: 'max_retries',
          }))
          uploadRetryStore.clear(txKey)
          await transaction.complete()
        } else {
          uploadRetryStore.bump(txKey)
          console.error(`[PowerSync upload] Error transitorio - reintentando (${attempts}/${this.MAX_UPLOAD_RETRIES}):`, {
            op: lastOp, code: error.code, message: error.message,
          })
          throw ex
        }
      }
    }
  }

  updateSession(session: Session | null) {
    this.currentSession = session
    if (!session) {
      return
    }
    this.iterateListeners((cb) => cb.sessionStarted?.(session))
  }
}

export const connector = new SupabaseConnector()
