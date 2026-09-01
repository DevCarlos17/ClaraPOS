-- =============================================================================
-- Migración 0076: Fusionar métodos de cobro EFECTIVO BS duplicados
--
-- Contexto:
--   La empresa f0aba92c-ff8f-4524-8100-eeea14ac4c29 tiene DOS metodos_cobro
--   activos de tipo EFECTIVO / moneda VES (Bs). Esto es data sucia: uno es
--   pre-seed (antiguo, sin caja_fuerte_id), el otro proviene del seed oficial
--   de register-owner (tiene caja_fuerte_id asociado).
--
--   KEEP  (oficial, del seed, con caja_fuerte): ff829297-ad57-46b3-8125-5efb327ec76c
--   MERGE + DESACTIVAR (antiguo, caja_fuerte_id IS NULL): 999e906d-2ca4-422e-a17a-a7ef138bc7f1
--
--   El metodo antiguo tiene saldo_actual = 4324.66 Bs que debe consolidarse
--   (sumarse) en el metodo que se conserva.
--
-- Que hace esta migracion:
--   1. Reasigna todas las referencias historicas del metodo ANTIGUO al metodo
--      OFICIAL en: pagos, gastos, gasto_pagos, movimientos_metodo_cobro.
--   2. Consolida sesiones_caja_detalle respetando la UNIQUE(sesion_caja_id,
--      metodo_cobro_id): si una sesion ya tiene fila para AMBOS metodos, se
--      suman los totales en la fila del metodo OFICIAL y se borra la fila del
--      metodo ANTIGUO; si una sesion solo tiene fila del metodo ANTIGUO, se
--      reasigna directamente.
--   3. Consolida el saldo_actual (antiguo -> oficial) y desactiva el metodo
--      antiguo (is_active = FALSE, saldo_actual = 0).
--
-- Inmutabilidad financiera:
--   Esta migracion NO borra ni edita tasas_cambio, movimientos_inventario,
--   movimientos_cuenta ni libro_contable. Los movimientos_metodo_cobro
--   conservan sus snapshots de monto/saldo_anterior/saldo_nuevo; solo se
--   reasigna la columna metodo_cobro_id (el registro sigue siendo un
--   historico valido, simplemente ahora apunta al metodo consolidado).
--
-- IMPORTANTE - triggers de inmutabilidad:
--   Las tablas pagos, gastos y movimientos_metodo_cobro tienen triggers
--   BEFORE UPDATE que RECHAZAN el cambio de metodo_cobro_id (inmutabilidad
--   financiera). Los NOMBRES de estos triggers han cambiado a lo largo de las
--   migraciones (p.ej. 0015 dropeo trg_pagos_no_update y creo
--   trg_pagos_allow_reversal), por lo que NO se puede depender de nombres
--   exactos. Siguiendo el patron ya usado en 0023 y 0028
--   (DISABLE TRIGGER USER), se desactivan TODOS los triggers de usuario de
--   esas tablas temporalmente durante la reasignacion y se reactivan al
--   finalizar. gasto_pagos y sesiones_caja_detalle no requieren este
--   tratamiento pero se incluye pagos/gastos/movimientos por seguridad.
--
-- traspasos_tesoreria: NO se toca. Se verifico el schema (0035, 0072) y las
--   columnas cuenta_origen_tipo / cuenta_destino_tipo solo aceptan los
--   literales 'BANCO' y 'CAJA_FUERTE' (CHECK constraint) — no existe un tipo
--   'METODO_COBRO' en esta tabla, por lo tanto no referencia metodos_cobro.
--
-- Idempotencia:
--   Todas las reasignaciones estan filtradas por metodo_cobro_id = (id
--   antiguo). Tras la primera ejecucion exitosa no quedan filas apuntando al
--   metodo antiguo, por lo que re-ejecutar este script no tiene efecto
--   (0 filas afectadas en cada UPDATE/DELETE) y es seguro.
--
-- Alcance multi-tenant:
--   TODAS las sentencias estan filtradas por empresa_id = la empresa objetivo
--   Y por el id especifico del metodo antiguo, para no afectar otros tenants.
-- =============================================================================

BEGIN;

-- ─── 1. Desactivar triggers de inmutabilidad para la reasignacion ────────────
-- Se usa DISABLE TRIGGER USER (no nombres especificos) porque los nombres de
-- los triggers de inmutabilidad cambiaron a lo largo de las migraciones.

ALTER TABLE pagos                    DISABLE TRIGGER USER;
ALTER TABLE gastos                   DISABLE TRIGGER USER;
ALTER TABLE movimientos_metodo_cobro DISABLE TRIGGER USER;


-- ─── 2. Reasignar referencias historicas: metodo ANTIGUO -> metodo OFICIAL ───

-- pagos: cobros de ventas registrados con el metodo antiguo
UPDATE pagos
SET metodo_cobro_id = 'ff829297-ad57-46b3-8125-5efb327ec76c'
WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
  AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- gastos: gastos pagados de inmediato con el metodo antiguo
UPDATE gastos
SET metodo_cobro_id = 'ff829297-ad57-46b3-8125-5efb327ec76c'
WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
  AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- gasto_pagos: cuotas/abonos de gastos con el metodo antiguo
UPDATE gasto_pagos
SET metodo_cobro_id = 'ff829297-ad57-46b3-8125-5efb327ec76c'
WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
  AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- movimientos_metodo_cobro: estado de cuenta historico del metodo antiguo.
