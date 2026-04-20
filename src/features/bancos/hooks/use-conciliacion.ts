import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'

/**
 * Marca un movimiento bancario como validado (campo validado: 0 -> 1).
 * El trigger en DB impide modificar movimientos ya validados.
 * En SQLite local no hay trigger, pero la validacion se hace aqui.
 */
export async function validarMovimientoBancario(
  movimientoId: string,
  validadoPor: string
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT validado FROM movimientos_bancarios WHERE id = ?',
      [movimientoId]
    )
    if (!result.rows?.length) throw new Error('Movimiento no encontrado')
    const mov = result.rows.item(0) as { validado: number }
    if (mov.validado === 1) throw new Error('Este movimiento ya fue validado')

    const now = localNow()
    await tx.execute(
      'UPDATE movimientos_bancarios SET validado = 1, validado_por = ?, validado_at = ? WHERE id = ?',
      [validadoPor, now, movimientoId]
    )
  })
}
