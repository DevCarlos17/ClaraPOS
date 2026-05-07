-- ============================================================
-- 0040_nro_caja.sql
-- Correlativos de factura por caja
--
-- Agrega nro_caja (entero secuencial por empresa) a la tabla
-- cajas. Este numero es el prefijo del nro_factura:
--   Caja 1 → C01-000001, C01-000002, ...
--   Caja 2 → C02-000001, C02-000002, ...
--
-- Nunca colisionan entre cajas. Dentro de cada caja el
-- correlativo es continuo y sin huecos.
-- ============================================================

-- 1. Agregar columna (nullable primero para poder poblar)
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS nro_caja SMALLINT;

-- 2. Asignar numeros a cajas existentes (por empresa, por orden de creacion)
UPDATE cajas c
SET nro_caja = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY empresa_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM cajas
) sub
WHERE c.id = sub.id
  AND c.nro_caja IS NULL;

-- 3. Hacer NOT NULL y agregar constraint de unicidad
ALTER TABLE cajas ALTER COLUMN nro_caja SET NOT NULL;

ALTER TABLE cajas
  ADD CONSTRAINT uq_cajas_empresa_nro_caja UNIQUE (empresa_id, nro_caja);

-- 4. Trigger que auto-asigna nro_caja en inserts futuros
CREATE OR REPLACE FUNCTION assign_nro_caja()
RETURNS TRIGGER AS $$
BEGIN
  NEW.nro_caja := COALESCE(
    (SELECT MAX(nro_caja) + 1 FROM cajas WHERE empresa_id = NEW.empresa_id),
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_nro_caja
  BEFORE INSERT ON cajas
  FOR EACH ROW EXECUTE FUNCTION assign_nro_caja();
