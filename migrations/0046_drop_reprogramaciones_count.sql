-- Elimina contador de reprogramaciones de la tabla citas.
-- El conteo ahora se deriva de cita_log WHERE accion = 'REPROGRAMADA'.
ALTER TABLE citas DROP COLUMN IF EXISTS reprogramaciones_count;
