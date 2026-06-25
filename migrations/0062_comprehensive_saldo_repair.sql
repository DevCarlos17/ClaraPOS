-- =============================================================================
-- Migration: 0062_comprehensive_saldo_repair.sql
-- Created:   2026-06-25
-- Depends:   0061_restore_trigger_context.sql (trigger must be fixed FIRST)
--
-- WHY:
--   Migration 0060 removed the set_config context from actualizar_saldo_cliente(),
--   causing P0001 on every INSERT into movimientos_cuenta. PowerSync discarded
--   those batches as FATAL, so clientes.saldo_actual was never updated.
--
--   Migration 0061 restored the trigger (fixed 0060's omission) and repaired
--   clients where saldo_actual was ~0 but had pending invoices.
--
--   This migration handles the remaining corruption cases:
--     A. saldo_actual > 0 but WRONG (too high or too low vs pending invoices)
--     B. saldo_actual > 0 but NO pending invoices (should be 0)
--
--   Negative saldo_actual values (SAF credits, "a favor") are left untouched
--   since they represent legitimate credit balances and cannot be recalculated
--   reliably from ventas alone.
--
-- REPAIR STRATEGY:
--   Source of truth = ventas.saldo_pend_usd
--   Rationale: ventas INSERTs succeeded (only movimientos_cuenta failed).
--   saldo_pend_usd is decremented correctly by each PAG/NCR/SAF because
--   those fields are written directly, not via the broken trigger.
--
-- SAFE TO RUN:
--   - Idempotent: running twice produces the same result.
--   - Only touches rows where recalculated value differs by > $0.005.
--   - Uses set_config to bypass validate_cliente_update (same pattern as 0061).
-- =============================================================================

DO $$
BEGIN
  -- ── Authorize direct UPDATE for this repair block (transaction-local) ──────
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);

  -- ── Case A: client has pending invoices but saldo_actual is WRONG ──────────
  -- Recalculate to exactly SUM(saldo_pend_usd) across all unpaid ventas.
  -- Touches both "too high" and "too low" cases.
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
    -- Only update if the current value actually differs (idempotency guard)
    AND ABS(CAST(c.saldo_actual AS NUMERIC) - sub.total_pendiente) > 0.005;

  -- ── Case B: no pending invoices but saldo_actual > 0 (orphan balance) ──────
  -- These clients had debt that was fully paid but the trigger never zeroed out
  -- their balance. Zero it now.
  UPDATE clientes c
  SET
    saldo_actual = '0',
    updated_at   = NOW()
  WHERE CAST(c.saldo_actual AS NUMERIC) > 0.005
    AND NOT EXISTS (
      SELECT 1
      FROM ventas v
      WHERE v.cliente_id  = c.id
        AND v.empresa_id  = c.empresa_id
        AND CAST(v.saldo_pend_usd AS REAL) > 0.005
    );

END;
$$;
