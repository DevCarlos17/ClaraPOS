-- =============================================================================
-- 0043_saldo_inicial_import.sql
-- Ampliar CHECK CONSTRAINTs para soportar tipo='SALDO_INICIAL' en ventas y
-- facturas_compra, y tipo='SAL' en movimientos_cuenta / movimientos_cuenta_proveedor.
-- Necesario para la funcionalidad de importacion de saldos iniciales (CXC / CXP).
-- =============================================================================

-- 1. ventas.tipo
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_tipo_check;
ALTER TABLE ventas
  ADD CONSTRAINT ventas_tipo_check
  CHECK (tipo IN ('CONTADO', 'CREDITO', 'SALDO_INICIAL'));

-- 2. facturas_compra.tipo
ALTER TABLE facturas_compra DROP CONSTRAINT IF EXISTS facturas_compra_tipo_check;
ALTER TABLE facturas_compra
  ADD CONSTRAINT facturas_compra_tipo_check
  CHECK (tipo IN ('CONTADO', 'CREDITO', 'SALDO_INICIAL'));

-- 3. movimientos_cuenta.tipo  ('SAL' = Saldo Inicial de apertura)
ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
ALTER TABLE movimientos_cuenta
  ADD CONSTRAINT movimientos_cuenta_tipo_check
  CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL'));

-- 4. movimientos_cuenta.doc_origen_tipo
ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_doc_origen_tipo_check;
ALTER TABLE movimientos_cuenta
  ADD CONSTRAINT movimientos_cuenta_doc_origen_tipo_check
  CHECK (doc_origen_tipo IN ('VENTA', 'PAGO', 'NOTA_CREDITO', 'NOTA_DEBITO', 'SALDO_INICIAL'));

-- 5. movimientos_cuenta_proveedor.tipo  ('SAL' = Saldo Inicial de apertura)
ALTER TABLE movimientos_cuenta_proveedor DROP CONSTRAINT IF EXISTS movimientos_cuenta_proveedor_tipo_check;
ALTER TABLE movimientos_cuenta_proveedor
  ADD CONSTRAINT movimientos_cuenta_proveedor_tipo_check
  CHECK (tipo IN ('FAC', 'PAG', 'NC', 'ND', 'DEV', 'SAL'));
