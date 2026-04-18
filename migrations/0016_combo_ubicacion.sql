-- Migracion 0016: Tipo Combo/Receta + Campo Ubicacion
-- Agrega soporte para articulos compuestos (tipo='C') y campo ubicacion en productos

-- 1. Agregar columna ubicacion
ALTER TABLE productos ADD COLUMN IF NOT EXISTS ubicacion TEXT;

-- 2. Modificar CHECK de tipo para incluir 'C'
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_tipo_check;
ALTER TABLE productos ADD CONSTRAINT productos_tipo_check CHECK (tipo IN ('P', 'S', 'C'));

-- 3. Modificar constraint de stock para incluir 'C' (combos no manejan stock propio)
ALTER TABLE productos DROP CONSTRAINT IF EXISTS chk_servicio_stock;
ALTER TABLE productos ADD CONSTRAINT chk_servicio_stock CHECK (
  tipo NOT IN ('S', 'C') OR (stock = 0 AND stock_minimo = 0)
);

-- 4. Actualizar publicacion PowerSync para incluir la nueva columna
-- (si la tabla ya estaba en la publicacion, los cambios de columna se propagan automaticamente)
