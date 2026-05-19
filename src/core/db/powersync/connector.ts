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
const TABLE_NATURAL_KEYS: Record<string, string> = {
  horarios_staff: 'empresa_id,usuario_id,dia_semana',
}

// Columnas BOOLEAN en Supabase que SQLite almacena como 0/1
// El connector convierte integers a booleans antes de enviar a Supabase
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  horarios_staff: ['is_active', 'cruza_medianoche'],
}

// Columnas que NO se deben actualizar en un UPDATE (son inmutables o son el filtro del match)
const IMMUTABLE_COLUMNS: Record<string, string[]> = {
  horarios_staff: ['created_at', 'empresa_id', 'usuario_id', 'dia_semana'],
}

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

export type SupabaseConnectorListener = {
  initialized: () => void
  sessionStarted: (session: Session) => void
}

export class SupabaseConnector
  extends BaseObserver<SupabaseConnectorListener>
  implements PowerSyncBackendConnector
{
  readonly client: SupabaseClient
  readonly config: SupabaseConfig

  ready: boolean
  currentSession: Session | null

  constructor() {
    super()
    this.config = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      powersyncUrl: import.meta.env.VITE_POWERSYNC_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    }

    this.client = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
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

    try {
      const projectId = new URL(this.config.supabaseUrl).hostname.split('.')[0]
      const storageKey = `sb-${projectId}-auth-token`
      const storedData = localStorage.getItem(storageKey)

      if (storedData) {
        const parsed = JSON.parse(storedData)
        this.updateSession(parsed)
      }
    } catch (error) {
      console.warn('No se pudo cargar sesion de localStorage:', error)
    }

    this.ready = true
    this.iterateListeners((cb) => cb.initialized?.())
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
    if (!navigator.onLine) {
      if (this.currentSession) {
        return {
          endpoint: this.config.powersyncUrl,
          token: this.currentSession.access_token ?? '',
        } satisfies PowerSyncCredentials
      }

      throw new Error('Sin sesion disponible. Conecta a internet e inicia sesion.')
    }

    const {
      data: { session },
      error,
    } = await this.client.auth.getSession()

    if (!session || error) {
      throw new Error(`No se pudo obtener credenciales: ${error}`)
    }

    return {
      endpoint: this.config.powersyncUrl,
      token: session.access_token ?? '',
    } satisfies PowerSyncCredentials
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()

    if (!transaction) {
      return
    }

    console.log('⬆️ [PowerSync upload] Procesando transaccion con', transaction.crud.length, 'operaciones')

    let lastOp: CrudEntry | null = null
    try {
      for (const op of transaction.crud) {
        lastOp = op
        console.log('⬆️ [PowerSync upload] Op:', op.op, op.table, op.id)

        // Validacion de identidad fiscal (middle layer)
        if (op.op === UpdateType.PUT) {
          if (op.table === 'clientes') {
            const identificacion = String(op.opData?.identificacion ?? '')
            if (!isValidCedula(identificacion)) {
              console.error('[PowerSync upload] FATAL - identificacion invalida en clientes:', identificacion)
              await transaction.complete()
              return
            }
          }
          if (op.table === 'proveedores') {
            const rif = String(op.opData?.rif ?? '')
            if (!isValidRif(rif)) {
              console.error('[PowerSync upload] FATAL - RIF invalido en proveedores:', rif)
              await transaction.complete()
              return
            }
          }
          if (op.table === 'ventas') {
            const depositoId = op.opData?.deposito_id
            if (!depositoId) {
              console.error('[PowerSync upload] FATAL - deposito_id nulo en ventas, descartando:', op.id)
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
                console.log('⬆️ [upload PUT horarios_staff] matchFilter:', matchFilter, '| payload:', updatePayload)
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
                if (op.table === 'horarios_staff') console.log('⬆️ [upload PUT horarios_staff] 0 filas por clave natural → INSERT id:', op.id)
                const insertRecord = convertBooleans(op.table, record as Record<string, unknown>)
                const insertResult = await table.insert(insertRecord)
                if (op.table === 'horarios_staff') {
                  if (insertResult.error) console.error('⬆️ [upload PUT horarios_staff] INSERT error:', insertResult.error)
                  else console.log('⬆️ [upload PUT horarios_staff] INSERT OK')
                }
                result = insertResult
              } else {
                if (op.table === 'horarios_staff') console.log('⬆️ [upload PUT horarios_staff] UPDATE OK, filas afectadas:', updatedRows.length, '| ids Supabase:', updatedRows.map((r: any) => r.id))
                result = { error: null }
              }
            } else {
              result = await table.upsert(record)
            }
            break
          }
          case UpdateType.PATCH: {
            const naturalKey = TABLE_NATURAL_KEYS[op.table]
            const patchPayload = convertBooleans(op.table, op.opData as Record<string, unknown>)

            if (naturalKey) {
              // Para tablas con clave natural: intentar por UUID primero,
              // luego caer en clave natural si no se encontro la fila.
              // Ocurre cuando el UUID local no llego a Supabase (ciclo PUT previo
              // actualizo por clave natural manteniendo el UUID de Supabase).
              if (op.table === 'horarios_staff') {
                console.log('⬆️ [upload PATCH horarios_staff] id:', op.id, '| payload:', patchPayload)
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
                  console.log('⬆️ [upload PATCH horarios_staff] fallback matchFilter:', matchFilter)
                  const fallbackResult = await table.update(patchPayload).match(matchFilter)
                  if (op.table === 'horarios_staff') {
                    if (fallbackResult.error) console.error('⬆️ [upload PATCH horarios_staff] fallback error:', fallbackResult.error)
                    else console.log('⬆️ [upload PATCH horarios_staff] fallback OK')
                  }
                  result = fallbackResult
                } else {
                  if (op.table === 'horarios_staff') console.error('⬆️ [upload PATCH horarios_staff] fila local no encontrada para id:', op.id)
                  result = { error: null }
                }
              } else {
                if (op.table === 'horarios_staff') console.log('⬆️ [upload PATCH horarios_staff] UPDATE por UUID OK')
                result = { error: null }
              }
            } else {
              result = await table.update(patchPayload).eq('id', op.id)
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
    } catch (ex: unknown) {
      const error = ex as { code?: string; message?: string }
      const isFatal =
        typeof error.code === 'string' &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(error.code!))

      if (isFatal) {
        console.error('[PowerSync upload] FATAL - descartando operacion:', {
          op: lastOp,
          code: error.code,
          message: error.message,
        })
        await transaction.complete()
      } else {
        console.error('[PowerSync upload] Error transitorio - reintentando:', {
          op: lastOp,
          code: error.code,
          message: error.message,
        })
        throw ex
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