-- Los snapshots monto/saldo_anterior/saldo_nuevo de cada fila se preservan
-- tal cual (son auditoria historica); solo cambia a que metodo pertenecen.
UPDATE movimientos_metodo_cobro
SET metodo_cobro_id = 'ff829297-ad57-46b3-8125-5efb327ec76c'
WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
  AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';


-- ─── 3. Reactivar triggers de inmutabilidad ───────────────────────────────────

ALTER TABLE pagos                    ENABLE TRIGGER USER;
ALTER TABLE gastos                   ENABLE TRIGGER USER;
ALTER TABLE movimientos_metodo_cobro ENABLE TRIGGER USER;


-- ─── 4. Consolidar sesiones_caja_detalle (respeta UNIQUE(sesion_caja_id, metodo_cobro_id)) ──

-- 4a. Sesiones donde YA existe fila para ambos metodos: sumar los totales del
--     metodo antiguo dentro de la fila del metodo oficial.
UPDATE sesiones_caja_detalle keep_row
SET total_sistema     = keep_row.total_sistema + old_row.total_sistema,
    total_fisico      = COALESCE(keep_row.total_fisico, 0) + COALESCE(old_row.total_fisico, 0),
    diferencia        = COALESCE(keep_row.diferencia, 0) + COALESCE(old_row.diferencia, 0),
    num_transacciones = keep_row.num_transacciones + old_row.num_transacciones
FROM sesiones_caja_detalle old_row
JOIN sesiones_caja sc ON sc.id = old_row.sesion_caja_id
WHERE old_row.metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1'
  AND sc.empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
  AND keep_row.sesion_caja_id = old_row.sesion_caja_id
  AND keep_row.metodo_cobro_id = 'ff829297-ad57-46b3-8125-5efb327ec76c';

-- 4b. Borrar las filas del metodo antiguo que ya se consolidaron en 4a
--     (la fila del metodo oficial para esa sesion ya tiene la suma correcta).
DELETE FROM sesiones_caja_detalle old_row
USING sesiones_caja sc
WHERE old_row.sesion_caja_id = sc.id
  AND sc.empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
  AND old_row.metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1'
  AND EXISTS (
    SELECT 1 FROM sesiones_caja_detalle keep_row
    WHERE keep_row.sesion_caja_id = old_row.sesion_caja_id
      AND keep_row.metodo_cobro_id = 'ff829297-ad57-46b3-8125-5efb327ec76c'
  );

-- 4c. Reasignar las filas restantes del metodo antiguo (sesiones donde solo
--     existia fila del metodo antiguo, sin conflicto de UNIQUE posible ya
--     que las duplicadas fueron eliminadas en 4b).
UPDATE sesiones_caja_detalle old_row
SET metodo_cobro_id = 'ff829297-ad57-46b3-8125-5efb327ec76c'
FROM sesiones_caja sc
WHERE old_row.sesion_caja_id = sc.id
  AND sc.empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
  AND old_row.metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';


-- ─── 5. Consolidar saldo_actual y desactivar el metodo antiguo ───────────────

-- Sumar el saldo del metodo antiguo al metodo oficial (lectura en vivo del
-- saldo antiguo via subquery, no se hardcodea el monto).
UPDATE metodos_cobro
SET saldo_actual = saldo_actual + (
      SELECT saldo_actual FROM metodos_cobro
      WHERE id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1'
        AND empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
    ),
    updated_at = NOW()
WHERE id = 'ff829297-ad57-46b3-8125-5efb327ec76c'
  AND empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29';

-- Poner en cero el saldo del metodo antiguo y desactivarlo.
UPDATE metodos_cobro
SET saldo_actual = 0,
    is_active = FALSE,
    updated_at = NOW()
WHERE id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1'
  AND empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29';

COMMIT;

-- =============================================================================
-- Verificacion post-migracion (ejecutar manualmente, comentado)
-- =============================================================================

-- Debe devolver 0: no deben quedar pagos apuntando al metodo antiguo
-- SELECT COUNT(*) FROM pagos
-- WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
--   AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- Debe devolver 0: no deben quedar gastos apuntando al metodo antiguo
-- SELECT COUNT(*) FROM gastos
-- WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
--   AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- Debe devolver 0: no deben quedar gasto_pagos apuntando al metodo antiguo
-- SELECT COUNT(*) FROM gasto_pagos
-- WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
--   AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- Debe devolver 0: no deben quedar movimientos_metodo_cobro apuntando al metodo antiguo
-- SELECT COUNT(*) FROM movimientos_metodo_cobro
-- WHERE empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
--   AND metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- Debe devolver 0: no deben quedar sesiones_caja_detalle apuntando al metodo antiguo
-- SELECT COUNT(*) FROM sesiones_caja_detalle scd
-- JOIN sesiones_caja sc ON sc.id = scd.sesion_caja_id
-- WHERE sc.empresa_id = 'f0aba92c-ff8f-4524-8100-eeea14ac4c29'
--   AND scd.metodo_cobro_id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';

-- Ver el saldo consolidado del metodo oficial (debe incluir los 4324.66 Bs)
-- SELECT id, nombre, saldo_actual, is_active FROM metodos_cobro
-- WHERE id = 'ff829297-ad57-46b3-8125-5efb327ec76c';

-- Confirmar que el metodo antiguo quedo desactivado y en cero
-- SELECT id, nombre, saldo_actual, is_active FROM metodos_cobro
-- WHERE id = '999e906d-2ca4-422e-a17a-a7ef138bc7f1';
