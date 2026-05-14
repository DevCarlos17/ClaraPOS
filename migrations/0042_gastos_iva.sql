-- Migración 0042: Agregar campos de desglose fiscal IVA a gastos
-- Los gastos existentes quedan con tipo_impuesto='Exento', sin IVA.

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS tipo_impuesto TEXT NOT NULL DEFAULT 'Exento'
    CHECK (tipo_impuesto IN ('Gravable', 'Exento', 'Exonerado')),
  ADD COLUMN IF NOT EXISTS porcentaje_iva NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_imponible_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_iva_usd NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Para registros existentes: la base imponible es el monto_usd y el IVA es 0
UPDATE gastos
  SET base_imponible_usd = CAST(monto_usd AS NUMERIC),
      monto_iva_usd = 0
  WHERE base_imponible_usd = 0 AND monto_usd IS NOT NULL;
