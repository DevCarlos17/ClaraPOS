-- Migración 0049: Agregar 'COBRO_PRESTAMO' al CHECK constraint de movimientos_metodo_cobro
--
-- Contexto: al registrar un abono a un préstamo desde el módulo de Préstamos o CxC,
-- se escribe un movimiento con origen = 'COBRO_PRESTAMO' para el historial de abonos.
-- Este origen no estaba incluido en el constraint de la migración 0041.

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
    'COBRO_PRESTAMO'   -- NUEVO: abono a préstamo desde módulo Préstamos o CxC
  ));
