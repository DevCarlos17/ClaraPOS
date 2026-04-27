-- ============================================================
-- Migración 0026: Campos bimonetarios en gastos
-- Agrega soporte para tasa paralela, moneda de factura y
-- saldo pendiente (para integración CXP)
-- ============================================================

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS nro_control        TEXT,
  ADD COLUMN IF NOT EXISTS usa_tasa_paralela  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda_factura     TEXT    NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS tasa_proveedor     NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS monto_factura      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS saldo_pendiente_usd NUMERIC(12,2) DEFAULT 0;

-- Poblar monto_factura y saldo_pendiente_usd solo en registros REGISTRADO.
-- Los gastos ANULADO no se tocan (el trigger prevent_gasto_mutation los bloquea
-- y de todas formas nunca aparecen en CXP).
UPDATE gastos
SET
  monto_factura       = CAST(monto_usd AS NUMERIC),
  saldo_pendiente_usd = 0          -- registros anteriores se asumen totalmente pagados
WHERE monto_factura IS NULL
  AND status = 'REGISTRADO';

-- Añadir CHECK constraint para moneda_factura
ALTER TABLE gastos
  ADD CONSTRAINT gastos_moneda_factura_check
  CHECK (moneda_factura IN ('USD', 'BS'));
