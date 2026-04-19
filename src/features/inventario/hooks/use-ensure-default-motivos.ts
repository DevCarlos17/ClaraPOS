import { useEffect, useRef } from 'react'
import { db } from '@/core/db/powersync/db'
import { kysely } from '@/core/db/kysely/kysely'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

/**
 * Verifica si la empresa tiene motivos de ajuste configurados y crea 3 por defecto
 * si no existen: CONTEO FISICO - ENTRADA (SUMA), CONTEO FISICO - SALIDA (RESTA),
 * y AJUSTE DE COSTO (NEUTRO). Los motivos creados tienen es_sistema=1.
 */
export function useEnsureDefaultMotivos(empresaId: string) {
  const seededRef = useRef(false)

  useEffect(() => {
    if (!empresaId || seededRef.current) return

    async function seed() {
      try {
        const result = await kysely
          .selectFrom('ajuste_motivos')
          .select(kysely.fn.count('id').as('total'))
          .where('empresa_id', '=', empresaId)
          .executeTakeFirst()

        const total = Number(result?.total ?? 0)
        if (total > 0) {
          seededRef.current = true
          return
        }

        const now = localNow()
        await db.writeTransaction(async (tx) => {
          await tx.execute(
            `INSERT INTO ajuste_motivos
             (id, empresa_id, nombre, es_sistema, operacion_base, afecta_costo, is_active, created_at, updated_at, created_by)
             VALUES (?, ?, 'CONTEO FISICO - ENTRADA', 1, 'SUMA', 0, 1, ?, ?, NULL)`,
            [uuidv4(), empresaId, now, now]
          )
          await tx.execute(
            `INSERT INTO ajuste_motivos
             (id, empresa_id, nombre, es_sistema, operacion_base, afecta_costo, is_active, created_at, updated_at, created_by)
             VALUES (?, ?, 'CONTEO FISICO - SALIDA', 1, 'RESTA', 0, 1, ?, ?, NULL)`,
            [uuidv4(), empresaId, now, now]
          )
          await tx.execute(
            `INSERT INTO ajuste_motivos
             (id, empresa_id, nombre, es_sistema, operacion_base, afecta_costo, is_active, created_at, updated_at, created_by)
             VALUES (?, ?, 'AJUSTE DE COSTO', 1, 'NEUTRO', 1, 1, ?, ?, NULL)`,
            [uuidv4(), empresaId, now, now]
          )
        })
        seededRef.current = true
      } catch {
        // silent fail - se reintenta si empresaId cambia
      }
    }

    seed()
  }, [empresaId])
}
