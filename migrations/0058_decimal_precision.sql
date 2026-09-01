-- =============================================================================
-- Migration: 0058_decimal_precision.sql
-- Purpose:   Widen all financial NUMERIC columns to NUMERIC(20,8) for
--            decimal.js precision parity, and create system_settings +
--            system_config_audit tables.
-- Created:   2026-06-17
-- Author:    decimal-precision-standard change
-- =============================================================================
-- PREREQUISITES:
--   - Snapshot staging DB before applying (Supabase → Settings → Database → Backup)
--   - Apply 0057_fix_duplicate_trigger_and_saf_tipo.sql before this
-- ROLLBACK GATE:
--   DOWN section below is only safe BEFORE any 8-decimal values are written
--   to production. Once PR1 app is live, the window closes permanently.
-- =============================================================================

-- =============================================================================
-- UP
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tasas_cambio
-- ---------------------------------------------------------------------------
ALTER TABLE tasas_cambio
  ALTER COLUMN valor TYPE NUMERIC(20,8) USING valor::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- productos
-- ---------------------------------------------------------------------------
ALTER TABLE productos
  ALTER COLUMN costo_usd          TYPE NUMERIC(20,8) USING costo_usd::NUMERIC(20,8),
  ALTER COLUMN precio_venta_usd   TYPE NUMERIC(20,8) USING precio_venta_usd::NUMERIC(20,8),
  ALTER COLUMN precio_mayor_usd   TYPE NUMERIC(20,8) USING precio_mayor_usd::NUMERIC(20,8),
  ALTER COLUMN precio_especial_usd TYPE NUMERIC(20,8) USING precio_especial_usd::NUMERIC(20,8),
  ALTER COLUMN costo_promedio     TYPE NUMERIC(20,8) USING costo_promedio::NUMERIC(20,8),
  ALTER COLUMN costo_ultimo       TYPE NUMERIC(20,8) USING costo_ultimo::NUMERIC(20,8),
  ALTER COLUMN stock              TYPE NUMERIC(20,8) USING stock::NUMERIC(20,8),
  ALTER COLUMN stock_minimo       TYPE NUMERIC(20,8) USING stock_minimo::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- inventario_stock
-- ---------------------------------------------------------------------------
ALTER TABLE inventario_stock
  ALTER COLUMN cantidad_actual  TYPE NUMERIC(20,8) USING cantidad_actual::NUMERIC(20,8),
  ALTER COLUMN stock_reservado  TYPE NUMERIC(20,8) USING stock_reservado::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- movimientos_inventario
-- ---------------------------------------------------------------------------
ALTER TABLE movimientos_inventario
  ALTER COLUMN cantidad        TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN stock_anterior  TYPE NUMERIC(20,8) USING stock_anterior::NUMERIC(20,8),
  ALTER COLUMN stock_nuevo     TYPE NUMERIC(20,8) USING stock_nuevo::NUMERIC(20,8),
  ALTER COLUMN costo_unitario  TYPE NUMERIC(20,8) USING costo_unitario::NUMERIC(20,8),
  ALTER COLUMN tasa_cambio     TYPE NUMERIC(20,8) USING tasa_cambio::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- recetas
-- ---------------------------------------------------------------------------
ALTER TABLE recetas
  ALTER COLUMN cantidad TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- ajustes_det
-- ---------------------------------------------------------------------------
ALTER TABLE ajustes_det
  ALTER COLUMN cantidad       TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN costo_unitario TYPE NUMERIC(20,8) USING costo_unitario::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- lotes
-- ---------------------------------------------------------------------------
ALTER TABLE lotes
  ALTER COLUMN cantidad_inicial TYPE NUMERIC(20,8) USING cantidad_inicial::NUMERIC(20,8),
  ALTER COLUMN cantidad_actual  TYPE NUMERIC(20,8) USING cantidad_actual::NUMERIC(20,8),
  ALTER COLUMN costo_unitario   TYPE NUMERIC(20,8) USING costo_unitario::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- unidades_conversion
-- ---------------------------------------------------------------------------
ALTER TABLE unidades_conversion
  ALTER COLUMN factor TYPE NUMERIC(20,8) USING factor::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- impuestos_ve
-- ---------------------------------------------------------------------------
ALTER TABLE impuestos_ve
  ALTER COLUMN porcentaje TYPE NUMERIC(20,8) USING porcentaje::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- niveles_precio
-- ---------------------------------------------------------------------------
ALTER TABLE niveles_precio
  ALTER COLUMN porcentaje_defecto TYPE NUMERIC(20,8) USING porcentaje_defecto::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------------
ALTER TABLE clientes
  ALTER COLUMN limite_credito_usd     TYPE NUMERIC(20,8) USING limite_credito_usd::NUMERIC(20,8),
  ALTER COLUMN saldo_actual           TYPE NUMERIC(20,8) USING saldo_actual::NUMERIC(20,8),
  ALTER COLUMN porcentaje_retencion_iva TYPE NUMERIC(20,8) USING porcentaje_retencion_iva::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- movimientos_cuenta (CxC)
-- ---------------------------------------------------------------------------
ALTER TABLE movimientos_cuenta
  ALTER COLUMN monto          TYPE NUMERIC(20,8) USING monto::NUMERIC(20,8),
  ALTER COLUMN saldo_anterior TYPE NUMERIC(20,8) USING saldo_anterior::NUMERIC(20,8),
  ALTER COLUMN saldo_nuevo    TYPE NUMERIC(20,8) USING saldo_nuevo::NUMERIC(20,8),
  ALTER COLUMN monto_moneda   TYPE NUMERIC(20,8) USING monto_moneda::NUMERIC(20,8),
  ALTER COLUMN tasa_pago      TYPE NUMERIC(20,8) USING tasa_pago::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- vencimientos_cobrar
-- ---------------------------------------------------------------------------
ALTER TABLE vencimientos_cobrar
  ALTER COLUMN monto_original_usd  TYPE NUMERIC(20,8) USING monto_original_usd::NUMERIC(20,8),
  ALTER COLUMN monto_pagado_usd    TYPE NUMERIC(20,8) USING monto_pagado_usd::NUMERIC(20,8),
  ALTER COLUMN saldo_pendiente_usd TYPE NUMERIC(20,8) USING saldo_pendiente_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- ventas
