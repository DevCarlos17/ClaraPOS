-- ============================================
-- 0048: Permiso ventas.absorber_diferencial
-- ============================================
-- Permite a un supervisor autorizar que el negocio asuma la pérdida
-- cuando el cliente paga menos del monto facturado (diferencial de cobro).
-- Es IDEMPOTENTE: usa ON CONFLICT DO NOTHING.
-- ============================================

-- 1. Insertar el permiso si no existe
INSERT INTO permisos (modulo, slug, nombre, descripcion)
VALUES (
  'ventas',
  'ventas.absorber_diferencial',
  'Absorber diferencial de cobro',
  'Autoriza que el negocio asuma la pérdida cuando el cliente paga menos del monto facturado'
) ON CONFLICT (slug) DO NOTHING;

-- 2. Asignar a Supervisor (is_system = FALSE: Supervisor es rol de sistema no-admin)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Supervisor'
  AND r.is_system = FALSE
  AND p.slug = 'ventas.absorber_diferencial'
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- 3. Asignar a Administrador (is_system = TRUE)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador'
  AND r.is_system = TRUE
  AND p.slug = 'ventas.absorber_diferencial'
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );
