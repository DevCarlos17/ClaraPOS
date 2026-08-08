import { VE_OFFSET } from '@/lib/dates'

/**
 * Constructor puro del SQL de `useMovimientosFiltrados`, extraido a un archivo
 * separado de `use-kardex.ts` a proposito: ese archivo importa `db` desde
 * `@/core/db/powersync/db`, que instancia `PowerSyncDatabase` (y por lo tanto
 * un Worker) en el momento del import. Bajo Vitest (happy-dom, sin Worker
 * global) eso revienta con "Worker is not defined" apenas se importa el
 * modulo, sin importar que funcion se use. Extraer el builder aqui permite
 * testear el SQL generado sin arrastrar ese efecto secundario (mismo patron
 * que `banco-actividad-sesion.ts`).
 *
 * Interpola `VE_OFFSET` (en vez del literal `'-04:00'`) para centralizar el
 * offset venezolano en `dates.ts`. El SQL resultante es byte-identico al
 * literal anterior.
 */
export function buildMovimientosFiltradosSql(): string {
  return `SELECT mi.*, p.codigo as prod_codigo, p.nombre as prod_nombre, p.departamento_id
     FROM movimientos_inventario mi
     LEFT JOIN productos p ON p.id = mi.producto_id
     WHERE mi.empresa_id = ?
       AND datetime(mi.fecha) >= datetime(? || 'T00:00:00${VE_OFFSET}')
       AND datetime(mi.fecha) <= datetime(? || 'T23:59:59${VE_OFFSET}')
     ORDER BY mi.fecha DESC LIMIT 500`
}
