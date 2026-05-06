-- 0037: Agrega precio_especial_usd (Precio Especial / Distribuidor) a la tabla productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_especial_usd NUMERIC(12,2) NULL;
