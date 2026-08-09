-- ============================================================
-- 0082_seed_material_empaque_flete_cuentas.sql
-- SDD compra-empaque-flete — Fase 1 (Fundacion: migracion + registro de config).
--
-- Contexto:
--   Habilita "lineas de cargo" no-producto (Material de Empaque / Flete) en el
--   formulario de Factura de Compra. Al procesar, se consolidan por concepto y
--   se registran como `gastos` (0-2 filas por factura), resolviendo la cuenta
--   contable via `cuentas_config` (mismo patron que `MERMA_INVENTARIO` /
--   `EXTRAVIO_INVENTARIO` de 0064, usado por ajustes de inventario).
--
--   MATERIAL_EMPAQUE reutiliza la cuenta plana `6.1.16 MATERIAL DE EMPAQUE`
--   (creada en 0064) — no requiere cuenta nueva.
--
--   FLETE requiere una cuenta nueva. El diseno original (openspec/changes/
--   compra-empaque-flete/design.md) proponia el codigo `6.1.25`, pero ese
--   codigo fue tomado por 0081 (`6.1.25 GASTOS DE VENTA`, grupo no-detalle
--   para comisiones de pasarela de pago) — DESCUBIERTO durante la
--   implementacion (verificacion directa del archivo de migracion mas
--   reciente antes de escribir esta). Se usa el siguiente codigo plano libre
--   bajo 6.1: `6.1.26 FLETES Y TRANSPORTE DE MERCANCIA` (GASTO, DEUDORA,
--   es_cuenta_detalle=TRUE, sin subgrupo — el usuario confirmo cuenta plana,
--   no jerarquia de 4 niveles como 0081).
--
--   Como en 0064/0081, `CREATE OR REPLACE FUNCTION` exige el cuerpo COMPLETO
--   de `seed_plan_cuentas`/`seed_cuentas_config` (no existe "ALTER" parcial en
--   Postgres) — se copia integro de 0081 y se agregan unicamente los bloques
--   nuevos marcados "de 0082" mas abajo. El resto de INSERTs es identico al de
--   0081, sin cambios de comportamiento.
--
-- Referencia: openspec/changes/compra-empaque-flete/{design.md,tasks.md}
-- Depende de: 0064 (seed_cuentas_config baseline, cuenta 6.1.16), 0081 (ultima
--             version de seed_plan_cuentas/seed_cuentas_config, cuenta 6.1.25
--             ya ocupada)
-- ============================================================


-- ============================================================
-- 1. CREATE OR REPLACE seed_plan_cuentas: cuerpo identico a 0081 MAS UN bloque
--    nuevo (6.1.26 FLETES Y TRANSPORTE DE MERCANCIA), ON CONFLICT (empresa_id,
--    codigo) DO NOTHING.
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

  -- Nueva (de 0081, PR-2b) — Gastos de Venta (grupo). Aloja la comisión de
  -- pasarela de pago (nace en cada transacción POS/tarjeta), distinta de la
  -- comisión bancaria (mantenimiento/transferencia, ver 6.2.06 más abajo).
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.25','GASTOS DE VENTA','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Nueva (de 0081, PR-2b) — subgrupo NUEVO, 100% aditivo. Las cuentas por
  -- banco (6.1.25.01.NN) nacen como hijas de este nodo vía backfill más
  -- abajo y, en producción, vía crearCuentasDelBanco() (Slice 3b.3, PR-2b.3).
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.25.01','COMISIONES DE PASARELAS DE PAGO','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.25'),4,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Nueva (de 0082, compra-empaque-flete) — cuenta PLANA (es_cuenta_detalle=
  -- TRUE, sin subgrupo, decision confirmada por el usuario) para el cargo de
  -- Flete/transporte en facturas de compra. Codigo '6.1.25' quedo tomado por
  -- 0081 (grupo "GASTOS DE VENTA"), por eso se usa '6.1.26' — siguiente
  -- codigo plano libre bajo 6.1.
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.26','FLETES Y TRANSPORTE DE MERCANCIA','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
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

  -- NOTA (0081, PR-2b): el bloque `6.2.05 COMISIONES BANCARIAS` de 0080 fue
  -- REMOVIDO de aquí — queda superado por `6.2.06.01` más abajo. Las filas
  -- ya insertadas por 0080 en empresas existentes se desactivan en 0081
  -- (esta migracion no toca esa desactivacion, ya aplicada).

  -- Nueva (de 0081, PR-2b) — Gastos Financieros (grupo). Código DISTINTO de
  -- la leaf vieja 6.2.01 (incompatible: aquella es leaf `es_cuenta_detalle
  -- =TRUE`, esta es grupo `=FALSE`) — sin colisión, la unique key es
  -- empresa_id+codigo, no nombre.
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.06','GASTOS FINANCIEROS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- Nueva (de 0081, PR-2b) — subgrupo NUEVO que reemplaza a 6.2.05. Las
  -- cuentas por banco (6.2.06.01.NN) nacen como hijas de este nodo vía
  -- backfill más abajo y, en producción, vía crearCuentasDelBanco()
  -- (Slice 3b.3, PR-2b.3).
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.06.01','COMISIONES BANCARIAS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.06'),4,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM plan_cuentas WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. BACKFILL: aplicar 6.1.26 a empresas existentes. seed_plan_cuentas es
--    idempotente (ON CONFLICT DO NOTHING) — no altera nada de lo ya seedeado
--    (incluye 6.1.25/6.1.25.01/6.2.06/6.2.06.01 de 0081, sin cambios).
-- ============================================================

