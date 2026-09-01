-- =============================================================================
-- Migration: 0088_fix_saf_trigger_sign.sql
-- Created:   2026-08-31
-- Depends:   0061_restore_trigger_context.sql (defines actualizar_saldo_cliente)
--
-- ROOT CAUSE:
--   actualizar_saldo_cliente() (restored in 0061) unconditionally recomputes
--   saldo_nuevo for tipo='SAF' as `NEW.saldo_anterior - NEW.monto`. But SAF
--   covers TWO directions the trigger cannot distinguish from `monto` alone
--   (monto is always positive, per movimientos_cuenta_tipo_check):
--     A. Debt-reduction: saldo_anterior - monto   (correctly matches the
--        hardcoded formula)
--     B. Credit-consumption: saldo_anterior + monto (the app correctly
--        computes this, e.g. -0.70 + 0.70 = 0, but the trigger OVERWRITES
--        it with -0.70 - 0.70 = -1.40, doubling the client's credit debt)
--
--   REV and SAL rows already skip recomputation (implicit fallthrough: no
--   branch touches NEW.saldo_nuevo, so the app-provided value survives).
--   SAF needs the same treatment.
--
-- CONSEQUENCE CHAIN:
--   App inserts movimientos_cuenta (tipo='SAF', saldo_anterior=-0.70,
--     saldo_nuevo=0 -- correct: credit fully consumed)
--     -> actualizar_saldo_cliente() [BEFORE INSERT trigger]
--       -> overwrites NEW.saldo_nuevo := -0.70 - 0.70 = -1.40 (WRONG)
--         -> UPDATE clientes SET saldo_actual = -1.40
--   Client's available credit shows $1001.40 instead of $1000. Recurs on
--   every SAF-consume operation, compounding further with each use.
--
-- FIX:
--   SAF branch stops recomputing; trusts NEW.saldo_nuevo like REV/SAL,
--   guarded by a direction-agnostic consistency assertion: the MAGNITUDE of
--   the change (|saldo_nuevo - saldo_anterior|) must equal `monto` within a
--   0.005 tolerance, regardless of direction (both A and B are legitimate).
--   This does NOT validate direction (inherently ambiguous for SAF by
--   design) but DOES catch gross corruption (missing value, wrong magnitude)
--   at INSERT time instead of silently corrupting the ledger a third time.
--   Mirrors the pure TS function in src/features/cxc/lib/saldo-cliente.ts
--   (calcularSaldoNuevoMovimientoCuenta / esSaldoSafConsistente) — see that
--   file's tests for the exact regression scenario. Vitest cannot execute
--   this trigger directly (no Postgres test infra in this repo); manual
--   verification checklist: openspec/changes/saldo-a-favor-fix/manual-verify.md
--
-- FAC/NDB/PAG/NCR branches: UNCHANGED.
--
-- Data repair for already-corrupted clients.saldo_actual: see
-- 0089_repair_saldo_actual_saf.sql (ships separately — non-reversible data
-- mutation decoupled from this revertible code change, per 0061->0062
-- precedent).
--
-- ROLLBACK:
--   Re-apply 0061's CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
--   body verbatim (restores the unconditional SAF recompute).
-- =============================================================================

CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute saldo_nuevo from the saldo_anterior provided in the INSERT.
  -- DO NOT read saldo_actual live from clientes — that created the race
  -- condition fixed in migration 0060. Keep that fix.
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  ELSIF NEW.tipo = 'SAF' THEN
    -- SAF covers two directions the trigger cannot distinguish from monto
    -- alone (monto is always positive, CHECK constraint): debt-reduction
    -- (saldo_anterior - monto) or credit-consumption (saldo_anterior + monto).
    -- Trust the app-computed value (same treatment as REV/SAL below), but
    -- assert internal consistency so a caller bug (e.g. omitted saldo_nuevo)
    -- fails loudly instead of silently corrupting the ledger a third time.
    IF NEW.saldo_nuevo IS NULL
       OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- REV, SAL: saldo_nuevo stays as provided in the INSERT (no recalculation,
  -- unchanged from 0061)

  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
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
