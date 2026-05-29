-- ============================================
-- 0047: Permisos del módulo Citas / Agenda
-- ============================================
-- Inserta los permisos citas.* que estaban definidos en el
-- código (use-permissions.ts) pero faltaban en la tabla permisos.
-- Asigna los permisos a los roles Supervisor y Cajero.
-- Es IDEMPOTENTE: usa ON CONFLICT DO NOTHING.
-- ============================================

-- 1. Insertar permisos del módulo Citas
INSERT INTO permisos (modulo, slug, nombre, descripcion)
VALUES
  ('citas', 'citas.ver',       'Ver citas',       'Ver el calendario y panel de citas'),
  ('citas', 'citas.crear',     'Crear citas',      'Crear y editar citas propias'),
  ('citas', 'citas.gestionar', 'Gestionar citas',  'Autorizar sobreturnos, reprogramar y cancelar cualquier cita'),
  ('citas', 'citas.horarios',  'Gestionar horarios','Configurar horarios del staff')
ON CONFLICT (slug) DO NOTHING;

-- 2. Asignar a Supervisor
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Supervisor'
  AND r.is_system = FALSE
  AND p.slug IN ('citas.ver', 'citas.crear', 'citas.gestionar', 'citas.horarios')
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- 3. Asignar a Cajero (solo ver y crear)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Cajero'
  AND r.is_system = FALSE
  AND p.slug IN ('citas.ver', 'citas.crear')
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );
