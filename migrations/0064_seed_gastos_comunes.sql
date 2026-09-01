-- ============================================================
-- 0064_seed_gastos_comunes.sql
-- Expande seed_plan_cuentas con las cuentas de gasto más comunes
-- para que toda empresa nueva tenga el catálogo base listo.
--
-- Cuentas nuevas en 6.1 (GASTOS OPERACIONALES):
--   6.1.09  Internet y conectividad
--   6.1.10  Telefonía celular
--   6.1.11  Otros servicios contratados
--   6.1.12  Uniformes y dotación
--   6.1.13  Agasajo al personal
--   6.1.14  Gastos de representación
--   6.1.15  Material de empaque
--   6.1.16  Implementos de trabajo
--   6.1.17  Gasolina y lubricantes
--   6.1.18  Viáticos y movilización
--   6.1.19  Reparación de vehículos
--   6.1.20  Reparación de equipos de trabajo
--   6.1.21  Cestaticket y beneficios
--   6.1.22  Consumo interno
--   6.1.23  Merma de inventario
--   6.1.24  Robo o extravío
--
-- Cuentas nuevas en 6.2 (GASTOS NO OPERACIONALES):
--   6.2.03  Comisión bancaria
--   6.2.04  Pérdida en vuelto
--
-- Depende de: 0021 (seed_plan_cuentas, seed_cuentas_config)
-- ============================================================


-- ============================================================
-- 1. REEMPLAZAR seed_plan_cuentas CON CATÁLOGO COMPLETO
-- ============================================================

CREATE OR REPLACE FUNCTION seed_plan_cuentas(
  p_empresa_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN

  -- ═══ 1 ACTIVOS ═══════════════════════════════════════════
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

  -- ═══ 2 PASIVOS ════════════════════════════════════════════
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

  -- ═══ 3 PATRIMONIO ═════════════════════════════════════════
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

  -- ═══ 4 INGRESOS ═══════════════════════════════════════════
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

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.2.01','GANANCIA POR DIFERENCIAL CAMBIARIO','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 5 COSTOS ═════════════════════════════════════════════
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5','COSTOS','COSTO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5.1','COSTO DE VENTAS','COSTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5.1.01','COSTO DE MERCANCIA VENDIDA','COSTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 6 GASTOS ═════════════════════════════════════════════
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6','GASTOS','GASTO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ── 6.1 Gastos Operacionales ──────────────────────────────
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1','GASTOS OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Existentes (de 0021)
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.01','NOMINA','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.02','ALQUILER DE LOCAL','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
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
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.07','PAPELERIA Y UTILES DE OFICINA','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.08','OTROS GASTOS OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Nuevas (de 0064) ─────────────────────────────────────────
  -- Servicios de comunicación
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.09','INTERNET Y CONECTIVIDAD','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.10','TELEFONIA CELULAR','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.11','SUSCRIPCIONES Y SERVICIOS DIGITALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Personal y beneficios
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.12','UNIFORMES Y DOTACION','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.13','AGASAJO AL PERSONAL','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.14','CESTATICKET Y BENEFICIOS AL PERSONAL','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Gastos administrativos y operativos
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.15','GASTOS DE REPRESENTACION','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.16','MATERIAL DE EMPAQUE','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.17','IMPLEMENTOS DE TRABAJO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Transporte
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.18','GASOLINA Y LUBRICANTES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.19','VIATICOS Y MOVILIZACION','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.20','REPARACION DE VEHICULOS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.21','REPARACION DE EQUIPOS DE TRABAJO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Pérdidas de inventario y mermas
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.22','CONSUMO INTERNO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.23','MERMA DE INVENTARIO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.24','ROBO O EXTRAVIO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ── 6.2 Gastos No Operacionales ──────────────────────────
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2','GASTOS NO OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Existentes (de 0021)
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.01','GASTOS FINANCIEROS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.02','PERDIDA POR DIFERENCIAL CAMBIARIO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Nuevas (de 0064)
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.03','COMISION BANCARIA','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.04','PERDIDA EN VUELTO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM plan_cuentas WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. ACTUALIZAR seed_cuentas_config: agregar COMISION_BANCARIA
-- ============================================================

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

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'GANANCIA_DIFERENCIAL_CAMBIARIO',id,'Ganancia por diferencial cambiario',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.2.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'PERDIDA_DIFERENCIAL_CAMBIARIO',id,'Perdida por diferencial cambiario',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  -- Nuevas (de 0064): cuentas de sistema para operaciones automáticas
  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'COMISION_BANCARIA',id,'Comision cobrada por el banco en transferencias',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  -- Vinculadas a ajustes de inventario (usadas automáticamente por el sistema)
  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CONSUMO_INTERNO',id,'Productos del inventario consumidos internamente (al costo)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.22'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'MERMA_INVENTARIO',id,'Productos danados, vencidos o deteriorados',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.23'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'EXTRAVIO_INVENTARIO',id,'Productos perdidos por robo o extravio',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.24'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'PERDIDA_EN_VUELTO',id,'Diferencia no cobrable al dar vuelto al cliente',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.04'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM cuentas_config WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 3. BACKFILL: aplicar las cuentas nuevas a empresas existentes
--    ON CONFLICT DO NOTHING → idempotente, no toca datos actuales
-- ============================================================

-- 3a. Cuentas del plan (seed_plan_cuentas es idempotente)
SELECT seed_plan_cuentas(id, NULL) FROM empresas;

-- 3b. Claves de sistema en cuentas_config para empresas existentes
--     (seed_cuentas_config tiene guard COUNT > 0, así que se hace directo)

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'COMISION_BANCARIA', pc.id,
       'Comision cobrada por el banco en transferencias', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.2.03'
ON CONFLICT (empresa_id, clave) DO NOTHING;

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'CONSUMO_INTERNO', pc.id,
       'Productos del inventario consumidos internamente (al costo)', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.1.22'
ON CONFLICT (empresa_id, clave) DO NOTHING;

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'MERMA_INVENTARIO', pc.id,
       'Productos danados, vencidos o deteriorados', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.1.23'
ON CONFLICT (empresa_id, clave) DO NOTHING;

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'EXTRAVIO_INVENTARIO', pc.id,
       'Productos perdidos por robo o extravio', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.1.24'
ON CONFLICT (empresa_id, clave) DO NOTHING;

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'PERDIDA_EN_VUELTO', pc.id,
       'Diferencia no cobrable al dar vuelto al cliente', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.2.04'
ON CONFLICT (empresa_id, clave) DO NOTHING;
