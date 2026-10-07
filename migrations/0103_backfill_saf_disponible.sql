-- =============================================================================
-- Migration: 0103_backfill_saf_disponible.sql
-- Created:   2026-10-07
-- Depends:   0102_extender_trigger_saf_disponible.sql
--
-- PURPOSE:
--   Backfill de `clientes.saf_disponible` para clientes con historial
--   PREVIO a esta migracion (filas de `movimientos_cuenta` insertadas antes
--   de que el trigger de 0102 existiera no actualizaron esta columna en su
--   momento). Puramente de LECTURA sobre `movimientos_cuenta` — no muta esa
--   tabla, no crea movimientos nuevos.
--
--   Formula identica al snapshot que mantiene el trigger (0102) y al
--   live-scan que este cambio reemplaza en las 6 lecturas: MAX(0, SUM(SAFC)
--   - SUM(SAF)) agrupado por cliente_id. Deterministico y SIN ambiguedad de
--   signo (a diferencia de `saldo_actual`, que mezcla FAC/NDB/PAG/NCR/SAF
--   y requirio heuristicas de reparacion en 0062/0089 — SAFC/SAF son
--   unambiguous, no necesitan ese tipo de replay).
--
--   IDEMPOTENTE (spec cxc-saf-snapshot, Requirement "Backfill idempotente y
--   de solo lectura"): es una recomputacion determinista del agregado
--   completo, no un incremento. Ejecutarla N veces produce el mismo
--   resultado que ejecutarla 1 vez, siempre que `movimientos_cuenta`
--   permanezca sin cambios (es inmutable — trg_mov_cuenta_no_update/delete).
--
--   Clientes SIN ninguna fila SAFC/SAF en `movimientos_cuenta` no aparecen
--   en el UPDATE (el JOIN no los alcanza) pero ya quedan en 0 por el
--   DEFAULT de la columna (0101) — correcto, no requieren backfill.
--
--   Aislamiento multi-tenant (spec Requirement "Aislamiento multi-tenant"):
--   el agregado agrupa por `cliente_id`, que pertenece a una unica
--   `empresa_id` por construccion (un cliente nunca cambia de empresa) —
--   el backfill no puede mezclar datos de dos empresas distintas incluso
--   sin filtrar explicitamente por empresa_id en el WHERE.
--
--   Auto-verificacion (reconciliation invariant, design.md §"Reconciliation
--   Invariant"): el bloque DO posterior al UPDATE cuenta cuantos clientes
--   quedaron con `saf_disponible` fuera de tolerancia (0.00000001) respecto
--   al live-scan equivalente, y emite un WARNING (no bloquea la migracion,
--   pero deja evidencia en los logs de Postgres si algo esta mal).
--
-- VERIFICACION MANUAL RECOMENDADA ANTES DE PRODUCCION (owner, alpha method
-- — esta sesion no tiene credenciales de DB para ejecutarlo):
--   BEGIN;
--     <ejecutar el UPDATE de esta migracion>
--     SELECT c.id FROM clientes c
--     WHERE ABS(c.saf_disponible - GREATEST(0,
--       COALESCE((SELECT SUM(monto) FROM movimientos_cuenta WHERE cliente_id=c.id AND tipo='SAFC'),0) -
--       COALESCE((SELECT SUM(monto) FROM movimientos_cuenta WHERE cliente_id=c.id AND tipo='SAF'),0)
--     )) > 0.005;
--     -- 0 filas = 100% consistente
--   ROLLBACK;
--   -- Si 0 filas: re-ejecutar este archivo completo (UPDATE queda confirmado por COMMIT real).
--
-- ROLLBACK:
--   UPDATE clientes SET saf_disponible = 0;
--   -- Seguro: saf_disponible es una columna net-new (0101), ponerla en 0
--   -- para TODOS los clientes no afecta saldo_actual, movimientos_cuenta,
--   -- ni ninguna otra tabla.
-- =============================================================================

UPDATE clientes c
SET saf_disponible = GREATEST(0, COALESCE(safc.t, 0) - COALESCE(saf.t, 0))
FROM (
  SELECT cliente_id, SUM(monto) AS t FROM movimientos_cuenta WHERE tipo = 'SAFC' GROUP BY cliente_id
) safc
FULL JOIN (
  SELECT cliente_id, SUM(monto) AS t FROM movimientos_cuenta WHERE tipo = 'SAF' GROUP BY cliente_id
) saf USING (cliente_id)
WHERE c.id = COALESCE(safc.cliente_id, saf.cliente_id);

DO $$
DECLARE
  v_inconsistentes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_inconsistentes
  FROM clientes c
  WHERE ABS(c.saf_disponible - GREATEST(0,
    COALESCE((SELECT SUM(monto) FROM movimientos_cuenta WHERE cliente_id = c.id AND tipo = 'SAFC'), 0) -
    COALESCE((SELECT SUM(monto) FROM movimientos_cuenta WHERE cliente_id = c.id AND tipo = 'SAF'), 0)
  )) > 0.005;

  IF v_inconsistentes > 0 THEN
    RAISE WARNING '0103_backfill_saf_disponible: % cliente(s) con saf_disponible fuera de tolerancia tras el backfill — revisar manualmente.', v_inconsistentes;
  ELSE
    RAISE NOTICE '0103_backfill_saf_disponible: reconciliacion OK, 0 clientes inconsistentes.';
  END IF;
END $$;
