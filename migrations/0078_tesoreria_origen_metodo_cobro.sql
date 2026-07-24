-- Migración 0078: Agregar 'INGRESO_TESORERIA' y 'EGRESO_TESORERIA' al CHECK
-- constraint de movimientos_metodo_cobro.origen
--
-- Contexto:
--   El flujo POS<->Tesorería (traspaso manual sesión<->caja fuerte y la nueva
--   consolidación automática de cierre) inserta movimientos_metodo_cobro con
--   origen = 'EGRESO_TESORERIA' (sale de la sesión hacia Tesorería) o
--   'INGRESO_TESORERIA' (entra a la sesión desde Tesorería).
--   Estos valores nunca fueron agregados al CHECK constraint, por lo que Postgres
--   los rechaza con error 400/23514 al sincronizar desde PowerSync: la fila se
--   escribe local en SQLite (sin CHECK) pero al hacer upload a Supabase falla y
--   PowerSync revierte la operación (el registro "aparece y se borra al segundo").
--
--   Esto afecta tanto a la consolidación de cierre (cierre-consolidacion-tesoreria)
--   como al flujo manual POS<->Tesorería preexistente (pos-tesoreria-integration),
--   que compartían el mismo defecto latente que 0077 corrigió para traspasos_tesoreria.
--
-- Patrón idempotente (DROP IF EXISTS + ADD), consistente con 0073/0075.

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
    'PAGO_PROVEEDOR',         -- pago CxP dirigido a sesión de caja activa
    'INGRESO_TESORERIA',      -- entrada a la sesión desde Tesorería (traspaso/envío)
    'EGRESO_TESORERIA'        -- salida de la sesión hacia Tesorería (traspaso/consolidación de cierre)
  ));
