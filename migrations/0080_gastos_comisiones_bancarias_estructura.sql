-- ============================================================
-- 0080_gastos_comisiones_bancarias_estructura.sql
-- PR-1a de gastos-registro-qol (openspec/gastos-registro-qol) — Slice 1.
--
-- Contexto:
--   `6.2.01 GASTOS FINANCIEROS` y `6.2.03 COMISION BANCARIA` son leaves
--   hermanas de `6.2 GASTOS NO OPERACIONALES`, sin subgrupo intermedio, y
--   `codigo` es inmutable (regla de negocio #5). En vez de reconvertir esas
--   leaves (podrían tener gastos históricos posteados), esta migración crea
--   un subgrupo NUEVO `6.2.05 COMISIONES BANCARIAS` bajo el `6.2` ya
--   existente. Las cuentas de comisión por banco nacen como hijas de ese
--   subgrupo. `6.2.01`/`6.2.03` quedan intactas — se desactivan luego en un
--   script de limpieza separado (`cleanup_gastos_cxp_qol.sql`, manual,
--   PR-1b, fuera de esta migración).
--
--   `metodo_cobro_deducciones` reemplaza `metodos_cobro.comision_pct`
--   (columna única) por N filas por método, cada una con su propia cuenta
--   de gasto — elimina la dependencia de la clave global
--   `cuentas_config['COMISION_BANCARIA']`.
--
--   100% aditiva: sin DELETE, sin UPDATE de códigos existentes. Ningún
--   trigger de inmutabilidad bloquea INSERT en `plan_cuentas`
--   (`protect_plan_cuentas`, 0065, solo restringe DELETE/UPDATE).
--
-- Referencia: openspec/gastos-registro-qol/design.md
-- Depende de: 0064 (seed_plan_cuentas), 0065 (protect_plan_cuentas),
--             0069 (metodos_cobro.comision_pct, bancos_empresa.saldo_inicial)
-- ============================================================


-- ============================================================
-- 1. EXTENDER seed_plan_cuentas: agregar 6.2.05 COMISIONES BANCARIAS
--    (grupo, es_cuenta_detalle=false, hijo de 6.2). Mismo patrón
--    ON CONFLICT (empresa_id,codigo) DO NOTHING de 0064.
--    CREATE OR REPLACE FUNCTION requiere el cuerpo completo — se copia
--    tal cual de 0064 y se agrega únicamente el bloque 6.2.05 antes del
--    RETURN final.
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

  -- Nuevas (de 0064)
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.09','INTERNET Y CONECTIVIDAD','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.10','TELEFONIA CELULAR','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.11','SUSCRIPCIONES Y SERVICIOS DIGITALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.12','UNIFORMES Y DOTACION','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.13','AGASAJO AL PERSONAL','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.14','CESTATICKET Y BENEFICIOS AL PERSONAL','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.15','GASTOS DE REPRESENTACION','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.16','MATERIAL DE EMPAQUE','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.17','IMPLEMENTOS DE TRABAJO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

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

  -- Existentes (de 0021) — SIN TOCAR (regla de negocio #5, codigo inmutable)
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.01','GASTOS FINANCIEROS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.02','PERDIDA POR DIFERENCIAL CAMBIARIO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Nuevas (de 0064) — SIN TOCAR (regla de negocio #5, codigo inmutable)
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.03','COMISION BANCARIA','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.04','PERDIDA EN VUELTO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Nueva (de 0080) — subgrupo NUEVO, 100% aditivo. Las cuentas por banco
  -- (6.2.05.NN) nacen como hijas de este nodo vía backfill más abajo y,
  -- en producción, vía agregarSubcuentaAGrupo() (Slice 2, PR-2).
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.05','COMISIONES BANCARIAS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM plan_cuentas WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. BACKFILL: aplicar 6.2.05 a empresas existentes.
--    seed_plan_cuentas es idempotente (ON CONFLICT DO NOTHING),
--    no altera nada existente en empresas ya seedeadas. SC-01, SC-02, SC-03, SC-04.
-- ============================================================

SELECT seed_plan_cuentas(id, NULL) FROM empresas;


-- ============================================================
-- 3. CREATE TABLE metodo_cobro_deducciones
--    N conceptos de deducción por método de cobro (comisión bancaria,
--    retención ISLR de tarjetas de crédito, u otros). Reemplaza el
--    campo único metodos_cobro.comision_pct (deprecado, ver sección 6).
--    Config editable, NO ledger — sin trigger anti-UPDATE/DELETE
--    (soft-deactivate vía is_active, aplicado en Slice 3 / PR-3).
-- ============================================================

CREATE TABLE IF NOT EXISTS metodo_cobro_deducciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  metodo_cobro_id UUID NOT NULL REFERENCES metodos_cobro(id),
  cuenta_gasto_id UUID NOT NULL REFERENCES plan_cuentas(id),
  concepto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('COMISION','ISLR','OTRO')),
  porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (porcentaje >= 0 AND porcentaje <= 100),
  orden INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_metodo_cobro_deducciones_metodo ON metodo_cobro_deducciones(metodo_cobro_id);
CREATE INDEX IF NOT EXISTS idx_metodo_cobro_deducciones_empresa ON metodo_cobro_deducciones(empresa_id);

DROP TRIGGER IF EXISTS trg_metodo_cobro_deducciones_updated ON metodo_cobro_deducciones;
CREATE TRIGGER trg_metodo_cobro_deducciones_updated BEFORE UPDATE ON metodo_cobro_deducciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Sin trigger anti-UPDATE/DELETE: config editable, no ledger (SC-05, SC-06).

ALTER TABLE metodo_cobro_deducciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON metodo_cobro_deducciones;
CREATE POLICY "select_own_empresa" ON metodo_cobro_deducciones FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON metodo_cobro_deducciones;
CREATE POLICY "insert_own_empresa" ON metodo_cobro_deducciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "update_own_empresa" ON metodo_cobro_deducciones;
CREATE POLICY "update_own_empresa" ON metodo_cobro_deducciones FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- Agregar a publicacion de PowerSync (patrón 0079/0035/0025 para tablas
-- nuevas). Envuelto en DO block para ser idempotente (ALTER PUBLICATION no
-- soporta IF NOT EXISTS): sin esto, re-ejecutar la migracion fallaria con
-- "relation is already member of publication".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'metodo_cobro_deducciones'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE metodo_cobro_deducciones;
  END IF;
END $$;


-- ============================================================
-- 4. ALTER TABLE bancos_empresa: columna de vínculo a la cuenta de gasto
--    de comisión. Fuente de verdad para el DEFAULT al crear una deducción
--    (Slice 2 / PR-2 extiende handleCrearCuentaContable en banco-form.tsx
--    para setearla). El cierre (Slice 4 / PR-4) lee
--    metodo_cobro_deducciones.cuenta_gasto_id directamente, no esta columna.
-- ============================================================

ALTER TABLE bancos_empresa ADD COLUMN IF NOT EXISTS cuenta_gasto_comision_id UUID REFERENCES plan_cuentas(id);


-- ============================================================
-- 5. BACKFILL: crear la leaf 6.2.05.NN COMISION BANCO {nombre} para cada
--    banco existente y vincularla en bancos_empresa.cuenta_gasto_comision_id.
--    Numeración por empresa: mismo criterio que agregarSubcuentaAGrupo()
--    (src/features/contabilidad/hooks/use-plan-cuentas.ts) — COUNT(*) de
--    hijos existentes del grupo + 1, padded a 2 dígitos. Idempotente: solo
--    procesa bancos con cuenta_gasto_comision_id IS NULL.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_grupo_id UUID;
  v_cnt INT;
  v_codigo TEXT;
  v_leaf_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  FOR r IN
    SELECT id, empresa_id, nombre_banco
    FROM bancos_empresa
    WHERE cuenta_gasto_comision_id IS NULL
    ORDER BY empresa_id, created_at
  LOOP
    SELECT id INTO v_grupo_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = '6.2.05';

    -- Defensivo: si el subgrupo no existe todavia para esta empresa (no
    -- deberia pasar, el paso 2 lo backfillea para todas), lo creamos aqui
    -- via seed_plan_cuentas antes de continuar.
    IF v_grupo_id IS NULL THEN
      PERFORM seed_plan_cuentas(r.empresa_id, NULL);
      SELECT id INTO v_grupo_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = '6.2.05';
    END IF;

    SELECT COUNT(*) INTO v_cnt FROM plan_cuentas WHERE parent_id = v_grupo_id AND empresa_id = r.empresa_id;
    v_codigo := '6.2.05.' || LPAD((v_cnt + 1)::TEXT, 2, '0');

    INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
    VALUES (uuid_generate_v4(), r.empresa_id, v_codigo, 'COMISION BANCO ' || UPPER(r.nombre_banco), 'GASTO', 'DEUDORA', v_grupo_id, 4, TRUE, TRUE, v_now, v_now, NULL)
    ON CONFLICT (empresa_id,codigo) DO NOTHING
    RETURNING id INTO v_leaf_id;

    IF v_leaf_id IS NULL THEN
      SELECT id INTO v_leaf_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = v_codigo;
    END IF;

    UPDATE bancos_empresa SET cuenta_gasto_comision_id = v_leaf_id, updated_at = v_now WHERE id = r.id;
  END LOOP;
END $$;


-- ============================================================
-- 6. BACKFILL: migrar metodos_cobro.comision_pct → metodo_cobro_deducciones
--    para métodos bancarios existentes con comisión configurada. SC-10.
--    Guard NOT EXISTS: idempotente, no duplica filas en re-ejecución.
-- ============================================================

INSERT INTO metodo_cobro_deducciones (id, empresa_id, metodo_cobro_id, cuenta_gasto_id, concepto, tipo, porcentaje, orden, is_active, created_at, updated_at, created_by)
SELECT
  uuid_generate_v4(),
  mc.empresa_id,
  mc.id,
  be.cuenta_gasto_comision_id,
  'Comision bancaria',
  'COMISION',
  mc.comision_pct,
  0,
  TRUE,
  NOW(),
  NOW(),
  NULL
FROM metodos_cobro mc
JOIN bancos_empresa be ON be.id = mc.banco_empresa_id
WHERE mc.banco_empresa_id IS NOT NULL
  AND mc.comision_pct > 0
  AND be.cuenta_gasto_comision_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM metodo_cobro_deducciones d
    WHERE d.metodo_cobro_id = mc.id AND d.tipo = 'COMISION' AND d.concepto = 'Comision bancaria'
  );


-- ============================================================
-- 7. metodos_cobro.comision_pct queda DEPRECADO — NO se toca ni se dropea
--    en esta migración. El cierre (use-sesiones-caja.ts) sigue leyéndolo
--    hasta que el Slice 4 (PR-4, encadenado) reemplace el path por
--    metodo_cobro_deducciones. Dropearlo antes rompería producción entre
--    PRs (design.md, tabla de Architecture Decisions).
-- ============================================================

COMMENT ON COLUMN metodos_cobro.comision_pct IS
  'DEPRECADO (0080): reemplazado por metodo_cobro_deducciones (N conceptos por método). Se mantiene por compatibilidad hasta que Slice 4 (PR-4) migre el path de lectura en use-sesiones-caja.ts. No usar en código nuevo.';
