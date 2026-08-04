/**
 * Predicado puro (sin dependencias de PowerSync) para detectar si un banco
 * tiene actividad financiera en curso.
 *
 * Vive en un archivo separado de `use-bancos.ts` a proposito: ese archivo
 * importa `db` desde `@/core/db/powersync/db`, que instancia
 * `PowerSyncDatabase` (y por lo tanto un Worker) en el momento del import.
 * Bajo Vitest (happy-dom, sin Worker global) eso revienta con
 * "Worker is not defined" apenas se importa el modulo, sin importar que
 * funcion se use. Extraer el predicado aqui permite testearlo con un
 * `EjecutorSql` mockeado, sin arrastrar ese efecto secundario.
 */
export interface EjecutorSql {
  execute: (
    sql: string,
    params: unknown[]
  ) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }>
}

/**
 * Determina si un banco tiene pagos no reversados registrados a traves de
 * alguno de sus metodos de cobro, dentro de una sesion de caja actualmente
 * ABIERTA. Usado para bloquear la inactivacion de un banco con actividad
 * en curso (ver `updateBanco` en `use-bancos.ts`).
 *
 * Join autoritativo: `pagos.metodo_cobro_id -> metodos_cobro.banco_empresa_id`.
 * `pagos.banco_empresa_id` existe en el esquema pero nunca se popula — no se
 * usa como fuente de verdad.
 */
export async function bancoTieneActividadEnSesionAbierta(
  ejecutor: EjecutorSql,
  bancoId: string,
  empresaId: string
): Promise<boolean> {
  const result = await ejecutor.execute(
    `SELECT COUNT(*) as cnt
     FROM pagos p
     JOIN metodos_cobro mc ON mc.id = p.metodo_cobro_id
     JOIN sesiones_caja sc ON sc.id = p.sesion_caja_id
     WHERE sc.empresa_id = ?
       AND p.empresa_id = ?
       AND sc.status = 'ABIERTA'
       AND mc.banco_empresa_id = ?
       AND (p.is_reversed IS NULL OR p.is_reversed = 0)`,
    [empresaId, empresaId, bancoId]
  )
  const row = result.rows?.item(0) as { cnt: number } | undefined
  return (row?.cnt ?? 0) > 0
}
