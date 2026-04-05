# PANTALLAS.md - Estado de Implementacion de Pantallas

> Ultima actualizacion: 2026-04-05

---

## Resumen General

| Estado | Cantidad |
|--------|----------|
| Implementado | 9 |
| Parcialmente implementado | 5 |
| Placeholder (solo stub) | 7 |
| Futuro (no iniciado) | 1+ |

---

## 1. AUTENTICACION

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Login | `/login` | Implementado | `(auth)/login.tsx`, `login-page.tsx` |
| Registro Propietario | `/register` | Implementado | `(auth)/register.tsx`, `register-page.tsx` |

**Pendiente:**
- [ ] Recuperacion de contrasena
- [ ] Verificacion de email

---

## 2. DASHBOARD

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Dashboard | `/dashboard` | Implementado | `_app/dashboard.tsx` |

**Componentes implementados:**
- `dashboard-welcome.tsx` - Banner de bienvenida con nombre de usuario
- `dashboard-kpi-cards.tsx` - KPIs: ventas totales USD/Bs, valor inventario, etc.
- `dashboard-inventario-chart.tsx` - Grafico inventario por departamento
- `dashboard-ventas-chart.tsx` - Grafico tendencia de ventas
- `dashboard-top-rotacion.tsx` - Top 15 productos por volumen

**Pendiente:**
- [ ] Filtro por rango de fechas en graficos
- [ ] Exportar a PDF

---

## 3. CONFIGURACION

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Tasas de Cambio | `/configuracion/tasa-cambio` | Implementado | `tasa-form.tsx`, `tasa-list.tsx`, `use-tasas.ts` |
| Usuarios | `/configuracion/usuarios` | Parcial | `usuario-list.tsx`, `usuario-form.tsx`, `use-usuarios.ts` |
| Datos Empresa | `/configuracion/datos-empresa` | Placeholder | Solo `PlaceholderPage` |
| Bancos | `/configuracion/bancos` | Placeholder | Solo `PlaceholderPage` |
| Metodos de Pago | `/configuracion/metodos-pago` | Placeholder | Solo `PlaceholderPage` |

### Tasas de Cambio - Implementado
- Formulario para nueva tasa (4 decimales de precision)
- Lista historica ordenada por fecha DESC
- Inmutable: sin edicion ni borrado
- Conversion USD/Bs en tiempo real

### Usuarios - Parcial
- Lista de empleados con nivel y estado
- Formulario crear/editar empleado (Edge Functions: `create-employee`, `update-employee`)
- **Pendiente:**
  - [ ] UI para matriz de permisos por nivel
  - [ ] Toggle activar/desactivar empleado con confirmacion
  - [ ] Cambio de contrasena de empleado

### Datos Empresa - Por Implementar
- [ ] Formulario: razon social, RIF, direccion, telefono, email, logo
- [ ] Lectura/escritura en tabla `empresas`
- [ ] Solo editable por nivel 1 (Propietario)

### Bancos - Por Implementar
- [ ] CRUD de catalogo de bancos
- [ ] Asociacion con metodos de pago
- [ ] Campos: nombre, codigo, activo

### Metodos de Pago - Por Implementar
- [ ] CRUD de metodos de pago (ya existe la tabla `metodos_pago` y el hook `use-metodos-pago.ts`)
- [ ] Campos: nombre, moneda (USD/BS), activo
- [ ] Los datos existen y se usan en POS y CxC, pero no hay pantalla para gestionarlos
- [ ] Solo editable por nivel 1 y 2

---

## 4. INVENTARIO

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Departamentos | `/inventario/departamentos` | Implementado | `departamento-list.tsx`, `departamento-form.tsx`, `use-departamentos.ts` |
| Productos | `/inventario/productos` | Implementado | `producto-list.tsx`, `producto-form.tsx`, `use-productos.ts` |
| Kardex | `/inventario/kardex` | Implementado | `kardex-list.tsx`, `movimiento-form.tsx`, `use-kardex.ts` |
| Recetas | `/inventario/recetas` | Implementado | `receta-manager.tsx`, `ingrediente-form.tsx`, `use-recetas.ts` |
| Compras | `/inventario/compras` | Placeholder | Solo `PlaceholderPage` |
| Reportes | `/inventario/reportes` | Placeholder | Solo `PlaceholderPage` |

