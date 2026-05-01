-- 0029_drop_monto_bs_gastos.sql
-- Hace monto_bs nullable en gastos.
-- El equivalente en Bs se calcula dinámicamente en el frontend como monto_usd * tasa_actual.
-- No se elimina la columna para mantener compatibilidad con datos existentes.

ALTER TABLE gastos ALTER COLUMN monto_bs DROP NOT NULL;
ALTER TABLE gastos ALTER COLUMN monto_bs SET DEFAULT NULL;
