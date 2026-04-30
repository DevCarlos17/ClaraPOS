-- =============================================
-- CLARAPOS: Limpieza de datos transaccionales
-- =============================================
-- PROPOSITO: Eliminar SOLO los datos operacionales/transaccionales
-- para comenzar con datos limpios sin perder la configuracion.
--
-- BORRA:
--   tasas_cambio, ventas, facturas_compra, gastos, pagos, notas_credito,
--   notas_debito, movimientos_cuenta (CxC), movimientos_cuenta_proveedor (CxP),
--   movimientos_inventario (kardex), inventario_stock, libro_contable,
--   sesiones_caja, retenciones, vencimientos, ajustes, lotes
--
-- CONSERVA (sin tocar):
--   empresas, usuarios, auth.users
--   productos, departamentos, recetas
--   clientes, proveedores
--   metodos_cobro, bancos_empresa, cajas, depositos
--   plan_cuentas, cuentas_config
--   marcas, unidades, unidades_conversion, impuestos_ve, ajuste_motivos
--   roles, tenant_permisos
--
-- RESETEA saldos derivados:
--   clientes.saldo_actual = 0
--   proveedores.saldo_actual = 0
--   productos.stock = 0
--
-- EJECUTAR EN: Supabase SQL Editor
-- IMPORTANTE: Ejecutar el script completo de una sola vez
-- =============================================

BEGIN;

-- ============================================
-- PASO 1: Desactivar triggers de inmutabilidad
-- ============================================
-- Necesario para poder hacer DELETE en tablas inmutables
-- y UPDATE en clientes/proveedores/productos sin interferencia.

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
-- Estos se deshabilitan para poder hacer UPDATE de saldo/stock sin auditoría
ALTER TABLE clientes DISABLE TRIGGER USER;
ALTER TABLE proveedores DISABLE TRIGGER USER;
ALTER TABLE productos DISABLE TRIGGER USER;

-- ============================================
-- PASO 2: Eliminar datos transaccionales (hojas -> raiz)
-- ============================================

-- Nivel: detalles y lineas (hojas del arbol de FK)
DELETE FROM ajustes_det;
DELETE FROM gasto_pagos;
DELETE FROM sesiones_caja_detalle;
DELETE FROM notas_credito_det;
DELETE FROM notas_debito_det;
DELETE FROM ventas_det;
DELETE FROM facturas_compra_det;
DELETE FROM notas_fiscales_compra_det;

-- Nivel: movimientos y documentos secundarios
DELETE FROM movimientos_inventario;
DELETE FROM pagos;
DELETE FROM movimientos_cuenta;
DELETE FROM movimientos_metodo_cobro;
DELETE FROM movimientos_bancarios;
DELETE FROM movimientos_cuenta_proveedor;
-- libro_contable tiene self-ref FK (parent_id) con ON DELETE RESTRICT: nullear primero
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

-- Nivel: documentos cabecera y stock
DELETE FROM ajustes;
DELETE FROM ventas;
DELETE FROM facturas_compra;
DELETE FROM lotes;
DELETE FROM sesiones_caja;
DELETE FROM inventario_stock;

-- Tasas de cambio BCV (historial completo)
DELETE FROM tasas_cambio;

-- ============================================
-- PASO 3: Resetear campos derivados a cero
-- ============================================
-- Estos campos son mantenidos por triggers al insertar movimientos.
-- Al eliminar todos los movimientos, deben quedar en 0.

-- Saldo de clientes (lo actualiza el trigger al insertar movimientos_cuenta)
UPDATE clientes SET saldo_actual = 0;

-- Saldo de proveedores (lo actualiza el trigger al insertar movimientos_cuenta_proveedor)
UPDATE proveedores SET saldo_actual = 0;

-- Stock de productos (lo actualiza el trigger al insertar movimientos_inventario)
UPDATE productos SET stock = 0;

-- ============================================
-- PASO 4: Reactivar todos los triggers
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
ALTER TABLE clientes ENABLE TRIGGER USER;
ALTER TABLE proveedores ENABLE TRIGGER USER;
ALTER TABLE productos ENABLE TRIGGER USER;

COMMIT;

-- ============================================
-- VERIFICACION (ejecutar despues del COMMIT)
-- ============================================
-- Tablas transaccionales deben devolver 0.
-- Tablas conservadas deben devolver > 0.

SELECT 'ventas'                       AS tabla, COUNT(*) AS filas FROM ventas
UNION ALL SELECT 'ventas_det',                  COUNT(*) FROM ventas_det
UNION ALL SELECT 'pagos',                       COUNT(*) FROM pagos
UNION ALL SELECT 'facturas_compra',             COUNT(*) FROM facturas_compra
UNION ALL SELECT 'facturas_compra_det',         COUNT(*) FROM facturas_compra_det
UNION ALL SELECT 'gastos',                      COUNT(*) FROM gastos
UNION ALL SELECT 'gasto_pagos',                 COUNT(*) FROM gasto_pagos
UNION ALL SELECT 'tasas_cambio',                COUNT(*) FROM tasas_cambio
UNION ALL SELECT 'movimientos_inventario',      COUNT(*) FROM movimientos_inventario
UNION ALL SELECT 'inventario_stock',            COUNT(*) FROM inventario_stock
UNION ALL SELECT 'movimientos_cuenta',          COUNT(*) FROM movimientos_cuenta
UNION ALL SELECT 'movimientos_cuenta_prov',     COUNT(*) FROM movimientos_cuenta_proveedor
UNION ALL SELECT 'libro_contable',              COUNT(*) FROM libro_contable
UNION ALL SELECT 'notas_credito',               COUNT(*) FROM notas_credito
UNION ALL SELECT 'notas_debito',                COUNT(*) FROM notas_debito
UNION ALL SELECT 'sesiones_caja',               COUNT(*) FROM sesiones_caja
UNION ALL SELECT 'ajustes',                     COUNT(*) FROM ajustes
UNION ALL SELECT 'lotes',                       COUNT(*) FROM lotes
UNION ALL SELECT '--- CONSERVADOS ---',         0
UNION ALL SELECT 'empresas',                    COUNT(*) FROM empresas
UNION ALL SELECT 'usuarios',                    COUNT(*) FROM usuarios
UNION ALL SELECT 'productos',                   COUNT(*) FROM productos
UNION ALL SELECT 'clientes',                    COUNT(*) FROM clientes
UNION ALL SELECT 'proveedores',                 COUNT(*) FROM proveedores
UNION ALL SELECT 'departamentos',               COUNT(*) FROM departamentos
UNION ALL SELECT 'metodos_cobro',               COUNT(*) FROM metodos_cobro
UNION ALL SELECT 'bancos_empresa',              COUNT(*) FROM bancos_empresa
UNION ALL SELECT 'plan_cuentas',                COUNT(*) FROM plan_cuentas;
