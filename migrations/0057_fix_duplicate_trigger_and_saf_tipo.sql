-- =============================================================================
-- 0057_fix_duplicate_trigger_and_saf_tipo.sql
--
-- ROOT CAUSES fixed:
--
-- BUG 1 — Double trigger on movimientos_cuenta:
--   0001_initial_schema.sql creates: trg_actualizar_saldo
--   0006_ventas.sql creates:         trg_actualizar_saldo_cliente
--   When 0006 was applied on a DB already setup with 0001_initial_schema.sql,
--   CREATE TABLE statements failed (tables exist) but the SQL editor continued,
--   successfully creating a SECOND trigger. Both fire on every INSERT, doubling
--   saldo_actual for FAC/PAG/NCR/NDB movements.
--
-- BUG 2 — Missing 'SAF' in movimientos_cuenta_tipo_check:
--   Constraint allows: FAC PAG NCR NDB REV SAL — but NOT SAF.
--   Code changes in ea384ed introduced tipo='SAF' inserts. They fail in Supabase
--   with 23514 (fatal). PowerSync discards the entire transaction. But UPDATE
--   ventas.saldo_pend_usd (which runs first in the same tx) is already committed
--   to Supabase, leaving invoices at $0 pending with saldo_actual unchanged.
--
-- ROLLBACK:
--   -- Re-add the old trigger (only if your DB actually had it from 0001):
--   -- CREATE TRIGGER trg_actualizar_saldo BEFORE INSERT ON movimientos_cuenta
--   --   FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente();
--   -- Revert constraint:
--   -- ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
--   -- ALTER TABLE movimientos_cuenta ADD CONSTRAINT movimientos_cuenta_tipo_check
--   --   CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL'));
-- =============================================================================

-- ─── Fix 1: Remove duplicate trigger ──────────────────────────────────────────
-- trg_actualizar_saldo_cliente (from 0006_ventas.sql) is the canonical one.
-- trg_actualizar_saldo (from 0001_initial_schema.sql) is the duplicate.
-- DROP IF EXISTS is idempotent — safe to run on DBs that never had this trigger.
DROP TRIGGER IF EXISTS trg_actualizar_saldo ON movimientos_cuenta;

-- ─── Fix 2: Add 'SAF' to the tipo constraint ──────────────────────────────────
ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
ALTER TABLE movimientos_cuenta
  ADD CONSTRAINT movimientos_cuenta_tipo_check
  CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL', 'SAF'));

-- ─── Fix 3: Data correction ────────────────────────────────────────────────────
-- saldo_actual for clients with debt got doubled by the duplicate trigger.
-- Clients with SAF payments in flight have saldo_actual > 0 but no pending
-- invoices (porque el UPDATE ventas llegó pero el INSERT SAF falló).
--
-- Correction: recalculate saldo_actual = SUM of pending invoice amounts.
-- This is the ground truth for debt. SAF credits (negative saldo) are reset to 0
-- because those SAF movements never reached Supabase anyway (constraint failure).
--
-- Bypass validate_cliente_update for this admin recalculation.
ALTER TABLE clientes DISABLE TRIGGER trg_validate_cliente_update;

UPDATE clientes c
SET saldo_actual = COALESCE(
  (SELECT SUM(CAST(v.saldo_pend_usd AS NUMERIC))
   FROM ventas v
   WHERE v.cliente_id = c.id
     AND v.empresa_id = c.empresa_id
     AND CAST(v.saldo_pend_usd AS REAL) > 0.005),
  0
),
updated_at = NOW();

ALTER TABLE clientes ENABLE TRIGGER trg_validate_cliente_update;
