# Plan de Migracion Frontend - ClaraPOS

Guia paso a paso para alinear el frontend con el nuevo esquema de base de datos (migraciones 0001-0008).

**Estado**: PowerSync sync rules, schema.ts y types.ts ya estan actualizados.

---

## Fase 0 — Infraestructura Core (bloqueante)

Todo lo demas depende de estos cambios. Deben hacerse primero.

### 0.1 Actualizar `useCurrentUser()` hook

**Archivo**: `src/core/hooks/use-current-user.ts`

**Cambios**:
- Reemplazar campo `level: number` por `rol_id: string | null` en la interfaz `CurrentUser`
- Actualizar la query SQL: `SELECT id, email, nombre, rol_id, empresa_id FROM usuarios WHERE id = ?`
- Actualizar el fallback JWT: leer `user_metadata.rol_id` en vez de `user_metadata.level`
- Considerar agregar campo `rol_nombre` via JOIN con tabla `roles` para display

**Impacto**: Todos los componentes que usen `user.level` para verificar permisos dejaran de funcionar hasta que se actualice el sistema de permisos (paso 0.2).

### 0.2 Reescribir `usePermissions()` hook

**Archivo**: `src/core/hooks/use-permissions.ts`

**Cambios**:
- Eliminar todas las queries a `level_permissions` (tabla eliminada)
- Implementar nuevo sistema basado en RBAC:
  1. Obtener `rol_id` del usuario actual via `useCurrentUser()`
  2. Query a `rol_permisos` filtrando por `rol_id` para obtener los `permiso_id`
  3. Query a `permisos` para resolver los slugs de cada permiso
  4. Opcionalmente filtrar por `tenant_permisos` para verificar que el permiso esta habilitado para el tenant
- Exponer helpers: `hasPermission(slug)`, `hasAnyPermission([slugs])`, `permissions[]`

### 0.3 Actualizar `connector.ts` — metodos de Edge Functions

**Archivo**: `src/core/db/powersync/connector.ts`

**Cambios**:
- `createEmployee()`: Reemplazar parametro `level: number` por `rol_id: string`
- `updateEmployee()`: Reemplazar `{ level?: number; activo?: boolean }` por `{ rol_id?: string; is_active?: boolean }`
- El metodo `uploadData()` es generico y no necesita cambios (opera con `op.table` dinamico)

### 0.4 Actualizar Edge Functions (Supabase)

Estos archivos viven en `supabase/functions/`:

| Funcion | Cambios |
|---------|---------|
| `register-owner` | Insertar `rol_id` en vez de `level` en `user_metadata`. Crear rol "Propietario" como rol de sistema para la empresa. Asignar al usuario. |
| `create-employee` | Recibir `rol_id` en vez de `level`. Validar que el rol pertenece a la misma empresa. Insertar `rol_id` en `user_metadata`. |
| `update-employee` | Recibir `rol_id` y `is_active` en vez de `level` y `activo`. Actualizar `user_metadata` acorde. |

---

## Fase 1 — Renombrar campos globales

Cambio sistematico en todos los archivos. Se puede hacer con buscar-reemplazar controlado.

### 1.1 `activo` → `is_active`

**Archivos afectados** (~20 archivos):

| Tipo | Archivos |
|------|----------|
| Hooks | `use-departamentos.ts`, `use-productos.ts`, `use-payment-methods.ts`, `use-bancos.ts`, `use-clientes.ts`, `use-proveedores.ts`, `use-usuarios.ts` |
| Schemas (Zod) | `producto-schema.ts`, `cliente-schema.ts`, `proveedor-schema.ts`, `payment-method-schema.ts`, `banco-schema.ts` |
| Componentes | Todos los formularios y listas que rendericen o filtren por `activo` |

**Patron de cambio**:
```
// Antes
WHERE activo = 1

// Despues
WHERE is_active = 1
```

### 1.2 `nombre_social` → `nombre` (clientes)

**Archivos afectados**:
- `src/features/clientes/hooks/use-clientes.ts`
- `src/features/clientes/schemas/cliente-schema.ts`
- Componentes en `src/features/clientes/components/`

La tabla `clientes` ahora usa `nombre` + `nombre_comercial` en vez de solo `nombre_social`.

### 1.3 `limite_credito` → `limite_credito_usd` (clientes)

**Archivos afectados**:
- `src/features/clientes/hooks/use-clientes.ts`
- `src/features/clientes/schemas/cliente-schema.ts`
- Componentes de clientes

### 1.4 `moneda_destino` → `moneda_id` (tasas_cambio)

**Archivos afectados**:
- `src/features/configuracion/hooks/use-tasas.ts`
- `src/features/configuracion/schemas/tasa-schema.ts`
- Componentes de tasa de cambio

