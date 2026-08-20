-- ============================================================
-- 0083_deposito_multitenant.sql
-- Slice 1a: Inventario Multideposito - Foundation
--
-- Agrega productos.deposito_id (deposito default de un producto,
-- usado para resolver donde entra su stock en compras/kardex
-- cuando no hay otro contexto que lo sobrescriba) y respalda
-- (backfill) cajas.deposito_id para filas existentes que quedaron
-- NULL antes de esta migracion.
--
-- Sigue el patron nullable-primero -> backfill de
-- 0040_nro_caja.sql. El NOT NULL de productos.deposito_id queda
-- diferido a una migracion de seguimiento una vez verificado el
-- backfill en produccion (ver design.md).
--
-- No crea las tablas de traspasos_inventario (eso es 0084, Slice 3a).
--
-- RLS: productos ya tiene RLS + policies (select/insert/update
-- "_own_empresa", filtradas por empresa_id via
-- public.current_empresa_id()). RLS es row-level, no column-level,
-- por lo que agregar una columna nullable NO requiere cambios de
-- policy. cajas no cambia de esquema (deposito_id ya existe desde
-- 0005_caja_tesoreria.sql), solo se backfillea.
-- ============================================================

-- 1. productos.deposito_id (FK nullable a depositos)
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS deposito_id UUID REFERENCES depositos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_deposito ON productos(deposito_id);

-- 2. Backfill productos.deposito_id desde el deposito principal de
--    la empresa. Idempotente (solo toca filas con deposito_id NULL).
--    Si una empresa no tiene deposito es_principal, la subquery no
--    devuelve filas y deposito_id queda NULL (no falla, no bloquea).
UPDATE productos p
SET deposito_id = (
  SELECT id FROM depositos
  WHERE empresa_id = p.empresa_id
    AND es_principal = TRUE
  LIMIT 1
)
WHERE p.deposito_id IS NULL;

-- 3. Backfill cajas.deposito_id (columna ya existe desde
--    0005_caja_tesoreria.sql, puede estar NULL). Mismo patron
--    idempotente y seguro que el paso anterior.
UPDATE cajas c
SET deposito_id = (
  SELECT id FROM depositos
  WHERE empresa_id = c.empresa_id
    AND es_principal = TRUE
  LIMIT 1
)
WHERE c.deposito_id IS NULL;
