-- Migration: 0052_sesion_detalle_nullable_metodo_moneda
-- Permite filas virtuales en sesiones_caja_detalle para metodos sin FK real (e.g. SAF).
-- Relaja las restricciones NOT NULL y elimina las FK de metodo_cobro_id y moneda_id
-- para permitir filas de snapshot con metodo_cobro_id = NULL, moneda_id = NULL.
-- Las filas existentes no se ven afectadas (tienen valores no-nulos).
-- Rollback: ver abajo (solo si no hay filas con NULL en esas columnas).

-- Eliminar FK constraint de metodo_cobro_id
ALTER TABLE sesiones_caja_detalle
  DROP CONSTRAINT IF EXISTS sesiones_caja_detalle_metodo_cobro_id_fkey;

-- Permitir NULL en metodo_cobro_id
ALTER TABLE sesiones_caja_detalle
  ALTER COLUMN metodo_cobro_id DROP NOT NULL;

-- Eliminar FK constraint de moneda_id
ALTER TABLE sesiones_caja_detalle
  DROP CONSTRAINT IF EXISTS sesiones_caja_detalle_moneda_id_fkey;

-- Permitir NULL en moneda_id
ALTER TABLE sesiones_caja_detalle
  ALTER COLUMN moneda_id DROP NOT NULL;

-- Rollback (solo ejecutar si no existen filas con metodo_cobro_id IS NULL):
-- ALTER TABLE sesiones_caja_detalle ALTER COLUMN metodo_cobro_id SET NOT NULL;
-- ALTER TABLE sesiones_caja_detalle
--   ADD CONSTRAINT sesiones_caja_detalle_metodo_cobro_id_fkey
--   FOREIGN KEY (metodo_cobro_id) REFERENCES metodos_cobro(id);
-- ALTER TABLE sesiones_caja_detalle ALTER COLUMN moneda_id SET NOT NULL;
-- ALTER TABLE sesiones_caja_detalle
--   ADD CONSTRAINT sesiones_caja_detalle_moneda_id_fkey
--   FOREIGN KEY (moneda_id) REFERENCES monedas(id);