-- ---------------------------------------------------------------------------
ALTER TABLE ventas
  ALTER COLUMN tasa             TYPE NUMERIC(20,8) USING tasa::NUMERIC(20,8),
  ALTER COLUMN total_exento_usd TYPE NUMERIC(20,8) USING total_exento_usd::NUMERIC(20,8),
  ALTER COLUMN total_base_usd   TYPE NUMERIC(20,8) USING total_base_usd::NUMERIC(20,8),
  ALTER COLUMN total_iva_usd    TYPE NUMERIC(20,8) USING total_iva_usd::NUMERIC(20,8),
  ALTER COLUMN total_igtf_usd   TYPE NUMERIC(20,8) USING total_igtf_usd::NUMERIC(20,8),
  ALTER COLUMN total_usd        TYPE NUMERIC(20,8) USING total_usd::NUMERIC(20,8),
  ALTER COLUMN total_bs         TYPE NUMERIC(20,8) USING total_bs::NUMERIC(20,8),
  ALTER COLUMN descuento_usd    TYPE NUMERIC(20,8) USING descuento_usd::NUMERIC(20,8),
  ALTER COLUMN descuento_bs     TYPE NUMERIC(20,8) USING descuento_bs::NUMERIC(20,8),
  ALTER COLUMN saldo_pend_usd   TYPE NUMERIC(20,8) USING saldo_pend_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- ventas_det
-- ---------------------------------------------------------------------------
ALTER TABLE ventas_det
  ALTER COLUMN cantidad           TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN precio_unitario_usd TYPE NUMERIC(20,8) USING precio_unitario_usd::NUMERIC(20,8),
  ALTER COLUMN impuesto_pct       TYPE NUMERIC(20,8) USING impuesto_pct::NUMERIC(20,8),
  ALTER COLUMN subtotal_usd       TYPE NUMERIC(20,8) USING subtotal_usd::NUMERIC(20,8),
  ALTER COLUMN subtotal_bs        TYPE NUMERIC(20,8) USING subtotal_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- pagos
-- ---------------------------------------------------------------------------
ALTER TABLE pagos
  ALTER COLUMN tasa      TYPE NUMERIC(20,8) USING tasa::NUMERIC(20,8),
  ALTER COLUMN monto     TYPE NUMERIC(20,8) USING monto::NUMERIC(20,8),
  ALTER COLUMN monto_usd TYPE NUMERIC(20,8) USING monto_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- notas_credito
-- ---------------------------------------------------------------------------
ALTER TABLE notas_credito
  ALTER COLUMN tasa_historica   TYPE NUMERIC(20,8) USING tasa_historica::NUMERIC(20,8),
  ALTER COLUMN total_exento_usd TYPE NUMERIC(20,8) USING total_exento_usd::NUMERIC(20,8),
  ALTER COLUMN total_base_usd   TYPE NUMERIC(20,8) USING total_base_usd::NUMERIC(20,8),
  ALTER COLUMN total_iva_usd    TYPE NUMERIC(20,8) USING total_iva_usd::NUMERIC(20,8),
  ALTER COLUMN total_usd        TYPE NUMERIC(20,8) USING total_usd::NUMERIC(20,8),
  ALTER COLUMN total_bs         TYPE NUMERIC(20,8) USING total_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- notas_credito_det
-- ---------------------------------------------------------------------------
ALTER TABLE notas_credito_det
  ALTER COLUMN cantidad            TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN precio_unitario_usd TYPE NUMERIC(20,8) USING precio_unitario_usd::NUMERIC(20,8),
  ALTER COLUMN impuesto_pct        TYPE NUMERIC(20,8) USING impuesto_pct::NUMERIC(20,8),
  ALTER COLUMN subtotal_usd        TYPE NUMERIC(20,8) USING subtotal_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- notas_debito
-- ---------------------------------------------------------------------------
ALTER TABLE notas_debito
  ALTER COLUMN tasa             TYPE NUMERIC(20,8) USING tasa::NUMERIC(20,8),
  ALTER COLUMN total_exento_usd TYPE NUMERIC(20,8) USING total_exento_usd::NUMERIC(20,8),
  ALTER COLUMN total_base_usd   TYPE NUMERIC(20,8) USING total_base_usd::NUMERIC(20,8),
  ALTER COLUMN total_iva_usd    TYPE NUMERIC(20,8) USING total_iva_usd::NUMERIC(20,8),
  ALTER COLUMN total_usd        TYPE NUMERIC(20,8) USING total_usd::NUMERIC(20,8),
  ALTER COLUMN total_bs         TYPE NUMERIC(20,8) USING total_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- notas_debito_det
-- ---------------------------------------------------------------------------
ALTER TABLE notas_debito_det
  ALTER COLUMN cantidad            TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN precio_unitario_usd TYPE NUMERIC(20,8) USING precio_unitario_usd::NUMERIC(20,8),
  ALTER COLUMN impuesto_pct        TYPE NUMERIC(20,8) USING impuesto_pct::NUMERIC(20,8),
  ALTER COLUMN subtotal_usd        TYPE NUMERIC(20,8) USING subtotal_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- retenciones_iva_ventas
-- ---------------------------------------------------------------------------
ALTER TABLE retenciones_iva_ventas
  ALTER COLUMN base_imponible      TYPE NUMERIC(20,8) USING base_imponible::NUMERIC(20,8),
  ALTER COLUMN porcentaje_iva      TYPE NUMERIC(20,8) USING porcentaje_iva::NUMERIC(20,8),
  ALTER COLUMN monto_iva           TYPE NUMERIC(20,8) USING monto_iva::NUMERIC(20,8),
  ALTER COLUMN porcentaje_retencion TYPE NUMERIC(20,8) USING porcentaje_retencion::NUMERIC(20,8),
  ALTER COLUMN monto_retenido      TYPE NUMERIC(20,8) USING monto_retenido::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- retenciones_islr_ventas
-- ---------------------------------------------------------------------------
ALTER TABLE retenciones_islr_ventas
  ALTER COLUMN base_imponible_bs   TYPE NUMERIC(20,8) USING base_imponible_bs::NUMERIC(20,8),
  ALTER COLUMN porcentaje_retencion TYPE NUMERIC(20,8) USING porcentaje_retencion::NUMERIC(20,8),
  ALTER COLUMN monto_retenido_bs   TYPE NUMERIC(20,8) USING monto_retenido_bs::NUMERIC(20,8),
  ALTER COLUMN sustraendo_bs       TYPE NUMERIC(20,8) USING sustraendo_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- islr_conceptos_ve
-- ---------------------------------------------------------------------------
ALTER TABLE islr_conceptos_ve
  ALTER COLUMN porcentaje_pj      TYPE NUMERIC(20,8) USING porcentaje_pj::NUMERIC(20,8),
  ALTER COLUMN porcentaje_pn      TYPE NUMERIC(20,8) USING porcentaje_pn::NUMERIC(20,8),
  ALTER COLUMN sustraendo_ut      TYPE NUMERIC(20,8) USING sustraendo_ut::NUMERIC(20,8),
  ALTER COLUMN monto_minimo_base  TYPE NUMERIC(20,8) USING monto_minimo_base::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- proveedores
