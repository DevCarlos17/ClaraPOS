-- Agregar campo codigo_barras a productos
-- Soporta EAN-13, UPC-A, Code128, QR y cualquier formato de texto
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barras TEXT;

-- Indice unico por empresa para evitar duplicados entre productos de la misma empresa
-- Permite que el mismo EAN exista en empresas distintas
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_codigo_barras
  ON productos(empresa_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL;