Ahora `tasas_cambio.moneda_id` es FK a la tabla `monedas` en vez de un string libre.

---

## Fase 2 — Renombrar tablas

### 2.1 `metodos_pago` → `metodos_cobro`

**Archivos a modificar**:

| Archivo | Cambios |
|---------|---------|
| `src/features/configuracion/hooks/use-payment-methods.ts` | Queries: `FROM metodos_pago` → `FROM metodos_cobro`. Campos nuevos: `tipo`, `moneda_id` (FK), `banco_empresa_id`, `requiere_referencia`, `saldo_actual` |
| `src/features/configuracion/schemas/payment-method-schema.ts` | Agregar campos nuevos al Zod schema. `moneda` (string) → `moneda_id` (UUID) |
| `src/features/configuracion/components/payment-methods/` | Actualizar formularios y listas |
| `src/routes/_app/configuracion/metodos-pago.tsx` | Actualizar imports si cambian nombres de hooks |
| `src/features/ventas/hooks/use-ventas.ts` | `metodo_pago_id` → `metodo_cobro_id` en queries de pagos |

### 2.2 `bancos` → `bancos_empresa`

**Archivos a modificar**:

| Archivo | Cambios |
|---------|---------|
| `src/features/configuracion/hooks/use-bancos.ts` | `FROM bancos` → `FROM bancos_empresa`. Columnas: `banco` → `nombre_banco`, `numero_cuenta` → `nro_cuenta`, `cedula_rif` → `titular_documento`. Campos nuevos: `tipo_cuenta`, `titular`, `moneda_id`, `saldo_actual` |
| `src/features/configuracion/schemas/banco-schema.ts` | Reestructurar Zod schema completo |
| `src/features/configuracion/components/bancos/` | Actualizar formularios y listas |

### 2.3 `detalle_venta` → `ventas_det`

**Archivos a modificar**:

| Archivo | Cambios |
|---------|---------|
| `src/features/ventas/hooks/use-ventas.ts` | `FROM detalle_venta` → `FROM ventas_det`. Campos nuevos: `deposito_id`, `tipo_impuesto`, `impuesto_pct`, `subtotal_usd`, `subtotal_bs`, `lote_id` |
| `src/features/reportes/hooks/use-ventas-reportes.ts` | Misma tabla renombrada |

### 2.4 `compras` / `detalle_compra` → `facturas_compra` / `facturas_compra_det`

**Archivos a modificar**:

| Archivo | Cambios |
|---------|---------|
| `src/features/inventario/hooks/use-compras.ts` | Reescribir completamente. El modelo nuevo es mucho mas complejo: `nro_control`, desglose fiscal (`total_exento_usd`, `total_base_usd`, `total_iva_usd`, `total_igtf_usd`), `status` (BORRADOR/PROCESADA/ANULADA), `saldo_pend_usd` |
| `src/features/inventario/schemas/compra-schema.ts` | Reescribir Zod schema |
| Componentes de compras | Reescribir formularios |
| `src/routes/_app/inventario/compras.tsx` | Actualizar ruta |

---

## Fase 3 — Estructura de ventas (campos nuevos)

La tabla `ventas` cambio significativamente. Ya no tiene campo `anulada` booleano; ahora usa `status` (BORRADOR/PROCESADA/ANULADA).

### 3.1 Actualizar hook `use-ventas.ts`

**Cambios**:
- `anulada = 0` → `status != 'ANULADA'` en queries
- Agregar campos: `deposito_id`, `sesion_caja_id`, `moneda_id`, `num_control`, `total_exento_usd`, `total_base_usd`, `total_iva_usd`, `total_igtf_usd`, `status`, `created_by`
- Eliminar campo `anulada`
- Actualizar pagos: `metodo_pago_id` → `metodo_cobro_id`, `moneda` (string) → `moneda_id` (FK), agregar `sesion_caja_id`, `banco_empresa_id`

### 3.2 Actualizar hook `use-notas-credito.ts`

**Cambios**:
- Agregar campos: `tipo` (DEVOLUCION/DESCUENTO/ANULACION), `moneda_id`, `total_exento_usd`, `total_base_usd`, `total_iva_usd`, `afecta_inventario`
- Eliminar `monto_total_usd`/`monto_total_bs` → usar `total_usd`/`total_bs`
- Agregar soporte para `notas_credito_det` (detalle por linea)

### 3.3 Actualizar schema `venta-schema.ts`

Ajustar el Zod schema para incluir los campos nuevos y la validacion fiscal (exento/gravable/IVA/IGTF).

---

## Fase 4 — Proveedores (campos nuevos)

### 4.1 Actualizar hook `use-proveedores.ts`

**Campos nuevos**: `tipo_persona_id`, `nombre_comercial`, `ciudad`, `email`, `tipo_contribuyente`, `concepto_islr_id`, `retencion_iva_pct`, `dias_credito`, `limite_credito_usd`, `saldo_actual`, `created_by`, `updated_by`