-- ---------------------------------------------------------------------------
ALTER TABLE proveedores
  ALTER COLUMN retencion_iva_pct   TYPE NUMERIC(20,8) USING retencion_iva_pct::NUMERIC(20,8),
  ALTER COLUMN limite_credito_usd  TYPE NUMERIC(20,8) USING limite_credito_usd::NUMERIC(20,8),
  ALTER COLUMN saldo_actual        TYPE NUMERIC(20,8) USING saldo_actual::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- facturas_compra
-- ---------------------------------------------------------------------------
ALTER TABLE facturas_compra
  ALTER COLUMN tasa             TYPE NUMERIC(20,8) USING tasa::NUMERIC(20,8),
  ALTER COLUMN tasa_costo       TYPE NUMERIC(20,8) USING tasa_costo::NUMERIC(20,8),
  ALTER COLUMN total_exento_usd TYPE NUMERIC(20,8) USING total_exento_usd::NUMERIC(20,8),
  ALTER COLUMN total_base_usd   TYPE NUMERIC(20,8) USING total_base_usd::NUMERIC(20,8),
  ALTER COLUMN total_iva_usd    TYPE NUMERIC(20,8) USING total_iva_usd::NUMERIC(20,8),
  ALTER COLUMN total_igtf_usd   TYPE NUMERIC(20,8) USING total_igtf_usd::NUMERIC(20,8),
  ALTER COLUMN total_usd        TYPE NUMERIC(20,8) USING total_usd::NUMERIC(20,8),
  ALTER COLUMN total_bs         TYPE NUMERIC(20,8) USING total_bs::NUMERIC(20,8),
  ALTER COLUMN saldo_pend_usd   TYPE NUMERIC(20,8) USING saldo_pend_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- facturas_compra_det
-- ---------------------------------------------------------------------------
ALTER TABLE facturas_compra_det
  ALTER COLUMN cantidad             TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN costo_unitario_usd   TYPE NUMERIC(20,8) USING costo_unitario_usd::NUMERIC(20,8),
  ALTER COLUMN costo_usd_sistema    TYPE NUMERIC(20,8) USING costo_usd_sistema::NUMERIC(20,8),
  ALTER COLUMN impuesto_pct         TYPE NUMERIC(20,8) USING impuesto_pct::NUMERIC(20,8),
  ALTER COLUMN subtotal_usd         TYPE NUMERIC(20,8) USING subtotal_usd::NUMERIC(20,8),
  ALTER COLUMN subtotal_bs          TYPE NUMERIC(20,8) USING subtotal_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- retenciones_iva (compras)
-- ---------------------------------------------------------------------------
ALTER TABLE retenciones_iva
  ALTER COLUMN base_imponible      TYPE NUMERIC(20,8) USING base_imponible::NUMERIC(20,8),
  ALTER COLUMN porcentaje_iva      TYPE NUMERIC(20,8) USING porcentaje_iva::NUMERIC(20,8),
  ALTER COLUMN monto_iva           TYPE NUMERIC(20,8) USING monto_iva::NUMERIC(20,8),
  ALTER COLUMN porcentaje_retencion TYPE NUMERIC(20,8) USING porcentaje_retencion::NUMERIC(20,8),
  ALTER COLUMN monto_retenido      TYPE NUMERIC(20,8) USING monto_retenido::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- retenciones_islr (compras)
-- ---------------------------------------------------------------------------
ALTER TABLE retenciones_islr
  ALTER COLUMN base_imponible_bs   TYPE NUMERIC(20,8) USING base_imponible_bs::NUMERIC(20,8),
  ALTER COLUMN porcentaje_retencion TYPE NUMERIC(20,8) USING porcentaje_retencion::NUMERIC(20,8),
  ALTER COLUMN monto_retenido_bs   TYPE NUMERIC(20,8) USING monto_retenido_bs::NUMERIC(20,8),
  ALTER COLUMN sustraendo_bs       TYPE NUMERIC(20,8) USING sustraendo_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- notas_fiscales_compra
-- ---------------------------------------------------------------------------
ALTER TABLE notas_fiscales_compra
  ALTER COLUMN tasa             TYPE NUMERIC(20,8) USING tasa::NUMERIC(20,8),
  ALTER COLUMN total_exento_usd TYPE NUMERIC(20,8) USING total_exento_usd::NUMERIC(20,8),
  ALTER COLUMN total_base_usd   TYPE NUMERIC(20,8) USING total_base_usd::NUMERIC(20,8),
  ALTER COLUMN total_iva_usd    TYPE NUMERIC(20,8) USING total_iva_usd::NUMERIC(20,8),
  ALTER COLUMN total_usd        TYPE NUMERIC(20,8) USING total_usd::NUMERIC(20,8),
  ALTER COLUMN total_bs         TYPE NUMERIC(20,8) USING total_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- notas_fiscales_compra_det
-- ---------------------------------------------------------------------------
ALTER TABLE notas_fiscales_compra_det
  ALTER COLUMN cantidad            TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN precio_unitario_usd TYPE NUMERIC(20,8) USING precio_unitario_usd::NUMERIC(20,8),
  ALTER COLUMN impuesto_pct        TYPE NUMERIC(20,8) USING impuesto_pct::NUMERIC(20,8),
  ALTER COLUMN subtotal_usd        TYPE NUMERIC(20,8) USING subtotal_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- movimientos_cuenta_proveedor
-- ---------------------------------------------------------------------------
ALTER TABLE movimientos_cuenta_proveedor
  ALTER COLUMN monto              TYPE NUMERIC(20,8) USING monto::NUMERIC(20,8),
  ALTER COLUMN saldo_anterior     TYPE NUMERIC(20,8) USING saldo_anterior::NUMERIC(20,8),
  ALTER COLUMN saldo_nuevo        TYPE NUMERIC(20,8) USING saldo_nuevo::NUMERIC(20,8),
  ALTER COLUMN monto_moneda       TYPE NUMERIC(20,8) USING monto_moneda::NUMERIC(20,8),
  ALTER COLUMN tasa_pago          TYPE NUMERIC(20,8) USING tasa_pago::NUMERIC(20,8),
  ALTER COLUMN monto_usd_interno  TYPE NUMERIC(20,8) USING monto_usd_interno::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- vencimientos_pagar