### Departamentos - Implementado
- DataTable con filtro activo/inactivo
- Modal crear/editar con codigo inmutable post-creacion
- Codigo: solo A-Z, 0-9, guion. Auto-mayusculas

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
- Tipo: Entrada (E) / Salida (S) con badges
- Origen: MAN, FAC, VEN, AJU
- Snapshot stock_anterior / stock_nuevo
- Operaciones atomicas

### Recetas (BOM) - Implementado
- Selector de servicio + lista de ingredientes
- Modal agregar/editar cantidad de ingrediente
- Solo para productos tipo 'S'
- Constraint unico: servicio + producto
- Cantidades con 3 decimales de precision

### Compras - Por Implementar
- [ ] Crear orden de compra a proveedor
- [ ] Seleccion de proveedor (desde tabla `proveedores`)
- [ ] Lineas de compra: producto, cantidad, costo unitario
- [ ] Al confirmar: auto-crear movimientos Kardex (origen='COM')
- [ ] Actualizacion automatica de costos en productos
- [ ] Historial de compras por proveedor
- [ ] Bimonetario: costos en USD, pago en Bs posible

### Reportes Inventario - Por Implementar
- [ ] Reporte de rotacion de productos (mas/menos vendidos)
- [ ] Valuacion de inventario (stock x costo)
- [ ] Productos con stock critico (stock < stock_minimo)
- [ ] Movimientos por periodo (filtro fecha desde/hasta)
- [ ] Exportar a PDF/Excel

---

## 5. CLIENTES

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Gestion de Clientes | `/clientes` | Implementado | `cliente-list.tsx`, `cliente-form.tsx`, `use-clientes.ts` |
| Cuentas por Cobrar | `/cxc` | Implementado | `cxc-list.tsx`, `pago-factura-modal.tsx`, `abono-global-modal.tsx`, `use-cxc.ts` |

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

**Pendiente (Reportes CxC):**
- [ ] Reporte de antiguedad de saldos (30/60/90 dias)
- [ ] Historial de pagos por cliente
- [ ] Estado de cobranza
- [ ] Exportar a PDF/Excel

---

## 6. VENTAS

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Nueva Venta (POS) | `/ventas/nueva` | Implementado | `pos-terminal.tsx`, `pago-modal.tsx`, `use-ventas.ts` |
| Notas de Credito | `/ventas/notas-credito` | Parcial | `crear-ncr-modal.tsx`, `use-notas-credito.ts` |
| Cuadre de Caja | `/ventas/cuadre-de-caja` | Parcial | `cuadre-page.tsx`, KPIs, graficos, modals |
| Reportes | `/ventas/reportes` | Placeholder | Solo `PlaceholderPage` |

### POS Terminal - Implementado
- Selector de cliente (opcional para contado, requerido para credito)
- Buscador de productos con validacion de stock
- Carrito con edicion de cantidad y eliminacion
- Servicios auto-explotan recetas (consumen productos)
- Modal de pago con multiples metodos (USD, Bs, Zelle, transferencia, punto)
- Totales bimonetarios (USD base + Bs calculado)
- Nro factura auto-generado por empresa
- Transaccion atomica: factura + detalle + pagos + kardex + movimiento cuenta
- Impresion de recibo via dialogo del navegador

### Notas de Credito - Parcial
- Lista de ventas disponibles para NCR
- Modal crear NCR con motivo
- Nro NCR auto-generado por empresa
- **Pendiente:**
  - [ ] Vista detalle de nota de credito
  - [ ] Ajuste automatico de saldo del cliente al crear NCR
  - [ ] Creacion de movimiento_cuenta asociado
  - [ ] Devolucion de stock al inventario (revertir Kardex)
  - [ ] Reimpresion de NCR

### Cuadre de Caja - Parcial
- KPI cards: total USD, total Bs, tickets, promedio, margen
- Grafico ventas por departamento
- Top 15 productos
- Resumen por metodo de pago
- Modal detalle CxC del dia
- Modal auditoria de facturas
- **Pendiente:**
  - [ ] Interfaz de conteo de caja (efectivo contado vs esperado)
  - [ ] Varianza por metodo de pago
  - [ ] Cierre y bloqueo del dia (aprobacion)
  - [ ] Exportar a PDF/Excel
  - [ ] Filtro por cajero/usuario

### Reportes Ventas - Por Implementar
- [ ] Ventas por periodo (diario, semanal, mensual)
- [ ] Analisis por cliente (top clientes, frecuencia)
- [ ] Rendimiento por producto (margen, velocidad)
- [ ] Rendimiento por cajero/vendedor
- [ ] Tendencias y comparativas
- [ ] Exportar a PDF/Excel

---

## 7. PROVEEDORES

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Gestion de Proveedores | `/proveedores/gestion` | Parcial | `proveedor-list.tsx`, `proveedor-form.tsx`, `use-proveedores.ts` |

### Gestion - Parcial
- DataTable con acciones CRUD
- Modal crear/editar proveedor
- Campos: razon_social, RIF, direccion_fiscal, telefono, correo, retiene_iva, retiene_islr, activo
- **Pendiente:**
  - [ ] Integracion con modulo de compras
  - [ ] Calculo de retenciones IVA/ISLR
  - [ ] Datos bancarios del proveedor
  - [ ] Historial de compras por proveedor

---

## 8. REPORTES GENERALES

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Reportes | `/reportes` | Parcial | `_app/reportes.tsx` |

**Pendiente:**
- [ ] Hub central de reportes con links a cada seccion
- [ ] Reporte consolidado de ventas
- [ ] Reporte consolidado de inventario
- [ ] Reporte consolidado de CxC
- [ ] Exportacion masiva

---

## 9. CLINICA (Futuro)

| Pantalla | Ruta | Estado | Archivos |
|----------|------|--------|----------|
| Clinica | `/clinica` | Placeholder | Solo `PlaceholderPage` |

**Por Implementar (modulo completo):**
- [ ] Historias clinicas por paciente/cliente
- [ ] Registro de sesiones de tratamiento
- [ ] Fotos antes/despues con galeria
- [ ] Mapas anatomicos para marcar areas de tratamiento
- [ ] Notas clinicas y observaciones
- [ ] Protocolos/planes de tratamiento
- [ ] Agenda de citas
- [ ] Control de acceso a expedientes medicos

---

## Orden de Implementacion Recomendado

### Prioridad Alta (funciones de negocio core)
1. **Metodos de Pago** - CRUD para gestionar los metodos (ya usados en POS y CxC)
2. **Datos Empresa** - Perfil de empresa (razon social, RIF, etc.)
3. **Notas de Credito** - Completar: ajuste saldo, reversion kardex, movimiento cuenta
4. **Cuadre de Caja** - Completar: conteo, cierre, exportacion

### Prioridad Media (analitica de negocio)
5. **Reportes de Ventas** - Analisis por periodo, cliente, producto
6. **Reportes de Inventario** - Rotacion, valuacion, stock critico
7. **Reportes de CxC** - Antiguedad de saldos, estado cobranza
8. **Compras** - Ordenes de compra con auto-actualizacion de stock

### Prioridad Baja (modulos futuros)
9. **Bancos** - Catalogo de bancos
10. **Proveedores** - Completar con compras e historial
11. **Clinica** - Modulo completo de historias clinicas

---

## Tablas de BD vs Pantallas

| Tabla | Pantalla(s) que la usan | Estado UI |
|-------|------------------------|-----------|
| `empresas` | Datos Empresa, multi-tenant | Placeholder |
| `usuarios` | Auth, Sidebar, Config:Usuarios | Parcial |
| `tasas_cambio` | Config:Tasas, todas las bimonetarias | Completo |
| `departamentos` | Inventario:Deptos, Productos | Completo |
| `productos` | Inventario, Ventas POS, Dashboard | Completo |
| `recetas` | Inventario:Recetas, Ventas (auto-explode) | Completo |
| `movimientos_inventario` | Kardex, Ventas (auto-create) | Completo |
| `metodos_pago` | Ventas POS, CxC (usado pero sin CRUD propio) | Placeholder |
| `clientes` | Clientes, Ventas POS, CxC | Completo |
| `movimientos_cuenta` | CxC, Ventas (auto-create) | Completo |
| `ventas` | POS, Notas Credito, Cuadre | Completo |
| `detalle_venta` | POS (auto-create), Reportes | Completo |
| `pagos` | POS (auto-create), Cuadre | Completo |
| `notas_credito` | Ventas:NCR | Parcial |
| `proveedores` | Proveedores:Gestion, Compras | Parcial |
| `level_permissions` | Auth, Sidebar, Permisos | Completo (backend) |
