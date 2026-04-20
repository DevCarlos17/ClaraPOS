-- =============================================
-- CLARAPOS: 0021 - DIFERENCIAL CAMBIARIO
-- Agrega cuentas contables y configuracion para el manejo automatico
-- del diferencial cambiario en cobros (CxC) y pagos (CxP).
-- Depende de: 0019 (plan_cuentas, cuentas_config, seed_plan_cuentas, seed_cuentas_config)
-- =============================================

-- ============================================
-- 1. AGREGAR CUENTAS A EMPRESAS EXISTENTES
-- Idempotente: ON CONFLICT DO NOTHING
-- ============================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM empresas WHERE is_active = TRUE LOOP

    -- 4.2.01 GANANCIA POR DIFERENCIAL CAMBIARIO (bajo 4.2 OTROS INGRESOS)
    INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, tipo, naturaleza, parent_id, nivel, es_cuenta_detalle, is_active, created_at, updated_at)
    SELECT
      uuid_generate_v4(), rec.id,
      '4.2.01', 'GANANCIA POR DIFERENCIAL CAMBIARIO',
      'INGRESO', 'ACREEDORA',
      (SELECT id FROM plan_cuentas WHERE empresa_id = rec.id AND codigo = '4.2'),
      3, TRUE, TRUE, NOW(), NOW()
    WHERE EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id = rec.id AND codigo = '4.2')
    ON CONFLICT (empresa_id, codigo) DO NOTHING;

    -- 6.2.02 PERDIDA POR DIFERENCIAL CAMBIARIO (bajo 6.2 GASTOS NO OPERACIONALES)
    INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, tipo, naturaleza, parent_id, nivel, es_cuenta_detalle, is_active, created_at, updated_at)
    SELECT
      uuid_generate_v4(), rec.id,
      '6.2.02', 'PERDIDA POR DIFERENCIAL CAMBIARIO',
      'GASTO', 'DEUDORA',
      (SELECT id FROM plan_cuentas WHERE empresa_id = rec.id AND codigo = '6.2'),
      3, TRUE, TRUE, NOW(), NOW()
    WHERE EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id = rec.id AND codigo = '6.2')
    ON CONFLICT (empresa_id, codigo) DO NOTHING;

    -- Configuracion: GANANCIA_DIFERENCIAL_CAMBIARIO
    INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at)
    SELECT
      uuid_generate_v4(), rec.id,
      'GANANCIA_DIFERENCIAL_CAMBIARIO',
      id,
      'Ganancia por diferencial cambiario',
      NOW(), NOW()
    FROM plan_cuentas WHERE empresa_id = rec.id AND codigo = '4.2.01'
    ON CONFLICT (empresa_id, clave) DO NOTHING;

    -- Configuracion: PERDIDA_DIFERENCIAL_CAMBIARIO
    INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at)
    SELECT
      uuid_generate_v4(), rec.id,
      'PERDIDA_DIFERENCIAL_CAMBIARIO',
      id,
      'Perdida por diferencial cambiario',
      NOW(), NOW()
    FROM plan_cuentas WHERE empresa_id = rec.id AND codigo = '6.2.02'
    ON CONFLICT (empresa_id, clave) DO NOTHING;

  END LOOP;
END;
$$;

-- ============================================
-- 2. ACTUALIZAR seed_plan_cuentas PARA NUEVAS EMPRESAS
-- Incluye las cuentas de diferencial cambiario en el seed base
-- ============================================

