-- =============================================================================
-- Migration: 0060_fix_saldo_trigger_idempotency.sql
-- Created:   2026-06-24
--
-- ROOT CAUSE of Bs 0.02 reduction on Bs 0.01 payment:
--
-- The trigger function actualizar_saldo_cliente() reads saldo_actual LIVE from
-- the clientes table to override NEW.saldo_anterior, instead of trusting the
-- value provided by the INSERT. This causes two failure modes:
--
--   1. DUPLICATE TRIGGER (0057 not applied):
--      Both trg_actualizar_saldo and trg_actualizar_saldo_cliente fire.
--      Trigger 1: reads saldo=$4.2038, sets saldo=$4.20378.
--      Trigger 2: reads saldo=$4.20378 (already updated by T1!), sets saldo=$4.20376.
--      Result: double deduction (Bs 0.02 instead of Bs 0.01).
--
--   2. POWERSYNC RACE (even with single trigger):
--      PowerSync uploads two ops per writeTransaction:
--        - PUT movimientos_cuenta (INSERT → trigger fires)
--        - PATCH clientes (UPDATE saldo_actual to locally-calculated value)
--      If the PATCH arrives in Supabase BEFORE the INSERT (race condition):
--        - PATCH sets saldo=$4.20378 (correct local value)
--        - INSERT → trigger reads live saldo=$4.20378 → sets saldo=$4.20376 (double!)
--      The PATCH that should be idempotent becomes destructive when trigger re-reads it.
--
-- FIX:
--   Change the trigger to use NEW.saldo_anterior AS PROVIDED in the INSERT,
--   not overriding it from the live clientes.saldo_actual.
--   This makes the trigger order-independent:
--     - Whether the PATCH or INSERT arrives first, the trigger always computes
--       saldo_nuevo = saldo_anterior_from_row +/- monto.
--     - The clientes PATCH and the trigger produce the same value → idempotent.
--
-- ALSO: re-drops trg_actualizar_saldo (safe no-op if 0057 was already applied).
-- =============================================================================

-- ─── Step 1: Drop duplicate trigger (idempotent) ──────────────────────────────
DROP TRIGGER IF EXISTS trg_actualizar_saldo ON movimientos_cuenta;

-- ─── Step 2: Fix trigger function ─────────────────────────────────────────────
-- Use NEW.saldo_anterior from the INSERT row (provided by application code)
-- instead of reading live saldo_actual from clientes.
-- The application code always provides correct saldo_anterior values.
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute saldo_nuevo from the saldo_anterior provided in the INSERT.
  -- DO NOT read saldo_actual from clientes — that creates order-dependency with
  -- the PowerSync clientes PATCH that arrives in the same CRUD transaction.
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  ELSIF NEW.tipo = 'SAF' THEN
    -- SAF reduces the debt (applies a credit); saldo_nuevo is already set by code
    -- but recalculate here for consistency.
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;
  -- REV, SAL: saldo_nuevo stays as provided by the INSERT (no change here)

  -- Update client balance to the calculated saldo_nuevo
  IF NEW.saldo_nuevo IS NOT NULL THEN
    UPDATE clientes
    SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The canonical trigger trg_actualizar_saldo_cliente (from 0006_ventas.sql)
-- is already attached to the updated function since it's CREATE OR REPLACE.
-- No need to recreate it.

-- =============================================================================
-- DOWN
-- =============================================================================
-- To revert: restore the old behavior of reading from clientes.
-- CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   SELECT saldo_actual INTO NEW.saldo_anterior
--   FROM clientes WHERE id = NEW.cliente_id;
--   IF NEW.tipo IN ('FAC', 'NDB') THEN
--     NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
--   ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
--     NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
--   END IF;
--   UPDATE clientes SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
--   WHERE id = NEW.cliente_id;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