### 4.2 Actualizar schema `proveedor-schema.ts`

Agregar validaciones Zod para los campos fiscales y de credito nuevos.

### 4.3 Actualizar componentes de proveedores

El formulario de proveedor ahora es mas complejo: incluye datos fiscales (tipo contribuyente, retenciones IVA/ISLR), credito (dias, limite), y datos de contacto expandidos.

---

## Fase 5 — Departamentos y productos (campos nuevos)

### 5.1 Departamentos

**Campos nuevos**: `parent_id` (jerarquia), `slug`, `descripcion`, `imagen_url`, `prioridad_visual`, `created_by`, `updated_by`

No es obligatorio implementar la jerarquia de inmediato, pero el schema y types deben reflejar los campos.

### 5.2 Productos

**Campos nuevos**: `marca_id`, `unidad_base_id`, `costo_promedio`, `costo_ultimo`, `tipo_impuesto` (Gravable/Exento/Exonerado), `impuesto_iva_id`, `impuesto_igtf_id`, `maneja_lotes`, `created_by`, `updated_by`

**Campo eliminado**: `medida` (string) → reemplazado por `unidad_base_id` (FK a tabla `unidades`)

---

## Fase 6 — Empresa (campos nuevos)

### 6.1 Actualizar hook `use-company.ts`

**Campos nuevos**: `tenant_id`, `logo_url`, `timezone`, `moneda_base`, `config` (JSON)

**Campos eliminados**: `nro_fiscal`, `regimen`

### 6.2 Crear hook para `empresas_fiscal_ve`

La informacion fiscal de la empresa ahora vive en tabla separada. Crear:
- `src/features/configuracion/hooks/use-empresa-fiscal.ts`
- Campos: `tipo_contribuyente`, `es_agente_retencion`, `documento_identidad`, `nro_providencia`, `porcentaje_retencion_iva`, `usa_maquina_fiscal`, `aplica_igtf`

---

## Fase 7 — Modulos nuevos (hooks + schemas + componentes)

Estas tablas no existian antes. Requieren crear archivos desde cero.

### 7.1 Configuracion

| Entidad | Hook | Schema | Componentes |
|---------|------|--------|-------------|
| Cajas | `use-cajas.ts` | `caja-schema.ts` | CRUD: nombre, ubicacion, deposito_id |
| Impuestos VE | `use-impuestos.ts` | `impuesto-schema.ts` | CRUD: IVA, IGTF con porcentajes |

### 7.2 Inventario

| Entidad | Hook | Schema | Componentes |
|---------|------|--------|-------------|
| Marcas | `use-marcas.ts` | `marca-schema.ts` | CRUD simple |
| Unidades | `use-unidades.ts` | `unidad-schema.ts` | CRUD: nombre, abreviatura, es_decimal |
| Conversiones | `use-unidades-conversion.ts` | `conversion-schema.ts` | Factor de conversion entre unidades |
| Depositos | `use-depositos.ts` | `deposito-schema.ts` | CRUD: nombre, direccion, es_principal |
| Inventario Stock | `use-inventario-stock.ts` | — | Read-only: stock por producto/deposito |
| Ajustes | `use-ajustes.ts` | `ajuste-schema.ts` | Crear ajustes con detalle |
| Motivos Ajuste | `use-ajuste-motivos.ts` | `ajuste-motivo-schema.ts` | Catalogo de motivos |
| Lotes | `use-lotes.ts` | `lote-schema.ts` | Gestion de lotes por producto |

### 7.3 Caja / Tesoreria

| Entidad | Hook | Schema | Componentes |
|---------|------|--------|-------------|
| Sesiones Caja | `use-sesiones-caja.ts` | `sesion-caja-schema.ts` | Apertura/cierre de caja |
| Mov. Metodo Cobro | `use-mov-metodo-cobro.ts` | — | Read-only: libro auxiliar |
| Mov. Bancarios | `use-mov-bancarios.ts` | — | Read-only: libro auxiliar bancario |

### 7.4 Ventas

| Entidad | Hook | Schema | Componentes |
|---------|------|--------|-------------|
| Notas Debito | `use-notas-debito.ts` | `nota-debito-schema.ts` | Crear ND con detalle |
| Retenciones IVA Ventas | `use-ret-iva-ventas.ts` | `ret-iva-venta-schema.ts` | Registrar retenciones del cliente |
| Retenciones ISLR Ventas | `use-ret-islr-ventas.ts` | `ret-islr-venta-schema.ts` | Registrar retenciones del cliente |
| Vencimientos CxC | `use-vencimientos-cobrar.ts` | — | Calendario de cobros |

### 7.5 Compras / CxP

