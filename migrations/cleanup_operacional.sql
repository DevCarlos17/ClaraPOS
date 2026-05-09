-- =============================================
-- CLARAPOS: Limpieza de datos operacionales
-- =============================================
-- PROPOSITO: Eliminar solo los datos de operacion diaria,
-- conservando toda la configuracion (usuarios, productos,
-- clientes, metodos de cobro, bancos, cajas, etc.)
--
-- BORRA:
--   Ventas          -> ventas_det, pagos, retenciones ventas,
--                      notas_credito_det, notas_credito, ventas
--   Sesiones de caja-> sesiones_caja_detalle, sesiones_caja
--   Conciliacion    -> mov_caja_fuerte, traspasos_tesoreria,
--                      movimientos_bancarios, movimientos_metodo_cobro
--   CxC / CxP       -> movimientos_cuenta, vencimientos_cobrar,
--                      movimientos_cuenta_proveedor, vencimientos_pagar
--   Stock           -> movimientos_inventario, inventario_stock
--
-- CONSERVA (sin tocar):
--   empresas, usuarios, auth.users
--   productos, departamentos, recetas
--   clientes, proveedores
--   metodos_cobro, bancos_empresa, cajas, caja_fuerte, depositos
--   tasas_cambio, facturas_compra, gastos, ajustes, lotes
--   plan_cuentas, libro_contable, retenciones (compras), etc.
--
-- RESETEA saldos derivados a 0:
--   clientes.saldo_actual
--   proveedores.saldo_actual
--   productos.stock
--   metodos_cobro.saldo_actual
--   bancos_empresa.saldo_actual
--   caja_fuerte.saldo_actual
--
-- EJECUTAR EN: Supabase SQL Editor
-- IMPORTANTE: Ejecutar el script completo de una sola vez
-- =============================================

BEGIN;

-- ============================================
-- PASO 1: Deshabilitar triggers
-- ============================================
-- Necesario para tablas inmutables (no permiten DELETE por trigger)
-- y para las que tienen triggers que leen saldos antes de UPDATE.

ALTER TABLE movimientos_inventario       DISABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta           DISABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta_proveedor DISABLE TRIGGER USER;
ALTER TABLE movimientos_metodo_cobro     DISABLE TRIGGER USER;
ALTER TABLE movimientos_bancarios        DISABLE TRIGGER USER;
ALTER TABLE mov_caja_fuerte              DISABLE TRIGGER USER;
ALTER TABLE ventas                       DISABLE TRIGGER USER;
ALTER TABLE ventas_det                   DISABLE TRIGGER USER;
ALTER TABLE pagos                        DISABLE TRIGGER USER;
ALTER TABLE notas_credito                DISABLE TRIGGER USER;
ALTER TABLE notas_credito_det            DISABLE TRIGGER USER;
ALTER TABLE retenciones_iva_ventas       DISABLE TRIGGER USER;
ALTER TABLE retenciones_islr_ventas      DISABLE TRIGGER USER;
-- Para poder hacer UPDATE de campos derivados sin interferencia
ALTER TABLE clientes                     DISABLE TRIGGER USER;
ALTER TABLE proveedores                  DISABLE TRIGGER USER;
ALTER TABLE productos                    DISABLE TRIGGER USER;
ALTER TABLE metodos_cobro                DISABLE TRIGGER USER;
ALTER TABLE bancos_empresa               DISABLE TRIGGER USER;
ALTER TABLE caja_fuerte                  DISABLE TRIGGER USER;

-- ============================================
-- PASO 2: Eliminar datos (hojas -> raiz)
-- ============================================

-- --- VENTAS ---
-- Nivel detalle (hijos de ventas)
DELETE FROM retenciones_islr_ventas;
DELETE FROM retenciones_iva_ventas;
DELETE FROM notas_credito_det;
DELETE FROM ventas_det;
DELETE FROM pagos;
-- Nivel documento secundario
DELETE FROM movimientos_cuenta
  WHERE doc_origen_tipo IN ('VENTA', 'NOTA_CREDITO', 'PAGO_CXC', 'ABONO_GLOBAL');
DELETE FROM vencimientos_cobrar;
-- Nivel cabecera
DELETE FROM notas_credito;
DELETE FROM ventas;

-- --- SESIONES DE CAJA ---
DELETE FROM sesiones_caja_detalle;
DELETE FROM sesiones_caja;

-- --- CONCILIACION / TESORERIA ---
DELETE FROM traspasos_tesoreria;
DELETE FROM mov_caja_fuerte;
DELETE FROM movimientos_bancarios;
-- Limpiar movimientos de metodo de cobro que no fueron borrados por ventas
DELETE FROM movimientos_metodo_cobro;

-- --- CUENTAS POR COBRAR Y PAGAR ---
-- (lo que quede de movimientos_cuenta no borrado en la seccion de ventas)
DELETE FROM movimientos_cuenta;
DELETE FROM vencimientos_cobrar;
DELETE FROM movimientos_cuenta_proveedor;
DELETE FROM vencimientos_pagar;

-- --- STOCK ---
DELETE FROM movimientos_inventario;
DELETE FROM inventario_stock;

