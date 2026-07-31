-- ============================================================
-- 0081_gastos_comisiones_4niveles.sql
-- PR-2b de gastos-registro-qol (openspec/gastos-registro-qol) — Slice 3b.1.
--
-- Contexto:
--   0080 (PR-1a) creó un subgrupo plano `6.2.05 COMISIONES BANCARIAS` bajo
--   `6.2` para alojar una leaf por banco. El usuario confirmó (obs Engram
--   #703) que el módulo de gastos está en desarrollo, sin data real
--   dependiendo de esa estructura, habilitando un rewrite limpio (opción C).
--
--   Esta migración SUPERA `6.2.05` con una jerarquía de 4 niveles que
--   separa dos naturalezas de comisión distintas:
--
--     - Comisión de PASARELA de pago (gasto de venta, nace en cada
--       transacción POS/tarjeta):
--       6.1 Gastos Operacionales > 6.1.25 Gastos de Venta >
--       6.1.25.01 Comisiones de Pasarelas de Pago > <leaf por banco>
--
--     - Comisión BANCARIA (gasto financiero, ej. mantenimiento/transferencia):
--       6.2 Gastos No Operacionales > 6.2.06 Gastos Financieros >
--       6.2.06.01 Comisiones Bancarias > <leaf por banco>
--
--   `6.2.06` reutiliza el nombre "GASTOS FINANCIEROS" de la leaf vieja
--   `6.2.01` pero con código distinto — sin colisión (unique key es
--   empresa_id+codigo, no nombre). `6.2.01`/`6.2.03` NO se tocan aquí, su
--   desactivación sigue siendo responsabilidad del script de limpieza
--   manual (Slice 1, cleanup_gastos_cxp_qol.sql, sin cambios).
--
--   Cada banco pasa a tener 2 cuentas de gasto (antes 1): la BANCARIA
--   (reutiliza `bancos_empresa.cuenta_gasto_comision_id`, ya existente de
--   0080) y la PASARELA (nueva columna `cuenta_gasto_pasarela_id`).
--
--   Los 2 grupos-padre nuevos se resuelven vía `cuentas_config` (mecanismo
--   ya existente en el proyecto, ver `COMISION_BANCARIA` de 0064) con las
--   claves `GRUPO_COMISIONES_PASARELA`/`GRUPO_COMISIONES_BANCARIAS`, en vez
--   de hardcodear el código como hacía `useSubgrupoComisionesBancarias`
--   (PR-2, superado en 3b.2).
--
--   ORDEN CRÍTICO: se repuntan `bancos_empresa`/`metodo_cobro_deducciones`
--   a las leaves NUEVAS (pasos 5 y 6) ANTES de desactivar `6.2.05` (paso 7).
--   Desactivar antes de repuntar dejaría FKs colgando de filas inactivas.
--   `protect_plan_cuentas` (0065) solo bloquea desactivar cuentas
--   referenciadas en `cuentas_config` — `6.2.05` nunca tuvo entrada ahí, así
--   que el paso 7 no está bloqueado por ese trigger. Un guard defensivo
--   (paso 6b) verifica en seco que nada quedó apuntando a 6.2.05.% antes de
--   desactivar, por si alguna fila de metodo_cobro_deducciones creada
--   manualmente durante el desarrollo escapó al repunte del paso 6.
--
--   `seed_cuentas_config` (sección 3a) también se actualiza con
--   CREATE OR REPLACE en esta migración — es la 2da RPC que
--   `register-owner/index.ts` invoca para TODA empresa NUEVA, junto con
--   `seed_plan_cuentas`. Sin este update, una empresa registrada DESPUÉS de
--   aplicar 0081 nunca recibiría las claves `GRUPO_COMISIONES_PASARELA`/
--   `GRUPO_COMISIONES_BANCARIAS` en su `cuentas_config` (hallazgo de review
--   adversarial, obs Engram #720 — CRITICAL, corregido en esta versión).
--
-- Referencia: openspec/gastos-registro-qol/design.md (líneas 29-147)
--             obs Engram #706 (diseño final), #703 (rewrite permitido),
--             #705 (zonas prohibidas), #713 (scope PR-2b), #720 (review
--             adversarial que motivó los fixes de seed_cuentas_config y
--             el guard defensivo del paso 6b)
-- Depende de: 0080 (seed_plan_cuentas con 6.2.05, metodo_cobro_deducciones,
--             bancos_empresa.cuenta_gasto_comision_id), 0064
--             (seed_cuentas_config baseline), 0065 (protect_plan_cuentas)
-- ============================================================


-- ============================================================
-- 1. CREATE OR REPLACE seed_plan_cuentas: mismo cuerpo de 0080 MENOS el
--    bloque INSERT de 6.2.05 (superado, removido) MÁS 4 bloques nuevos
--    ON CONFLICT (empresa_id,codigo) DO NOTHING: 6.1.25, 6.1.25.01,
--    6.2.06, 6.2.06.01. CREATE OR REPLACE FUNCTION requiere el cuerpo
--    completo — se copia tal cual de 0080.
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
  -- ya insertadas por 0080 en empresas existentes se desactivan en la
  -- sección 7 de esta migración (DESPUÉS de repuntar sus consumidores).

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
-- 2. BACKFILL: aplicar 6.1.25/6.1.25.01/6.2.06/6.2.06.01 a empresas
--    existentes. seed_plan_cuentas es idempotente (ON CONFLICT DO NOTHING),
--    no altera nada existente en empresas ya seedeadas. SC-01, SC-02, SC-03, SC-04.
-- ============================================================

SELECT seed_plan_cuentas(id, NULL) FROM empresas;


-- ============================================================
-- 3a. CREATE OR REPLACE seed_cuentas_config: mismo cuerpo de 0064 (última
--     vez que se tocó esta función) MÁS 2 bloques nuevos que resuelven los
--     grupos-padre por empresa, reemplazando el hardcode de código
--     (`6.2.05`) que usaba useSubgrupoComisionesBancarias (PR-2, superado
--     en 3b.2). `seed_cuentas_config` es la 2da RPC (junto con
--     `seed_plan_cuentas`) que `register-owner/index.ts` invoca para TODA
--     empresa NUEVA (líneas ~353-360) — sin este CREATE OR REPLACE, una
--     empresa registrada DESPUÉS de aplicar 0081 obtendría los grupos
--     `6.1.25.01`/`6.2.06.01` en `plan_cuentas` (vía seed_plan_cuentas, ya
--     actualizado en la sección 1) pero NUNCA las claves
--     `GRUPO_COMISIONES_PASARELA`/`GRUPO_COMISIONES_BANCARIAS` en
--     `cuentas_config` — rompiendo en silencio los resolvers de 3b.2 y la
--     auto-creación de cuentas de 3b.3 para todo tenant futuro (hallazgo de
--     review, obs Engram #720).
--     El guard `IF COUNT(*) FROM cuentas_config WHERE empresa_id=p_empresa_id
--     > 0 THEN RETURN 0` es inofensivo para este fix: `register-owner`
--     llama `seed_plan_cuentas` y LUEGO `seed_cuentas_config` para la misma
--     empresa nueva (0 filas en cuentas_config en ese punto), así que el
--     guard nunca corta el camino de una empresa recién creada. Para
--     empresas YA EXISTENTES (que sí tienen filas > 0 y por ende el guard
--     las corta), la sección 3b más abajo hace el INSERT directo — ambos
--     caminos deben setear las claves (empresas nuevas vía esta función,
--     empresas existentes vía el backfill directo).
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

  -- Nuevas (de 0081, PR-2b) — resuelven los grupos-padre del subárbol de
  -- comisiones de 4 niveles. Se buscan por empresa_id+codigo dentro de
  -- ESTA misma empresa (p_empresa_id), no globalmente — `seed_plan_cuentas`
  -- ya corrió antes que esta función para la empresa nueva (orden fijo en
  -- register-owner/index.ts), así que 6.1.25.01/6.2.06.01 ya existen.
  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'GRUPO_COMISIONES_PASARELA',id,'Grupo de comisiones de pasarelas de pago (gasto de venta, por banco)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1.25.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'GRUPO_COMISIONES_BANCARIAS',id,'Grupo de comisiones bancarias (gasto financiero, por banco)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2.06.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM cuentas_config WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 3b. BACKFILL: aplicar las 2 claves nuevas a empresas EXISTENTES.
--     `seed_cuentas_config` (sección 3a) tiene guard `COUNT>0 RETURN 0`, así
--     que para empresas que ya tenían filas en cuentas_config antes de esta
--     migración, el INSERT directo (mismo patrón que el backfill de
--     COMISION_BANCARIA en 0064) es el único camino — la función NUNCA
--     vuelve a ejecutar su cuerpo para una empresa con cuentas_config no
--     vacío. Ambos caminos (3a para empresas nuevas, 3b para existentes)
--     son necesarios y no se solapan.
-- ============================================================

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'GRUPO_COMISIONES_PASARELA', pc.id,
       'Grupo de comisiones de pasarelas de pago (gasto de venta, por banco)', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.1.25.01'
ON CONFLICT (empresa_id, clave) DO NOTHING;

INSERT INTO cuentas_config (id, empresa_id, clave, cuenta_contable_id, descripcion, created_at, updated_at, created_by)
SELECT uuid_generate_v4(), e.id, 'GRUPO_COMISIONES_BANCARIAS', pc.id,
       'Grupo de comisiones bancarias (gasto financiero, por banco)', NOW(), NOW(), NULL
FROM empresas e
JOIN plan_cuentas pc ON pc.empresa_id = e.id AND pc.codigo = '6.2.06.01'
ON CONFLICT (empresa_id, clave) DO NOTHING;


-- ============================================================
-- 4. ALTER TABLE bancos_empresa: columna de vínculo a la cuenta BASE de
--    comisión de pasarela de pago (distinta de cuenta_gasto_comision_id,
--    que ya existe de 0080 y ahora es específicamente la BANCARIA).
-- ============================================================

ALTER TABLE bancos_empresa ADD COLUMN IF NOT EXISTS cuenta_gasto_pasarela_id UUID REFERENCES plan_cuentas(id);


-- ============================================================
-- 5. BACKFILL: para cada banco existente, crear 2 leaves NUEVAS (una bajo
--    6.2.06.01 "bancaria", otra bajo 6.1.25.01 "pasarela") y repuntar
--    ambas columnas de bancos_empresa. Nombre dinámico
--    "{BANCO} {TIPO} {ÚLTIMOS4}" (ej. "VENEZUELA CORRIENTE 5546"), sin
--    prefijo "COMISION BANCO" (el grupo padre ya lo dice). Guard
--    `cuenta_gasto_pasarela_id IS NULL`: procesa solo bancos aun no
--    migrados a la estructura de 2 cuentas — idempotente, re-ejecutar no
--    duplica ni reprocesa bancos ya migrados.
--    Numeración por conteo de hijos del grupo, mismo criterio que 0080.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_grupo_bancaria_id UUID;
  v_grupo_pasarela_id UUID;
  v_cnt INT;
  v_codigo TEXT;
  v_nombre_leaf TEXT;
  v_leaf_bancaria_id UUID;
  v_leaf_pasarela_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  FOR r IN
    SELECT id, empresa_id, nombre_banco, tipo_cuenta, nro_cuenta
    FROM bancos_empresa
    WHERE cuenta_gasto_pasarela_id IS NULL
    ORDER BY empresa_id, created_at
  LOOP
    -- Nombre dinámico compartido por ambas leaves: "{BANCO} {TIPO} {ULT4}"
    v_nombre_leaf := UPPER(TRIM(r.nombre_banco))
      || CASE WHEN r.tipo_cuenta IS NOT NULL AND TRIM(r.tipo_cuenta) <> ''
              THEN ' ' || UPPER(TRIM(r.tipo_cuenta)) ELSE '' END
      || ' ' || RIGHT(r.nro_cuenta, 4);

    -- ── Rama BANCARIA: 6.2.06.01 ────────────────────────────
    SELECT id INTO v_grupo_bancaria_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = '6.2.06.01';

    -- Defensivo: si el subgrupo no existe todavia para esta empresa (no
    -- deberia pasar, el paso 2 lo backfillea para todas), lo creamos aqui
    -- via seed_plan_cuentas antes de continuar.
    IF v_grupo_bancaria_id IS NULL THEN
      PERFORM seed_plan_cuentas(r.empresa_id, NULL);
      SELECT id INTO v_grupo_bancaria_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = '6.2.06.01';
    END IF;

    SELECT COUNT(*) INTO v_cnt FROM plan_cuentas WHERE parent_id = v_grupo_bancaria_id AND empresa_id = r.empresa_id;
    v_codigo := '6.2.06.01.' || LPAD((v_cnt + 1)::TEXT, 2, '0');

    INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
    VALUES (uuid_generate_v4(), r.empresa_id, v_codigo, v_nombre_leaf, 'GASTO', 'DEUDORA', v_grupo_bancaria_id, 5, TRUE, TRUE, v_now, v_now, NULL)
    ON CONFLICT (empresa_id,codigo) DO NOTHING
    RETURNING id INTO v_leaf_bancaria_id;

    IF v_leaf_bancaria_id IS NULL THEN
      SELECT id INTO v_leaf_bancaria_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = v_codigo;
    END IF;

    -- ── Rama PASARELA: 6.1.25.01 ────────────────────────────
    SELECT id INTO v_grupo_pasarela_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = '6.1.25.01';

    IF v_grupo_pasarela_id IS NULL THEN
      PERFORM seed_plan_cuentas(r.empresa_id, NULL);
      SELECT id INTO v_grupo_pasarela_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = '6.1.25.01';
    END IF;

    SELECT COUNT(*) INTO v_cnt FROM plan_cuentas WHERE parent_id = v_grupo_pasarela_id AND empresa_id = r.empresa_id;
    v_codigo := '6.1.25.01.' || LPAD((v_cnt + 1)::TEXT, 2, '0');

    INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
    VALUES (uuid_generate_v4(), r.empresa_id, v_codigo, v_nombre_leaf, 'GASTO', 'DEUDORA', v_grupo_pasarela_id, 5, TRUE, TRUE, v_now, v_now, NULL)
    ON CONFLICT (empresa_id,codigo) DO NOTHING
    RETURNING id INTO v_leaf_pasarela_id;

    IF v_leaf_pasarela_id IS NULL THEN
      SELECT id INTO v_leaf_pasarela_id FROM plan_cuentas WHERE empresa_id = r.empresa_id AND codigo = v_codigo;
    END IF;

    -- Repuntar ambas columnas del banco a las leaves nuevas.
    UPDATE bancos_empresa
    SET cuenta_gasto_comision_id = v_leaf_bancaria_id,
        cuenta_gasto_pasarela_id = v_leaf_pasarela_id,
        updated_at = v_now
    WHERE id = r.id;
  END LOOP;
END $$;


-- ============================================================
-- 6. REPUNTAR metodo_cobro_deducciones: el backfill de 0080 (SC-10) apuntaba
--    a las leaves viejas de 6.2.05.NN (100% "Comision bancaria"). Se
--    re-apuntan a la leaf nueva de "Comisiones Bancarias" (6.2.06.01.NN) del
--    mismo banco — NUNCA a pasarela, el backfill original era íntegramente
--    de naturaleza bancaria. CRÍTICO: este paso va ANTES del paso 7
--    (desactivación de 6.2.05) — repuntar antes de desactivar.
-- ============================================================

UPDATE metodo_cobro_deducciones d
SET cuenta_gasto_id = be.cuenta_gasto_comision_id,
    updated_at = NOW()
FROM metodos_cobro mc
JOIN bancos_empresa be ON be.id = mc.banco_empresa_id
WHERE d.metodo_cobro_id = mc.id
  AND d.cuenta_gasto_id IN (SELECT id FROM plan_cuentas WHERE codigo LIKE '6.2.05.%')
  AND be.cuenta_gasto_comision_id IS NOT NULL;


-- ============================================================
-- 6b. GUARD DEFENSIVO: verificar que NADA quedó apuntando al subárbol
--     6.2.05.% antes de desactivarlo. El paso 5 repunta bancos_empresa y el
--     paso 6 repunta metodo_cobro_deducciones SOLO para filas alcanzables
--     vía el JOIN metodos_cobro→bancos_empresa (igual que el backfill
--     original de 0080, que también exigía `banco_empresa_id IS NOT NULL`).
--     Una fila de metodo_cobro_deducciones creada manualmente durante la
--     ventana de desarrollo, con `metodo_cobro_id` apuntando a un método
--     cuyo `banco_empresa_id` haya sido luego anulado, NO sería alcanzada
--     por el UPDATE del paso 6 y quedaría huérfana sobre una cuenta
--     desactivada sin aviso. Este guard falla la migración en seco (RAISE
--     EXCEPTION) en vez de dejar ese caso pasar en silencio — mismo patrón
--     de precondición que 0071 (RAISE EXCEPTION si falta una fila esperada
--     antes de continuar). Chequea ambas superficies: filas de
--     metodo_cobro_deducciones y columnas FK de bancos_empresa.
-- ============================================================

DO $$
DECLARE
  v_deducciones_huerfanas INT;
  v_bancos_huerfanos INT;
BEGIN
  SELECT COUNT(*) INTO v_deducciones_huerfanas
  FROM metodo_cobro_deducciones d
  WHERE d.cuenta_gasto_id IN (SELECT id FROM plan_cuentas WHERE codigo = '6.2.05' OR codigo LIKE '6.2.05.%');

  SELECT COUNT(*) INTO v_bancos_huerfanos
  FROM bancos_empresa be
  WHERE be.cuenta_gasto_comision_id IN (SELECT id FROM plan_cuentas WHERE codigo = '6.2.05' OR codigo LIKE '6.2.05.%')
     OR be.cuenta_gasto_pasarela_id IN (SELECT id FROM plan_cuentas WHERE codigo = '6.2.05' OR codigo LIKE '6.2.05.%');

  IF v_deducciones_huerfanas > 0 OR v_bancos_huerfanos > 0 THEN
    RAISE EXCEPTION 'No se puede desactivar 6.2.05: quedan % fila(s) de metodo_cobro_deducciones y % banco(s) apuntando aun al subarbol 6.2.05.%% (deberian haber sido repuntados en los pasos 5/6). Revisar metodos_cobro sin banco_empresa_id antes de reintentar.',
      v_deducciones_huerfanas, v_bancos_huerfanos;
  END IF;
END $$;


-- ============================================================
-- 7. DESACTIVAR 6.2.05 y sus leaves — ahora seguro, nada referencia ya esas
--    filas (paso 5 repuntó bancos_empresa, paso 6 repuntó
--    metodo_cobro_deducciones, paso 6b lo verificó). `6.2.05` nunca tuvo
--    entrada en cuentas_config, así que `protect_plan_cuentas` (0065, Regla
--    2) no bloquea esta desactivación. Solo desactiva (is_active=FALSE),
--    nunca DELETE — reversible con UPDATE manual si algo sale mal.
--    `6.2.01`/`6.2.03` (leaves viejas de 0021/0064) NO se tocan aquí — su
--    desactivación sigue siendo responsabilidad del script de limpieza
--    manual (Slice 1, cleanup_gastos_cxp_qol.sql, sin cambios).
-- ============================================================

UPDATE plan_cuentas
SET is_active = FALSE, updated_at = NOW()
WHERE codigo = '6.2.05' OR codigo LIKE '6.2.05.%';
