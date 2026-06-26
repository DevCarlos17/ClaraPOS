-- ============================================================
-- 0066_ajuste_motivos_cuentas_link.sql
-- Vincula motivos de ajuste de inventario con cuentas contables.
--
-- Cambios:
-- 1. Agrega columna cuentas_config_clave a ajuste_motivos.
--    Motivos con esta clave registran un gasto automáticamente
--    al aplicar el ajuste (solo operacion RESTA que afecta costo).
--
-- 2. Crea 3 motivos de sistema en todas las empresas existentes:
--    - MERMA            → MERMA_INVENTARIO
--    - EXTRAVIO         → EXTRAVIO_INVENTARIO
--    - CONSUMO INTERNO  → CONSUMO_INTERNO
--
-- Depende de: 0064 (cuentas MERMA_INVENTARIO, EXTRAVIO_INVENTARIO,
--              CONSUMO_INTERNO en cuentas_config)
-- ============================================================

-- 1. Agregar columna
ALTER TABLE ajuste_motivos ADD COLUMN IF NOT EXISTS cuentas_config_clave TEXT;

-- 2. Backfill motivos de sistema para empresas existentes
DO $$
DECLARE
  v_empresa RECORD;
  v_now     TIMESTAMPTZ := NOW();
BEGIN
  FOR v_empresa IN SELECT id FROM empresas LOOP

    IF NOT EXISTS (
      SELECT 1 FROM ajuste_motivos
      WHERE empresa_id = v_empresa.id AND nombre = 'MERMA'
    ) THEN
      INSERT INTO ajuste_motivos
        (id, empresa_id, nombre, es_sistema, operacion_base, afecta_costo,
         cuentas_config_clave, is_active, created_at, updated_at, created_by)
      VALUES
        (uuid_generate_v4(), v_empresa.id, 'MERMA', 1, 'RESTA', 1,
         'MERMA_INVENTARIO', 1, v_now, v_now, NULL);
    ELSE
      -- Si ya existe, vincular la clave si aún no la tiene
      UPDATE ajuste_motivos
      SET cuentas_config_clave = 'MERMA_INVENTARIO', updated_at = v_now
      WHERE empresa_id = v_empresa.id AND nombre = 'MERMA'
        AND cuentas_config_clave IS NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM ajuste_motivos
      WHERE empresa_id = v_empresa.id AND nombre = 'EXTRAVIO'
    ) THEN
      INSERT INTO ajuste_motivos
        (id, empresa_id, nombre, es_sistema, operacion_base, afecta_costo,
         cuentas_config_clave, is_active, created_at, updated_at, created_by)
      VALUES
        (uuid_generate_v4(), v_empresa.id, 'EXTRAVIO', 1, 'RESTA', 1,
         'EXTRAVIO_INVENTARIO', 1, v_now, v_now, NULL);
    ELSE
      UPDATE ajuste_motivos
      SET cuentas_config_clave = 'EXTRAVIO_INVENTARIO', updated_at = v_now
      WHERE empresa_id = v_empresa.id AND nombre = 'EXTRAVIO'
        AND cuentas_config_clave IS NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM ajuste_motivos
      WHERE empresa_id = v_empresa.id AND nombre = 'CONSUMO INTERNO'
    ) THEN
      INSERT INTO ajuste_motivos
        (id, empresa_id, nombre, es_sistema, operacion_base, afecta_costo,
         cuentas_config_clave, is_active, created_at, updated_at, created_by)
      VALUES
        (uuid_generate_v4(), v_empresa.id, 'CONSUMO INTERNO', 1, 'RESTA', 1,
         'CONSUMO_INTERNO', 1, v_now, v_now, NULL);
    ELSE
      UPDATE ajuste_motivos
      SET cuentas_config_clave = 'CONSUMO_INTERNO', updated_at = v_now
      WHERE empresa_id = v_empresa.id AND nombre = 'CONSUMO INTERNO'
        AND cuentas_config_clave IS NULL;
    END IF;

  END LOOP;
END;
$$;
