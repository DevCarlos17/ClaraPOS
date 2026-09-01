-- 0074_pos_saf_allocation.sql
--
-- Marca los pagos creados como asignación interna del excedente POS (SAF aplicado
-- a facturas crédito desde el cobro modal). Estos registros representan
-- reasignación de efectivo ya contabilizado en la venta original y NO deben
-- sumarse al total del método de pago ni al saldo esperado de caja.
--
-- is_pos_saf_allocation = 1 → pago generado internamente desde el POS (SAF-to-FACTURAS)
-- is_pos_saf_allocation = 0 / NULL → pago normal (venta contado o cobro CxC standalone)

ALTER TABLE pagos ADD COLUMN IF NOT EXISTS is_pos_saf_allocation INTEGER DEFAULT 0;
