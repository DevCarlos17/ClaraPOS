-- =============================================
-- CLARAPOS: 0036 - DESCUENTO COMERCIAL EN VENTAS
-- Agrega columnas descuento_usd y descuento_bs a la tabla ventas.
-- Permite registrar descuentos/cortesias otorgados en el POS,
-- reportarlos en el cuadre de caja como "Descuentos comerciales"
-- y contabilizarlos en la cuenta 4.1.03 DESCUENTOS EN VENTAS.
-- Depende de: 0006 (ventas), 0021 (DESCUENTO_VENTAS en cuentas_config)
-- =============================================

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS descuento_usd NUMERIC(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_bs  NUMERIC(20, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN ventas.descuento_usd IS 'Descuento comercial otorgado en USD. El total_usd almacenado es NETO (ya descontado).';
COMMENT ON COLUMN ventas.descuento_bs  IS 'Descuento comercial otorgado en Bs. El total_bs almacenado es NETO (ya descontado).';