SELECT seed_plan_cuentas(id, NULL) FROM empresas;


-- ============================================================
-- 3a. CREATE OR REPLACE seed_cuentas_config: cuerpo identico a 0081 MAS DOS
--     bloques nuevos (MATERIAL_EMPAQUE -> 6.1.16 existente, FLETE_COMPRA ->
--     6.1.26 nueva). Es la 2da RPC (junto con seed_plan_cuentas) que
--     register-owner/index.ts invoca para TODA empresa nueva — sin este
--     CREATE OR REPLACE, una empresa registrada DESPUES de aplicar 0082
--     tendria las cuentas en plan_cuentas (via seed_plan_cuentas, ya
--     actualizado arriba) pero NUNCA las claves en cuentas_config, rompiendo
--     en silencio crearCompra() para todo tenant futuro (mismo hallazgo de
--     review documentado en 0081, seccion 3a).
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

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'COMISION_BANCARIA',id,'Comision cobrada por el banco en transferencias',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

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

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'GRUPO_COMISIONES_PASARELA',id,'Grupo de comisiones de pasarelas de pago (gasto de venta, por banco)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.25.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'GRUPO_COMISIONES_BANCARIAS',id,'Grupo de comisiones bancarias (gasto financiero, por banco)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.06.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  -- Nuevas (de 0082, compra-empaque-flete) — cargos no-producto de factura de
  -- compra. MATERIAL_EMPAQUE reutiliza la cuenta plana existente 6.1.16
  -- (de 0064). FLETE_COMPRA apunta a la cuenta plana nueva 6.1.26.
  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'MATERIAL_EMPAQUE',id,'Material de empaque (cargos en factura de compra)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.16'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'FLETE_COMPRA',id,'Flete y transporte de mercancia (cargos en factura de compra)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.26'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM cuentas_config WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 3b. BACKFILL: aplicar las 2 claves nuevas a empresas EXISTENTES.
--     `seed_cuentas_config` (seccion 3a) tiene guard `COUNT>0 RETURN 0`, asi
--     que para empresas que ya tenian filas en cuentas_config antes de esta
--     migracion, el INSERT directo (mismo patron que el backfill de
--     COMISION_BANCARIA en 0064 y GRUPO_COMISIONES_* en 0081) es el unico
--     camino.
-- ============================================================

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'MATERIAL_EMPAQUE', pc.id,
       'Material de empaque (cargos en factura de compra)', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.1.16'
ON CONFLICT (empresa_id, clave) DO NOTHING;

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'FLETE_COMPRA', pc.id,
       'Flete y transporte de mercancia (cargos en factura de compra)', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.1.26'
ON CONFLICT (empresa_id, clave) DO NOTHING;