-- ---------------------------------------------------------------------------
ALTER TABLE vencimientos_pagar
  ALTER COLUMN monto_original_usd  TYPE NUMERIC(20,8) USING monto_original_usd::NUMERIC(20,8),
  ALTER COLUMN monto_pagado_usd    TYPE NUMERIC(20,8) USING monto_pagado_usd::NUMERIC(20,8),
  ALTER COLUMN saldo_pendiente_usd TYPE NUMERIC(20,8) USING saldo_pendiente_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- historico_precios
-- ---------------------------------------------------------------------------
ALTER TABLE historico_precios
  ALTER COLUMN costo_anterior TYPE NUMERIC(20,8) USING costo_anterior::NUMERIC(20,8),
  ALTER COLUMN costo_nuevo    TYPE NUMERIC(20,8) USING costo_nuevo::NUMERIC(20,8),
  ALTER COLUMN pvp_anterior   TYPE NUMERIC(20,8) USING pvp_anterior::NUMERIC(20,8),
  ALTER COLUMN pvp_nuevo      TYPE NUMERIC(20,8) USING pvp_nuevo::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- sesiones_caja
-- ---------------------------------------------------------------------------
ALTER TABLE sesiones_caja
  ALTER COLUMN monto_apertura_usd TYPE NUMERIC(20,8) USING monto_apertura_usd::NUMERIC(20,8),
  ALTER COLUMN monto_apertura_bs  TYPE NUMERIC(20,8) USING monto_apertura_bs::NUMERIC(20,8),
  ALTER COLUMN monto_sistema_usd  TYPE NUMERIC(20,8) USING monto_sistema_usd::NUMERIC(20,8),
  ALTER COLUMN monto_fisico_usd   TYPE NUMERIC(20,8) USING monto_fisico_usd::NUMERIC(20,8),
  ALTER COLUMN diferencia_usd     TYPE NUMERIC(20,8) USING diferencia_usd::NUMERIC(20,8),
  ALTER COLUMN monto_sistema_bs   TYPE NUMERIC(20,8) USING monto_sistema_bs::NUMERIC(20,8),
  ALTER COLUMN monto_fisico_bs    TYPE NUMERIC(20,8) USING monto_fisico_bs::NUMERIC(20,8),
  ALTER COLUMN diferencia_bs      TYPE NUMERIC(20,8) USING diferencia_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- sesiones_caja_detalle
-- ---------------------------------------------------------------------------
ALTER TABLE sesiones_caja_detalle
  ALTER COLUMN total_sistema TYPE NUMERIC(20,8) USING total_sistema::NUMERIC(20,8),
  ALTER COLUMN total_fisico  TYPE NUMERIC(20,8) USING total_fisico::NUMERIC(20,8),
  ALTER COLUMN diferencia    TYPE NUMERIC(20,8) USING diferencia::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- movimientos_metodo_cobro
-- ---------------------------------------------------------------------------
ALTER TABLE movimientos_metodo_cobro
  ALTER COLUMN monto          TYPE NUMERIC(20,8) USING monto::NUMERIC(20,8),
  ALTER COLUMN saldo_anterior TYPE NUMERIC(20,8) USING saldo_anterior::NUMERIC(20,8),
  ALTER COLUMN saldo_nuevo    TYPE NUMERIC(20,8) USING saldo_nuevo::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- metodos_cobro
-- ---------------------------------------------------------------------------
ALTER TABLE metodos_cobro
  ALTER COLUMN saldo_actual TYPE NUMERIC(20,8) USING saldo_actual::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- movimientos_bancarios
-- ---------------------------------------------------------------------------
ALTER TABLE movimientos_bancarios
  ALTER COLUMN monto          TYPE NUMERIC(20,8) USING monto::NUMERIC(20,8),
  ALTER COLUMN saldo_anterior TYPE NUMERIC(20,8) USING saldo_anterior::NUMERIC(20,8),
  ALTER COLUMN saldo_nuevo    TYPE NUMERIC(20,8) USING saldo_nuevo::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- bancos_empresa
-- ---------------------------------------------------------------------------
ALTER TABLE bancos_empresa
  ALTER COLUMN saldo_actual TYPE NUMERIC(20,8) USING saldo_actual::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- caja_fuerte
-- ---------------------------------------------------------------------------
ALTER TABLE caja_fuerte
  ALTER COLUMN saldo_actual TYPE NUMERIC(20,8) USING saldo_actual::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- mov_caja_fuerte
-- ---------------------------------------------------------------------------
ALTER TABLE mov_caja_fuerte
  ALTER COLUMN monto          TYPE NUMERIC(20,8) USING monto::NUMERIC(20,8),
  ALTER COLUMN saldo_anterior TYPE NUMERIC(20,8) USING saldo_anterior::NUMERIC(20,8),
  ALTER COLUMN saldo_nuevo    TYPE NUMERIC(20,8) USING saldo_nuevo::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- traspasos_tesoreria
-- ---------------------------------------------------------------------------
ALTER TABLE traspasos_tesoreria
  ALTER COLUMN monto_origen  TYPE NUMERIC(20,8) USING monto_origen::NUMERIC(20,8),
  ALTER COLUMN monto_destino TYPE NUMERIC(20,8) USING monto_destino::NUMERIC(20,8),
  ALTER COLUMN tasa_cambio   TYPE NUMERIC(20,8) USING tasa_cambio::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- gastos
-- ---------------------------------------------------------------------------
ALTER TABLE gastos
  ALTER COLUMN tasa                TYPE NUMERIC(20,8) USING tasa::NUMERIC(20,8),
  ALTER COLUMN tasa_proveedor      TYPE NUMERIC(20,8) USING tasa_proveedor::NUMERIC(20,8),
  ALTER COLUMN monto_factura       TYPE NUMERIC(20,8) USING monto_factura::NUMERIC(20,8),
  ALTER COLUMN monto_usd           TYPE NUMERIC(20,8) USING monto_usd::NUMERIC(20,8),
  ALTER COLUMN porcentaje_iva      TYPE NUMERIC(20,8) USING porcentaje_iva::NUMERIC(20,8),
  ALTER COLUMN base_imponible_usd  TYPE NUMERIC(20,8) USING base_imponible_usd::NUMERIC(20,8),
  ALTER COLUMN monto_iva_usd       TYPE NUMERIC(20,8) USING monto_iva_usd::NUMERIC(20,8),
  ALTER COLUMN saldo_pendiente_usd TYPE NUMERIC(20,8) USING saldo_pendiente_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- gasto_pagos
-- ---------------------------------------------------------------------------
ALTER TABLE gasto_pagos
  ALTER COLUMN monto_usd TYPE NUMERIC(20,8) USING monto_usd::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- libro_contable
