-- =============================================================================
-- Migration: 0061_restore_trigger_context.sql
-- Created:   2026-06-25
--
-- ROOT CAUSE (introduced by 0060):
--   actualizar_saldo_cliente() was rewritten to fix idempotency (race condition)
--   but the PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE)
--   line was accidentally omitted.
--
-- Without it, validate_cliente_update() sees no context and raises P0001 on
-- every INSERT into movimientos_cuenta, because the trigger tries to UPDATE
-- clientes.saldo_actual without the authorizing context flag.
--
-- CONSEQUENCE CHAIN:
--   INSERT movimientos_cuenta
--     → actualizar_saldo_cliente() [BEFORE INSERT trigger]
--       → UPDATE clientes SET saldo_actual = ...
--         → validate_cliente_update() [BEFORE UPDATE trigger]
--           → context ≠ 'mov_cuenta' → RAISE EXCEPTION P0001
--         → INSERT is rolled back
--   PowerSync receives 400, marks op as FATAL, discards it.
--   saldo_actual stays at 0 in Supabase.
--   clientes with only credit invoices → invisible in CxC query (filter > 0.001).
--
-- FIX:
--   Restore the set_config call. Keep 0060's logic of using NEW.saldo_anterior
--   from the INSERT row (not reading live from clientes) — that race-condition
--   fix was correct and must be preserved.
--
-- DATA REPAIR:
--   Recalculate saldo_actual for all clients whose balance in Supabase is 0
--   but who have unpaid ventas (saldo_pend_usd > 0).
--   Uses set_config to bypass validate_cliente_update during the repair.
-- =============================================================================

-- ─── Step 1: Restore trigger function with set_config ─────────────────────────
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute saldo_nuevo from the saldo_anterior provided in the INSERT.
  -- DO NOT read saldo_actual live from clientes — that created the race condition
  -- fixed in migration 0060. Keep that fix.
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  ELSIF NEW.tipo = 'SAF' THEN
    -- SAF reduces debt (applies a credit balance to pending invoices)
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;
  -- REV, SAL: saldo_nuevo stays as provided in the INSERT (no recalculation)

  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
  -- This was accidentally removed in migration 0060.
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    UPDATE clientes
    SET saldo_actual = NEW.saldo_nuevo,
        updated_at   = NOW()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Step 2: Data repair ──────────────────────────────────────────────────────
-- Recalculate saldo_actual as the sum of saldo_pend_usd from unpaid ventas.
-- Only touches clients that have pending invoices and currently show saldo = 0,
-- which is the signature of the bug (trigger failed, saldo never updated).
DO $$
BEGIN
  -- Authorize the direct UPDATE for this repair block (transaction-local)
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);

  UPDATE clientes c
  SET
    saldo_actual = sub.total_pendiente,
    updated_at   = NOW()
  FROM (
    SELECT
      v.cliente_id,
      v.empresa_id,
      SUM(CAST(v.saldo_pend_usd AS NUMERIC)) AS total_pendiente
    FROM ventas v
    WHERE CAST(v.saldo_pend_usd AS REAL) > 0.005
    GROUP BY v.cliente_id, v.empresa_id
  ) sub
  WHERE c.id          = sub.cliente_id
    AND c.empresa_id  = sub.empresa_id
    AND ABS(CAST(c.saldo_actual AS NUMERIC)) < 0.005;
END;
$$;
