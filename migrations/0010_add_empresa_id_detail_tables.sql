-- ============================================
-- MIGRACION 0010: Agregar empresa_id a tablas detalle
-- ============================================
-- PowerSync solo soporta queries simples (SELECT FROM tabla WHERE col = param).
-- Estas 4 tablas no tenian empresa_id directo, lo que impedia sincronizarlas.
-- Esta migracion agrega empresa_id, lo puebla desde la tabla padre,
-- y crea triggers para auto-popularlo en INSERTs futuros.
-- ============================================

-- ============================================
-- 1. ROL_PERMISOS
-- ============================================

ALTER TABLE rol_permisos ADD COLUMN IF NOT EXISTS empresa_id UUID;

UPDATE rol_permisos rp
SET empresa_id = r.empresa_id
FROM roles r
WHERE rp.rol_id = r.id
  AND rp.empresa_id IS NULL;

ALTER TABLE rol_permisos ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE rol_permisos ADD CONSTRAINT fk_rol_permisos_empresa
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_rol_permisos_empresa ON rol_permisos(empresa_id);

CREATE OR REPLACE FUNCTION set_rol_permisos_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := (SELECT empresa_id FROM roles WHERE id = NEW.rol_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_rol_permisos_empresa
  BEFORE INSERT ON rol_permisos
  FOR EACH ROW EXECUTE FUNCTION set_rol_permisos_empresa_id();

-- ============================================
-- 2. TENANT_PERMISOS
-- ============================================
-- En ClaraPOS cada tenant tiene 1 empresa (1:1).
-- Se agrega empresa_id para poder sincronizar con PowerSync.

ALTER TABLE tenant_permisos ADD COLUMN IF NOT EXISTS empresa_id UUID;

UPDATE tenant_permisos tp
SET empresa_id = e.id
FROM empresas e
WHERE tp.tenant_id = e.tenant_id
  AND tp.empresa_id IS NULL;

-- Puede haber filas huerfanas si el tenant no tiene empresa aun
DELETE FROM tenant_permisos WHERE empresa_id IS NULL;

ALTER TABLE tenant_permisos ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE tenant_permisos ADD CONSTRAINT fk_tenant_permisos_empresa
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tenant_permisos_empresa ON tenant_permisos(empresa_id);

CREATE OR REPLACE FUNCTION set_tenant_permisos_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := (SELECT id FROM empresas WHERE tenant_id = NEW.tenant_id LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_tenant_permisos_empresa
  BEFORE INSERT ON tenant_permisos
  FOR EACH ROW EXECUTE FUNCTION set_tenant_permisos_empresa_id();

-- ============================================
-- 3. AJUSTES_DET
-- ============================================

ALTER TABLE ajustes_det ADD COLUMN IF NOT EXISTS empresa_id UUID;

UPDATE ajustes_det ad
SET empresa_id = a.empresa_id
FROM ajustes a
WHERE ad.ajuste_id = a.id
  AND ad.empresa_id IS NULL;

-- Eliminar filas huerfanas sin ajuste padre
DELETE FROM ajustes_det WHERE empresa_id IS NULL;

ALTER TABLE ajustes_det ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE ajustes_det ADD CONSTRAINT fk_ajustes_det_empresa
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ajustes_det_empresa ON ajustes_det(empresa_id);

CREATE OR REPLACE FUNCTION set_ajustes_det_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := (SELECT empresa_id FROM ajustes WHERE id = NEW.ajuste_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_ajustes_det_empresa
  BEFORE INSERT ON ajustes_det
  FOR EACH ROW EXECUTE FUNCTION set_ajustes_det_empresa_id();

-- ============================================
-- 4. SESIONES_CAJA_DETALLE
-- ============================================

ALTER TABLE sesiones_caja_detalle ADD COLUMN IF NOT EXISTS empresa_id UUID;

UPDATE sesiones_caja_detalle scd
SET empresa_id = sc.empresa_id
FROM sesiones_caja sc
WHERE scd.sesion_caja_id = sc.id
  AND scd.empresa_id IS NULL;

DELETE FROM sesiones_caja_detalle WHERE empresa_id IS NULL;

ALTER TABLE sesiones_caja_detalle ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE sesiones_caja_detalle ADD CONSTRAINT fk_sesion_detalle_empresa
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sesion_detalle_empresa ON sesiones_caja_detalle(empresa_id);

CREATE OR REPLACE FUNCTION set_sesion_detalle_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := (SELECT empresa_id FROM sesiones_caja WHERE id = NEW.sesion_caja_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_sesion_detalle_empresa
  BEFORE INSERT ON sesiones_caja_detalle
  FOR EACH ROW EXECUTE FUNCTION set_sesion_detalle_empresa_id();