-- ---------------------------------------------------------------------------
ALTER TABLE libro_contable
  ALTER COLUMN monto TYPE NUMERIC(20,8) USING monto::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- citas
-- ---------------------------------------------------------------------------
ALTER TABLE citas
  ALTER COLUMN total_usd TYPE NUMERIC(20,8) USING total_usd::NUMERIC(20,8),
  ALTER COLUMN tasa      TYPE NUMERIC(20,8) USING tasa::NUMERIC(20,8),
  ALTER COLUMN total_bs  TYPE NUMERIC(20,8) USING total_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- citas_servicios
-- ---------------------------------------------------------------------------
ALTER TABLE citas_servicios
  ALTER COLUMN precio_usd TYPE NUMERIC(20,8) USING precio_usd::NUMERIC(20,8),
  ALTER COLUMN cantidad   TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- cita_items_extras
-- ---------------------------------------------------------------------------
ALTER TABLE cita_items_extras
  ALTER COLUMN cantidad   TYPE NUMERIC(20,8) USING cantidad::NUMERIC(20,8),
  ALTER COLUMN precio_usd TYPE NUMERIC(20,8) USING precio_usd::NUMERIC(20,8);

-- =============================================================================
-- system_settings table
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('precision_calc', '8',  'Decimales para calculos intermedios'),
  ('precision_view', '2',  'Decimales para presentacion en UI'),
  ('rounding_mode',  '4',  'Modo de redondeo decimal.js (4 = ROUND_HALF_UP)')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings_select"
  ON system_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for tenants — read-only

-- =============================================================================
-- system_config_audit table
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_config_audit (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key         TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT NOT NULL,
  changed_by  TEXT,
  changed_at  TIMESTAMPTZ DEFAULT now(),
  reason      TEXT
);

ALTER TABLE system_config_audit ENABLE ROW LEVEL SECURITY;

-- No tenant access — internal dev/ops only
CREATE POLICY "system_config_audit_deny_all"
  ON system_config_audit
  FOR ALL
  TO authenticated
  USING (false);

-- =============================================================================
-- DOWN (only safe BEFORE any 8-decimal values written to production)
-- =============================================================================
-- ROLLBACK GATE: Once PR1 app is live and toStorageString() values hit
-- production, narrowing back WILL truncate data. Only run DOWN during the
-- window between SQL deploy and app deploy.
-- Restore order: run in reverse of UP (new tables first, then ALTER columns).
-- =============================================================================

-- DROP TABLE IF EXISTS system_config_audit;
-- DROP TABLE IF EXISTS system_settings;

-- ALTER TABLE cita_items_extras ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);
-- ALTER TABLE cita_items_extras ALTER COLUMN precio_usd TYPE NUMERIC(12,2) USING precio_usd::NUMERIC(12,2);

-- ALTER TABLE citas_servicios ALTER COLUMN precio_usd TYPE NUMERIC(12,2) USING precio_usd::NUMERIC(12,2);
-- ALTER TABLE citas_servicios ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);

-- ALTER TABLE citas ALTER COLUMN total_usd TYPE NUMERIC(12,2) USING total_usd::NUMERIC(12,2);
-- ALTER TABLE citas ALTER COLUMN tasa TYPE NUMERIC(12,4) USING tasa::NUMERIC(12,4);
-- ALTER TABLE citas ALTER COLUMN total_bs TYPE NUMERIC(12,2) USING total_bs::NUMERIC(12,2);

-- ALTER TABLE libro_contable ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);

-- ALTER TABLE gasto_pagos ALTER COLUMN monto_usd TYPE NUMERIC(12,2) USING monto_usd::NUMERIC(12,2);

-- ALTER TABLE gastos ALTER COLUMN tasa TYPE NUMERIC(12,4) USING tasa::NUMERIC(12,4);
-- ALTER TABLE gastos ALTER COLUMN tasa_proveedor TYPE NUMERIC(12,4) USING tasa_proveedor::NUMERIC(12,4);
-- ALTER TABLE gastos ALTER COLUMN monto_factura TYPE NUMERIC(12,2) USING monto_factura::NUMERIC(12,2);
-- ALTER TABLE gastos ALTER COLUMN monto_usd TYPE NUMERIC(12,2) USING monto_usd::NUMERIC(12,2);
-- ALTER TABLE gastos ALTER COLUMN porcentaje_iva TYPE NUMERIC(12,2) USING porcentaje_iva::NUMERIC(12,2);
-- ALTER TABLE gastos ALTER COLUMN base_imponible_usd TYPE NUMERIC(12,2) USING base_imponible_usd::NUMERIC(12,2);
-- ALTER TABLE gastos ALTER COLUMN monto_iva_usd TYPE NUMERIC(12,2) USING monto_iva_usd::NUMERIC(12,2);
-- ALTER TABLE gastos ALTER COLUMN saldo_pendiente_usd TYPE NUMERIC(12,2) USING saldo_pendiente_usd::NUMERIC(12,2);

-- ALTER TABLE traspasos_tesoreria ALTER COLUMN monto_origen TYPE NUMERIC(12,2) USING monto_origen::NUMERIC(12,2);
-- ALTER TABLE traspasos_tesoreria ALTER COLUMN monto_destino TYPE NUMERIC(12,2) USING monto_destino::NUMERIC(12,2);
-- ALTER TABLE traspasos_tesoreria ALTER COLUMN tasa_cambio TYPE NUMERIC(12,4) USING tasa_cambio::NUMERIC(12,4);

-- ALTER TABLE mov_caja_fuerte ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);
-- ALTER TABLE mov_caja_fuerte ALTER COLUMN saldo_anterior TYPE NUMERIC(12,2) USING saldo_anterior::NUMERIC(12,2);
-- ALTER TABLE mov_caja_fuerte ALTER COLUMN saldo_nuevo TYPE NUMERIC(12,2) USING saldo_nuevo::NUMERIC(12,2);

-- ALTER TABLE caja_fuerte ALTER COLUMN saldo_actual TYPE NUMERIC(12,2) USING saldo_actual::NUMERIC(12,2);

-- ALTER TABLE bancos_empresa ALTER COLUMN saldo_actual TYPE NUMERIC(12,2) USING saldo_actual::NUMERIC(12,2);

-- ALTER TABLE movimientos_bancarios ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);
-- ALTER TABLE movimientos_bancarios ALTER COLUMN saldo_anterior TYPE NUMERIC(12,2) USING saldo_anterior::NUMERIC(12,2);
-- ALTER TABLE movimientos_bancarios ALTER COLUMN saldo_nuevo TYPE NUMERIC(12,2) USING saldo_nuevo::NUMERIC(12,2);

