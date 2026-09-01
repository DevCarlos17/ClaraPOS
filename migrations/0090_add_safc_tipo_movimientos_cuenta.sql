-- =============================================================================
-- Migration: 0090_add_safc_tipo_movimientos_cuenta.sql
-- Created:   2026-09-01
-- Depends:   0088_fix_saf_trigger_sign.sql (actualizar_saldo_cliente trigger)
--
-- CONTEXT (openspec/changes/cxc-saldo-favor-modelo/design.md, Decision 1/2):
--   'SAF' has historically been overloaded for two opposite operations:
--     - Credit CREATION (use-ventas.ts Paso B, use-cxc.ts registrarSafExcedente)
--     - Credit CONSUMPTION (use-cxc.ts aplicarSaldoFavor, registrarPagoFactura)
--   Slice A's derived credit read (`SUM(SAFC) - SUM(SAF)`, see use-cxc.ts
--   DEUDA_CREDITO_CLIENTE_SELECT) requires a SEPARATE tipo for creation so
--   consumption can be subtracted correctly. This migration only widens the
--   CHECK constraint — the app-side write paths that switch tipo='PAG'/'SAF'
--   (creation) to tipo='SAFC' ship in the same PR (Slice B).
--
-- WHY NO TRIGGER CHANGE IS NEEDED:
--   actualizar_saldo_cliente() (0088) only special-cases FAC/NDB/PAG/NCR/SAF;
--   any other tipo (REV, SAL, and now SAFC) falls through the implicit else
--   and trusts the app-supplied NEW.saldo_nuevo unchanged. SAFC's app-side
--   saldo_anterior/saldo_nuevo math is bit-identical to today's PAG write
--   (saldo_nuevo = saldo_anterior - monto) — only the tipo LABEL changes.
--
-- ROLLBACK:
--   ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
--   ALTER TABLE movimientos_cuenta ADD CONSTRAINT movimientos_cuenta_tipo_check
--     CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL', 'SAF'));
-- =============================================================================

ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
ALTER TABLE movimientos_cuenta
  ADD CONSTRAINT movimientos_cuenta_tipo_check
  CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL', 'SAF', 'SAFC'));
