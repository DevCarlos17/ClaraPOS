-- =============================================
-- CLARAPOS: 0028 - TASAS EN MOVIMIENTOS CUENTA (CxC)
-- Agrega columnas para registrar la moneda original, tasa de pago
-- y el monto en la moneda original en cada movimiento de la cuenta
-- del cliente. Permite trazabilidad completa de pagos en Bs vs USD.
-- Mismo patron que migracion 0023 para movimientos_cuenta_proveedor.
-- =============================================

ALTER TABLE movimientos_cuenta
  ADD COLUMN IF NOT EXISTS moneda_pago TEXT,           -- 'USD' o 'BS'
  ADD COLUMN IF NOT EXISTS monto_moneda NUMERIC(12,2), -- importe en moneda original del pago
  ADD COLUMN IF NOT EXISTS tasa_pago NUMERIC(12,4);    -- tasa usada para la conversion

-- Poblar filas existentes: monto ya estaba en USD, marcar como tal.
-- Deshabilitamos triggers temporalmente porque prevent_mutation() bloquea UPDATE.
ALTER TABLE movimientos_cuenta DISABLE TRIGGER USER;

UPDATE movimientos_cuenta
SET
  moneda_pago  = 'USD',
  monto_moneda = CAST(monto AS NUMERIC),
  tasa_pago    = NULL
WHERE moneda_pago IS NULL
  AND tipo IN ('PAG', 'REV');

ALTER TABLE movimientos_cuenta ENABLE TRIGGER USER;
