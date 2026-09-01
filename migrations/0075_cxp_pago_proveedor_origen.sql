-- Migración 0075: Agregar 'PAGO_PROVEEDOR' al CHECK constraint de movimientos_metodo_cobro
--
-- Contexto:
--   Al registrar un pago de CxP (cuentas por pagar) dirigido a una sesión de caja activa,
--   el código inserta origen = 'PAGO_PROVEEDOR' en movimientos_metodo_cobro para que el
--   pago aparezca como egreso en el cuadre de caja de la sesión.
--   Este valor no estaba incluido en el constraint, causando error 400/23514 al sincronizar.

ALTER TABLE movimientos_metodo_cobro
  DROP CONSTRAINT IF EXISTS movimientos_metodo_cobro_origen_check;

ALTER TABLE movimientos_metodo_cobro
  ADD CONSTRAINT movimientos_metodo_cobro_origen_check
  CHECK (origen IN (
    'VENTA',
    'PAGO_CXC',
    'DEPOSITO_BANCO',
    'RETIRO',
    'AJUSTE',
    'APERTURA_CAJA',
    'CIERRE_CAJA',
    'INGRESO_MANUAL',
    'EGRESO_MANUAL',
    'AVANCE',
    'PRESTAMO',
    'VUELTO',
    'COBRO_PRESTAMO',
    'PROPINA',
    'COBRO',                  -- abono CxC dirigido a sesión de caja activa
    'DIFERENCIAL_CAMBIARIO',  -- excedente por diferencia de tasa en POS
    'PAGO_PROVEEDOR'          -- pago CxP dirigido a sesión de caja activa
  ));
