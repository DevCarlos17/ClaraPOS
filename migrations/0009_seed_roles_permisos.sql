-- ============================================
-- 0009: Seed roles y permisos por defecto
-- ============================================
-- Este script puebla roles y rol_permisos para empresas existentes
-- que tengan roles vacios (sin rol_permisos asignados).
--
-- Ejecutar en Supabase SQL Editor.
-- Es IDEMPOTENTE: si ya existen datos, no duplica.
-- ============================================

-- 1. Renombrar rol "Propietario" a "Administrador" si existe
UPDATE roles
SET nombre = 'Administrador',
    descripcion = 'Rol de sistema con acceso total'
WHERE nombre = 'Propietario' AND is_system = TRUE;

-- 2. Asignar rol_id del Administrador al usuario que no lo tenga
-- (usuarios cuyo rol_id es NULL y pertenecen a una empresa con rol Administrador)
UPDATE usuarios u
SET rol_id = r.id
FROM roles r
WHERE u.empresa_id = r.empresa_id
  AND r.is_system = TRUE
  AND u.rol_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM usuarios u2
    WHERE u2.empresa_id = u.empresa_id
      AND u2.rol_id IS NOT NULL
      AND u2.id != u.id
  );

-- 3. Insertar rol_permisos para Supervisor (si no existen ya)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Supervisor'
  AND r.is_system = FALSE
  AND p.slug IN (
    'inventario.ver',
    'inventario.crear',
    'inventario.editar',
    'inventario.ajustar',
    'inventario.editar_precios',
    'ventas.crear',
    'ventas.anular',
    'clientes.gestionar',
    'clientes.credito',
    'compras.crear',
    'caja.abrir',
    'caja.cerrar',
    'caja.movimientos',
    'reportes.ver',
    'reportes.cuadre_caja',
    'config.tasas',
    'config.metodos_cobro',
    'contabilidad.gastos',
    'cxc.ver',
    'cxp.ver',
    'cxp.pagar',
    'clinica.acceso'
  )
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- 4. Insertar rol_permisos para Cajero (si no existen ya)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Cajero'
  AND r.is_system = FALSE
  AND p.slug IN (
    'inventario.ver',
    'ventas.crear',
    'clientes.gestionar',
    'caja.abrir',
    'caja.cerrar',
    'reportes.ver'
  )
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );
