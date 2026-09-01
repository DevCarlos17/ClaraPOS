-- Migración 0073: Agregar 'COBRO' y 'DIFERENCIAL_CAMBIARIO' al CHECK constraint de movimientos_metodo_cobro
--
-- Contexto:
--   - Al registrar un abono CxC (pago a factura específica o abono global) dirigido a
--     una sesión de caja activa, el código inserta origen = 'COBRO' en movimientos_metodo_cobro.
--     Este valor nunca fue incluido en el constraint, causando error 23514 al sincronizar.
--   - Al registrar el diferencial cambiario en el POS (excedente por diferencia de tasa),
--     el código inserta origen = 'DIFERENCIAL_CAMBIARIO'. Mismo problema.
--
-- Los SELECTs en use-cuadre.ts y sesion-caja-form.tsx ya filtran por origen = 'COBRO'
-- para mostrar cobranzas CxC en el cuadre de caja — la semántica es correcta.

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
    'COBRO',              -- abono CxC dirigido a sesión de caja activa
    'DIFERENCIAL_CAMBIARIO'  -- excedente por diferencia de tasa en POS
  ));
