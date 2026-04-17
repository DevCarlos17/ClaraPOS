import { hashPin } from '@/lib/crypto'
import { connector } from '@/core/db/powersync/connector'

/**
 * Configura el PIN de supervisor.
 * - Si se omite `targetUserId`, actualiza el PIN del usuario autenticado.
 * - Si se provee `targetUserId`, el admin puede configurar el PIN de otro usuario en su empresa.
 *
 * El hash se calcula en el frontend (nunca viaja el PIN plano por red).
 */
export async function setSupervisorPin(
  pin: string,
  empresaId: string,
  targetUserId?: string
): Promise<void> {
  if (!connector.currentSession) throw new Error('No hay sesion activa')

  const pinHash = await hashPin(pin, empresaId)

  const body: Record<string, string> = { pin_hash: pinHash }
  if (targetUserId) body.user_id = targetUserId

  const res = await fetch(
    `${connector.config.supabaseUrl}/functions/v1/set-supervisor-pin`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: connector.config.supabaseAnonKey,
        Authorization: `Bearer ${connector.currentSession.access_token}`,
      },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error ?? 'Error al configurar el PIN')
  }
}
