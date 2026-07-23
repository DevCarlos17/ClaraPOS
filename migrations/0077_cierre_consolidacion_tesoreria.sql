-- Migración 0077: Fundamento para consolidación automática de cierre de caja a Tesorería
--
-- Contexto:
--   - traspasos_tesoreria.cuenta_origen_tipo / cuenta_destino_tipo solo permiten
--     'BANCO' y 'CAJA_FUERTE'. El código ya inserta 'SESION_CAJA' desde
--     crearTraspasoSesionATesoreria y crearTraspasoTesoreriaASesion (pos-tesoreria-integration),
--     lo que rompe la sincronizacion a Supabase con error 23514. Este constraint nunca
--     fue actualizado cuando se agrego sesion_caja_id en la migracion 0072.
--   - movimientos_bancarios_origen_check no incluye 'CIERRE_CONSOLIDACION', el nuevo
--     origen que usara el cierre de caja para depositar automaticamente el total de
--     metodos bancarios/POS al cerrar una sesion (cierre-consolidacion-tesoreria).
--
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, siguiendo el patron de 0073/0027.

ALTER TABLE traspasos_tesoreria DROP CONSTRAINT IF EXISTS traspasos_tesoreria_cuenta_origen_tipo_check;
ALTER TABLE traspasos_tesoreria ADD CONSTRAINT traspasos_tesoreria_cuenta_origen_tipo_check
  CHECK (cuenta_origen_tipo IN ('BANCO','CAJA_FUERTE','SESION_CAJA'));

ALTER TABLE traspasos_tesoreria DROP CONSTRAINT IF EXISTS traspasos_tesoreria_cuenta_destino_tipo_check;
ALTER TABLE traspasos_tesoreria ADD CONSTRAINT traspasos_tesoreria_cuenta_destino_tipo_check
  CHECK (cuenta_destino_tipo IN ('BANCO','CAJA_FUERTE','SESION_CAJA'));

ALTER TABLE movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_check;
ALTER TABLE movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_check
  CHECK (origen IN ('DEPOSITO_CAJA','TRANSFERENCIA_CLIENTE','PAGO_PROVEEDOR','GASTO',
                     'MANUAL','TRASPASO','REVERSO','CIERRE_CONSOLIDACION'));

-- mov_caja_fuerte_origen_check ya incluye 'DEPOSITO_CIERRE' desde su creacion — no requiere cambio.
--
-- La clave de configuracion contable 'COMISION_BANCARIA' (cuenta a la que se cargan las
-- comisiones bancarias detectadas al consolidar el cierre) no requiere schema nuevo: se
-- gestiona igual que cualquier otra clave de cuentas_config, configurable por el usuario
-- desde Configuracion Contable (ver CLAVES_CONFIG en cuentas-config-schema.ts).
