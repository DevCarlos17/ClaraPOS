-- =============================================
-- CLARAPOS 0071: Seed caja fuerte de efectivo
-- Inserta EFECTIVO BS y EFECTIVO $ para todas las empresas
-- que aun no los tienen (idempotente).
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =============================================

DO $$
DECLARE
  emp RECORD;
  moneda_bs_id UUID;
  moneda_usd_id UUID;
  caja_bs_id UUID;
  caja_usd_id UUID;
BEGIN
  -- Obtener IDs de monedas
  SELECT id INTO moneda_bs_id  FROM monedas WHERE codigo_iso = 'VES' LIMIT 1;
  SELECT id INTO moneda_usd_id FROM monedas WHERE codigo_iso = 'USD' LIMIT 1;

  IF moneda_bs_id IS NULL OR moneda_usd_id IS NULL THEN
    RAISE EXCEPTION 'No se encontraron las monedas VES o USD en la tabla monedas';
  END IF;

  -- Iterar sobre todas las empresas activas
  FOR emp IN SELECT id FROM empresas WHERE is_active = TRUE LOOP

    -- EFECTIVO BS
    IF NOT EXISTS (
      SELECT 1 FROM caja_fuerte
      WHERE empresa_id = emp.id AND nombre = 'EFECTIVO BS'
    ) THEN
      caja_bs_id := gen_random_uuid();
      INSERT INTO caja_fuerte (id, empresa_id, nombre, moneda_id, saldo_actual, descripcion, is_active, created_at, updated_at)
      VALUES (caja_bs_id, emp.id, 'EFECTIVO BS', moneda_bs_id, 0, 'Efectivo en bolivares', TRUE, NOW(), NOW());

      INSERT INTO metodos_cobro (id, empresa_id, nombre, tipo, moneda_id, caja_fuerte_id, deposito_directo, comision_pct, usa_pos, usa_cxc, usa_cxp, requiere_referencia, saldo_actual, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), emp.id, 'EFECTIVO BS', 'EFECTIVO', moneda_bs_id, caja_bs_id, FALSE, 0, TRUE, TRUE, TRUE, FALSE, 0, TRUE, NOW(), NOW());
    END IF;

    -- EFECTIVO $
    IF NOT EXISTS (
      SELECT 1 FROM caja_fuerte
      WHERE empresa_id = emp.id AND nombre = 'EFECTIVO $'
    ) THEN
      caja_usd_id := gen_random_uuid();
      INSERT INTO caja_fuerte (id, empresa_id, nombre, moneda_id, saldo_actual, descripcion, is_active, created_at, updated_at)
      VALUES (caja_usd_id, emp.id, 'EFECTIVO $', moneda_usd_id, 0, 'Efectivo en dolares', TRUE, NOW(), NOW());

      INSERT INTO metodos_cobro (id, empresa_id, nombre, tipo, moneda_id, caja_fuerte_id, deposito_directo, comision_pct, usa_pos, usa_cxc, usa_cxp, requiere_referencia, saldo_actual, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), emp.id, 'EFECTIVO $', 'EFECTIVO', moneda_usd_id, caja_usd_id, FALSE, 0, TRUE, TRUE, TRUE, FALSE, 0, TRUE, NOW(), NOW());
    END IF;

  END LOOP;
END $$;
