-- =============================================
-- Migracion 0006: Duracion por defecto para servicios
-- Agrega duracion_min a productos (solo relevante para tipo = 'S')
-- Valores validos: multiplos de 15 entre 15 y 120 (minutos)
-- =============================================

ALTER TABLE productos ADD COLUMN IF NOT EXISTS duracion_min INTEGER;

COMMENT ON COLUMN productos.duracion_min IS 'Duracion por defecto del servicio en minutos. Solo aplica para tipo S. Multiplos de 15, maximo 120.';
