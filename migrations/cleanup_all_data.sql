-- =============================================
-- CLARAPOS: Limpieza total de datos
-- =============================================
-- PROPOSITO: Eliminar TODOS los datos de negocio, usuarios y auth
-- para empezar de cero con el flujo register -> empleados.
--
-- PRESERVA (seed/catalogos globales):
--   apps, permisos, monedas, tipos_persona_ve,
--   islr_conceptos_ve, tipos_movimiento
--
-- ELIMINA: Todo lo demas (empresa, tenant, usuarios, auth.users,
--          y todos los datos de negocio)
--
-- EJECUTAR EN: Supabase SQL Editor
-- IMPORTANTE: Ejecutar el script completo de una sola vez
-- =============================================

BEGIN;

-- ============================================
-- PASO 1: Desactivar triggers de inmutabilidad
-- ============================================
-- Muchas tablas tienen triggers que previenen DELETE/UPDATE.
-- Los desactivamos temporalmente para poder limpiar.

-- Inmutables (DELETE bloqueado por triggers)
ALTER TABLE movimientos_inventario DISABLE TRIGGER USER;
ALTER TABLE tasas_cambio DISABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta DISABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta_proveedor DISABLE TRIGGER USER;
ALTER TABLE movimientos_metodo_cobro DISABLE TRIGGER USER;
ALTER TABLE movimientos_bancarios DISABLE TRIGGER USER;
ALTER TABLE ventas DISABLE TRIGGER USER;
ALTER TABLE ventas_det DISABLE TRIGGER USER;
ALTER TABLE pagos DISABLE TRIGGER USER;
ALTER TABLE notas_credito DISABLE TRIGGER USER;
ALTER TABLE notas_credito_det DISABLE TRIGGER USER;
ALTER TABLE notas_debito DISABLE TRIGGER USER;
ALTER TABLE notas_debito_det DISABLE TRIGGER USER;
ALTER TABLE retenciones_iva DISABLE TRIGGER USER;
ALTER TABLE retenciones_islr DISABLE TRIGGER USER;
ALTER TABLE retenciones_iva_ventas DISABLE TRIGGER USER;
ALTER TABLE retenciones_islr_ventas DISABLE TRIGGER USER;
ALTER TABLE notas_fiscales_compra DISABLE TRIGGER USER;
ALTER TABLE notas_fiscales_compra_det DISABLE TRIGGER USER;
ALTER TABLE facturas_compra DISABLE TRIGGER USER;
ALTER TABLE facturas_compra_det DISABLE TRIGGER USER;
ALTER TABLE gastos DISABLE TRIGGER USER;
ALTER TABLE libro_contable DISABLE TRIGGER USER;
ALTER TABLE pagos_suscripcion DISABLE TRIGGER USER;

-- Tablas con triggers de validacion/update (se necesitan UPDATE antes de DELETE)
ALTER TABLE clientes DISABLE TRIGGER USER;
ALTER TABLE proveedores DISABLE TRIGGER USER;
ALTER TABLE productos DISABLE TRIGGER USER;
ALTER TABLE departamentos DISABLE TRIGGER USER;
ALTER TABLE plan_cuentas DISABLE TRIGGER USER;
ALTER TABLE roles DISABLE TRIGGER USER;
ALTER TABLE usuarios DISABLE TRIGGER USER;
ALTER TABLE empresas_fiscal_ve DISABLE TRIGGER USER;
ALTER TABLE empresas DISABLE TRIGGER USER;

-- ============================================
-- PASO 2: Eliminar datos de negocio (hojas -> raiz)
-- ============================================

-- Nivel 8: Detalles / lineas (hojas del arbol)
DELETE FROM ajustes_det;
DELETE FROM gasto_pagos;
DELETE FROM sesiones_caja_detalle;
DELETE FROM notas_credito_det;
DELETE FROM notas_debito_det;
DELETE FROM ventas_det;
DELETE FROM facturas_compra_det;
DELETE FROM notas_fiscales_compra_det;
DELETE FROM rol_permisos;

-- Nivel 7: Movimientos inmutables y documentos secundarios
DELETE FROM movimientos_inventario;
DELETE FROM pagos;
DELETE FROM movimientos_cuenta;
DELETE FROM movimientos_metodo_cobro;
DELETE FROM movimientos_bancarios;
DELETE FROM movimientos_cuenta_proveedor;
-- libro_contable tiene self-ref FK (parent_id), nullear primero
UPDATE libro_contable SET parent_id = NULL;
DELETE FROM libro_contable;
DELETE FROM retenciones_iva;
DELETE FROM retenciones_islr;
DELETE FROM retenciones_iva_ventas;
DELETE FROM retenciones_islr_ventas;
DELETE FROM vencimientos_cobrar;
DELETE FROM vencimientos_pagar;
DELETE FROM notas_fiscales_compra;
DELETE FROM notas_credito;
DELETE FROM notas_debito;
DELETE FROM gastos;

-- Nivel 6: Documentos cabecera y stock
DELETE FROM ajustes;
DELETE FROM ventas;
DELETE FROM facturas_compra;
DELETE FROM lotes;
DELETE FROM sesiones_caja;
DELETE FROM inventario_stock;

-- Nivel 5: Maestros que dependen de otros maestros
DELETE FROM proveedores_bancos;
DELETE FROM recetas;
DELETE FROM productos;
DELETE FROM impuestos_ve;

