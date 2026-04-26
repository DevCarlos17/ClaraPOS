-- =============================================
-- CLARAPOS: 0023 - TASAS EN MOVIMIENTOS CUENTA PROVEEDOR
-- Agrega columnas para registrar la moneda original, tasa de pago
-- y el monto en USD a tasa interna/BCV en cada movimiento de pago.
-- Permite mostrar dual-rate en el historial de abonos CxP.
-- =============================================

ALTER TABLE movimientos_cuenta_proveedor
  ADD COLUMN IF NOT EXISTS moneda_pago TEXT,              -- 'USD' o 'BS'
  ADD COLUMN IF NOT EXISTS monto_moneda NUMERIC(12,2),    -- importe en moneda original (Bs o USD)
  ADD COLUMN IF NOT EXISTS tasa_pago NUMERIC(12,4),       -- tasa usada para este pago
  ADD COLUMN IF NOT EXISTS monto_usd_interno NUMERIC(12,2); -- USD a tasa interna/BCV (contabilidad)

-- Poblar filas existentes: monto ya estaba en USD, marcar como tal.
-- Deshabilitamos triggers temporalmente porque prevent_mutation() bloquea UPDATE.
ALTER TABLE movimientos_cuenta_proveedor DISABLE TRIGGER USER;

UPDATE movimientos_cuenta_proveedor
SET
  moneda_pago      = 'USD',
  monto_moneda     = CAST(monto AS NUMERIC),
  tasa_pago        = NULL,
  monto_usd_interno = CAST(monto AS NUMERIC)
WHERE moneda_pago IS NULL;

ALTER TABLE movimientos_cuenta_proveedor ENABLE TRIGGER USER;