-- ALTER TABLE metodos_cobro ALTER COLUMN saldo_actual TYPE NUMERIC(12,2) USING saldo_actual::NUMERIC(12,2);

-- ALTER TABLE movimientos_metodo_cobro ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);
-- ALTER TABLE movimientos_metodo_cobro ALTER COLUMN saldo_anterior TYPE NUMERIC(12,2) USING saldo_anterior::NUMERIC(12,2);
-- ALTER TABLE movimientos_metodo_cobro ALTER COLUMN saldo_nuevo TYPE NUMERIC(12,2) USING saldo_nuevo::NUMERIC(12,2);

-- ALTER TABLE sesiones_caja_detalle ALTER COLUMN total_sistema TYPE NUMERIC(12,2) USING total_sistema::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja_detalle ALTER COLUMN total_fisico TYPE NUMERIC(12,2) USING total_fisico::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja_detalle ALTER COLUMN diferencia TYPE NUMERIC(12,2) USING diferencia::NUMERIC(12,2);

-- ALTER TABLE sesiones_caja ALTER COLUMN monto_apertura_usd TYPE NUMERIC(12,2) USING monto_apertura_usd::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja ALTER COLUMN monto_apertura_bs TYPE NUMERIC(12,2) USING monto_apertura_bs::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja ALTER COLUMN monto_sistema_usd TYPE NUMERIC(12,2) USING monto_sistema_usd::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja ALTER COLUMN monto_fisico_usd TYPE NUMERIC(12,2) USING monto_fisico_usd::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja ALTER COLUMN diferencia_usd TYPE NUMERIC(12,2) USING diferencia_usd::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja ALTER COLUMN monto_sistema_bs TYPE NUMERIC(12,2) USING monto_sistema_bs::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja ALTER COLUMN monto_fisico_bs TYPE NUMERIC(12,2) USING monto_fisico_bs::NUMERIC(12,2);
-- ALTER TABLE sesiones_caja ALTER COLUMN diferencia_bs TYPE NUMERIC(12,2) USING diferencia_bs::NUMERIC(12,2);

-- ALTER TABLE historico_precios ALTER COLUMN costo_anterior TYPE NUMERIC(12,2) USING costo_anterior::NUMERIC(12,2);
-- ALTER TABLE historico_precios ALTER COLUMN costo_nuevo TYPE NUMERIC(12,2) USING costo_nuevo::NUMERIC(12,2);
-- ALTER TABLE historico_precios ALTER COLUMN pvp_anterior TYPE NUMERIC(12,2) USING pvp_anterior::NUMERIC(12,2);
-- ALTER TABLE historico_precios ALTER COLUMN pvp_nuevo TYPE NUMERIC(12,2) USING pvp_nuevo::NUMERIC(12,2);

-- ALTER TABLE vencimientos_pagar ALTER COLUMN monto_original_usd TYPE NUMERIC(12,2) USING monto_original_usd::NUMERIC(12,2);
-- ALTER TABLE vencimientos_pagar ALTER COLUMN monto_pagado_usd TYPE NUMERIC(12,2) USING monto_pagado_usd::NUMERIC(12,2);
-- ALTER TABLE vencimientos_pagar ALTER COLUMN saldo_pendiente_usd TYPE NUMERIC(12,2) USING saldo_pendiente_usd::NUMERIC(12,2);

-- ALTER TABLE movimientos_cuenta_proveedor ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta_proveedor ALTER COLUMN saldo_anterior TYPE NUMERIC(12,2) USING saldo_anterior::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta_proveedor ALTER COLUMN saldo_nuevo TYPE NUMERIC(12,2) USING saldo_nuevo::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta_proveedor ALTER COLUMN monto_moneda TYPE NUMERIC(12,2) USING monto_moneda::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta_proveedor ALTER COLUMN tasa_pago TYPE NUMERIC(12,4) USING tasa_pago::NUMERIC(12,4);
-- ALTER TABLE movimientos_cuenta_proveedor ALTER COLUMN monto_usd_interno TYPE NUMERIC(12,2) USING monto_usd_interno::NUMERIC(12,2);

-- ALTER TABLE notas_fiscales_compra_det ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);
-- ALTER TABLE notas_fiscales_compra_det ALTER COLUMN precio_unitario_usd TYPE NUMERIC(12,2) USING precio_unitario_usd::NUMERIC(12,2);
-- ALTER TABLE notas_fiscales_compra_det ALTER COLUMN impuesto_pct TYPE NUMERIC(12,2) USING impuesto_pct::NUMERIC(12,2);
-- ALTER TABLE notas_fiscales_compra_det ALTER COLUMN subtotal_usd TYPE NUMERIC(12,2) USING subtotal_usd::NUMERIC(12,2);

-- ALTER TABLE notas_fiscales_compra ALTER COLUMN tasa TYPE NUMERIC(12,4) USING tasa::NUMERIC(12,4);
-- ALTER TABLE notas_fiscales_compra ALTER COLUMN total_exento_usd TYPE NUMERIC(12,2) USING total_exento_usd::NUMERIC(12,2);
-- ALTER TABLE notas_fiscales_compra ALTER COLUMN total_base_usd TYPE NUMERIC(12,2) USING total_base_usd::NUMERIC(12,2);
-- ALTER TABLE notas_fiscales_compra ALTER COLUMN total_iva_usd TYPE NUMERIC(12,2) USING total_iva_usd::NUMERIC(12,2);
-- ALTER TABLE notas_fiscales_compra ALTER COLUMN total_usd TYPE NUMERIC(12,2) USING total_usd::NUMERIC(12,2);
-- ALTER TABLE notas_fiscales_compra ALTER COLUMN total_bs TYPE NUMERIC(12,2) USING total_bs::NUMERIC(12,2);

-- ALTER TABLE retenciones_islr ALTER COLUMN base_imponible_bs TYPE NUMERIC(12,2) USING base_imponible_bs::NUMERIC(12,2);
-- ALTER TABLE retenciones_islr ALTER COLUMN porcentaje_retencion TYPE NUMERIC(12,2) USING porcentaje_retencion::NUMERIC(12,2);
-- ALTER TABLE retenciones_islr ALTER COLUMN monto_retenido_bs TYPE NUMERIC(12,2) USING monto_retenido_bs::NUMERIC(12,2);
-- ALTER TABLE retenciones_islr ALTER COLUMN sustraendo_bs TYPE NUMERIC(12,2) USING sustraendo_bs::NUMERIC(12,2);

