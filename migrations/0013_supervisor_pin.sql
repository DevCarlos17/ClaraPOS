-- =============================================
-- 0013_supervisor_pin.sql
-- PIN de supervision de caja (independiente de credenciales de cuenta)
-- =============================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin_supervisor_hash TEXT NULL;

COMMENT ON COLUMN usuarios.pin_supervisor_hash IS
  'SHA-256(pin_numerico || empresa_id). PIN independiente para autorizar operaciones de caja. Verificacion 100% offline via SQLite local.';
