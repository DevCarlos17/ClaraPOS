-- ============================================
-- 0014: Agrega permiso ventas.facturar_negativo
-- ============================================
-- Permite a un rol facturar articulos cuyo stock quedaria en negativo.
-- Por defecto solo el Administrador (is_system) tiene este permiso.
--
-- Es IDEMPOTENTE: no duplica si ya existe.
-- ============================================

-- 1. Insertar el permiso si no existe
INSERT INTO permisos (modulo, slug, nombre, descripcion)
SELECT 'ventas', 'ventas.facturar_negativo', 'Facturar en negativo', 'Permite facturar aunque el stock quede en negativo'
WHERE NOT EXISTS (
  SELECT 1 FROM permisos WHERE slug = 'ventas.facturar_negativo'
);
