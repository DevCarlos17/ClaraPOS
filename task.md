-- ================================================================
-- CLONE EMPRESA: ClaraPOS
-- Origen : 0ecd3158-55ca-4438-aecd-c4304cf05318
-- Destino: f0aba92c-ff8f-4524-8100-eeea14ac4c29
--
-- INSTRUCCIONES:
-- 1. Ejecutar desde Supabase SQL Editor (corre como postgres, bypasea RLS).
-- 2. Ejecutar UNA sola vez. Si necesitás re-ejecutar, primero borrá
-- manualmente los datos del destino o usá el bloque DELETE del Paso 2.
-- 3. Los campos usuario_id / created_by quedan apuntando a los usuarios
-- de la empresa origen — es correcto para datos de prueba.
-- ================================================================

DO $$
DECLARE
src uuid := '0ecd3158-55ca-4438-aecd-c4304cf05318';
dst uuid := 'f0aba92c-ff8f-4524-8100-eeea14ac4c29';
BEGIN

-- ================================================================
-- PASO 1: Tablas de mapeo (viejo UUID → nuevo UUID)
-- ================================================================
CREATE TEMP TABLE IF NOT EXISTS \_m_roles (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_dep (o uuid PRIMARY KEY, n uuid); -- departamentos
CREATE TEMP TABLE IF NOT EXISTS \_m_marcas (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_uni (o uuid PRIMARY KEY, n uuid); -- unidades
CREATE TEMP TABLE IF NOT EXISTS \_m_depositos (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_cuentas (o uuid PRIMARY KEY, n uuid); -- plan_cuentas
CREATE TEMP TABLE IF NOT EXISTS \_m_bancos (o uuid PRIMARY KEY, n uuid); -- bancos_empresa
CREATE TEMP TABLE IF NOT EXISTS \_m_imptos (o uuid PRIMARY KEY, n uuid); -- impuestos_ve
CREATE TEMP TABLE IF NOT EXISTS \_m_niveles (o uuid PRIMARY KEY, n uuid); -- niveles_precio
CREATE TEMP TABLE IF NOT EXISTS \_m_motivos (o uuid PRIMARY KEY, n uuid); -- ajuste_motivos
CREATE TEMP TABLE IF NOT EXISTS \_m_clientes (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_prov (o uuid PRIMARY KEY, n uuid); -- proveedores
CREATE TEMP TABLE IF NOT EXISTS \_m_cajas (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_metodos (o uuid PRIMARY KEY, n uuid); -- metodos_cobro
CREATE TEMP TABLE IF NOT EXISTS \_m_prods (o uuid PRIMARY KEY, n uuid); -- productos
CREATE TEMP TABLE IF NOT EXISTS \_m_lotes (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_cajaf (o uuid PRIMARY KEY, n uuid); -- caja_fuerte
CREATE TEMP TABLE IF NOT EXISTS \_m_ses (o uuid PRIMARY KEY, n uuid); -- sesiones_caja
CREATE TEMP TABLE IF NOT EXISTS \_m_ventas (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_fcomp (o uuid PRIMARY KEY, n uuid); -- facturas_compra
CREATE TEMP TABLE IF NOT EXISTS \_m_gastos (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_ajus (o uuid PRIMARY KEY, n uuid); -- ajustes
CREATE TEMP TABLE IF NOT EXISTS \_m_ncr (o uuid PRIMARY KEY, n uuid); -- notas_credito
CREATE TEMP TABLE IF NOT EXISTS \_m_ndb (o uuid PRIMARY KEY, n uuid); -- notas_debito
CREATE TEMP TABLE IF NOT EXISTS \_m_nfc (o uuid PRIMARY KEY, n uuid); -- notas_fiscales_compra
CREATE TEMP TABLE IF NOT EXISTS \_m_pagos (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_mmc (o uuid PRIMARY KEY, n uuid); -- movimientos_metodo_cobro
CREATE TEMP TABLE IF NOT EXISTS \_m_mban (o uuid PRIMARY KEY, n uuid); -- movimientos_bancarios
CREATE TEMP TABLE IF NOT EXISTS \_m_mcf (o uuid PRIMARY KEY, n uuid); -- mov_caja_fuerte
CREATE TEMP TABLE IF NOT EXISTS \_m_minv (o uuid PRIMARY KEY, n uuid); -- movimientos_inventario
CREATE TEMP TABLE IF NOT EXISTS \_m_mcta (o uuid PRIMARY KEY, n uuid); -- movimientos_cuenta
CREATE TEMP TABLE IF NOT EXISTS \_m_citas (o uuid PRIMARY KEY, n uuid);
CREATE TEMP TABLE IF NOT EXISTS \_m_citasvc (o uuid PRIMARY KEY, n uuid); -- citas_servicios
CREATE TEMP TABLE IF NOT EXISTS \_m_hstaff (o uuid PRIMARY KEY, n uuid); -- horarios_staff
CREATE TEMP TABLE IF NOT EXISTS \_m_libro (o uuid PRIMARY KEY, n uuid); -- libro_contable
CREATE TEMP TABLE IF NOT EXISTS \_m_gastp (o uuid PRIMARY KEY, n uuid); -- gasto_pagos
CREATE TEMP TABLE IF NOT EXISTS \_m_tras (o uuid PRIMARY KEY, n uuid); -- traspasos_tesoreria

-- Poblar mapeos PRE-generando todos los nuevos UUIDs
INSERT INTO \_m_roles SELECT id, gen_random_uuid() FROM roles WHERE empresa_id = src;
INSERT INTO \_m_dep SELECT id, gen_random_uuid() FROM departamentos WHERE empresa_id = src;
INSERT INTO \_m_marcas SELECT id, gen_random_uuid() FROM marcas WHERE empresa_id = src;
INSERT INTO \_m_uni SELECT id, gen_random_uuid() FROM unidades WHERE empresa_id = src;
INSERT INTO \_m_depositos SELECT id, gen_random_uuid() FROM depositos WHERE empresa_id = src;
INSERT INTO \_m_cuentas SELECT id, gen_random_uuid() FROM plan_cuentas WHERE empresa_id = src;
INSERT INTO \_m_bancos SELECT id, gen_random_uuid() FROM bancos_empresa WHERE empresa_id = src;
INSERT INTO \_m_imptos SELECT id, gen_random_uuid() FROM impuestos_ve WHERE empresa_id = src;
INSERT INTO \_m_niveles SELECT id, gen_random_uuid() FROM niveles_precio WHERE empresa_id = src;
INSERT INTO \_m_motivos SELECT id, gen_random_uuid() FROM ajuste_motivos WHERE empresa_id = src;
INSERT INTO \_m_clientes SELECT id, gen_random_uuid() FROM clientes WHERE empresa_id = src;
INSERT INTO \_m_prov SELECT id, gen_random_uuid() FROM proveedores WHERE empresa_id = src;
INSERT INTO \_m_cajas SELECT id, gen_random_uuid() FROM cajas WHERE empresa_id = src;
INSERT INTO \_m_metodos SELECT id, gen_random_uuid() FROM metodos_cobro WHERE empresa_id = src;
INSERT INTO \_m_prods SELECT id, gen_random_uuid() FROM productos WHERE empresa_id = src;
INSERT INTO \_m_lotes SELECT id, gen_random_uuid() FROM lotes WHERE empresa_id = src;
INSERT INTO \_m_cajaf SELECT id, gen_random_uuid() FROM caja_fuerte WHERE empresa_id = src;
INSERT INTO \_m_ses SELECT id, gen_random_uuid() FROM sesiones_caja WHERE empresa_id = src;
INSERT INTO \_m_ventas SELECT id, gen_random_uuid() FROM ventas WHERE empresa_id = src;
INSERT INTO \_m_fcomp SELECT id, gen_random_uuid() FROM facturas_compra WHERE empresa_id = src;
INSERT INTO \_m_gastos SELECT id, gen_random_uuid() FROM gastos WHERE empresa_id = src;
INSERT INTO \_m_ajus SELECT id, gen_random_uuid() FROM ajustes WHERE empresa_id = src;
INSERT INTO \_m_ncr SELECT id, gen_random_uuid() FROM notas_credito WHERE empresa_id = src;
INSERT INTO \_m_ndb SELECT id, gen_random_uuid() FROM notas_debito WHERE empresa_id = src;
INSERT INTO \_m_nfc SELECT id, gen_random_uuid() FROM notas_fiscales_compra WHERE empresa_id = src;
INSERT INTO \_m_pagos SELECT id, gen_random_uuid() FROM pagos WHERE empresa_id = src;
INSERT INTO \_m_mmc SELECT id, gen_random_uuid() FROM movimientos_metodo_cobro WHERE empresa_id = src;
INSERT INTO \_m_mban SELECT id, gen_random_uuid() FROM movimientos_bancarios WHERE empresa_id = src;
INSERT INTO \_m_mcf SELECT id, gen_random_uuid() FROM mov_caja_fuerte WHERE empresa_id = src;
INSERT INTO \_m_minv SELECT id, gen_random_uuid() FROM movimientos_inventario WHERE empresa_id = src;
INSERT INTO \_m_mcta SELECT id, gen_random_uuid() FROM movimientos_cuenta WHERE empresa_id = src;
INSERT INTO \_m_citas SELECT id, gen_random_uuid() FROM citas WHERE empresa_id = src;
INSERT INTO \_m_citasvc SELECT id, gen_random_uuid() FROM citas_servicios WHERE empresa_id = src;
INSERT INTO \_m_hstaff SELECT id, gen_random_uuid() FROM horarios_staff WHERE empresa_id = src;
INSERT INTO \_m_libro SELECT id, gen_random_uuid() FROM libro_contable WHERE empresa_id = src;
INSERT INTO \_m_gastp SELECT id, gen_random_uuid() FROM gasto_pagos WHERE empresa_id = src;
INSERT INTO \_m_tras SELECT id, gen_random_uuid() FROM traspasos_tesoreria WHERE empresa_id = src;

RAISE NOTICE 'Mapeos generados OK';

-- ================================================================
-- PASO 2: Limpiar destino (orden inverso de dependencias)
-- ================================================================
DELETE FROM horarios_descansos WHERE empresa_id = dst;
DELETE FROM horarios_excepciones WHERE empresa_id = dst;
DELETE FROM horarios_plantillas WHERE empresa_id = dst;
DELETE FROM cita_items_extras WHERE empresa_id = dst;
DELETE FROM cita_log WHERE empresa_id = dst;
DELETE FROM cita_trabajadores WHERE empresa_id = dst;
DELETE FROM citas_servicios WHERE empresa_id = dst;
DELETE FROM citas WHERE empresa_id = dst;
DELETE FROM traspasos_tesoreria WHERE empresa_id = dst;
DELETE FROM mov_caja_fuerte WHERE empresa_id = dst;
DELETE FROM caja_fuerte WHERE empresa_id = dst;
DELETE FROM gasto_pagos WHERE empresa_id = dst;
DELETE FROM libro_contable WHERE empresa_id = dst;
DELETE FROM cuentas_config WHERE empresa_id = dst;
DELETE FROM notas_fiscales_compra_det WHERE empresa_id = dst;
DELETE FROM notas_fiscales_compra WHERE empresa_id = dst;
DELETE FROM retenciones_islr WHERE empresa_id = dst;
DELETE FROM retenciones_iva WHERE empresa_id = dst;
DELETE FROM facturas_compra_det WHERE empresa_id = dst;
DELETE FROM vencimientos_pagar WHERE empresa_id = dst;
DELETE FROM movimientos_cuenta_proveedor WHERE empresa_id = dst;
DELETE FROM proveedores_bancos WHERE empresa_id = dst;
DELETE FROM retenciones_islr_ventas WHERE empresa_id = dst;
DELETE FROM retenciones_iva_ventas WHERE empresa_id = dst;
DELETE FROM movimientos_bancarios WHERE empresa_id = dst;
DELETE FROM movimientos_metodo_cobro WHERE empresa_id = dst;
DELETE FROM sesiones_caja_detalle WHERE empresa_id = dst;
DELETE FROM sesiones_caja WHERE empresa_id = dst;
DELETE FROM notas_debito_det WHERE empresa_id = dst;
DELETE FROM notas_debito WHERE empresa_id = dst;
DELETE FROM notas_credito_det WHERE empresa_id = dst;
DELETE FROM notas_credito WHERE empresa_id = dst;
DELETE FROM vencimientos_cobrar WHERE empresa_id = dst;
DELETE FROM movimientos_cuenta WHERE empresa_id = dst;
DELETE FROM pagos WHERE empresa_id = dst;
DELETE FROM ventas_det WHERE empresa_id = dst;
DELETE FROM ventas WHERE empresa_id = dst;
DELETE FROM gastos WHERE empresa_id = dst;
DELETE FROM ajustes_det WHERE empresa_id = dst;
DELETE FROM ajustes WHERE empresa_id = dst;
-- movimientos_inventario: trigger bloquea DELETE, se omite si destino está vacío
-- (si ya existían registros, eliminarlos manualmente desactivando el trigger)
DELETE FROM inventario_stock WHERE empresa_id = dst;
DELETE FROM lotes WHERE empresa_id = dst;
DELETE FROM recetas WHERE empresa_id = dst;
DELETE FROM productos WHERE empresa_id = dst;
DELETE FROM horarios_staff WHERE empresa_id = dst;
DELETE FROM cajas WHERE empresa_id = dst;
DELETE FROM metodos_cobro WHERE empresa_id = dst;
DELETE FROM bancos_empresa WHERE empresa_id = dst;
DELETE FROM unidades_conversion WHERE empresa_id = dst;
DELETE FROM ajuste_motivos WHERE empresa_id = dst;
DELETE FROM niveles_precio WHERE empresa_id = dst;
DELETE FROM impuestos_ve WHERE empresa_id = dst;
DELETE FROM depositos WHERE empresa_id = dst;
DELETE FROM unidades WHERE empresa_id = dst;
DELETE FROM marcas WHERE empresa_id = dst;
DELETE FROM departamentos WHERE empresa_id = dst;
DELETE FROM plan_cuentas WHERE empresa_id = dst;
DELETE FROM facturas_compra WHERE empresa_id = dst;
DELETE FROM proveedores WHERE empresa_id = dst;
DELETE FROM clientes WHERE empresa_id = dst;
-- tasas_cambio: trigger bloquea DELETE; se omite si destino está vacío
DELETE FROM rol_permisos WHERE empresa_id = dst;
DELETE FROM roles WHERE empresa_id = dst;
DELETE FROM tenant_permisos WHERE empresa_id = dst;
DELETE FROM empresas_fiscal_ve WHERE empresa_id = dst;

RAISE NOTICE 'Limpieza del destino OK';

-- ================================================================
-- PASO 3: Clonar tablas (orden de dependencias)
-- ================================================================
-- Desactivar triggers de usuario para esta sesión.
-- Permite insertar datos históricos sin que los triggers de validación
-- (sesión abierta, kardex inmutable, etc.) bloqueen la operación.
-- Se restaura al final del bloque.
SET session_replication_role = 'replica';

-- ── 3.01 empresas_fiscal_ve ─────────────────────────────────────
INSERT INTO empresas_fiscal_ve (
empresa_id, tipo_contribuyente, es_agente_retencion, documento_identidad,
tipo_documento, nro_providencia, porcentaje_retencion_iva, codigo_sucursal_seniat,
usa_maquina_fiscal, aplica_igtf, created_at, updated_at, updated_by
)
SELECT
dst, tipo_contribuyente, es_agente_retencion, documento_identidad,
tipo_documento, nro_providencia, porcentaje_retencion_iva, codigo_sucursal_seniat,
usa_maquina_fiscal, aplica_igtf, created_at, updated_at, updated_by
FROM empresas_fiscal_ve WHERE empresa_id = src;

-- ── 3.02 tasas_cambio (inmutable: solo INSERT) ──────────────────
INSERT INTO tasas_cambio (
id, empresa_id, moneda_id, valor, fecha, created_at, created_by
)
SELECT gen_random_uuid(), dst, moneda_id, valor, fecha, created_at, created_by
FROM tasas_cambio WHERE empresa_id = src;

-- ── 3.03 roles ──────────────────────────────────────────────────
INSERT INTO roles (
id, empresa_id, nombre, descripcion, is_system, is_active,
created_at, updated_at, created_by, updated_by
)
SELECT m.n, dst, r.nombre, r.descripcion, r.is_system, r.is_active,
r.created_at, r.updated_at, r.created_by, r.updated_by
FROM roles r JOIN \_m_roles m ON r.id = m.o WHERE r.empresa_id = src;

-- ── 3.04 rol_permisos ───────────────────────────────────────────
INSERT INTO rol_permisos (
id, empresa_id, rol_id, permiso_id, granted_by, granted_at
)
SELECT gen_random_uuid(), dst, m.n, rp.permiso_id, rp.granted_by, rp.granted_at
FROM rol_permisos rp JOIN \_m_roles m ON rp.rol_id = m.o WHERE rp.empresa_id = src;

-- ── 3.05 tenant_permisos ────────────────────────────────────────
-- ON CONFLICT DO NOTHING: tenant_id es compartido entre empresas del mismo tenant,
-- por lo que (tenant_id, permiso_id) puede ya existir.
INSERT INTO tenant_permisos (
id, empresa_id, tenant_id, permiso_id, habilitado, created_at, updated_at
)
SELECT gen_random_uuid(), dst, tenant_id, permiso_id, habilitado, created_at, updated_at
FROM tenant_permisos WHERE empresa_id = src
ON CONFLICT ON CONSTRAINT uq_tenant_permiso DO NOTHING;

-- ── 3.06 plan_cuentas (self-ref parent_id) ──────────────────────
INSERT INTO plan_cuentas (
id, empresa_id, codigo, nombre, tipo, naturaleza,
parent_id, nivel, es_cuenta_detalle, is_active,
created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, pc.codigo, pc.nombre, pc.tipo, pc.naturaleza,
(SELECT n FROM \_m_cuentas WHERE o = pc.parent_id),
pc.nivel, pc.es_cuenta_detalle, pc.is_active,
pc.created_at, pc.updated_at, pc.created_by, pc.updated_by
FROM plan_cuentas pc JOIN \_m_cuentas m ON pc.id = m.o WHERE pc.empresa_id = src;

-- ── 3.07 bancos_empresa ─────────────────────────────────────────
INSERT INTO bancos_empresa (
id, empresa_id, nombre_banco, nro_cuenta, tipo_cuenta, titular,
titular_documento, moneda_id, saldo_actual, cuenta_contable_id,
is_active, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, be.nombre_banco, be.nro_cuenta, be.tipo_cuenta, be.titular,
be.titular_documento, be.moneda_id, be.saldo_actual,
(SELECT n FROM \_m_cuentas WHERE o = be.cuenta_contable_id),
be.is_active, be.created_at, be.updated_at, be.created_by, be.updated_by
FROM bancos_empresa be JOIN \_m_bancos m ON be.id = m.o WHERE be.empresa_id = src;

-- ── 3.08 impuestos_ve ───────────────────────────────────────────
INSERT INTO impuestos_ve (
id, empresa_id, nombre, tipo_tributo, porcentaje, codigo_seniat,
descripcion, is_active, created_at, updated_at, updated_by
)
SELECT
m.n, dst, iv.nombre, iv.tipo_tributo, iv.porcentaje, iv.codigo_seniat,
iv.descripcion, iv.is_active, iv.created_at, iv.updated_at, iv.updated_by
FROM impuestos_ve iv JOIN \_m_imptos m ON iv.id = m.o WHERE iv.empresa_id = src;

-- ── 3.09 niveles_precio ─────────────────────────────────────────
INSERT INTO niveles_precio (
id, empresa_id, nombre, orden, porcentaje_defecto, is_active,
created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, np.nombre, np.orden, np.porcentaje_defecto, np.is_active,
np.created_at, np.updated_at, np.created_by, np.updated_by
FROM niveles_precio np JOIN \_m_niveles m ON np.id = m.o WHERE np.empresa_id = src;

-- ── 3.10 marcas ─────────────────────────────────────────────────
INSERT INTO marcas (
id, empresa_id, nombre, descripcion, logo_url, is_active,
created_at, updated_at, updated_by
)
SELECT
m.n, dst, ma.nombre, ma.descripcion, ma.logo_url, ma.is_active,
ma.created_at, ma.updated_at, ma.updated_by
FROM marcas ma JOIN \_m_marcas m ON ma.id = m.o WHERE ma.empresa_id = src;

-- ── 3.11 unidades ───────────────────────────────────────────────
INSERT INTO unidades (
id, empresa_id, nombre, abreviatura, es_decimal, is_active,
created_at, updated_at, updated_by
)
SELECT
m.n, dst, u.nombre, u.abreviatura, u.es_decimal, u.is_active,
u.created_at, u.updated_at, u.updated_by
FROM unidades u JOIN \_m_uni m ON u.id = m.o WHERE u.empresa_id = src;

-- ── 3.12 depositos ──────────────────────────────────────────────
INSERT INTO depositos (
id, empresa_id, nombre, direccion, es_principal, permite_venta,
is_active, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, d.nombre, d.direccion, d.es_principal, d.permite_venta,
d.is_active, d.created_at, d.updated_at, d.created_by, d.updated_by
FROM depositos d JOIN \_m_depositos m ON d.id = m.o WHERE d.empresa_id = src;

-- ── 3.13 ajuste_motivos ─────────────────────────────────────────
INSERT INTO ajuste_motivos (
id, empresa_id, nombre, es_sistema, operacion_base, afecta_costo,
is_active, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, am.nombre, am.es_sistema, am.operacion_base, am.afecta_costo,
am.is_active, am.created_at, am.updated_at, am.created_by, am.updated_by
FROM ajuste_motivos am JOIN \_m_motivos m ON am.id = m.o WHERE am.empresa_id = src;

-- ── 3.14 departamentos (self-ref parent_id) ─────────────────────
INSERT INTO departamentos (
id, empresa_id, codigo, nombre, parent_id, slug, descripcion,
imagen_url, prioridad_visual, is_active, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, d.codigo, d.nombre,
(SELECT n FROM \_m_dep WHERE o = d.parent_id),
d.slug, d.descripcion, d.imagen_url, d.prioridad_visual, d.is_active,
d.created_at, d.updated_at, d.created_by, d.updated_by
FROM departamentos d JOIN \_m_dep m ON d.id = m.o WHERE d.empresa_id = src;

-- ── 3.15 unidades_conversion ────────────────────────────────────
INSERT INTO unidades_conversion (
id, empresa_id, unidad_mayor_id, unidad_menor_id, factor, is_active,
created_at, updated_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_uni WHERE o = uc.unidad_mayor_id),
(SELECT n FROM \_m_uni WHERE o = uc.unidad_menor_id),
uc.factor, uc.is_active, uc.created_at, uc.updated_at
FROM unidades_conversion uc WHERE uc.empresa_id = src;

-- ── 3.16 clientes ───────────────────────────────────────────────
INSERT INTO clientes (
id, empresa_id, tipo_persona_id, identificacion, nombre, nombre_comercial,
direccion, telefono, email, es_contribuyente_especial,
es_agente_retencion_iva, es_agente_retencion_islr, porcentaje_retencion_iva,
limite_credito_usd, saldo_actual, is_active,
created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, c.tipo_persona_id, c.identificacion, c.nombre, c.nombre_comercial,
c.direccion, c.telefono, c.email, c.es_contribuyente_especial,
c.es_agente_retencion_iva, c.es_agente_retencion_islr, c.porcentaje_retencion_iva,
c.limite_credito_usd, c.saldo_actual, c.is_active,
c.created_at, c.updated_at, c.created_by, c.updated_by
FROM clientes c JOIN \_m_clientes m ON c.id = m.o WHERE c.empresa_id = src;

-- ── 3.17 proveedores ────────────────────────────────────────────
INSERT INTO proveedores (
id, empresa_id, tipo_persona_id, rif, razon_social, nombre_comercial,
direccion_fiscal, ciudad, telefono, email, tipo_contribuyente,
retiene_iva, retiene_islr, concepto_islr_id, retencion_iva_pct,
dias_credito, limite_credito_usd, saldo_actual, is_active,
created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, p.tipo_persona_id, p.rif, p.razon_social, p.nombre_comercial,
p.direccion_fiscal, p.ciudad, p.telefono, p.email, p.tipo_contribuyente,
p.retiene_iva, p.retiene_islr, p.concepto_islr_id, p.retencion_iva_pct,
p.dias_credito, p.limite_credito_usd, p.saldo_actual, p.is_active,
p.created_at, p.updated_at, p.created_by, p.updated_by
FROM proveedores p JOIN \_m_prov m ON p.id = m.o WHERE p.empresa_id = src;

-- ── 3.18 proveedores_bancos ─────────────────────────────────────
INSERT INTO proveedores_bancos (
id, empresa_id, proveedor_id, nombre_banco, nro_cuenta, tipo_cuenta,
titular, titular_documento, moneda_id, is_active, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_prov WHERE o = pb.proveedor_id),
pb.nombre_banco, pb.nro_cuenta, pb.tipo_cuenta,
pb.titular, pb.titular_documento, pb.moneda_id, pb.is_active, pb.created_at
FROM proveedores_bancos pb WHERE pb.empresa_id = src;

-- ── 3.19 productos ──────────────────────────────────────────────
INSERT INTO productos (
id, empresa_id, codigo, tipo, nombre, departamento_id, marca_id,
unidad_base_id, costo_usd, precio_venta_usd, precio_mayor_usd,
precio_especial_usd, costo_promedio, costo_ultimo, stock, stock_minimo,
tipo_impuesto, impuesto_iva_id, impuesto_igtf_id, maneja_lotes,
is_active, created_at, updated_at, created_by, updated_by,
ubicacion, presentacion, codigo_barras, duracion_min
)
SELECT
m.n, dst, p.codigo, p.tipo, p.nombre,
(SELECT n FROM \_m_dep WHERE o = p.departamento_id),
(SELECT n FROM \_m_marcas WHERE o = p.marca_id),
(SELECT n FROM \_m_uni WHERE o = p.unidad_base_id),
p.costo_usd, p.precio_venta_usd, p.precio_mayor_usd,
p.precio_especial_usd, p.costo_promedio, p.costo_ultimo, p.stock, p.stock_minimo,
p.tipo_impuesto,
(SELECT n FROM \_m_imptos WHERE o = p.impuesto_iva_id),
(SELECT n FROM \_m_imptos WHERE o = p.impuesto_igtf_id),
p.maneja_lotes, p.is_active, p.created_at, p.updated_at, p.created_by, p.updated_by,
p.ubicacion, p.presentacion, p.codigo_barras, p.duracion_min
FROM productos p JOIN \_m_prods m ON p.id = m.o WHERE p.empresa_id = src;

-- ── 3.20 cajas ──────────────────────────────────────────────────
INSERT INTO cajas (
id, empresa_id, nombre, ubicacion, deposito_id, nro_caja,
is_active, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, c.nombre, c.ubicacion,
(SELECT n FROM \_m_depositos WHERE o = c.deposito_id),
c.nro_caja, c.is_active, c.created_at, c.updated_at, c.created_by, c.updated_by
FROM cajas c JOIN \_m_cajas m ON c.id = m.o WHERE c.empresa_id = src;

-- ── 3.21 metodos_cobro ──────────────────────────────────────────
INSERT INTO metodos_cobro (
id, empresa_id, nombre, tipo, moneda_id, banco_empresa_id,
requiere_referencia, saldo_actual, is_active, created_at, updated_at, created_by
)
SELECT
m.n, dst, mc.nombre, mc.tipo, mc.moneda_id,
(SELECT n FROM \_m_bancos WHERE o = mc.banco_empresa_id),
mc.requiere_referencia, mc.saldo_actual, mc.is_active,
mc.created_at, mc.updated_at, mc.created_by
FROM metodos_cobro mc JOIN \_m_metodos m ON mc.id = m.o WHERE mc.empresa_id = src;

-- ── 3.22 cuentas_config ─────────────────────────────────────────
INSERT INTO cuentas_config (
id, empresa_id, clave, cuenta_contable_id, descripcion,
created_at, updated_at, created_by, updated_by
)
SELECT
gen_random_uuid(), dst, cc.clave,
(SELECT n FROM \_m_cuentas WHERE o = cc.cuenta_contable_id),
cc.descripcion, cc.created_at, cc.updated_at, cc.created_by, cc.updated_by
FROM cuentas_config cc WHERE cc.empresa_id = src;

-- ── 3.23 lotes (factura_compra_id se corrige después) ───────────
INSERT INTO lotes (
id, empresa_id, producto_id, deposito_id, nro_lote, fecha_fabricacion,
fecha_vencimiento, cantidad_inicial, cantidad_actual, costo_unitario,
factura_compra_id, status, created_at, updated_at, created_by
)
SELECT
m.n, dst,
(SELECT n FROM \_m_prods WHERE o = l.producto_id),
(SELECT n FROM \_m_depositos WHERE o = l.deposito_id),
l.nro_lote, l.fecha_fabricacion, l.fecha_vencimiento,
l.cantidad_inicial, l.cantidad_actual, l.costo_unitario,
NULL, -- se actualiza tras clonar facturas_compra
l.status, l.created_at, l.updated_at, l.created_by
FROM lotes l JOIN \_m_lotes m ON l.id = m.o WHERE l.empresa_id = src;

-- ── 3.24 inventario_stock ───────────────────────────────────────
INSERT INTO inventario_stock (
id, empresa_id, producto_id, deposito_id,
cantidad_actual, stock_reservado, updated_at, updated_by
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_prods WHERE o = s.producto_id),
(SELECT n FROM \_m_depositos WHERE o = s.deposito_id),
s.cantidad_actual, s.stock_reservado, s.updated_at, s.updated_by
FROM inventario_stock s WHERE s.empresa_id = src;

-- ── 3.25 recetas ────────────────────────────────────────────────
INSERT INTO recetas (id, empresa_id, servicio_id, producto_id, cantidad, created_at)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_prods WHERE o = r.servicio_id),
(SELECT n FROM \_m_prods WHERE o = r.producto_id),
r.cantidad, r.created_at
FROM recetas r WHERE r.empresa_id = src;

-- ── 3.26 ajustes ────────────────────────────────────────────────
INSERT INTO ajustes (
id, empresa_id, num_ajuste, motivo_id, fecha, observaciones,
status, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, a.num_ajuste,
(SELECT n FROM \_m_motivos WHERE o = a.motivo_id),
a.fecha, a.observaciones, a.status,
a.created_at, a.updated_at, a.created_by, a.updated_by
FROM ajustes a JOIN \_m_ajus m ON a.id = m.o WHERE a.empresa_id = src;

-- ── 3.27 caja_fuerte ────────────────────────────────────────────
INSERT INTO caja_fuerte (
id, empresa_id, nombre, moneda_id, saldo_actual, descripcion,
is_active, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst, cf.nombre, cf.moneda_id, cf.saldo_actual, cf.descripcion,
cf.is_active, cf.created_at, cf.updated_at, cf.created_by, cf.updated_by
FROM caja_fuerte cf JOIN \_m_cajaf m ON cf.id = m.o WHERE cf.empresa_id = src;

-- ── 3.28 horarios_staff ─────────────────────────────────────────
INSERT INTO horarios_staff (
id, empresa_id, usuario_id, dia_semana, hora_inicio, hora_fin,
is_active, tiempo_preparacion_min, cruza_medianoche, created_at, updated_at
)
SELECT
m.n, dst, hs.usuario_id, -- usuario_id: referencia a usuarios de la empresa origen (aceptable)
hs.dia_semana, hs.hora_inicio, hs.hora_fin, hs.is_active,
hs.tiempo_preparacion_min, hs.cruza_medianoche, hs.created_at, hs.updated_at
FROM horarios_staff hs JOIN \_m_hstaff m ON hs.id = m.o WHERE hs.empresa_id = src;

-- ── 3.29 sesiones_caja ──────────────────────────────────────────
INSERT INTO sesiones_caja (
id, empresa_id, caja_id, usuario_apertura_id, fecha_apertura,
monto_apertura_usd, monto_apertura_bs, usuario_cierre_id, fecha_cierre,
monto_sistema_usd, monto_fisico_usd, diferencia_usd,
monto_sistema_bs, monto_fisico_bs, diferencia_bs,
observaciones_cierre, status, created_at, updated_at
)
SELECT
m.n, dst,
(SELECT n FROM \_m_cajas WHERE o = sc.caja_id),
sc.usuario_apertura_id, sc.fecha_apertura,
sc.monto_apertura_usd, sc.monto_apertura_bs, sc.usuario_cierre_id, sc.fecha_cierre,
sc.monto_sistema_usd, sc.monto_fisico_usd, sc.diferencia_usd,
sc.monto_sistema_bs, sc.monto_fisico_bs, sc.diferencia_bs,
sc.observaciones_cierre, sc.status, sc.created_at, sc.updated_at
FROM sesiones_caja sc JOIN \_m_ses m ON sc.id = m.o WHERE sc.empresa_id = src;

-- ── 3.30 ventas ─────────────────────────────────────────────────
INSERT INTO ventas (
id, empresa_id, cliente_id, nro_factura, num_control,
deposito_id, sesion_caja_id, moneda_id, tasa,
total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd,
total_usd, total_bs, descuento_usd, descuento_bs, saldo_pend_usd,
tipo, status, usuario_id, fecha, created_at, created_by
)
SELECT
m.n, dst,
(SELECT n FROM \_m_clientes WHERE o = v.cliente_id),
v.nro_factura, v.num_control,
(SELECT n FROM \_m_depositos WHERE o = v.deposito_id),
(SELECT n FROM \_m_ses WHERE o = v.sesion_caja_id),
v.moneda_id, v.tasa,
v.total_exento_usd, v.total_base_usd, v.total_iva_usd, v.total_igtf_usd,
v.total_usd, v.total_bs, v.descuento_usd, v.descuento_bs, v.saldo_pend_usd,
v.tipo, v.status, v.usuario_id, v.fecha, v.created_at, v.created_by
FROM ventas v JOIN \_m_ventas m ON v.id = m.o WHERE v.empresa_id = src;

-- ── 3.31 facturas_compra ────────────────────────────────────────
INSERT INTO facturas_compra (
id, empresa_id, proveedor_id, nro_factura, nro_control,
deposito_id, moneda_id, tasa, tasa_costo,
total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd,
total_usd, total_bs, saldo_pend_usd, tipo, status,
fecha_factura, fecha_recepcion, usuario_id, created_at, updated_at, created_by
)
SELECT
m.n, dst,
(SELECT n FROM \_m_prov WHERE o = fc.proveedor_id),
fc.nro_factura, fc.nro_control,
(SELECT n FROM \_m_depositos WHERE o = fc.deposito_id),
fc.moneda_id, fc.tasa, fc.tasa_costo,
fc.total_exento_usd, fc.total_base_usd, fc.total_iva_usd, fc.total_igtf_usd,
fc.total_usd, fc.total_bs, fc.saldo_pend_usd, fc.tipo, fc.status,
fc.fecha_factura, fc.fecha_recepcion, fc.usuario_id,
fc.created_at, fc.updated_at, fc.created_by
FROM facturas_compra fc JOIN \_m_fcomp m ON fc.id = m.o WHERE fc.empresa_id = src;

-- Actualizar lotes.factura_compra_id ahora que facturas_compra están clonadas
UPDATE lotes dest_l
SET factura_compra_id = (SELECT n FROM \_m_fcomp WHERE o = src_l.factura_compra_id)
FROM lotes src_l
JOIN \_m_lotes ml ON src_l.id = ml.o
WHERE dest_l.id = ml.n
AND dest_l.empresa_id = dst
AND src_l.factura_compra_id IS NOT NULL;

-- ── 3.32 gastos ─────────────────────────────────────────────────
INSERT INTO gastos (
id, empresa_id, nro_gasto, nro_factura, nro_control,
cuenta_id, proveedor_id, descripcion, fecha, moneda_id, moneda_factura,
usa_tasa_paralela, tasa, tasa_proveedor, monto_factura, monto_usd,
tipo_impuesto, porcentaje_iva, base_imponible_usd, monto_iva_usd,
saldo_pendiente_usd, metodo_cobro_id, banco_empresa_id, referencia,
observaciones, status, created_at, updated_at, created_by
)
SELECT
m.n, dst, g.nro_gasto, g.nro_factura, g.nro_control,
(SELECT n FROM \_m_cuentas WHERE o = g.cuenta_id),
(SELECT n FROM \_m_prov WHERE o = g.proveedor_id),
g.descripcion, g.fecha, g.moneda_id, g.moneda_factura,
g.usa_tasa_paralela, g.tasa, g.tasa_proveedor, g.monto_factura, g.monto_usd,
g.tipo_impuesto, g.porcentaje_iva, g.base_imponible_usd, g.monto_iva_usd,
g.saldo_pendiente_usd,
(SELECT n FROM \_m_metodos WHERE o = g.metodo_cobro_id),
(SELECT n FROM \_m_bancos WHERE o = g.banco_empresa_id),
g.referencia, g.observaciones, g.status,
g.created_at, g.updated_at, g.created_by
FROM gastos g JOIN \_m_gastos m ON g.id = m.o WHERE g.empresa_id = src;

-- ── 3.33 ventas_det ─────────────────────────────────────────────
INSERT INTO ventas_det (
id, empresa_id, venta_id, producto_id, deposito_id,
cantidad, precio_unitario_usd, tipo_impuesto, impuesto_pct,
subtotal_usd, subtotal_bs, lote_id, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ventas WHERE o = vd.venta_id),
(SELECT n FROM \_m_prods WHERE o = vd.producto_id),
(SELECT n FROM \_m_depositos WHERE o = vd.deposito_id),
vd.cantidad, vd.precio_unitario_usd, vd.tipo_impuesto, vd.impuesto_pct,
vd.subtotal_usd, vd.subtotal_bs,
(SELECT n FROM \_m_lotes WHERE o = vd.lote_id),
vd.created_at
FROM ventas_det vd WHERE vd.empresa_id = src;

-- ── 3.34 pagos ──────────────────────────────────────────────────
INSERT INTO pagos (
id, empresa_id, venta_id, cliente_id, metodo_cobro_id, moneda_id,
tasa, monto, monto_usd, referencia, sesion_caja_id, banco_empresa_id,
fecha, created_at, created_by, is_reversed, reversed_at, reversed_by,
reversed_reason, procesado_por_nombre
)
SELECT
m.n, dst,
(SELECT n FROM \_m_ventas WHERE o = p.venta_id),
(SELECT n FROM \_m_clientes WHERE o = p.cliente_id),
(SELECT n FROM \_m_metodos WHERE o = p.metodo_cobro_id),
p.moneda_id, p.tasa, p.monto, p.monto_usd, p.referencia,
(SELECT n FROM \_m_ses WHERE o = p.sesion_caja_id),
(SELECT n FROM \_m_bancos WHERE o = p.banco_empresa_id),
p.fecha, p.created_at, p.created_by,
p.is_reversed, p.reversed_at, p.reversed_by, p.reversed_reason, p.procesado_por_nombre
FROM pagos p JOIN \_m_pagos m ON p.id = m.o WHERE p.empresa_id = src;

-- ── 3.35 notas_credito ──────────────────────────────────────────
INSERT INTO notas_credito (
id, empresa_id, nro_ncr, venta_id, cliente_id, tipo, motivo,
moneda_id, tasa_historica, total_exento_usd, total_base_usd,
total_iva_usd, total_usd, total_bs, afecta_inventario,
usuario_id, fecha, created_at
)
SELECT
m.n, dst, nc.nro_ncr,
(SELECT n FROM \_m_ventas WHERE o = nc.venta_id),
(SELECT n FROM \_m_clientes WHERE o = nc.cliente_id),
nc.tipo, nc.motivo, nc.moneda_id, nc.tasa_historica,
nc.total_exento_usd, nc.total_base_usd, nc.total_iva_usd,
nc.total_usd, nc.total_bs, nc.afecta_inventario,
nc.usuario_id, nc.fecha, nc.created_at
FROM notas_credito nc JOIN \_m_ncr m ON nc.id = m.o WHERE nc.empresa_id = src;

-- ── 3.36 notas_credito_det ──────────────────────────────────────
INSERT INTO notas_credito_det (
id, empresa_id, nota_credito_id, producto_id, deposito_id,
cantidad, precio_unitario_usd, tipo_impuesto, impuesto_pct,
subtotal_usd, afecta_inventario, descripcion, lote_id, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ncr WHERE o = ncd.nota_credito_id),
(SELECT n FROM \_m_prods WHERE o = ncd.producto_id),
(SELECT n FROM \_m_depositos WHERE o = ncd.deposito_id),
ncd.cantidad, ncd.precio_unitario_usd, ncd.tipo_impuesto, ncd.impuesto_pct,
ncd.subtotal_usd, ncd.afecta_inventario, ncd.descripcion,
(SELECT n FROM \_m_lotes WHERE o = ncd.lote_id),
ncd.created_at
FROM notas_credito_det ncd WHERE ncd.empresa_id = src;

-- ── 3.37 notas_debito ───────────────────────────────────────────
INSERT INTO notas_debito (
id, empresa_id, nro_ndb, venta_id, cliente_id, motivo,
moneda_id, tasa, total_exento_usd, total_base_usd,
total_iva_usd, total_usd, total_bs, usuario_id, fecha, created_at
)
SELECT
m.n, dst, nd.nro_ndb,
(SELECT n FROM \_m_ventas WHERE o = nd.venta_id),
(SELECT n FROM \_m_clientes WHERE o = nd.cliente_id),
nd.motivo, nd.moneda_id, nd.tasa,
nd.total_exento_usd, nd.total_base_usd, nd.total_iva_usd,
nd.total_usd, nd.total_bs, nd.usuario_id, nd.fecha, nd.created_at
FROM notas_debito nd JOIN \_m_ndb m ON nd.id = m.o WHERE nd.empresa_id = src;

-- ── 3.38 notas_debito_det ───────────────────────────────────────
INSERT INTO notas_debito_det (
id, empresa_id, nota_debito_id, descripcion, cantidad,
precio_unitario_usd, tipo_impuesto, impuesto_pct, subtotal_usd, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ndb WHERE o = ndd.nota_debito_id),
ndd.descripcion, ndd.cantidad, ndd.precio_unitario_usd,
ndd.tipo_impuesto, ndd.impuesto_pct, ndd.subtotal_usd, ndd.created_at
FROM notas_debito_det ndd WHERE ndd.empresa_id = src;

-- ── 3.39 movimientos_cuenta ─────────────────────────────────────
INSERT INTO movimientos_cuenta (
id, empresa_id, cliente_id, tipo, referencia, monto,
saldo_anterior, saldo_nuevo, observacion, doc_origen_id, doc_origen_tipo,
venta_id, fecha, created_at, created_by, moneda_pago, monto_moneda, tasa_pago
)
SELECT
m.n, dst,
(SELECT n FROM \_m_clientes WHERE o = mc.cliente_id),
mc.tipo, mc.referencia, mc.monto, mc.saldo_anterior, mc.saldo_nuevo, mc.observacion,
COALESCE(
(SELECT n FROM \_m_ventas WHERE o = mc.doc_origen_id),
(SELECT n FROM \_m_ncr WHERE o = mc.doc_origen_id),
(SELECT n FROM \_m_ndb WHERE o = mc.doc_origen_id),
mc.doc_origen_id
),
mc.doc_origen_tipo,
(SELECT n FROM \_m_ventas WHERE o = mc.venta_id),
mc.fecha, mc.created_at, mc.created_by, mc.moneda_pago, mc.monto_moneda, mc.tasa_pago
FROM movimientos_cuenta mc JOIN \_m_mcta m ON mc.id = m.o WHERE mc.empresa_id = src;

-- ── 3.40 vencimientos_cobrar ────────────────────────────────────
INSERT INTO vencimientos_cobrar (
id, empresa_id, venta_id, cliente_id, nro_cuota, fecha_vencimiento,
monto_original_usd, monto_pagado_usd, saldo_pendiente_usd,
status, origen_fondos_tipo, created_at, updated_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ventas WHERE o = vc.venta_id),
(SELECT n FROM \_m_clientes WHERE o = vc.cliente_id),
vc.nro_cuota, vc.fecha_vencimiento,
vc.monto_original_usd, vc.monto_pagado_usd, vc.saldo_pendiente_usd,
vc.status, vc.origen_fondos_tipo, vc.created_at, vc.updated_at
FROM vencimientos_cobrar vc WHERE vc.empresa_id = src;

-- ── 3.41 sesiones_caja_detalle ──────────────────────────────────
INSERT INTO sesiones_caja_detalle (
id, empresa_id, sesion_caja_id, metodo_cobro_id, moneda_id,
total_sistema, total_fisico, diferencia, num_transacciones, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ses WHERE o = scd.sesion_caja_id),
(SELECT n FROM \_m_metodos WHERE o = scd.metodo_cobro_id),
scd.moneda_id, scd.total_sistema, scd.total_fisico,
scd.diferencia, scd.num_transacciones, scd.created_at
FROM sesiones_caja_detalle scd WHERE scd.empresa_id = src;

-- ── 3.42 movimientos_metodo_cobro ───────────────────────────────
INSERT INTO movimientos_metodo_cobro (
id, empresa_id, metodo_cobro_id, tipo, origen, monto,
saldo_anterior, saldo_nuevo, doc_origen_id, doc_origen_ref,
concepto, sesion_caja_id, autorizado_por_id, destinatario_id,
referencia_pago_digital_id, fecha, created_at, created_by
)
SELECT
m.n, dst,
(SELECT n FROM \_m_metodos WHERE o = mmc.metodo_cobro_id),
mmc.tipo, mmc.origen, mmc.monto, mmc.saldo_anterior, mmc.saldo_nuevo,
COALESCE(
(SELECT n FROM \_m_ventas WHERE o = mmc.doc_origen_id),
(SELECT n FROM \_m_pagos WHERE o = mmc.doc_origen_id),
(SELECT n FROM \_m_gastos WHERE o = mmc.doc_origen_id),
(SELECT n FROM \_m_mcta WHERE o = mmc.doc_origen_id),
(SELECT n FROM \_m_fcomp WHERE o = mmc.doc_origen_id),
mmc.doc_origen_id
),
mmc.doc_origen_ref, mmc.concepto,
(SELECT n FROM \_m_ses WHERE o = mmc.sesion_caja_id),
mmc.autorizado_por_id, mmc.destinatario_id, mmc.referencia_pago_digital_id,
mmc.fecha, mmc.created_at, mmc.created_by
FROM movimientos_metodo_cobro mmc JOIN \_m_mmc m ON mmc.id = m.o WHERE mmc.empresa_id = src;

-- ── 3.43 movimientos_bancarios ──────────────────────────────────
INSERT INTO movimientos_bancarios (
id, empresa_id, banco_empresa_id, tipo, origen, monto,
saldo_anterior, saldo_nuevo, doc_origen_id, doc_origen_tipo,
referencia, validado, validado_por, validado_at, observacion,
descripcion, reversado, reverso_de, fecha, created_at, created_by
)
SELECT
m.n, dst,
(SELECT n FROM \_m_bancos WHERE o = mb.banco_empresa_id),
mb.tipo, mb.origen, mb.monto, mb.saldo_anterior, mb.saldo_nuevo,
COALESCE(
(SELECT n FROM \_m_ventas WHERE o = mb.doc_origen_id),
(SELECT n FROM \_m_fcomp WHERE o = mb.doc_origen_id),
(SELECT n FROM \_m_pagos WHERE o = mb.doc_origen_id),
(SELECT n FROM \_m_gastos WHERE o = mb.doc_origen_id),
(SELECT n FROM \_m_mcta WHERE o = mb.doc_origen_id),
mb.doc_origen_id
),
mb.doc_origen_tipo, mb.referencia, mb.validado, mb.validado_por, mb.validado_at,
mb.observacion, mb.descripcion, mb.reversado,
(SELECT n FROM \_m_mban WHERE o = mb.reverso_de),
mb.fecha, mb.created_at, mb.created_by
FROM movimientos_bancarios mb JOIN \_m_mban m ON mb.id = m.o WHERE mb.empresa_id = src;

-- ── 3.44 movimientos_inventario (inmutable: solo INSERT) ────────
INSERT INTO movimientos_inventario (
id, empresa_id, producto_id, deposito_id, tipo_movimiento_id,
tipo, origen, cantidad, stock_anterior, stock_nuevo,
costo_unitario, moneda_id, tasa_cambio, doc_origen_id,
doc_origen_ref, lote_id, motivo, usuario_id, fecha, created_at
)
SELECT
m.n, dst,
(SELECT n FROM \_m_prods WHERE o = mi.producto_id),
(SELECT n FROM \_m_depositos WHERE o = mi.deposito_id),
mi.tipo_movimiento_id,
mi.tipo, mi.origen, mi.cantidad, mi.stock_anterior, mi.stock_nuevo,
mi.costo_unitario, mi.moneda_id, mi.tasa_cambio,
COALESCE(
(SELECT n FROM \_m_ventas WHERE o = mi.doc_origen_id),
(SELECT n FROM \_m_fcomp WHERE o = mi.doc_origen_id),
(SELECT n FROM \_m_ajus WHERE o = mi.doc_origen_id),
(SELECT n FROM \_m_ncr WHERE o = mi.doc_origen_id),
mi.doc_origen_id
),
mi.doc_origen_ref,
(SELECT n FROM \_m_lotes WHERE o = mi.lote_id),
mi.motivo, mi.usuario_id, mi.fecha, mi.created_at
FROM movimientos_inventario mi JOIN \_m_minv m ON mi.id = m.o WHERE mi.empresa_id = src;

-- ── 3.45 ajustes_det ────────────────────────────────────────────
INSERT INTO ajustes_det (
id, empresa_id, ajuste_id, producto_id, deposito_id,
cantidad, costo_unitario, lote_id, lote_nro,
lote_fecha_fab, lote_fecha_venc, created_at, created_by
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ajus WHERE o = ad.ajuste_id),
(SELECT n FROM \_m_prods WHERE o = ad.producto_id),
(SELECT n FROM \_m_depositos WHERE o = ad.deposito_id),
ad.cantidad, ad.costo_unitario,
(SELECT n FROM \_m_lotes WHERE o = ad.lote_id),
ad.lote_nro, ad.lote_fecha_fab, ad.lote_fecha_venc,
ad.created_at, ad.created_by
FROM ajustes_det ad WHERE ad.empresa_id = src;

-- ── 3.46 facturas_compra_det ────────────────────────────────────
INSERT INTO facturas_compra_det (
id, empresa_id, factura_compra_id, producto_id, deposito_id,
cantidad, costo_unitario_usd, costo_usd_sistema,
tipo_impuesto, impuesto_pct, subtotal_usd, subtotal_bs, lote_id, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_fcomp WHERE o = fcd.factura_compra_id),
(SELECT n FROM \_m_prods WHERE o = fcd.producto_id),
(SELECT n FROM \_m_depositos WHERE o = fcd.deposito_id),
fcd.cantidad, fcd.costo_unitario_usd, fcd.costo_usd_sistema,
fcd.tipo_impuesto, fcd.impuesto_pct, fcd.subtotal_usd, fcd.subtotal_bs,
(SELECT n FROM \_m_lotes WHERE o = fcd.lote_id),
fcd.created_at
FROM facturas_compra_det fcd WHERE fcd.empresa_id = src;

-- ── 3.47 retenciones_iva_ventas ─────────────────────────────────
INSERT INTO retenciones_iva_ventas (
id, empresa_id, venta_id, cliente_id, nro_comprobante, fecha_comprobante,
periodo_fiscal, base_imponible, porcentaje_iva, monto_iva,
porcentaje_retencion, monto_retenido, status, observaciones, created_at, created_by
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ventas WHERE o = r.venta_id),
(SELECT n FROM \_m_clientes WHERE o = r.cliente_id),
r.nro_comprobante, r.fecha_comprobante, r.periodo_fiscal,
r.base_imponible, r.porcentaje_iva, r.monto_iva,
r.porcentaje_retencion, r.monto_retenido, r.status, r.observaciones,
r.created_at, r.created_by
FROM retenciones_iva_ventas r WHERE r.empresa_id = src;

-- ── 3.48 retenciones_islr_ventas ────────────────────────────────
INSERT INTO retenciones_islr_ventas (
id, empresa_id, venta_id, cliente_id, concepto_islr_id,
nro_comprobante, fecha_comprobante, periodo_fiscal,
base_imponible_bs, porcentaje_retencion, monto_retenido_bs, sustraendo_bs,
status, observaciones, created_at, created_by
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_ventas WHERE o = r.venta_id),
(SELECT n FROM \_m_clientes WHERE o = r.cliente_id),
r.concepto_islr_id, r.nro_comprobante, r.fecha_comprobante, r.periodo_fiscal,
r.base_imponible_bs, r.porcentaje_retencion, r.monto_retenido_bs, r.sustraendo_bs,
r.status, r.observaciones, r.created_at, r.created_by
FROM retenciones_islr_ventas r WHERE r.empresa_id = src;

-- ── 3.49 retenciones_iva (compras) ──────────────────────────────
INSERT INTO retenciones_iva (
id, empresa_id, factura_compra_id, proveedor_id, nro_comprobante,
fecha_comprobante, periodo_fiscal, base_imponible, porcentaje_iva, monto_iva,
porcentaje_retencion, monto_retenido, status, observaciones, created_at, created_by
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_fcomp WHERE o = r.factura_compra_id),
(SELECT n FROM \_m_prov WHERE o = r.proveedor_id),
r.nro_comprobante, r.fecha_comprobante, r.periodo_fiscal,
r.base_imponible, r.porcentaje_iva, r.monto_iva,
r.porcentaje_retencion, r.monto_retenido, r.status, r.observaciones,
r.created_at, r.created_by
FROM retenciones_iva r WHERE r.empresa_id = src;

-- ── 3.50 retenciones_islr (compras) ─────────────────────────────
INSERT INTO retenciones_islr (
id, empresa_id, factura_compra_id, proveedor_id, concepto_islr_id,
nro_comprobante, fecha_comprobante, periodo_fiscal,
base_imponible_bs, porcentaje_retencion, monto_retenido_bs, sustraendo_bs,
status, observaciones, created_at, created_by
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_fcomp WHERE o = r.factura_compra_id),
(SELECT n FROM \_m_prov WHERE o = r.proveedor_id),
r.concepto_islr_id, r.nro_comprobante, r.fecha_comprobante, r.periodo_fiscal,
r.base_imponible_bs, r.porcentaje_retencion, r.monto_retenido_bs, r.sustraendo_bs,
r.status, r.observaciones, r.created_at, r.created_by
FROM retenciones_islr r WHERE r.empresa_id = src;

-- ── 3.51 notas_fiscales_compra ──────────────────────────────────
INSERT INTO notas_fiscales_compra (
id, empresa_id, proveedor_id, factura_compra_id, tipo, nro_documento,
motivo, moneda_id, tasa, total_exento_usd, total_base_usd,
total_iva_usd, total_usd, total_bs, afecta_inventario,
usuario_id, fecha, created_at
)
SELECT
m.n, dst,
(SELECT n FROM \_m_prov WHERE o = nfc.proveedor_id),
(SELECT n FROM \_m_fcomp WHERE o = nfc.factura_compra_id),
nfc.tipo, nfc.nro_documento, nfc.motivo, nfc.moneda_id, nfc.tasa,
nfc.total_exento_usd, nfc.total_base_usd, nfc.total_iva_usd,
nfc.total_usd, nfc.total_bs, nfc.afecta_inventario,
nfc.usuario_id, nfc.fecha, nfc.created_at
FROM notas_fiscales_compra nfc JOIN \_m_nfc m ON nfc.id = m.o WHERE nfc.empresa_id = src;

-- ── 3.52 notas_fiscales_compra_det ──────────────────────────────
INSERT INTO notas_fiscales_compra_det (
id, empresa_id, nota_fiscal_compra_id, producto_id, descripcion,
cantidad, precio_unitario_usd, tipo_impuesto, impuesto_pct,
subtotal_usd, afecta_inventario, lote_id, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_nfc WHERE o = d.nota_fiscal_compra_id),
(SELECT n FROM \_m_prods WHERE o = d.producto_id),
d.descripcion, d.cantidad, d.precio_unitario_usd, d.tipo_impuesto, d.impuesto_pct,
d.subtotal_usd, d.afecta_inventario,
(SELECT n FROM \_m_lotes WHERE o = d.lote_id),
d.created_at
FROM notas_fiscales_compra_det d WHERE d.empresa_id = src;

-- ── 3.53 movimientos_cuenta_proveedor ───────────────────────────
INSERT INTO movimientos_cuenta_proveedor (
id, empresa_id, proveedor_id, tipo, referencia, monto,
saldo_anterior, saldo_nuevo, observacion, factura_compra_id,
doc_origen_id, doc_origen_tipo, fecha, created_at, created_by,
moneda_pago, monto_moneda, tasa_pago, monto_usd_interno
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_prov WHERE o = mcp.proveedor_id),
mcp.tipo, mcp.referencia, mcp.monto, mcp.saldo_anterior, mcp.saldo_nuevo,
mcp.observacion,
(SELECT n FROM \_m_fcomp WHERE o = mcp.factura_compra_id),
COALESCE(
(SELECT n FROM \_m_fcomp WHERE o = mcp.doc_origen_id),
(SELECT n FROM \_m_nfc WHERE o = mcp.doc_origen_id),
mcp.doc_origen_id
),
mcp.doc_origen_tipo, mcp.fecha, mcp.created_at, mcp.created_by,
mcp.moneda_pago, mcp.monto_moneda, mcp.tasa_pago, mcp.monto_usd_interno
FROM movimientos_cuenta_proveedor mcp WHERE mcp.empresa_id = src;

-- ── 3.54 vencimientos_pagar ─────────────────────────────────────
INSERT INTO vencimientos_pagar (
id, empresa_id, factura_compra_id, proveedor_id, nro_cuota,
fecha_vencimiento, monto_original_usd, monto_pagado_usd,
saldo_pendiente_usd, status, created_at, updated_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_fcomp WHERE o = vp.factura_compra_id),
(SELECT n FROM \_m_prov WHERE o = vp.proveedor_id),
vp.nro_cuota, vp.fecha_vencimiento,
vp.monto_original_usd, vp.monto_pagado_usd, vp.saldo_pendiente_usd,
vp.status, vp.created_at, vp.updated_at
FROM vencimientos_pagar vp WHERE vp.empresa_id = src;

-- ── 3.55 gasto_pagos ────────────────────────────────────────────
INSERT INTO gasto_pagos (
id, empresa_id, gasto_id, metodo_cobro_id, banco_empresa_id,
monto_usd, referencia, created_at
)
SELECT
m.n, dst,
(SELECT n FROM \_m_gastos WHERE o = gp.gasto_id),
(SELECT n FROM \_m_metodos WHERE o = gp.metodo_cobro_id),
(SELECT n FROM \_m_bancos WHERE o = gp.banco_empresa_id),
gp.monto_usd, gp.referencia, gp.created_at
FROM gasto_pagos gp JOIN \_m_gastp m ON gp.id = m.o WHERE gp.empresa_id = src;

-- ── 3.56 libro_contable (self-ref parent_id) ────────────────────
INSERT INTO libro_contable (
id, empresa_id, nro_asiento, fecha_registro, modulo_origen,
doc_origen_id, doc_origen_ref, cuenta_contable_id, banco_empresa_id,
monto, detalle, estado, parent_id, usuario_id, created_at
)
SELECT
m.n, dst, lc.nro_asiento, lc.fecha_registro, lc.modulo_origen,
COALESCE(
(SELECT n FROM \_m_ventas WHERE o = lc.doc_origen_id),
(SELECT n FROM \_m_fcomp WHERE o = lc.doc_origen_id),
(SELECT n FROM \_m_gastos WHERE o = lc.doc_origen_id),
(SELECT n FROM \_m_pagos WHERE o = lc.doc_origen_id),
(SELECT n FROM \_m_ncr WHERE o = lc.doc_origen_id),
(SELECT n FROM \_m_ndb WHERE o = lc.doc_origen_id),
(SELECT n FROM \_m_ajus WHERE o = lc.doc_origen_id),
lc.doc_origen_id
),
lc.doc_origen_ref,
(SELECT n FROM \_m_cuentas WHERE o = lc.cuenta_contable_id),
(SELECT n FROM \_m_bancos WHERE o = lc.banco_empresa_id),
lc.monto, lc.detalle, lc.estado,
(SELECT n FROM \_m_libro WHERE o = lc.parent_id),
lc.usuario_id, lc.created_at
FROM libro_contable lc JOIN \_m_libro m ON lc.id = m.o WHERE lc.empresa_id = src;

-- ── 3.57 mov_caja_fuerte ────────────────────────────────────────
INSERT INTO mov_caja_fuerte (
id, empresa_id, caja_fuerte_id, tipo, origen, monto,
saldo_anterior, saldo_nuevo, doc_origen_id, doc_origen_tipo,
referencia, descripcion, validado, validado_por, validado_at,
reversado, reverso_de, fecha, created_at, created_by
)
SELECT
m.n, dst,
(SELECT n FROM \_m_cajaf WHERE o = mcf.caja_fuerte_id),
mcf.tipo, mcf.origen, mcf.monto, mcf.saldo_anterior, mcf.saldo_nuevo,
COALESCE(
(SELECT n FROM \_m_mmc WHERE o = mcf.doc_origen_id),
(SELECT n FROM \_m_mban WHERE o = mcf.doc_origen_id),
mcf.doc_origen_id
),
mcf.doc_origen_tipo, mcf.referencia, mcf.descripcion,
mcf.validado, mcf.validado_por, mcf.validado_at, mcf.reversado,
(SELECT n FROM \_m_mcf WHERE o = mcf.reverso_de),
mcf.fecha, mcf.created_at, mcf.created_by
FROM mov_caja_fuerte mcf JOIN \_m_mcf m ON mcf.id = m.o WHERE mcf.empresa_id = src;

-- ── 3.58 traspasos_tesoreria ────────────────────────────────────
INSERT INTO traspasos_tesoreria (
id, empresa_id, cuenta_origen_tipo, cuenta_origen_id, mov_origen_id,
cuenta_destino_tipo, cuenta_destino_id, mov_destino_id,
monto_origen, moneda_origen_id, monto_destino, moneda_destino_id,
tasa_cambio, reversado, reversado_at, reversado_por,
observacion, fecha, created_at, created_by
)
SELECT
m.n, dst,
tt.cuenta_origen_tipo,
COALESCE(
(SELECT n FROM \_m_metodos WHERE o = tt.cuenta_origen_id),
(SELECT n FROM \_m_bancos WHERE o = tt.cuenta_origen_id),
(SELECT n FROM \_m_cajaf WHERE o = tt.cuenta_origen_id),
tt.cuenta_origen_id
),
COALESCE(
(SELECT n FROM \_m_mmc WHERE o = tt.mov_origen_id),
(SELECT n FROM \_m_mban WHERE o = tt.mov_origen_id),
(SELECT n FROM \_m_mcf WHERE o = tt.mov_origen_id),
tt.mov_origen_id
),
tt.cuenta_destino_tipo,
COALESCE(
(SELECT n FROM \_m_metodos WHERE o = tt.cuenta_destino_id),
(SELECT n FROM \_m_bancos WHERE o = tt.cuenta_destino_id),
(SELECT n FROM \_m_cajaf WHERE o = tt.cuenta_destino_id),
tt.cuenta_destino_id
),
COALESCE(
(SELECT n FROM \_m_mmc WHERE o = tt.mov_destino_id),
(SELECT n FROM \_m_mban WHERE o = tt.mov_destino_id),
(SELECT n FROM \_m_mcf WHERE o = tt.mov_destino_id),
tt.mov_destino_id
),
tt.monto_origen, tt.moneda_origen_id, tt.monto_destino, tt.moneda_destino_id,
tt.tasa_cambio, tt.reversado, tt.reversado_at, tt.reversado_por,
tt.observacion, tt.fecha, tt.created_at, tt.created_by
FROM traspasos_tesoreria tt JOIN \_m_tras m ON tt.id = m.o WHERE tt.empresa_id = src;

-- ── 3.59 citas ──────────────────────────────────────────────────
INSERT INTO citas (
id, empresa_id, cliente_id, profesional_id, fecha_inicio, fecha_fin,
duracion_min, cita_status, finance_status, checkout_tipo,
total_usd, tasa, total_bs, venta_id, notas, observaciones, color,
google_event_id, timestamp_inicio, timestamp_fin, duracion_real_min,
desviacion_min, ejecucion_paralela, prioridad_filtro,
snapshot_en_progreso, created_at, updated_at, created_by, updated_by
)
SELECT
m.n, dst,
(SELECT n FROM \_m_clientes WHERE o = c.cliente_id),
c.profesional_id, -- usuario de origen; aceptable para datos de prueba
c.fecha_inicio, c.fecha_fin, c.duracion_min,
c.cita_status, c.finance_status, c.checkout_tipo,
c.total_usd, c.tasa, c.total_bs,
(SELECT n FROM \_m_ventas WHERE o = c.venta_id),
c.notas, c.observaciones, c.color, c.google_event_id,
c.timestamp_inicio, c.timestamp_fin, c.duracion_real_min, c.desviacion_min,
c.ejecucion_paralela, c.prioridad_filtro, c.snapshot_en_progreso,
c.created_at, c.updated_at, c.created_by, c.updated_by
FROM citas c JOIN \_m_citas m ON c.id = m.o WHERE c.empresa_id = src;

-- ── 3.60 citas_servicios ────────────────────────────────────────
INSERT INTO citas_servicios (
id, empresa_id, cita_id, producto_id, precio_usd,
cantidad, duracion_min, trabajador_id, created_at
)
SELECT
m.n, dst,
(SELECT n FROM \_m_citas WHERE o = cs.cita_id),
(SELECT n FROM \_m_prods WHERE o = cs.producto_id),
cs.precio_usd, cs.cantidad, cs.duracion_min,
cs.trabajador_id, cs.created_at
FROM citas_servicios cs JOIN \_m_citasvc m ON cs.id = m.o WHERE cs.empresa_id = src;

-- ── 3.61 cita_trabajadores ──────────────────────────────────────
INSERT INTO cita_trabajadores (
id, empresa_id, cita_id, cita_servicio_id, usuario_id, rol_en_cita, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_citas WHERE o = ct.cita_id),
(SELECT n FROM \_m_citasvc WHERE o = ct.cita_servicio_id),
ct.usuario_id, ct.rol_en_cita, ct.created_at
FROM cita_trabajadores ct WHERE ct.empresa_id = src;

-- ── 3.62 cita_log ───────────────────────────────────────────────
INSERT INTO cita_log (
id, empresa_id, cita_id, usuario_id, accion,
datos_anteriores, datos_nuevos, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_citas WHERE o = cl.cita_id),
cl.usuario_id, cl.accion, cl.datos_anteriores, cl.datos_nuevos, cl.created_at
FROM cita_log cl WHERE cl.empresa_id = src;

-- ── 3.63 cita_items_extras ──────────────────────────────────────
INSERT INTO cita_items_extras (
id, empresa_id, cita_id, producto_id, cantidad, precio_usd,
status_cobro, venta_id, created_at, created_by
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_citas WHERE o = cie.cita_id),
(SELECT n FROM \_m_prods WHERE o = cie.producto_id),
cie.cantidad, cie.precio_usd, cie.status_cobro,
(SELECT n FROM \_m_ventas WHERE o = cie.venta_id),
cie.created_at, cie.created_by
FROM cita_items_extras cie WHERE cie.empresa_id = src;

-- ── 3.64 horarios_descansos ─────────────────────────────────────
INSERT INTO horarios_descansos (
id, empresa_id, horario_staff_id, hora_inicio, hora_fin, tipo, created_at
)
SELECT
gen_random_uuid(), dst,
(SELECT n FROM \_m_hstaff WHERE o = hd.horario_staff_id),
hd.hora_inicio, hd.hora_fin, hd.tipo, hd.created_at
FROM horarios_descansos hd WHERE hd.empresa_id = src;

-- ── 3.65 horarios_excepciones ───────────────────────────────────
INSERT INTO horarios_excepciones (
id, empresa_id, usuario_id, fecha, tipo, hora_inicio,
hora_fin, motivo, created_at, created_by
)
SELECT
gen_random_uuid(), dst,
he.usuario_id, he.fecha, he.tipo, he.hora_inicio,
he.hora_fin, he.motivo, he.created_at, he.created_by
FROM horarios_excepciones he WHERE he.empresa_id = src;

-- ── 3.66 horarios_plantillas ────────────────────────────────────
INSERT INTO horarios_plantillas (
id, empresa_id, nombre, data, created_at, updated_at
)
SELECT
gen_random_uuid(), dst, hp.nombre, hp.data, hp.created_at, hp.updated_at
FROM horarios_plantillas hp WHERE hp.empresa_id = src;

-- Restaurar comportamiento normal de triggers
SET session_replication_role = 'origin';

-- ================================================================
RAISE NOTICE '✓ Clone completado: % → %', src, dst;
-- ================================================================

END $$;