-- ============================================
-- PASO 3: Resetear campos derivados a cero
-- ============================================
-- Estos campos son mantenidos por triggers al insertar movimientos.
-- Al vaciar los movimientos, el saldo real es 0.

UPDATE clientes        SET saldo_actual = 0;
UPDATE proveedores     SET saldo_actual = 0;
UPDATE productos       SET stock        = 0;
UPDATE metodos_cobro   SET saldo_actual = 0;
UPDATE bancos_empresa  SET saldo_actual = 0;
UPDATE caja_fuerte     SET saldo_actual = 0;

-- ============================================
-- PASO 4: Reactivar triggers
-- ============================================

ALTER TABLE movimientos_inventario       ENABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta           ENABLE TRIGGER USER;
ALTER TABLE movimientos_cuenta_proveedor ENABLE TRIGGER USER;
ALTER TABLE movimientos_metodo_cobro     ENABLE TRIGGER USER;
ALTER TABLE movimientos_bancarios        ENABLE TRIGGER USER;
ALTER TABLE mov_caja_fuerte              ENABLE TRIGGER USER;
ALTER TABLE ventas                       ENABLE TRIGGER USER;
ALTER TABLE ventas_det                   ENABLE TRIGGER USER;
ALTER TABLE pagos                        ENABLE TRIGGER USER;
ALTER TABLE notas_credito                ENABLE TRIGGER USER;
ALTER TABLE notas_credito_det            ENABLE TRIGGER USER;
ALTER TABLE retenciones_iva_ventas       ENABLE TRIGGER USER;
ALTER TABLE retenciones_islr_ventas      ENABLE TRIGGER USER;
ALTER TABLE clientes                     ENABLE TRIGGER USER;
ALTER TABLE proveedores                  ENABLE TRIGGER USER;
ALTER TABLE productos                    ENABLE TRIGGER USER;
ALTER TABLE metodos_cobro                ENABLE TRIGGER USER;
ALTER TABLE bancos_empresa               ENABLE TRIGGER USER;
ALTER TABLE caja_fuerte                  ENABLE TRIGGER USER;

COMMIT;

-- ============================================
-- VERIFICACION (ejecutar despues del COMMIT)
-- ============================================
-- Tablas limpiadas deben devolver 0.
-- Tablas conservadas deben devolver > 0.

SELECT '=== LIMPIADAS (debe ser 0) ===' AS resultado, 0 AS filas
UNION ALL
SELECT 'ventas',                    COUNT(*)::int FROM ventas
UNION ALL SELECT 'ventas_det',      COUNT(*)::int FROM ventas_det
UNION ALL SELECT 'pagos',           COUNT(*)::int FROM pagos
UNION ALL SELECT 'notas_credito',   COUNT(*)::int FROM notas_credito
UNION ALL SELECT 'notas_credito_det', COUNT(*)::int FROM notas_credito_det
UNION ALL SELECT 'sesiones_caja',   COUNT(*)::int FROM sesiones_caja
UNION ALL SELECT 'sesiones_caja_detalle', COUNT(*)::int FROM sesiones_caja_detalle
UNION ALL SELECT 'mov_caja_fuerte', COUNT(*)::int FROM mov_caja_fuerte
UNION ALL SELECT 'traspasos_tesoreria', COUNT(*)::int FROM traspasos_tesoreria
UNION ALL SELECT 'mov_bancarios',   COUNT(*)::int FROM movimientos_bancarios
UNION ALL SELECT 'mov_metodo_cobro', COUNT(*)::int FROM movimientos_metodo_cobro
UNION ALL SELECT 'mov_cuenta (CxC)', COUNT(*)::int FROM movimientos_cuenta
UNION ALL SELECT 'vencimientos_cobrar', COUNT(*)::int FROM vencimientos_cobrar
UNION ALL SELECT 'mov_cuenta_prov (CxP)', COUNT(*)::int FROM movimientos_cuenta_proveedor
UNION ALL SELECT 'vencimientos_pagar', COUNT(*)::int FROM vencimientos_pagar
UNION ALL SELECT 'mov_inventario',  COUNT(*)::int FROM movimientos_inventario
UNION ALL SELECT 'inventario_stock', COUNT(*)::int FROM inventario_stock
UNION ALL
SELECT '=== CONSERVADOS (debe ser > 0) ===' AS resultado, 0
UNION ALL
SELECT 'productos',     COUNT(*)::int FROM productos
UNION ALL SELECT 'clientes',       COUNT(*)::int FROM clientes
UNION ALL SELECT 'proveedores',    COUNT(*)::int FROM proveedores
UNION ALL SELECT 'metodos_cobro',  COUNT(*)::int FROM metodos_cobro
UNION ALL SELECT 'bancos_empresa', COUNT(*)::int FROM bancos_empresa
UNION ALL SELECT 'cajas',          COUNT(*)::int FROM cajas
UNION ALL SELECT 'caja_fuerte',    COUNT(*)::int FROM caja_fuerte
UNION ALL SELECT 'tasas_cambio',   COUNT(*)::int FROM tasas_cambio
UNION ALL SELECT 'usuarios',       COUNT(*)::int FROM usuarios;
