-- =============================================
-- CLARAPOS: 0027 - Agregar 'GASTO' a doc_origen_tipo en movimientos_cuenta_proveedor
-- La restricción CHECK de migration 0024 no incluía 'GASTO', causando error 23514
-- al sincronizar pagos de gastos via PowerSync.
-- =============================================

ALTER TABLE movimientos_cuenta_proveedor
  DROP CONSTRAINT IF EXISTS movimientos_cuenta_proveedor_doc_origen_tipo_check;

ALTER TABLE movimientos_cuenta_proveedor
  ADD CONSTRAINT movimientos_cuenta_proveedor_doc_origen_tipo_check
  CHECK (doc_origen_tipo IN ('FACTURA_COMPRA','PAGO','NC_COMPRA','ND_COMPRA','DEV_COMPRA','GASTO'));
