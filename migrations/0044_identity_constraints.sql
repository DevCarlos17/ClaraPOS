-- =============================================================================
-- 0044_identity_constraints.sql
-- Agrega CHECK CONSTRAINTs de formato de identidad fiscal venezolana en las
-- tablas clientes y proveedores. Validacion en capa backend (PostgreSQL).
--
-- Reglas:
--   Cedula: [VE] + 5 a 9 digitos   (ej: V22448021, E12345678)
--   RIF:    [VEJGCP] + 9 digitos exactos (ej: J001234567)
--
-- IMPORTANTE: Ejecutar en Supabase SQL Editor.
-- Los triggers de inmutabilidad (trg_validate_cliente_update y
-- trg_validate_proveedor_update) se desactivan temporalmente para la
-- limpieza de datos y se reactivan al finalizar.
-- =============================================================================

BEGIN;

-- ─── 1. Desactivar triggers de inmutabilidad para la limpieza de datos ───────

ALTER TABLE clientes    DISABLE TRIGGER trg_validate_cliente_update;
ALTER TABLE proveedores DISABLE TRIGGER trg_validate_proveedor_update;


-- ─── 2. Limpiar datos existentes (formato con guiones → purificado) ──────────

-- Clientes: quitar espacios, puntos, guiones y barras
UPDATE clientes
SET identificacion = regexp_replace(identificacion, '[\s.\-/]', '', 'g')
WHERE identificacion ~ '[\s.\-/]';

-- Clientes: prefijo V automatico si son solo digitos (6-8 digitos)
UPDATE clientes
SET identificacion = 'V' || identificacion
WHERE identificacion ~ '^\d{6,8}$';

-- Proveedores: quitar espacios, puntos, guiones y barras del RIF
UPDATE proveedores
SET rif = regexp_replace(rif, '[\s.\-/]', '', 'g')
WHERE rif ~ '[\s.\-/]';

-- Proveedores: zero-pad la parte numerica del RIF a 9 digitos
UPDATE proveedores
SET rif = CONCAT(
  SUBSTRING(rif, 1, 1),
  LPAD(SUBSTRING(rif, 2), 9, '0')
)
WHERE rif ~ '^[VEJGCP]\d{1,8}$';


-- ─── 3. Reactivar triggers de inmutabilidad ───────────────────────────────────

ALTER TABLE clientes    ENABLE TRIGGER trg_validate_cliente_update;
ALTER TABLE proveedores ENABLE TRIGGER trg_validate_proveedor_update;


-- ─── 4. Agregar CHECK CONSTRAINTs ────────────────────────────────────────────

-- clientes.identificacion: cedula venezolana purificada
ALTER TABLE clientes
  DROP CONSTRAINT IF EXISTS clientes_identificacion_formato_check;

ALTER TABLE clientes
  ADD CONSTRAINT clientes_identificacion_formato_check
  CHECK (identificacion ~ '^[VE][0-9]{5,9}$');


-- proveedores.rif: RIF venezolano purificado (exactamente 10 caracteres)
ALTER TABLE proveedores
  DROP CONSTRAINT IF EXISTS proveedores_rif_formato_check;

ALTER TABLE proveedores
  ADD CONSTRAINT proveedores_rif_formato_check
  CHECK (rif ~ '^[VEJGCP][0-9]{9}$');


COMMIT;