| Entidad | Hook | Schema | Componentes |
|---------|------|--------|-------------|
| Proveedores Bancos | `use-proveedores-bancos.ts` | `proveedor-banco-schema.ts` | Cuentas bancarias del proveedor |
| Retenciones IVA Compras | `use-ret-iva-compras.ts` | `ret-iva-compra-schema.ts` | Comprobantes de retencion |
| Retenciones ISLR Compras | `use-ret-islr-compras.ts` | `ret-islr-compra-schema.ts` | Comprobantes de retencion |
| Notas Fiscales Compra | `use-notas-fiscales-compra.ts` | `nota-fiscal-compra-schema.ts` | NC/ND del proveedor |
| Mov. Cuenta Proveedor | `use-mov-cuenta-proveedor.ts` | — | Read-only: libro auxiliar CxP |
| Vencimientos CxP | `use-vencimientos-pagar.ts` | — | Calendario de pagos |

### 7.6 Contabilidad

| Entidad | Hook | Schema | Componentes |
|---------|------|--------|-------------|
| Plan de Cuentas | `use-plan-cuentas.ts` | `cuenta-schema.ts` | CRUD jerarquico |
| Gastos | `use-gastos.ts` | `gasto-schema.ts` | Registro de egresos operativos |

---

## Fase 8 — Rutas y navegacion

### 8.1 Sidebar

Actualizar `src/components/layout/sidebar.tsx` para incluir nuevas secciones:
- Configuracion: agregar Cajas, Impuestos
- Inventario: agregar Marcas, Unidades, Depositos, Ajustes, Lotes
- Caja: nueva seccion con Sesiones, Movimientos
- Compras: nueva seccion (actualmente vive dentro de Inventario)
- Contabilidad: nueva seccion con Plan de Cuentas, Gastos

### 8.2 Rutas nuevas

Crear archivos de ruta en `src/routes/_app/`:

```
configuracion/
  cajas.tsx
  impuestos.tsx
inventario/
  marcas.tsx
  unidades.tsx
  depositos.tsx
  ajustes.tsx
  lotes.tsx
caja/
  sesiones.tsx
  movimientos.tsx
compras/
  facturas.tsx
  retenciones.tsx
  notas-fiscales.tsx
contabilidad/
  plan-cuentas.tsx
  gastos.tsx
```

---

## Fase 9 — Dashboard y reportes

### 9.1 Dashboard

Actualizar `use-dashboard.ts` para usar nombres de tabla correctos (`ventas_det`, `is_active`).

### 9.2 Cuadre de caja

Actualizar `use-cuadre.ts` para:
- Usar `metodos_cobro` en vez de `metodos_pago`
- Integrar con `sesiones_caja` y `sesiones_caja_detalle`
- Usar `movimientos_metodo_cobro` para saldos

### 9.3 Reportes de ventas

Actualizar `use-ventas-reportes.ts`:
- `detalle_venta` → `ventas_det`
- `anulada = 0` → `status != 'ANULADA'`

### 9.4 Reportes de inventario

Actualizar `use-inventario-reportes.ts`:
- `activo` → `is_active`
- Agregar soporte para reportes por deposito (multi-deposito)

---

## Orden de ejecucion recomendado

```
Fase 0 (bloqueante)
  ├── 0.1 useCurrentUser (rol_id)
  ├── 0.2 usePermissions (RBAC)
  ├── 0.3 connector.ts (metodos edge)
  └── 0.4 Edge Functions (register-owner, create/update-employee)

Fase 1 (buscar-reemplazar)
  ├── 1.1 activo → is_active (global)
  ├── 1.2 nombre_social → nombre (clientes)
  ├── 1.3 limite_credito → limite_credito_usd (clientes)
  └── 1.4 moneda_destino → moneda_id (tasas)

Fase 2 (renombrar tablas)
  ├── 2.1 metodos_pago → metodos_cobro
  ├── 2.2 bancos → bancos_empresa
  ├── 2.3 detalle_venta → ventas_det
  └── 2.4 compras → facturas_compra

Fase 3 (campos nuevos ventas)
Fase 4 (campos nuevos proveedores)
Fase 5 (campos nuevos inventario)
Fase 6 (campos nuevos empresa)
Fase 7 (modulos nuevos - incremental)
Fase 8 (rutas y navegacion)
Fase 9 (dashboard y reportes)
```

---

## Resumen de impacto

| Categoria | Archivos existentes a modificar | Archivos nuevos a crear |
|-----------|---:|---:|
| Core (hooks, auth, connector) | 4 | 0 |
| Edge Functions | 3 | 0 |
| Hooks de features | 18 | ~20 |
| Schemas Zod | 10 | ~15 |
| Componentes | ~15 | ~25 |
| Rutas | ~8 | ~12 |
| **Total** | **~58** | **~72** |