-- ALTER TABLE retenciones_iva ALTER COLUMN base_imponible TYPE NUMERIC(12,2) USING base_imponible::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva ALTER COLUMN porcentaje_iva TYPE NUMERIC(12,2) USING porcentaje_iva::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva ALTER COLUMN monto_iva TYPE NUMERIC(12,2) USING monto_iva::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva ALTER COLUMN porcentaje_retencion TYPE NUMERIC(12,2) USING porcentaje_retencion::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva ALTER COLUMN monto_retenido TYPE NUMERIC(12,2) USING monto_retenido::NUMERIC(12,2);

-- ALTER TABLE facturas_compra_det ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);
-- ALTER TABLE facturas_compra_det ALTER COLUMN costo_unitario_usd TYPE NUMERIC(12,2) USING costo_unitario_usd::NUMERIC(12,2);
-- ALTER TABLE facturas_compra_det ALTER COLUMN costo_usd_sistema TYPE NUMERIC(12,2) USING costo_usd_sistema::NUMERIC(12,2);
-- ALTER TABLE facturas_compra_det ALTER COLUMN impuesto_pct TYPE NUMERIC(12,2) USING impuesto_pct::NUMERIC(12,2);
-- ALTER TABLE facturas_compra_det ALTER COLUMN subtotal_usd TYPE NUMERIC(12,2) USING subtotal_usd::NUMERIC(12,2);
-- ALTER TABLE facturas_compra_det ALTER COLUMN subtotal_bs TYPE NUMERIC(12,2) USING subtotal_bs::NUMERIC(12,2);

-- ALTER TABLE facturas_compra ALTER COLUMN tasa TYPE NUMERIC(12,4) USING tasa::NUMERIC(12,4);
-- ALTER TABLE facturas_compra ALTER COLUMN tasa_costo TYPE NUMERIC(12,4) USING tasa_costo::NUMERIC(12,4);
-- ALTER TABLE facturas_compra ALTER COLUMN total_exento_usd TYPE NUMERIC(12,2) USING total_exento_usd::NUMERIC(12,2);
-- ALTER TABLE facturas_compra ALTER COLUMN total_base_usd TYPE NUMERIC(12,2) USING total_base_usd::NUMERIC(12,2);
-- ALTER TABLE facturas_compra ALTER COLUMN total_iva_usd TYPE NUMERIC(12,2) USING total_iva_usd::NUMERIC(12,2);
-- ALTER TABLE facturas_compra ALTER COLUMN total_igtf_usd TYPE NUMERIC(12,2) USING total_igtf_usd::NUMERIC(12,2);
-- ALTER TABLE facturas_compra ALTER COLUMN total_usd TYPE NUMERIC(12,2) USING total_usd::NUMERIC(12,2);
-- ALTER TABLE facturas_compra ALTER COLUMN total_bs TYPE NUMERIC(12,2) USING total_bs::NUMERIC(12,2);
-- ALTER TABLE facturas_compra ALTER COLUMN saldo_pend_usd TYPE NUMERIC(12,2) USING saldo_pend_usd::NUMERIC(12,2);

-- ALTER TABLE proveedores ALTER COLUMN retencion_iva_pct TYPE NUMERIC(12,2) USING retencion_iva_pct::NUMERIC(12,2);
-- ALTER TABLE proveedores ALTER COLUMN limite_credito_usd TYPE NUMERIC(12,2) USING limite_credito_usd::NUMERIC(12,2);
-- ALTER TABLE proveedores ALTER COLUMN saldo_actual TYPE NUMERIC(12,2) USING saldo_actual::NUMERIC(12,2);

-- ALTER TABLE islr_conceptos_ve ALTER COLUMN porcentaje_pj TYPE NUMERIC(12,2) USING porcentaje_pj::NUMERIC(12,2);
-- ALTER TABLE islr_conceptos_ve ALTER COLUMN porcentaje_pn TYPE NUMERIC(12,2) USING porcentaje_pn::NUMERIC(12,2);
-- ALTER TABLE islr_conceptos_ve ALTER COLUMN sustraendo_ut TYPE NUMERIC(12,2) USING sustraendo_ut::NUMERIC(12,2);
-- ALTER TABLE islr_conceptos_ve ALTER COLUMN monto_minimo_base TYPE NUMERIC(12,2) USING monto_minimo_base::NUMERIC(12,2);

-- ALTER TABLE retenciones_islr_ventas ALTER COLUMN base_imponible_bs TYPE NUMERIC(12,2) USING base_imponible_bs::NUMERIC(12,2);
-- ALTER TABLE retenciones_islr_ventas ALTER COLUMN porcentaje_retencion TYPE NUMERIC(12,2) USING porcentaje_retencion::NUMERIC(12,2);
-- ALTER TABLE retenciones_islr_ventas ALTER COLUMN monto_retenido_bs TYPE NUMERIC(12,2) USING monto_retenido_bs::NUMERIC(12,2);
-- ALTER TABLE retenciones_islr_ventas ALTER COLUMN sustraendo_bs TYPE NUMERIC(12,2) USING sustraendo_bs::NUMERIC(12,2);

-- ALTER TABLE retenciones_iva_ventas ALTER COLUMN base_imponible TYPE NUMERIC(12,2) USING base_imponible::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva_ventas ALTER COLUMN porcentaje_iva TYPE NUMERIC(12,2) USING porcentaje_iva::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva_ventas ALTER COLUMN monto_iva TYPE NUMERIC(12,2) USING monto_iva::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva_ventas ALTER COLUMN porcentaje_retencion TYPE NUMERIC(12,2) USING porcentaje_retencion::NUMERIC(12,2);
-- ALTER TABLE retenciones_iva_ventas ALTER COLUMN monto_retenido TYPE NUMERIC(12,2) USING monto_retenido::NUMERIC(12,2);

-- ALTER TABLE pagos ALTER COLUMN tasa TYPE NUMERIC(12,4) USING tasa::NUMERIC(12,4);
-- ALTER TABLE pagos ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);
-- ALTER TABLE pagos ALTER COLUMN monto_usd TYPE NUMERIC(12,2) USING monto_usd::NUMERIC(12,2);

-- ALTER TABLE ventas_det ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);
-- ALTER TABLE ventas_det ALTER COLUMN precio_unitario_usd TYPE NUMERIC(12,2) USING precio_unitario_usd::NUMERIC(12,2);
-- ALTER TABLE ventas_det ALTER COLUMN impuesto_pct TYPE NUMERIC(12,2) USING impuesto_pct::NUMERIC(12,2);
-- ALTER TABLE ventas_det ALTER COLUMN subtotal_usd TYPE NUMERIC(12,2) USING subtotal_usd::NUMERIC(12,2);
-- ALTER TABLE ventas_det ALTER COLUMN subtotal_bs TYPE NUMERIC(12,2) USING subtotal_bs::NUMERIC(12,2);