-- Nivel 4: Maestros principales
DELETE FROM metodos_cobro;
DELETE FROM bancos_empresa;
DELETE FROM cajas;
DELETE FROM depositos;
DELETE FROM ajuste_motivos;
DELETE FROM cuentas_config;
-- plan_cuentas tiene self-ref FK con ON DELETE RESTRICT, nullear parent_id primero
UPDATE plan_cuentas SET parent_id = NULL;
DELETE FROM plan_cuentas;
DELETE FROM clientes;
DELETE FROM proveedores;

-- Nivel 3: Catalogos por empresa
DELETE FROM departamentos;
DELETE FROM marcas;
DELETE FROM unidades_conversion;
DELETE FROM unidades;
DELETE FROM tasas_cambio;

-- ============================================
-- PASO 3: Romper dependencias circulares (audit FKs)
-- ============================================
-- roles <-> usuarios via created_by/updated_by
-- empresas_fiscal_ve -> usuarios via updated_by

UPDATE roles SET created_by = NULL, updated_by = NULL;
UPDATE usuarios SET created_by = NULL, updated_by = NULL;
UPDATE empresas_fiscal_ve SET updated_by = NULL;

-- ============================================
-- PASO 4: Eliminar RBAC + Usuarios
-- ============================================

DELETE FROM tenant_permisos;
DELETE FROM roles;
DELETE FROM usuarios;

-- ============================================
-- PASO 5: Eliminar Empresa + SaaS
-- ============================================

DELETE FROM empresas_fiscal_ve;
DELETE FROM tenant_app_access;
DELETE FROM pagos_suscripcion;
DELETE FROM suscripciones;
DELETE FROM empresas;
DELETE FROM planes;
DELETE FROM plataforma_metodos_pago;
DELETE FROM tenants;

-- ============================================
-- PASO 6: Eliminar usuarios de Supabase Auth
-- ============================================
-- auth.identities, auth.sessions, etc. se eliminan via CASCADE

DELETE FROM auth.users;

-- ============================================
-- PASO 7: Reactivar todos los triggers
-- ============================================

ALTER TABLE movimientos_inventario ENABLE TRIGGER USER;
ALTER TABLE tasas_cambio ENABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta ENABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta_proveedor ENABLE TRIGGER USER;
ALTER TABLE movimientos_metodo_cobro ENABLE TRIGGER USER;
ALTER TABLE movimientos_bancarios ENABLE TRIGGER USER;
ALTER TABLE ventas ENABLE TRIGGER USER;
ALTER TABLE ventas_det ENABLE TRIGGER USER;
ALTER TABLE pagos ENABLE TRIGGER USER;
ALTER TABLE notas_credito ENABLE TRIGGER USER;
ALTER TABLE notas_credito_det ENABLE TRIGGER USER;
ALTER TABLE notas_debito ENABLE TRIGGER USER;
ALTER TABLE notas_debito_det ENABLE TRIGGER USER;
ALTER TABLE retenciones_iva ENABLE TRIGGER USER;
ALTER TABLE retenciones_islr ENABLE TRIGGER USER;
ALTER TABLE retenciones_iva_ventas ENABLE TRIGGER USER;
ALTER TABLE retenciones_islr_ventas ENABLE TRIGGER USER;
ALTER TABLE notas_fiscales_compra ENABLE TRIGGER USER;
ALTER TABLE notas_fiscales_compra_det ENABLE TRIGGER USER;
ALTER TABLE facturas_compra ENABLE TRIGGER USER;
ALTER TABLE facturas_compra_det ENABLE TRIGGER USER;
ALTER TABLE gastos ENABLE TRIGGER USER;
ALTER TABLE libro_contable ENABLE TRIGGER USER;
ALTER TABLE pagos_suscripcion ENABLE TRIGGER USER;
ALTER TABLE clientes ENABLE TRIGGER USER;
ALTER TABLE proveedores ENABLE TRIGGER USER;
ALTER TABLE productos ENABLE TRIGGER USER;
ALTER TABLE departamentos ENABLE TRIGGER USER;
ALTER TABLE plan_cuentas ENABLE TRIGGER USER;
ALTER TABLE roles ENABLE TRIGGER USER;
ALTER TABLE usuarios ENABLE TRIGGER USER;
ALTER TABLE empresas_fiscal_ve ENABLE TRIGGER USER;
ALTER TABLE empresas ENABLE TRIGGER USER;

COMMIT;

-- ============================================
-- VERIFICACION (ejecutar despues del COMMIT)
-- ============================================
-- Debe devolver 0 para todas las tablas de negocio
-- y conservar filas en los catalogos globales

SELECT 'empresas' AS tabla, COUNT(*) FROM empresas
UNION ALL SELECT 'usuarios', COUNT(*) FROM usuarios
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL SELECT 'libro_contable', COUNT(*) FROM libro_contable
UNION ALL SELECT 'cuentas_config', COUNT(*) FROM cuentas_config
UNION ALL SELECT 'gasto_pagos', COUNT(*) FROM gasto_pagos
UNION ALL SELECT '--- PRESERVADOS ---', 0
UNION ALL SELECT 'apps', COUNT(*) FROM apps
UNION ALL SELECT 'permisos', COUNT(*) FROM permisos
UNION ALL SELECT 'monedas', COUNT(*) FROM monedas
UNION ALL SELECT 'tipos_persona_ve', COUNT(*) FROM tipos_persona_ve
UNION ALL SELECT 'islr_conceptos_ve', COUNT(*) FROM islr_conceptos_ve
UNION ALL SELECT 'tipos_movimiento', COUNT(*) FROM tipos_movimiento;
