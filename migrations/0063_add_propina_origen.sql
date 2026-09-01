-- Migración 0063: Agregar 'PROPINA' al CHECK constraint de movimientos_metodo_cobro
--
-- Contexto: al registrar el excedente de un pago en el POS como propina,
-- el código inserta origen = 'PROPINA'. Este valor no estaba incluido en el
-- constraint definido en la migración 0049, lo que producía error 23514
-- (violación de check constraint) al sincronizar vía PowerSync.

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
    'PROPINA'    -- NUEVO: excedente de pago que el cliente deja como propina
  ));