-- ALTER TABLE ventas ALTER COLUMN tasa TYPE NUMERIC(12,4) USING tasa::NUMERIC(12,4);
-- ALTER TABLE ventas ALTER COLUMN total_exento_usd TYPE NUMERIC(12,2) USING total_exento_usd::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN total_base_usd TYPE NUMERIC(12,2) USING total_base_usd::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN total_iva_usd TYPE NUMERIC(12,2) USING total_iva_usd::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN total_igtf_usd TYPE NUMERIC(12,2) USING total_igtf_usd::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN total_usd TYPE NUMERIC(12,2) USING total_usd::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN total_bs TYPE NUMERIC(12,2) USING total_bs::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN descuento_usd TYPE NUMERIC(12,2) USING descuento_usd::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN descuento_bs TYPE NUMERIC(12,2) USING descuento_bs::NUMERIC(12,2);
-- ALTER TABLE ventas ALTER COLUMN saldo_pend_usd TYPE NUMERIC(12,2) USING saldo_pend_usd::NUMERIC(12,2);

-- ALTER TABLE vencimientos_cobrar ALTER COLUMN monto_original_usd TYPE NUMERIC(12,2) USING monto_original_usd::NUMERIC(12,2);
-- ALTER TABLE vencimientos_cobrar ALTER COLUMN monto_pagado_usd TYPE NUMERIC(12,2) USING monto_pagado_usd::NUMERIC(12,2);
-- ALTER TABLE vencimientos_cobrar ALTER COLUMN saldo_pendiente_usd TYPE NUMERIC(12,2) USING saldo_pendiente_usd::NUMERIC(12,2);

-- ALTER TABLE movimientos_cuenta ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta ALTER COLUMN saldo_anterior TYPE NUMERIC(12,2) USING saldo_anterior::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta ALTER COLUMN saldo_nuevo TYPE NUMERIC(12,2) USING saldo_nuevo::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta ALTER COLUMN monto_moneda TYPE NUMERIC(12,2) USING monto_moneda::NUMERIC(12,2);
-- ALTER TABLE movimientos_cuenta ALTER COLUMN tasa_pago TYPE NUMERIC(12,4) USING tasa_pago::NUMERIC(12,4);

-- ALTER TABLE clientes ALTER COLUMN limite_credito_usd TYPE NUMERIC(12,2) USING limite_credito_usd::NUMERIC(12,2);
-- ALTER TABLE clientes ALTER COLUMN saldo_actual TYPE NUMERIC(12,2) USING saldo_actual::NUMERIC(12,2);
-- ALTER TABLE clientes ALTER COLUMN porcentaje_retencion_iva TYPE NUMERIC(12,2) USING porcentaje_retencion_iva::NUMERIC(12,2);

-- ALTER TABLE niveles_precio ALTER COLUMN porcentaje_defecto TYPE NUMERIC(12,2) USING porcentaje_defecto::NUMERIC(12,2);

-- ALTER TABLE impuestos_ve ALTER COLUMN porcentaje TYPE NUMERIC(12,2) USING porcentaje::NUMERIC(12,2);

-- ALTER TABLE unidades_conversion ALTER COLUMN factor TYPE NUMERIC(12,4) USING factor::NUMERIC(12,4);

-- ALTER TABLE lotes ALTER COLUMN cantidad_inicial TYPE NUMERIC(12,3) USING cantidad_inicial::NUMERIC(12,3);
-- ALTER TABLE lotes ALTER COLUMN cantidad_actual TYPE NUMERIC(12,3) USING cantidad_actual::NUMERIC(12,3);
-- ALTER TABLE lotes ALTER COLUMN costo_unitario TYPE NUMERIC(12,2) USING costo_unitario::NUMERIC(12,2);

-- ALTER TABLE ajustes_det ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);
-- ALTER TABLE ajustes_det ALTER COLUMN costo_unitario TYPE NUMERIC(12,2) USING costo_unitario::NUMERIC(12,2);

-- ALTER TABLE recetas ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);

-- ALTER TABLE movimientos_inventario ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::NUMERIC(12,3);
-- ALTER TABLE movimientos_inventario ALTER COLUMN stock_anterior TYPE NUMERIC(12,3) USING stock_anterior::NUMERIC(12,3);
-- ALTER TABLE movimientos_inventario ALTER COLUMN stock_nuevo TYPE NUMERIC(12,3) USING stock_nuevo::NUMERIC(12,3);
-- ALTER TABLE movimientos_inventario ALTER COLUMN costo_unitario TYPE NUMERIC(12,2) USING costo_unitario::NUMERIC(12,2);
-- ALTER TABLE movimientos_inventario ALTER COLUMN tasa_cambio TYPE NUMERIC(12,4) USING tasa_cambio::NUMERIC(12,4);

-- ALTER TABLE inventario_stock ALTER COLUMN cantidad_actual TYPE NUMERIC(12,3) USING cantidad_actual::NUMERIC(12,3);
-- ALTER TABLE inventario_stock ALTER COLUMN stock_reservado TYPE NUMERIC(12,3) USING stock_reservado::NUMERIC(12,3);

-- ALTER TABLE productos ALTER COLUMN costo_usd TYPE NUMERIC(12,2) USING costo_usd::NUMERIC(12,2);
-- ALTER TABLE productos ALTER COLUMN precio_venta_usd TYPE NUMERIC(12,2) USING precio_venta_usd::NUMERIC(12,2);
-- ALTER TABLE productos ALTER COLUMN precio_mayor_usd TYPE NUMERIC(12,2) USING precio_mayor_usd::NUMERIC(12,2);
-- ALTER TABLE productos ALTER COLUMN precio_especial_usd TYPE NUMERIC(12,2) USING precio_especial_usd::NUMERIC(12,2);
-- ALTER TABLE productos ALTER COLUMN costo_promedio TYPE NUMERIC(12,2) USING costo_promedio::NUMERIC(12,2);
-- ALTER TABLE productos ALTER COLUMN costo_ultimo TYPE NUMERIC(12,2) USING costo_ultimo::NUMERIC(12,2);
-- ALTER TABLE productos ALTER COLUMN stock TYPE NUMERIC(12,3) USING stock::NUMERIC(12,3);
-- ALTER TABLE productos ALTER COLUMN stock_minimo TYPE NUMERIC(12,3) USING stock_minimo::NUMERIC(12,3);

-- ALTER TABLE tasas_cambio ALTER COLUMN valor TYPE NUMERIC(12,4) USING valor::NUMERIC(12,4);
