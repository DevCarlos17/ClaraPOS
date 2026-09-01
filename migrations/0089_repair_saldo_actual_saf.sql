-- =============================================================================
-- Migration: 0089_repair_saldo_actual_saf.sql
-- Created:   2026-08-31
-- Depends:   0088_fix_saf_trigger_sign.sql (trigger must be fixed FIRST, or
--            this repair's correct values get re-corrupted by the next SAF
--            insert)
--
-- WHY:
--   Before 0088, actualizar_saldo_cliente() unconditionally recomputed
--   saldo_nuevo for tipo='SAF' as `saldo_anterior - monto`, silently
--   corrupting the credit-consumption direction (doubling the client's
--   saldo a favor on every consumption).
--
--   Historical movimientos_cuenta rows' stored saldo_nuevo is ITSELF
--   corrupted for SAF-consume rows — cannot be trusted as a repair source.
--   saldo_anterior on a given row also cascades corruption forward, because
--   each operation read the live (possibly already-wrong) clientes.saldo_actual
--   at insert time. The ONLY correct fix is a full chronological replay from
--   zero per client, re-deriving SAF direction from the RUNNING BALANCE'S
--   OWN SIGN at each step (not from any stored saldo_nuevo/saldo_anterior,
--   except REV/SAL rows which are trusted checkpoints/resets, including SAL
--   opening-balance imports from migration 0043).
--
-- REPAIR STRATEGY (ledger replay, NOT migrations/0062's ventas-sum formula):
--   Per (empresa_id, cliente_id), replay movimientos_cuenta chronologically
--   (fecha, created_at, id):
--     FAC/NDB      -> running += monto
--     PAG/NCR      -> running -= monto
--     SAF          -> running >= 0 ? running -= monto : running += monto
--                     (this single sign rule correctly handles SAF creation
--                     which starts >=0, debt-reduction which stays positive,
--                     AND credit-consumption which starts negative)
--     REV/SAL      -> running := saldo_nuevo (trusted checkpoint)
--   0062's "SUM(ventas.saldo_pend_usd)" formula is the WRONG source of truth
--   here — that repair targeted the 0057-era total-trigger-failure bug, not
--   this wrong-sign bug; it also cannot represent negative (credit) balances.
--
-- SCOPE:
--   Covers ALL clients with movimientos_cuenta history (self-verifying — no
--   need to pre-guess which clients were affected by the SAF bug specifically).
--   Multi-tenant: every replay is scoped to a single (empresa_id, cliente_id)
--   pair; the final UPDATE filters on both columns.
--
-- KNOWN EDGE CASE:
--   Same-(fecha, created_at) ties fall back to `id` ordering, which is not
--   causally guaranteed. Acceptable and documented — not blocking, matches
--   the tolerance-guarded idempotency pattern used everywhere else in this
--   migration.
--
-- SAFE TO RUN:
--   - Idempotent: re-running yields the same `running` per client: UPDATE
--     only fires where drift > $0.005 (threshold-guarded, matches 0061/0062).
--   - Uses set_config to bypass validate_cliente_update (same pattern as
--     0061/0062).
--
-- ROLLBACK:
--   Not reversible (data repair, not a schema/logic change). If a specific
--   client's saldo_actual needs reverting, restore it from a Supabase backup
--   taken before this migration ran.
-- =============================================================================

DO $$
DECLARE
  cli RECORD;
  mov RECORD;
  running NUMERIC(12,2);
BEGIN
  -- Authorize the direct UPDATE for this repair block (transaction-local)
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);

  FOR cli IN SELECT DISTINCT empresa_id, cliente_id FROM movimientos_cuenta LOOP
    running := 0;

    FOR mov IN
      SELECT tipo, monto, saldo_nuevo
      FROM movimientos_cuenta
      WHERE empresa_id = cli.empresa_id AND cliente_id = cli.cliente_id
      ORDER BY fecha ASC, created_at ASC, id ASC
    LOOP
      IF mov.tipo IN ('FAC', 'NDB') THEN
        running := running + mov.monto;
      ELSIF mov.tipo IN ('PAG', 'NCR') THEN
        running := running - mov.monto;
      ELSIF mov.tipo = 'SAF' THEN
        running := CASE WHEN running >= 0 THEN running - mov.monto ELSE running + mov.monto END;
      ELSIF mov.tipo IN ('REV', 'SAL') THEN
        running := mov.saldo_nuevo;
      END IF;
    END LOOP;

    UPDATE clientes
    SET saldo_actual = running,
        updated_at   = NOW()
    WHERE id = cli.cliente_id
      AND empresa_id = cli.empresa_id
      AND ABS(saldo_actual - running) > 0.005;
  END LOOP;
END;
$$;
