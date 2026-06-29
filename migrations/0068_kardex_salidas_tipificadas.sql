-- =============================================
-- CLARAPOS: 0068 - Kardex Salidas Tipificadas
-- Agrega tipo_salida a movimientos_inventario (MERMA, EXTRAVIO, CONSUMO_INTERNO)
-- y doc_origen_id / doc_origen_tipo a gastos para trazabilidad inversa.
-- Todas las columnas son nullable — migracion zero-downtime, registros
-- existentes quedan con NULL. La tabla movimientos_inventario es inmutable:
-- solo se agregan columnas, nunca se modifican registros.
-- =============================================

-- 1. tipo_salida en movimientos_inventario (tabla inmutable — nullable, sin DEFAULT)
ALTER TABLE movimientos_inventario
  ADD COLUMN IF NOT EXISTS tipo_salida TEXT;

ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS chk_mov_inv_tipo_salida;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_mov_inv_tipo_salida
  CHECK (tipo_salida IS NULL OR tipo_salida IN ('MERMA', 'EXTRAVIO', 'CONSUMO_INTERNO'));

-- 2. Trazabilidad de origen en gastos
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS doc_origen_id UUID;

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS doc_origen_tipo TEXT;