CREATE OR REPLACE FUNCTION seed_plan_cuentas(
  p_empresa_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- ═══ 1 ACTIVOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1','ACTIVOS','ACTIVO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1','ACTIVO CORRIENTE','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01','EFECTIVO Y EQUIVALENTES','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01.01','CAJA','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01.02','CAJA CHICA','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01.03','BANCOS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.02','CUENTAS POR COBRAR','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.02.01','CUENTAS POR COBRAR CLIENTES','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.03','INVENTARIOS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.03.01','MERCANCIA EN EXISTENCIA','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.03'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04','IMPUESTOS CREDITO FISCAL','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04.01','IVA CREDITO FISCAL','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04.02','RETENCIONES IVA SOPORTADAS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04.03','RETENCIONES ISLR SOPORTADAS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 2 PASIVOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2','PASIVOS','PASIVO','ACREEDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1','PASIVO CORRIENTE','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.01','CUENTAS POR PAGAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.01.01','CUENTAS POR PAGAR PROVEEDORES','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02','IMPUESTOS Y RETENCIONES POR PAGAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.01','IVA DEBITO FISCAL','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.02','RETENCIONES IVA POR ENTERAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.03','RETENCIONES ISLR POR ENTERAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.04','IGTF POR PAGAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 3 PATRIMONIO ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3','PATRIMONIO','PATRIMONIO','ACREEDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.1','CAPITAL SOCIAL','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.1.01','CAPITAL PAGADO','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.2','RESULTADOS','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.2.01','UTILIDAD DEL EJERCICIO','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 4 INGRESOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4','INGRESOS','INGRESO','ACREEDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1','INGRESOS OPERACIONALES','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.01','VENTAS DE PRODUCTOS','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.02','SERVICIOS PRESTADOS','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.03','DESCUENTOS EN VENTAS','INGRESO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.04','DEVOLUCIONES EN VENTAS','INGRESO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.2','OTROS INGRESOS','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- NUEVO: Ganancia por diferencial cambiario
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.2.01','GANANCIA POR DIFERENCIAL CAMBIARIO','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 5 COSTOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5','COSTOS','COSTO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5.1','COSTO DE VENTAS','COSTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5.1.01','COSTO DE MERCANCIA VENDIDA','COSTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 6 GASTOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6','GASTOS','GASTO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1','GASTOS OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.01','SUELDOS Y SALARIOS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.02','ALQUILERES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.03','SERVICIOS PUBLICOS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.04','MANTENIMIENTO Y REPARACIONES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.05','PUBLICIDAD Y MERCADEO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.06','SEGUROS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.07','PAPELERIA Y UTILES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.08','OTROS GASTOS OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2','GASTOS NO OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.01','GASTOS FINANCIEROS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- NUEVO: Perdida por diferencial cambiario
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.02','PERDIDA POR DIFERENCIAL CAMBIARIO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM plan_cuentas WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. ACTUALIZAR seed_cuentas_config PARA NUEVAS EMPRESAS
-- ============================================

CREATE OR REPLACE FUNCTION seed_cuentas_config(
  p_empresa_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF (SELECT COUNT(*) FROM cuentas_config WHERE empresa_id = p_empresa_id) > 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CAJA_EFECTIVO',id,'Efectivo en caja',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CAJA_CHICA',id,'Caja chica',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'BANCO_DEFAULT',id,'Bancos (cuenta generica)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CXC_CLIENTES',id,'Cuentas por cobrar clientes',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.02.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'INVENTARIO',id,'Inventario de mercancia',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.03.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'IVA_CREDITO',id,'IVA credito fiscal',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_IVA_SOPORTADA',id,'Retenciones IVA soportadas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_ISLR_SOPORTADA',id,'Retenciones ISLR soportadas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CXP_PROVEEDORES',id,'Cuentas por pagar proveedores',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.01.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'IVA_DEBITO',id,'IVA debito fiscal',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_IVA_POR_ENTERAR',id,'Retenciones IVA por enterar',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_ISLR_POR_ENTERAR',id,'Retenciones ISLR por enterar',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'IGTF_POR_PAGAR',id,'IGTF por pagar',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.04'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'INGRESO_VENTA_PRODUCTO',id,'Ventas de productos',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'INGRESO_VENTA_SERVICIO',id,'Servicios prestados',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'DESCUENTO_VENTAS',id,'Descuentos en ventas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'DEVOLUCION_VENTAS',id,'Devoluciones en ventas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.04'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'COSTO_VENTA',id,'Costo de mercancia vendida',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5.1.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  -- NUEVO: Diferencial cambiario
  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'GANANCIA_DIFERENCIAL_CAMBIARIO',id,'Ganancia por diferencial cambiario',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.2.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'PERDIDA_DIFERENCIAL_CAMBIARIO',id,'Perdida por diferencial cambiario',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM cuentas_config WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;
