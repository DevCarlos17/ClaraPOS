import { useEffect } from 'react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { registrarCitaLog } from './use-cita-log'
import { useAgendaConfig } from './use-agenda-config'

const POLL_INTERVAL_MS = 60 * 1000

/**
 * Detects RESERVADA appointments that exceed the no-show tolerance window
 * and automatically transitions them to NO_SHOW status.
 * Safe to call multiple times — subsequent calls are no-ops if already running.
 */
export function useNoshowDetector() {
  const { user } = useCurrentUser()
  const { config } = useAgendaConfig()
  const empresaId = user?.empresa_id ?? ''
  const userId = user?.id ?? ''

  useEffect(() => {
    if (!empresaId || !userId || config.tolerancia_noshow_min <= 0) return

    const detectar = async () => {
      const toleranciaMs = config.tolerancia_noshow_min * 60 * 1000
      const limiteStr = new Date(Date.now() - toleranciaMs).toISOString()

      // NOT EXISTS evita loguear NO_SHOW duplicados si PowerSync revierte
      // el UPDATE local antes de que Supabase confirme el cambio de status.
      const citas = await db.getAll<{ id: string }>(
        `SELECT c.id FROM citas c
         WHERE c.empresa_id = ?
           AND c.cita_status = 'RESERVADA'
           AND c.fecha_inicio < ?
           AND NOT EXISTS (
             SELECT 1 FROM cita_log l
             WHERE l.cita_id = c.id AND l.accion = 'NO_SHOW'
           )`,
        [empresaId, limiteStr]
      )

      for (const cita of citas) {
        try {
          await db.writeTransaction(async (tx) => {
            await tx.execute(
              `UPDATE citas SET cita_status = 'NO_SHOW', updated_at = ?, updated_by = ? WHERE id = ?`,
              [new Date().toISOString(), userId, cita.id]
            )
          })
          await registrarCitaLog({
            empresaId,
            citaId: cita.id,
            usuarioId: userId,
            accion: 'NO_SHOW',
            datosAnteriores: { cita_status: 'RESERVADA' },
            datosNuevos: {
              cita_status: 'NO_SHOW',
              detectado_automaticamente: true,
              tolerancia_min: config.tolerancia_noshow_min,
            },
          })
        } catch (err) {
          console.error('[NoshowDetector] Error al marcar NO_SHOW para cita:', cita.id, err)
        }
      }
    }

    void detectar()
    const interval = setInterval(() => void detectar(), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [empresaId, userId, config.tolerancia_noshow_min])
}
