-- =============================================
-- CLARAPOS: 0030 - CAJA MOVIMIENTOS MANUALES
-- Agrega soporte para ingresos/egresos manuales de efectivo,
-- avances y prestamos, y vincula movimientos a sesiones de caja.
-- =============================================

-- 1. Agregar columna concepto a movimientos_metodo_cobro
ALTER TABLE movimientos_metodo_cobro
  ADD COLUMN IF NOT EXISTS concepto TEXT;

-- 2. Agregar columna sesion_caja_id a movimientos_metodo_cobro
ALTER TABLE movimientos_metodo_cobro
  ADD COLUMN IF NOT EXISTS sesion_caja_id UUID REFERENCES sesiones_caja(id) ON DELETE SET NULL;

-- 3. Expandir CHECK de origen para incluir movimientos manuales
--    Primero eliminamos la restriccion existente y la re-creamos con los nuevos valores
ALTER TABLE movimientos_metodo_cobro
  DROP CONSTRAINT IF EXISTS movimientos_metodo_cobro_origen_check;

ALTER TABLE movimientos_metodo_cobro
  ADD CONSTRAINT movimientos_metodo_cobro_origen_check
  CHECK (origen IN (
    'VENTA',
    'PAGO_CXC',
    'DEPOSITO_BANCO',
    'RETIRO',
    'AJUSTE',
    'APERTURA_CAJA',
    'CIERRE_CAJA',
    'INGRESO_MANUAL',
    'EGRESO_MANUAL',
    'AVANCE',
    'PRESTAMO'
  ));

-- 4. Indice en sesion_caja_id para consultas de cierre
CREATE INDEX IF NOT EXISTS idx_mov_metodo_cobro_sesion
  ON movimientos_metodo_cobro(sesion_caja_id)
  WHERE sesion_caja_id IS NOT NULL;

-- 5. Agregar permiso caja.movimientos_manual a la tabla permisos
INSERT INTO permisos (modulo, slug, nombre, descripcion, is_active)
VALUES (
  'caja',
  'caja.movimientos_manual',
  'Movimientos Manuales de Caja',
  'Permite registrar ingresos, egresos, avances y prestamos manuales en la caja',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- 6. Asignar permiso caja.movimientos_manual al rol Supervisor
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Supervisor'
  AND r.is_system = FALSE
  AND p.slug = 'caja.movimientos_manual'
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );
