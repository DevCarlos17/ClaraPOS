# PANTALLAS.md - Estado de Implementacion de Pantallas

> Ultima actualizacion: 2026-05-07

---

## Resumen General

| Estado | Cantidad |
|--------|----------|
| Implementado | 22+ |
| Parcialmente implementado | 10+ |
| Placeholder (solo stub) | 5 |
| Futuro (no iniciado) | 1 |

---

## 1. AUTENTICACION

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Login | `/login` | Implementado |
| Registro Propietario | `/register` | Implementado |

**Pendiente:**
- [ ] Recuperacion de contrasena
- [ ] Verificacion de email

---

## 2. DASHBOARD

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Dashboard | `/dashboard` | Implementado |

**Componentes implementados:**
- `dashboard-welcome.tsx` - Banner de bienvenida con nombre de usuario
- `dashboard-kpi-cards.tsx` - KPIs: ventas totales USD/Bs, valor inventario, etc.
- `dashboard-inventario-chart.tsx` - Grafico inventario por departamento (Recharts)
- `dashboard-ventas-chart.tsx` - Grafico tendencia de ventas
- `dashboard-top-rotacion.tsx` - Top 15 productos por volumen

**Pendiente:**
- [ ] Filtro por rango de fechas en graficos
- [ ] Exportar a PDF

---

## 3. CONFIGURACION

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Tasas de Cambio | `/configuracion/tasa-cambio` | Implementado |
| Usuarios | `/configuracion/usuarios` | Implementado |
| Datos Empresa | `/configuracion/datos-empresa` | Implementado |
| Metodos de Pago | `/configuracion/metodos-pago` | Implementado |
| Bancos (config) | `/configuracion/bancos` | Implementado |
| Cajas | `/configuracion/cajas` | Implementado |
| Impuestos | `/configuracion/impuestos` | Implementado |
| Niveles de Precio | `/configuracion/niveles-precio` | Implementado |

### Tasas de Cambio - Implementado
- Formulario para nueva tasa (4 decimales de precision)
- Lista historica ordenada por fecha DESC
- Inmutable: sin edicion ni borrado

### Usuarios - Implementado
- Lista de empleados con nivel y estado
- Crear/editar empleado (Edge Functions: `create-employee`, `update-employee`)
- Roles con permisos granulares
- Matriz de permisos por nivel

### Datos Empresa - Implementado
- Formulario: razon social, RIF, direccion, telefono, email, logo

### Metodos de Pago - Implementado
- CRUD de metodos de pago (USD, Bs, Zelle, transferencia, punto, etc.)
- Toggle activo/inactivo

### Bancos - Implementado
- Cuentas bancarias de la empresa

### Cajas - Implementado
- Terminales POS de la empresa

---

## 4. INVENTARIO

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Departamentos | `/inventario/departamentos` | Implementado |
| Productos | `/inventario/productos` | Implementado |
| Kardex | `/inventario/kardex` | Implementado |
| Recetas | `/inventario/recetas` | Implementado |
| Marcas | `/inventario/marcas` | Implementado |
| Unidades | `/inventario/unidades` | Implementado |
| Depositos | `/inventario/depositos` | Implementado |
| Lotes | `/inventario/lotes` | Implementado |
| Ajustes | `/inventario/ajustes` | Implementado |
| Compras | `/inventario/compras` | Parcial |
| Reportes | `/inventario/reportes` | Placeholder |

### Departamentos - Implementado
- DataTable con filtro activo/inactivo
- Modal crear/editar con codigo inmutable post-creacion

### Productos/Servicios - Implementado
- DataTable con cards resumen (valor total, stock critico)
- Modal con precios bimonetarios (USD base + Bs calculado)
- Tipos: 'P' (Producto) y 'S' (Servicio)
- Servicios: stock = 0 siempre, consumen via recetas
- Validaciones: precio_venta >= costo, precio_mayor <= precio_venta
- Stock solo lectura (se modifica via Kardex)

### Kardex - Implementado
- Lista inmutable de movimientos (sin editar/borrar)
- Formulario ajuste manual (entrada/salida)
- Snapshot stock_anterior / stock_nuevo
- Operaciones atomicas

### Recetas (BOM) - Implementado
- Selector de servicio + lista de ingredientes
- Modal agregar/editar cantidad de ingrediente
- Solo para productos tipo 'S'

### Marcas, Unidades, Depositos, Lotes, Ajustes - Implementados
- CRUD completo para catalogos de apoyo del inventario

