-- =============================================================================
-- Migration: 0111_backfill_saldo_pendiente.sql
-- Created:   2026-10-18
-- Depends:   0110_extender_trigger_saldo_pendiente.sql
--
-- PURPOSE:
--   Backfill de `clientes.saldo_pendiente_usd` para clientes con historial
--   PREVIO a esta migracion (filas de `movimientos_cuenta` insertadas antes
--   de que el trigger de 0110 existiera no actualizaron esta columna en su
--   momento). Puramente de LECTURA sobre `ventas` — no muta esa tabla, no
--   crea movimientos nuevos, no toca `movimientos_cuenta`.
--
--   A diferencia de 0103 (que agrega sobre `movimientos_cuenta` SAFC/SAF,
--   porque `saf_disponible` no tiene ninguna columna ya-confiable que lo
--   espeje), este backfill agrega directamente sobre `ventas.saldo_pend_usd`
--   — la columna que YA es la fuente de verdad de deuda pendiente por
--   factura (mantenida por `prevent_venta_mutation()`/`derive_venta_estado_insert()`,
--   0106/0108). `saldo_pendiente_usd` es solo su agregado materializado por
--   cliente; no hay riesgo de "ledger replay" (design.md Q1 — ese riesgo
--   solo aplicaba a 0107, que reconstruia `estado` desde cero porque
--   0106 lo habia dejado `DEFAULT 'pendiente'` activamente incorrecto).
--
--   Formula: `GREATEST(0, SUM(saldo_pend_usd)) WHERE estado != 'pago'`,
--   agrupado por `cliente_id` — identica a la que mantiene el trigger
--   (0110) y a la que reemplazan las 3 lecturas (`use-cxc.ts`,
--   `use-deuda-cliente.ts`). Tolerancia 0 exacta (no 0.005), igual que la
--   regla de `estado`/`saldo_pend_usd` fijada en 0108 (decision del owner:
--   ClaraPOS cobra en Bs con tasa variable, 0.005 USD podia dejar deuda real
--   sin reflejar).
--
--   IDEMPOTENTE: es una recomputacion determinista del agregado completo
--   (dos UPDATE, no un incremento). Ejecutarla N veces produce el mismo
--   resultado que ejecutarla 1 vez, siempre que `ventas.saldo_pend_usd` no
--   cambie entre ejecuciones (y si cambia, es porque el trigger 0110 ya lo
--   reflejo correctamente — el backfill solo es necesario para el historial
--   previo a 0110).
--
--   Dos pasos (en vez de un solo UPDATE...FROM, que solo toca clientes
--   presentes en la subquery agregada):
--     1. Clientes SIN ninguna venta pendiente (`estado != 'pago'`) se ponen
--        en 0 explicitamente — cubre tanto clientes sin ventas como
--        clientes cuya unica deuda ya fue pagada en su totalidad.
--     2. Clientes CON al menos una venta pendiente reciben el agregado real.
--
--   Aislamiento multi-tenant (spec cxc-saldo-pendiente-materializado,
--   Requirement "Multitenant isolation"): el agregado agrupa por
--   `cliente_id`, que pertenece a una unica `empresa_id` por construccion
--   (un cliente nunca cambia de empresa) — el backfill no puede mezclar
--   datos de dos empresas distintas incluso sin filtrar explicitamente por
--   empresa_id en el WHERE.
--
--   Auto-verificacion (mismo patron que 0103 y la Paso-3 de 0105): el
--   bloque DO posterior a los UPDATE cuenta cuantos clientes quedaron con
--   `saldo_pendiente_usd` fuera de tolerancia (0 exacta, no 0.005) respecto
--   al agregado equivalente sobre `ventas`, y emite un WARNING (no bloquea
--   la migracion, pero deja evidencia en los logs de Postgres si algo esta
--   mal). Tambien queda disponible como query de reconciliacion ad-hoc
--   (design.md Q3 — "Read-only diagnostic query, ad-hoc"), ejecutable en
--   cualquier momento desde el SQL Editor de Supabase para re-verificar
--   confianza en la columna antes de cualquier trabajo futuro de
--   sync-trimming en PowerSync.
--
-- VERIFICACION MANUAL RECOMENDADA ANTES DE PRODUCCION (owner, esta sesion no
-- tiene credenciales de DB para ejecutarlo):
--   BEGIN;
--     <ejecutar los 2 UPDATE de esta migracion>
--     SELECT c.id FROM clientes c
--     WHERE ABS(c.saldo_pendiente_usd - GREATEST(0, COALESCE((
--       SELECT SUM(v.saldo_pend_usd) FROM ventas v
--       WHERE v.cliente_id = c.id AND v.estado != 'pago'
--     ), 0))) > 0;
--     -- 0 filas = 100% consistente
--   ROLLBACK;
--   -- Si 0 filas: re-ejecutar este archivo completo (los UPDATE quedan
--   -- confirmados por el COMMIT real, no el ROLLBACK de la verificacion).
--
-- ROLLBACK:
--   UPDATE clientes SET saldo_pendiente_usd = 0;
--   -- Seguro: saldo_pendiente_usd es una columna net-new (0109), ponerla en
--   -- 0 para TODOS los clientes no afecta saldo_actual, saf_disponible,
--   -- ventas.saldo_pend_usd, movimientos_cuenta, ni ninguna otra tabla.
-- =============================================================================

BEGIN;

-- Paso 1: clientes sin ninguna venta pendiente quedan en 0 explicitamente.
UPDATE clientes c
SET saldo_pendiente_usd = 0
WHERE c.saldo_pendiente_usd != 0
  AND NOT EXISTS (
    SELECT 1 FROM ventas v WHERE v.cliente_id = c.id AND v.estado != 'pago'
  );

-- Paso 2: clientes con al menos una venta pendiente reciben el agregado real.
UPDATE clientes c
SET saldo_pendiente_usd = sub.d
FROM (
  SELECT cliente_id, GREATEST(0, SUM(saldo_pend_usd)) AS d
  FROM ventas
  WHERE estado != 'pago'
  GROUP BY cliente_id
) sub
WHERE c.id = sub.cliente_id;

DO $$
DECLARE
  v_inconsistentes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_inconsistentes
  FROM clientes c
  WHERE ABS(c.saldo_pendiente_usd - GREATEST(0, COALESCE((
    SELECT SUM(v.saldo_pend_usd) FROM ventas v
    WHERE v.cliente_id = c.id AND v.estado != 'pago'
  ), 0))) > 0;

  IF v_inconsistentes > 0 THEN
    RAISE WARNING '0111_backfill_saldo_pendiente: % cliente(s) con saldo_pendiente_usd fuera de tolerancia (0 exacta) tras el backfill — revisar manualmente.', v_inconsistentes;
  ELSE
    RAISE NOTICE '0111_backfill_saldo_pendiente: reconciliacion OK, 0 clientes inconsistentes.';
  END IF;
END $$;

COMMIT;
