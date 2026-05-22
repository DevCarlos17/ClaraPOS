-- Agrega contador de reprogramaciones a citas
-- Permite saber si una cita fue reprogramada al menos una vez (label)
-- y cuántas veces total (analítica por profesional)
ALTER TABLE citas ADD COLUMN IF NOT EXISTS reprogramaciones_count INTEGER NOT NULL DEFAULT 0;