### Compras - Parcial
- [ ] Ordenes de compra vinculadas a proveedores
- [ ] Auto-kardex al confirmar compra (origen='COM')
- [ ] Actualizacion automatica de costos en productos

### Reportes Inventario - Placeholder
- [ ] Rotacion, valuacion, stock critico, movimientos por periodo

---

## 5. CLIENTES

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Gestion de Clientes | `/clientes` | Implementado |
| Cuentas por Cobrar | `/cxc` | Implementado |
| Reportes CxC | `/clientes/reportes` | Parcial |

### Gestion de Clientes - Implementado
- Lista con busqueda y filtro activo/inactivo
- Modal crear/editar cliente
- Identificacion inmutable post-creacion (V-12345678, J-98765432)
- Saldo mostrado en USD + equivalente Bs
- Limite de credito

### Cuentas por Cobrar - Implementado
- Lista de clientes con deuda y cards resumen
- Pago a factura especifica (modal)
- Abono global FIFO (aplica a factura mas antigua primero)
- Conversion bimonetaria para pagos en Bs
- Preview de distribucion FIFO antes de confirmar

---

## 6. VENTAS

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Nueva Venta (POS) | `/ventas/nueva` | Implementado |
| Notas de Credito | `/ventas/notas-credito` | Parcial |
| Notas de Debito | `/ventas/notas-debito` | Parcial |
| Cuadre de Caja | `/ventas/cuadre-de-caja` | Parcial |
| Prestamos | `/ventas/prestamos` | Parcial |
| Reportes | `/ventas/reportes` | Placeholder |

### POS Terminal - Implementado
- Selector de cliente (opcional contado, requerido credito)
- Buscador de productos con validacion de stock (Edge Function `validar-stock`)
- Carrito con edicion de cantidad y eliminacion
- Servicios auto-explotan recetas (consumen productos)
- Modal de pago con multiples metodos (USD, Bs, Zelle, transferencia, punto)
- Totales bimonetarios (USD base + Bs calculado)
- Nro factura auto-generado por empresa
- Transaccion atomica: factura + detalle + pagos + kardex + movimiento cuenta

### Notas de Credito - Parcial
- Lista de ventas disponibles para NCR
- Modal crear NCR con motivo
- **Pendiente:**
  - [ ] Devolucion de stock (revertir Kardex)
  - [ ] Ajuste automatico de saldo del cliente
  - [ ] Reimpresion de NCR

### Cuadre de Caja - Parcial
- KPI cards, grafico por departamento, top productos, resumen por metodo
- **Pendiente:**
  - [ ] Conteo de caja (efectivo contado vs esperado)
  - [ ] Cierre y bloqueo del dia
  - [ ] Exportar a PDF/Excel

---

## 7. CAJA / TESORERIA

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Sesiones de Caja | `/caja/sesiones` | Parcial |
| Movimientos | `/caja/movimientos` | Parcial |

### Sesiones de Caja - Parcial
- Apertura y cierre de sesion de caja
- Control de cuadre por turno

### Movimientos - Parcial
- Movimientos manuales de caja
- Traspasos entre cajas

---

## 8. COMPRAS

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Facturas de Compra | `/compras/facturas` | Parcial |
| Notas Fiscales | `/compras/notas-fiscales` | Parcial |
| Cuentas por Pagar (CxP) | `/compras/cxp` | Parcial |
| Gastos | `/compras/gastos` | Parcial |
| Dashboard Gastos | `/compras/gastos-dashboard` | Parcial |
| Retenciones | `/compras/retenciones` | Parcial |

### Facturas de Compra - Parcial
- Registro de facturas de proveedores
- Lineas de compra: producto, cantidad, costo unitario
- Calculo de retenciones IVA/ISLR

### CxP - Parcial
- Cuentas por pagar a proveedores
- Vencimientos de pago

---

## 9. CONTABILIDAD

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Plan de Cuentas | `/contabilidad/plan-cuentas` | Implementado |
| Gastos | `/contabilidad/gastos` | Parcial |
| Dashboard Gastos | `/contabilidad/gastos-dashboard` | Parcial |
| Libro Contable | `/contabilidad/libro-contable` | Parcial |
| Balance de Comprobacion | `/contabilidad/balance-comprobacion` | Parcial |
| Config Cuentas | `/contabilidad/cuentas-config` | Parcial |

