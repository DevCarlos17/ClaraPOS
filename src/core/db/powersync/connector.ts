import {
  AbstractPowerSyncDatabase,
  BaseObserver,
  CrudEntry,
  type PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials,
} from '@powersync/web'

import { type Session, SupabaseClient, createClient } from '@supabase/supabase-js'

export type SupabaseConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  powersyncUrl: string
}

const FATAL_RESPONSE_CODES = [
  new RegExp('^22...$'),
  new RegExp('^23...$'),
  new RegExp('^42501$'),
]

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

    let lastOp: CrudEntry | null = null
    try {
      for (const op of transaction.crud) {
        lastOp = op
        const table = this.client.from(op.table)
        let result: { error: { message: string; code?: string; details?: string; hint?: string } | null }

        switch (op.op) {
          case UpdateType.PUT: {
            const record = { ...op.opData, id: op.id }
            result = await table.upsert(record)
            break
          }
          case UpdateType.PATCH:
            result = await table.update(op.opData).eq('id', op.id)
            break
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
