-- =============================================================================
-- Migration: 0094_fix_nota_credito_sum_self_count.sql
-- Created:   2026-09-18
-- Depends:   0093_nc_refund_tesoreria_origen.sql
--
-- BUG (engram sdd/nc-refund-tesoreria/bug-double-count):
--   `validate_nota_credito_insert()` (migrations/0006_ventas.sql:340-359) suma
--   `total_usd` de TODAS las filas `notas_credito` con `venta_id = NEW.venta_id`
--   SIN excluir `id = NEW.id`. Esta funcion corre en un trigger BEFORE INSERT,
--   que Postgres ejecuta SIEMPRE — incluso cuando PowerSync reintenta el MISMO
--   PUT como `INSERT ... ON CONFLICT (id) DO NOTHING` (connector.ts:525-527).
--
--   En un reintento, la fila ya comprometida en el intento #1 sigue estando
--   en `notas_credito` (nunca se revirtio) y el trigger la cuenta como
--   "existente" en el SUM. Al sumarle `NEW.total_usd` de la MISMA fila que
--   se esta reintentando, el total se DUPLICA transitoriamente dentro del
--   trigger ($2.60 + $2.60 = $5.20), superando `ventas.total_usd` y lanzando
--   `RAISE EXCEPTION` para una NC que en realidad es 100% legitima y unica.
--
--   No es una fila duplicada (`ON CONFLICT DO NOTHING` jamas llega a
--   ejecutarse porque el trigger BEFORE INSERT aborta antes) — es un valor
--   doblado SOLO durante el chequeo. El bug es generico a las 5 modalidades
--   de NC; solo REFUND_TESORERIA lo dispara en la practica porque agrega
--   escrituras extra (egresos de tesoreria) DESPUES del INSERT de
--   `notas_credito` dentro del mismo batch/transaccion de PowerSync,
--   aumentando la superficie para que un error transitorio fuerce un
--   reintento completo del batch (incluyendo el PUT de `notas_credito` ya
--   confirmado).
--
--   TRAMPA OFFLINE-FIRST: PowerSync local (SQLite, wa-sqlite) NO tiene este
--   trigger — el guard solo existe server-side en Postgres/Supabase. Un
--   reintento nunca falla localmente; el error solo aparece en el sync en
--   background, sin feedback visible en la UI en el momento de la escritura.
--
-- FIX:
--   Excluir la propia fila (`id <> NEW.id`) del SELECT SUM de "notas de
--   credito existentes". Esto es un no-op en el INSERT original (la fila con
--   `NEW.id` todavia no existe en la tabla, asi que el filtro no cambia el
--   resultado) y en el reintento excluye correctamente la fila ya
--   comprometida, evitando que se cuente dos veces. `NEW.total_usd` se sigue
--   sumando UNA vez en la comparacion final — el guard contra dos NC
--   DISTINTAS que exceden el total de la venta sigue intacto.
--
-- IDEMPOTENT: `CREATE OR REPLACE FUNCTION` — seguro de re-ejecutar. No se
-- dropea el trigger (`trg_validate_nota_credito_insert`, definido en
-- 0006_ventas.sql), solo se reemplaza el cuerpo de la funcion que ya usa.
--
-- DEPLOY ORDER (manual, Supabase SQL Editor): aplicar DESPUES de 0093 y
-- ANTES de re-probar QA-9/Q1 (REFUND_TESORERIA) en el ambiente de pruebas.
--
-- ROLLBACK: re-aplicar el cuerpo original de 0006_ventas.sql:340-359
-- (CREATE OR REPLACE FUNCTION validate_nota_credito_insert() sin el filtro
-- `AND id <> NEW.id`) — no recomendado, reintroduce el bug.
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_nota_credito_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_total_venta NUMERIC(12,2);
  v_total_nc_existentes NUMERIC(12,2);
BEGIN
  SELECT total_usd INTO v_total_venta
  FROM ventas WHERE id = NEW.venta_id;

  -- Excluye la propia fila (`id <> NEW.id`): en un INSERT normal es un
  -- no-op (la fila con NEW.id aun no existe); en un reintento de PowerSync
  -- (`INSERT ... ON CONFLICT (id) DO NOTHING`) evita contar la fila ya
  -- comprometida en el intento anterior como "existente" ademas de sumarla
  -- de nuevo via NEW.total_usd mas abajo.
  SELECT COALESCE(SUM(total_usd), 0) INTO v_total_nc_existentes
  FROM notas_credito WHERE venta_id = NEW.venta_id AND id <> NEW.id;

  -- NEW.total_usd se suma UNA sola vez aqui — el guard contra dos NC
  -- DISTINTAS que en conjunto excedan el total de la venta sigue intacto.
  IF (v_total_nc_existentes + NEW.total_usd) > v_total_venta THEN
    RAISE EXCEPTION 'La suma de notas de credito ($%) excede el total de la venta ($%)',
      (v_total_nc_existentes + NEW.total_usd), v_total_venta;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INVARIANTE SQL (documentado, no ejecutable en Vitest — ver
-- openspec/changes/saldo-a-favor-fix/design.md:86, gap de test-infra ya
-- aceptado: cero pgTAP/testcontainers en el proyecto). Verificar MANUALMENTE
-- contra un Supabase real durante sdd-verify:
--
--   Caso (a) — reintento idempotente NO debe lanzar:
--     INSERT INTO notas_credito (id, venta_id, total_usd, ...)
--       VALUES ('nc-1', 'venta-x', 2.60, ...);              -- OK, primera vez
--     INSERT INTO notas_credito (id, venta_id, total_usd, ...)
--       VALUES ('nc-1', 'venta-x', 2.60, ...)                -- MISMO id/valores
--       ON CONFLICT (id) DO NOTHING;                         -- NO debe lanzar
--
--   Caso (b) — dos NC DISTINTAS que exceden el total SI deben seguir
--   lanzando (el fix no debe abrir la puerta a sobre-acreditar):
--     -- venta-y.total_usd = 10.00
--     INSERT INTO notas_credito (id, venta_id, total_usd, ...)
--       VALUES ('nc-a', 'venta-y', 7.00, ...);               -- OK
--     INSERT INTO notas_credito (id, venta_id, total_usd, ...)
--       VALUES ('nc-b', 'venta-y', 5.00, ...);               -- DEBE lanzar
--       -- (7.00 + 5.00 = 12.00 > 10.00)
-- =============================================================================