### Plan de Cuentas - Implementado
- CRUD de cuentas del plan contable
- Jerarquia: grupo > cuenta > subcuenta
- Importacion desde CSV
- Asociacion de cuentas con tipos de movimiento

---

## 10. BANCOS

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Conciliacion Bancaria | `/bancos/conciliacion` | Parcial |
| Diferencial Cambiario | `/bancos/diferencial-cambiario` | Parcial |

---

## 11. PROVEEDORES

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Gestion de Proveedores | `/proveedores` | Parcial |

### Gestion - Parcial
- DataTable con acciones CRUD
- Modal crear/editar proveedor
- Campos: razon_social, RIF, direccion_fiscal, telefono, correo, retiene_iva, retiene_islr, activo
- **Pendiente:**
  - [ ] Datos bancarios del proveedor
  - [ ] Historial de compras por proveedor

---

## 12. REPORTES GENERALES

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Reportes | `/reportes` | Placeholder |

**Pendiente:**
- [ ] Hub central de reportes con links a cada seccion
- [ ] Reportes consolidados de ventas, inventario, CxC
- [ ] Exportacion masiva

---

## 13. CLINICA (Futuro - Modulo Vertical)

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Clinica | `/clinica` | Placeholder |

**Por Implementar (modulo completo):**
- [ ] Historias clinicas por paciente/cliente
- [ ] Registro de sesiones de tratamiento
- [ ] Fotos antes/despues con galeria
- [ ] Mapas anatomicos para marcar areas
- [ ] Notas clinicas y protocolos de tratamiento
- [ ] Agenda de citas

---

## Orden de Implementacion Recomendado

### Prioridad Alta (completar lo iniciado)
1. **Notas de Credito** - Devolucion de stock + ajuste saldo + reimpresion
2. **Cuadre de Caja** - Conteo de caja + cierre formal + exportacion
3. **Compras completas** - Facturas con auto-kardex y actualizacion de costos

### Prioridad Media (modulos de gestion)
4. **Reportes de Ventas** - Analisis por periodo, cliente, producto
5. **Reportes de Inventario** - Rotacion, valuacion, stock critico
6. **Proveedores** - Datos bancarios + historial de compras
7. **CxP** - Flujo completo de pago a proveedores

### Prioridad Baja (vertical)
8. **Clinica** - Modulo completo de historias clinicas y agenda

---

## Tablas de BD vs Pantallas

| Tabla | Pantalla(s) que la usan | Estado UI |
|-------|------------------------|-----------|
| `empresas` | Datos Empresa, multi-tenant | Implementado |
| `usuarios` | Auth, Sidebar, Config:Usuarios | Implementado |
| `tasas_cambio` | Config:Tasas, todas las bimonetarias | Implementado |
| `departamentos` | Inventario:Deptos, Productos | Implementado |
| `marcas` | Inventario:Marcas | Implementado |
| `unidades` | Inventario:Unidades | Implementado |
| `depositos` | Inventario:Depositos | Implementado |
| `productos` | Inventario, Ventas POS, Dashboard | Implementado |
| `inventario_stock` | Inventario:Productos (stock), POS | Implementado |
| `recetas` | Inventario:Recetas, Ventas (auto-explode) | Implementado |
| `movimientos_inventario` | Kardex, Ventas (auto-create) | Implementado |
| `ajustes` / `ajustes_det` | Inventario:Ajustes | Implementado |
| `lotes` | Inventario:Lotes | Implementado |
| `metodos_cobro` | Config:Metodos, POS, CxC | Implementado |
| `bancos_empresa` | Config:Bancos | Implementado |
| `cajas` | Config:Cajas, Caja:Sesiones | Implementado |
| `clientes` | Clientes, POS, CxC | Implementado |
| `movimientos_cuenta` | CxC, Ventas (auto-create) | Implementado |
| `ventas` | POS, NCR, Cuadre | Implementado |
| `ventas_det` | POS (auto-create), Reportes | Implementado |
| `pagos` | POS (auto-create), Cuadre | Implementado |
| `notas_credito` | Ventas:NCR | Parcial |
| `sesiones_caja` | Caja:Sesiones | Parcial |
| `proveedores` | Proveedores:Gestion, Compras | Parcial |
| `facturas_compra` | Compras:Facturas | Parcial |
| `plan_cuentas` | Contabilidad:Plan | Implementado |
| `gastos` / `gasto_pagos` | Contabilidad:Gastos | Parcial |
| `libro_contable` | Contabilidad:Libro | Parcial |
