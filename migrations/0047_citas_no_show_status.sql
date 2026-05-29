-- =============================================
-- MIGRACION 0047: Agregar NO_SHOW al constraint cita_status
-- Aplicar desde Supabase Dashboard > SQL Editor
-- =============================================
-- Contexto: el check constraint de cita_status fue creado en 0005_citas_enhanced.sql
-- sin incluir 'NO_SHOW'. El frontend lo usa y Supabase rechaza el PATCH con error 23514.

ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_cita_status_check;

ALTER TABLE citas
  ADD CONSTRAINT citas_cita_status_check
  CHECK (cita_status IN ('RESERVADA', 'EN_PROCESO', 'REALIZADA', 'CANCELADA', 'NO_SHOW'));
