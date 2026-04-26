-- 0025_gastos_nro_factura.sql
-- Agrega columna nro_factura a gastos para almacenar el numero de factura del proveedor.
-- Si el usuario no lo ingresa, el sistema genera uno automaticamente.

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS nro_factura TEXT;

-- Publicar en powersync
ALTER PUBLICATION powersync ADD TABLE gastos;
