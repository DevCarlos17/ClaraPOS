-- =============================================================================
-- Migration: 0093_nc_refund_tesoreria_origen.sql
-- Created:   2026-09-17
-- Depends:   0092_producto_costo_factura_tasa_paralela.sql
--
-- CONTEXT (openspec/changes/nc-refund-tesoreria/design.md, Decision c/f):
--   La modalidad REFUND_TESORERIA (NC "Devolver dinero" via Tesoreria) inserta
--   egresos reales en `movimientos_bancarios` y/o `mov_caja_fuerte` cuando una
--   Nota de Credito se reembolsa contra un banco o caja fuerte. Ambas tablas
--   necesitan un valor nuevo de `origen` que identifique semanticamente "este
--   egreso es el reembolso de tesoreria de una NC": 'REEMBOLSO_NCR'.
--
--   Mismo valor en AMBAS tablas (Design §c) — simplifica el reporting
--   cross-cuenta (un solo filtro `origen = 'REEMBOLSO_NCR'` reconstruye todos
--   los egresos de reembolso, sin importar si salieron de banco o caja
--   fuerte). Sigue el patron NOUN/NOUN_NOUN en mayusculas ya usado
--   (TRANSFERENCIA_CLIENTE, PAGO_PROVEEDOR, CIERRE_CONSOLIDACION) y el sufijo
--   `_NCR` ya usado en `movimientos_metodo_cobro.origen` (migracion 0091).
--
-- TRAMPA OFFLINE-FIRST (Design §f, IMPORTANTE):
--   PowerSync local (`src/core/db/powersync/schema.ts` L913/L959) declara
--   `origen` como `column.text` SIN ningun CHECK — un INSERT local con
--   origen='REEMBOLSO_NCR' SIEMPRE "funciona" instantaneo en SQLite, aunque
--   esta migracion NO se haya aplicado todavia en Supabase. El fallo real
--   solo aparece en el sync en background (offline-first): la fila queda
--   atascada localmente sin subir, sin ningun error visible en la UI en el
--   momento de la escritura. Por eso esta migracion es la PRIMERA tarea del
--   change y DEBE aplicarse en Supabase ANTES de que el codigo que usa
--   'REEMBOLSO_NCR' llegue a produccion (mismo patron de riesgo que 0091).
--
-- IDEMPOTENT: safe to re-run. DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT
-- (lista completa de valores existentes + el nuevo), mismo patron que
-- 0035/0077/0091.
--
-- DEPLOY ORDER (manual, Supabase SQL Editor): apply BEFORE merging the
-- frontend branch that writes 'REEMBOLSO_NCR' to `main` — main triggers
-- auto-deploy to Cloudflare Workers.
--
-- ROLLBACK:
--   ALTER TABLE movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_check;
--   ALTER TABLE movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_check
--     CHECK (origen IN ('DEPOSITO_CAJA','TRANSFERENCIA_CLIENTE','PAGO_PROVEEDOR','GASTO',
--                        'MANUAL','TRASPASO','REVERSO','CIERRE_CONSOLIDACION'));
--   ALTER TABLE mov_caja_fuerte DROP CONSTRAINT IF EXISTS mov_caja_fuerte_origen_check;
--   ALTER TABLE mov_caja_fuerte ADD CONSTRAINT mov_caja_fuerte_origen_check
--     CHECK (origen IN ('DEPOSITO_CIERRE','GASTO','TRASPASO','MANUAL','REVERSO'));
-- =============================================================================

-- 1. movimientos_bancarios.origen: 8 valores existentes (ultima lista, 0077) + REEMBOLSO_NCR
ALTER TABLE movimientos_bancarios
  DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_check;

ALTER TABLE movimientos_bancarios
  ADD CONSTRAINT movimientos_bancarios_origen_check
  CHECK (origen IN (
    'DEPOSITO_CAJA',
    'TRANSFERENCIA_CLIENTE',
    'PAGO_PROVEEDOR',
    'GASTO',
    'MANUAL',
    'TRASPASO',
    'REVERSO',
    'CIERRE_CONSOLIDACION',
    'REEMBOLSO_NCR'           -- Egreso de tesoreria por reembolso de NC (REFUND_TESORERIA)
  ));

-- 2. mov_caja_fuerte.origen: 5 valores existentes (creacion original, 0035) + REEMBOLSO_NCR
ALTER TABLE mov_caja_fuerte
  DROP CONSTRAINT IF EXISTS mov_caja_fuerte_origen_check;

ALTER TABLE mov_caja_fuerte
  ADD CONSTRAINT mov_caja_fuerte_origen_check
  CHECK (origen IN (
    'DEPOSITO_CIERRE',
    'GASTO',
    'TRASPASO',
    'MANUAL',
    'REVERSO',
    'REEMBOLSO_NCR'           -- Egreso de tesoreria por reembolso de NC (REFUND_TESORERIA)
  ));
