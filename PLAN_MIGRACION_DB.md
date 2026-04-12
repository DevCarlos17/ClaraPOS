# Plan de Estructura de Base de Datos - ClaraPOS

**Fecha**: 2026-04-11
**Base**: REVISION_ARQUITECTONICA_DB.md + aclaraciones del propietario
**Estado**: IMPLEMENTADO

> **NOTA IMPORTANTE**: Este plan NO es una migracion de datos existentes. El sistema actual esta en modo piloto/desarrollo. Los datos en Supabase y las tablas actuales **no necesitan preservarse**. Este documento describe la **estructura nueva completa** de la base de datos que se creo desde cero.

---

## 0. Aclaraciones del Propietario (Incorporadas)

Antes de detallar el plan, se documentan las aclaraciones recibidas que corrigen interpretaciones del documento de revision:

### AC-1: `table_apps` es un catalogo puro

- **Lo que dice la revision**: Se interpreta como que vincula tenants con apps.
- **Aclaracion**: `apps` es solamente un listado de las aplicaciones disponibles en el ecosistema (ClaraPOS, NexoAudit, etc.). **No indica** que tenants estan suscritos a que apps. La relacion tenant-app se establece en `tenant_app_access`.
- **Impacto en implementacion**: La tabla `apps` no necesita FK a tenants. Es una tabla global de catalogo sin `empresa_id` ni `tenant_id`.

### AC-2: `table_planes` necesita campo de dias exactos

- **Aclaracion**: Ademas del nombre del plan e intervalo, se requiere un campo `duracion_dias INT NOT NULL` que indique los dias exactos de vigencia del plan.
- **Impacto en implementacion**: Agregar `duracion_dias INT NOT NULL CHECK (duracion_dias > 0)` a la tabla `planes`.

### AC-3: `table_usuarios_permisos` debe ser por tenant, no global

- **Lo que dice la revision**: Catalogo global de permisos con `slug UNIQUE` compartido por todos los tenants.
- **Aclaracion**: Los permisos deben poder personalizarse por tenant. Cada tenant podria tener su propio set de permisos disponibles.
- **Impacto en implementacion**: Se necesita una estrategia hibrida:
  - Tabla `permisos` global con el catalogo maestro (slugs base del sistema).
  - Tabla `tenant_permisos` que controle cuales permisos estan habilitados para cada tenant.
  - Asi un tenant puede desactivar permisos que no aplican a su negocio sin afectar a otros tenants.
- **Alternativa evaluada**: Hacer `permisos` por tenant (con `tenant_id`) fue descartada porque causaria duplicacion masiva de registros identicos y dificultaria actualizaciones globales del sistema.

### AC-4: `table_monedas` - Predefinidas globales (DECIDIDO: Opcion A)

- **Decision**: Opcion A - Predefinidas globales
- Tabla global sin `tenant_id` ni `empresa_id`
- Seed con monedas ISO 4217: USD, VES, EUR, COP
- Solo un admin de plataforma puede agregar monedas
- **Implementado en**: `0003_fiscal_monedas.sql`

### AC-5: `table_inventario_kardex` - Escalabilidad y archivado

- **Preocupacion**: Evaluar si conviene migrar/archivar datos del kardex cuando supere cierto volumen en un periodo de tiempo.
- **Evaluacion tecnica**:

| Estrategia                 | Descripcion                                                | Viabilidad con PowerSync                                             |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| **Particionado por fecha** | Particiones anuales (kardex_2025, kardex_2026)             | Media - PowerSync puede no soportar tablas particionadas nativamente |
| **Archivado a tabla fria** | Mover registros >12 meses a `kardex_archivo`               | Alta - Simple, no afecta PowerSync (la tabla fria no se sincroniza)  |
| **Soft-archivado**         | Flag `archivado BOOLEAN` + excluir del sync                | Alta - Solo se sincronizan registros recientes                       |
| **Paginacion temporal**    | Frontend solo consulta ultimos N meses, backend tiene todo | Alta - Sin cambio en DB, solo logica de sync rules                   |

- **Decision**: Empezar con **paginacion temporal en sync rules** (solo sincronizar kardex de los ultimos **6 meses** a SQLite). Cuando un tenant supere **~500K registros**, implementar **archivado a tabla fria** (`kardex_archivo`) con un proceso batch mensual.

---

## 1. Resumen de Archivos Creados

La estructura se divide en **8 archivos SQL** ordenados por dependencia. Todos los archivos estan creados en `migrations/`.

| Archivo | Tablas | Estado | Descripcion |
| ------- | ------ | ------ | ----------- |
| `0001_foundation_saas.sql` | 9 | CREADO | Funciones utilitarias, tenants, apps, planes, suscripciones, empresas, empresas_fiscal_ve |
| `0002_auth_rbac.sql` | 5 | CREADO | permisos, tenant_permisos, roles, usuarios, rol_permisos + funciones RBAC + seed 30 permisos |
| `0003_fiscal_monedas.sql` | 4 | CREADO | monedas, tipos_persona_ve, impuestos_ve, islr_conceptos_ve + seeds |
| `0004_inventario.sql` | 14 | CREADO | departamentos, marcas, unidades, unidades_conversion, depositos, productos, inventario_stock, tipos_movimiento, movimientos_inventario, ajuste_motivos, ajustes, ajustes_det, lotes, recetas |
| `0005_caja_tesoreria.sql` | 7 | CREADO | bancos_empresa, metodos_cobro, cajas, sesiones_caja, sesiones_caja_detalle, movimientos_bancarios, movimientos_metodo_cobro |
| `0006_ventas.sql` | 13 | CREADO | tasas_cambio, clientes, movimientos_cuenta, ventas, ventas_det, pagos, notas_credito, notas_credito_det, notas_debito, notas_debito_det, retenciones_iva_ventas, retenciones_islr_ventas, vencimientos_cobrar |
| `0007_compras.sql` | 10 | CREADO | proveedores, proveedores_bancos, facturas_compra, facturas_compra_det, retenciones_iva, retenciones_islr, notas_fiscales_compra, notas_fiscales_compra_det, movimientos_cuenta_proveedor, vencimientos_pagar |
| `0008_contabilidad.sql` | 2 | CREADO | plan_cuentas, gastos |
| **TOTAL** | **~64** | | |

---

## 2. Decisiones Aprobadas

Todas las decisiones fueron aprobadas por el propietario antes de implementar:

| # | Decision | Resultado |
| - | -------- | --------- |
| D1 | Monedas predefinidas o por tenant | **Opcion A: Global** - Monedas predefinidas ISO 4217 sin tenant_id |
| D2 | Periodo de sync del kardex en PowerSync | **6 meses** - Balance entre datos offline y rendimiento |
| D3 | Umbral de archivado del kardex | **500K registros** por empresa |
| D4 | Ejecutar capa SaaS ahora o postergar | **Ahora** - La estructura no afecta operacion actual |

---

## 3. Correcciones Arquitectonicas Aplicadas

Las siguientes correcciones del documento de revision original se aplicaron en **todos** los archivos SQL:

- **`empresa_id NOT NULL`** en todas las tablas de negocio
- **`UNIQUE(empresa_id, campo)`** en lugar de UNIQUE global (departamentos, productos, clientes, proveedores, ventas, notas_credito, etc.)
- **Funcion generica `prevent_mutation()`** con `TG_TABLE_NAME` para mensajes contextuales (definida en `0001_foundation_saas.sql`)
- **RLS con `current_empresa_id()`** en todas las tablas de negocio (funcion SECURITY DEFINER en `0002_auth_rbac.sql`)
- **Saldos via trigger** con `set_config('clarapos.trigger_context', ...)` para evitar conflictos con validaciones de saldo directo

---

## 4. Detalle por Archivo SQL

### 4.1 `0001_foundation_saas.sql`

**Depende de**: Ninguno (primer archivo)
**Tablas**: tenants, apps, planes, suscripciones, pagos_suscripcion, tenant_app_access, plataforma_metodos_pago, empresas, empresas_fiscal_ve
**Funciones**: `update_updated_at()`, `prevent_mutation()`
**Seed**: apps (clarapos, claraclinic)
**Notas**: RLS habilitado en empresas/empresas_fiscal_ve pero policies se aplican en 0002 (necesita `current_empresa_id()` que requiere tabla `usuarios`)

### 4.2 `0002_auth_rbac.sql`

**Depende de**: 0001 (empresas, tenants)
**Tablas**: permisos, tenant_permisos, roles, usuarios, rol_permisos
**Funciones**: `current_empresa_id()`, `current_tenant_id()`, `user_has_permission(p_slug)`, `handle_new_user()`
**Seed**: 30 permisos en 10 modulos (inventario, ventas, clientes, compras, caja, reportes, configuracion, contabilidad, cxc/cxp, clinica)
**Notas**: Aplica las RLS policies diferidas de 0001. Agrega FKs de auditoria (`created_by`/`updated_by`) a roles, usuarios, empresas_fiscal_ve.

### 4.3 `0003_fiscal_monedas.sql`

**Depende de**: 0001 (empresas), 0002 (usuarios)
**Tablas**: monedas, tipos_persona_ve, impuestos_ve, islr_conceptos_ve
**Seed**: 4 monedas (USD, VES, EUR, COP), 6 tipos persona (V,E,J,G,P,C con regex), 7 conceptos ISLR
**Decision D1 aplicada**: Monedas globales predefinidas (sin tenant_id)

### 4.4 `0004_inventario.sql`

**Depende de**: 0002 (usuarios), 0003 (monedas, impuestos_ve)
**Tablas**: departamentos (jerarquico con parent_id), marcas, unidades, unidades_conversion, depositos, productos (mejorado con marca, unidad, impuestos, costos), inventario_stock, tipos_movimiento, movimientos_inventario (kardex mejorado), ajuste_motivos, ajustes, ajustes_det, lotes, recetas
**Seed**: 8 tipos de movimiento
**Triggers clave**: `validate_departamento_update` (codigo inmutable), `validate_producto_update` (codigo+tipo inmutable), `validate_movimiento_inventario_insert` (consistencia matematica), `actualizar_inventario_stock` (upsert stock + update legacy)

### 4.5 `0005_caja_tesoreria.sql`

**Depende de**: 0003 (monedas), 0004 (depositos)
**Tablas**: bancos_empresa, metodos_cobro (reemplaza metodos_pago), cajas, sesiones_caja, sesiones_caja_detalle, movimientos_bancarios, movimientos_metodo_cobro
**Triggers clave**: `validate_sesion_caja_insert` (solo una ABIERTA por caja), `actualizar_saldo_banco`, `prevent_mov_bancario_mutation` (inmutable post-validacion, solo validado FALSE->TRUE), `actualizar_saldo_metodo_cobro`

### 4.6 `0006_ventas.sql`

**Depende de**: 0002 (usuarios), 0003 (monedas, impuestos_ve, islr_conceptos_ve, tipos_persona_ve), 0004 (productos, depositos, lotes), 0005 (metodos_cobro, sesiones_caja, bancos_empresa)
**Tablas**: tasas_cambio, clientes (mejorado con fiscal VE), movimientos_cuenta (CxC), ventas (mejorado con desglose fiscal), ventas_det (con impuestos por linea), pagos (mejorado con sesion_caja/banco), notas_credito (total+parcial), notas_credito_det, notas_debito, notas_debito_det, retenciones_iva_ventas, retenciones_islr_ventas, vencimientos_cobrar
**Triggers clave**: `validate_cliente_update` (identificacion inmutable, saldo solo via trigger), `actualizar_saldo_cliente`, `prevent_venta_mutation` (solo saldo_pend_usd y status), `validate_nota_credito_insert` (suma NC <= total venta), inmutabilidad parcial en retenciones (solo status PENDIENTE->DECLARADO)

### 4.7 `0007_compras.sql`

**Depende de**: 0002 (usuarios), 0003 (monedas, tipos_persona_ve, islr_conceptos_ve), 0004 (productos, depositos, lotes), 0005 (metodos_cobro, bancos_empresa)
**Tablas**: proveedores (mejorado con fiscal VE, credito, saldo), proveedores_bancos, facturas_compra (con desglose fiscal), facturas_compra_det, retenciones_iva, retenciones_islr, notas_fiscales_compra (NC/ND del proveedor), notas_fiscales_compra_det, movimientos_cuenta_proveedor (CxP), vencimientos_pagar
**Triggers clave**: `validate_proveedor_update` (RIF inmutable, saldo solo via trigger), `prevent_factura_compra_mutation` (BORRADOR->PROCESADA->ANULADA), `actualizar_saldo_proveedor`, inmutabilidad parcial en retenciones

### 4.8 `0008_contabilidad.sql`

**Depende de**: 0003 (monedas), 0005 (metodos_cobro, bancos_empresa), 0007 (proveedores)
**Tablas**: plan_cuentas (jerarquico con parent_id), gastos
**Triggers clave**: `validate_plan_cuentas_update` (codigo inmutable), `validate_gasto_insert` (solo cuentas detalle aceptan gastos), `prevent_gasto_mutation` (solo anulacion permitida)

---

## 5. Orden de Ejecucion y Dependencias

```
0001_foundation_saas -- sin dependencias, ejecutar primero
    |
    v
0002_auth_rbac -- depende de 0001 (empresas, tenants)
    |
    v
0003_fiscal_monedas -- depende de 0001 (empresas), 0002 (usuarios)
    |
    +------+------+
    |             |
    v             v
0004_inventario  0005_caja_tesoreria
    |             |
    +------+------+
           |
    +------+------+
    |             |
    v             v
0006_ventas     0007_compras
    |             |
    +------+------+
           |
           v
     0008_contabilidad
```

**Orden de ejecucion en SQL Editor**: 0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006 -> 0007 -> 0008

---

## 6. Convencion de Nombres

| Elemento           | Convencion                                     | Ejemplo                                          |
| ------------------ | ---------------------------------------------- | ------------------------------------------------ |
| Tablas             | snake_case, plural                             | `productos`, `facturas_compra`                   |
| PKs                | `id` (UUID v4)                                 | `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` |
| FKs                | `<tabla_singular>_id` (no `id_<tabla>`)        | `producto_id`, `empresa_id`                      |
| Booleanos          | `is_<adjetivo>` o verbo descriptivo            | `is_active`, `permite_venta`                     |
| Timestamps         | `created_at`, `updated_at`                     | `TIMESTAMPTZ NOT NULL DEFAULT NOW()`             |
| Auditoria          | `created_by`, `updated_by`                     | `UUID REFERENCES usuarios(id)`                   |
| Indices            | `idx_<tabla>_<columnas>`                       | `idx_productos_empresa_codigo`                   |
| Constraints UNIQUE | `uq_<tabla>_<columnas>`                        | `uq_productos_empresa_codigo`                    |
| RLS Policies       | `<accion>_own_empresa`                         | `select_own_empresa`                             |
| Triggers           | `trg_<tabla>_<evento>`                         | `trg_kardex_no_update`                           |

---

## 7. Evaluacion de Tablas Solicitadas

> Esta seccion documenta la evaluacion de necesidad de las 17 tablas adicionales solicitadas por el propietario. Todas fueron incorporadas en los archivos SQL.

| #   | Tabla solicitada             | Veredicto              | Archivo donde se implemento |
| --- | ---------------------------- | ---------------------- | --------------------------- |
| 1   | Facturas de venta            | **MEJORAR EXISTENTE**  | `0006_ventas.sql` (tabla `ventas`) |
| 2   | Detalle de facturas          | **MEJORAR EXISTENTE**  | `0006_ventas.sql` (tabla `ventas_det`) |
| 3   | Retenciones IVA ventas       | **NUEVA, NECESARIA**   | `0006_ventas.sql` |
| 4   | Retenciones ISLR ventas      | **NUEVA, NECESARIA**   | `0006_ventas.sql` |
| 5   | Notas credito ventas         | **MEJORAR EXISTENTE**  | `0006_ventas.sql` (soporte parcial + detalle) |
| 6   | Detalle de notas credito     | **NUEVA, NECESARIA**   | `0006_ventas.sql` |
| 7   | Notas debito ventas          | **NUEVA, NECESARIA**   | `0006_ventas.sql` |
| 8   | Detalle de notas debito      | **NUEVA, NECESARIA**   | `0006_ventas.sql` |
| 9   | Cuadre de caja               | **NUEVA, NECESARIA**   | `0005_caja_tesoreria.sql` |
| 10  | Metodos de cobro             | **MEJORAR EXISTENTE**  | `0005_caja_tesoreria.sql` (renombrado de `metodos_pago`) |
| 11  | Bancos empresa               | **NUEVA, NECESARIA**   | `0005_caja_tesoreria.sql` |
| 12  | Movimientos bancarios        | **NUEVA, NECESARIA**   | `0005_caja_tesoreria.sql` |
| 13  | Estados de cuenta por metodo | **NUEVA, NECESARIA**   | `0005_caja_tesoreria.sql` (`movimientos_metodo_cobro`) |
| 14  | Cuentas por pagar            | **NUEVA, NECESARIA**   | `0007_compras.sql` (`movimientos_cuenta_proveedor` + `vencimientos_pagar`) |
| 15  | Cuentas por cobrar           | **MEJORAR EXISTENTE**  | `0006_ventas.sql` (`vencimientos_cobrar`) |
| 16  | Inventario por lotes         | **NUEVA, RECOMENDADA** | `0004_inventario.sql` (tabla `lotes`) |
| 17  | Cuentas contables (gastos)   | **NUEVA, NECESARIA**   | `0008_contabilidad.sql` |

**Resultado**: 7 tablas mejoradas + 16 tablas nuevas = **23 tablas** adicionales incorporadas.

---

## 8. Tablas Inmutables (Consolidado)

Todas estas tablas tienen triggers `prevent_mutation()` para UPDATE y DELETE:

| Tabla                           | Excepcion a inmutabilidad                                                     |
| ------------------------------- | ----------------------------------------------------------------------------- |
| tasas_cambio                    | Ninguna                                                                       |
| movimientos_inventario (kardex) | Ninguna                                                                       |
| movimientos_cuenta              | Ninguna                                                                       |
| movimientos_cuenta_proveedor    | Ninguna                                                                       |
| movimientos_metodo_cobro        | Ninguna                                                                       |
| movimientos_bancarios           | Solo UPDATE de `validado` (FALSE->TRUE, irreversible)                         |
| ventas                          | Solo UPDATE de `saldo_pend_usd` (solo baja) y `status` (solo ACTIVA->ANULADA) |
| ventas_det                      | Ninguna                                                                       |
| pagos                           | Ninguna                                                                       |
| notas_credito                   | Ninguna                                                                       |
| notas_credito_det               | Ninguna                                                                       |
| notas_debito                    | Ninguna                                                                       |
| notas_debito_det                | Ninguna                                                                       |
| retenciones_iva_ventas          | Solo UPDATE de `status` (PENDIENTE->DECLARADO)                                |
| retenciones_islr_ventas         | Solo UPDATE de `status` (PENDIENTE->DECLARADO)                                |
| facturas_compra                 | Solo UPDATE de `status` (BORRADOR->PROCESADA->ANULADA)                        |
| retenciones_iva (compras)       | Solo UPDATE de `status` (PENDIENTE->DECLARADO)                                |
| retenciones_islr (compras)      | Solo UPDATE de `status` (PENDIENTE->DECLARADO)                                |
| gastos                          | Solo UPDATE de `status` (REGISTRADO->ANULADO)                                 |

---

## 9. Diagrama de Relaciones Completo

```
PLATAFORMA:
  tenants --1:N--> empresas
  tenants --1:N--> suscripciones --N:1--> planes --N:1--> apps
  tenants --1:N--> tenant_app_access --N:1--> apps
  tenants --1:N--> tenant_permisos --N:1--> permisos

EMPRESA + AUTH:
  empresas --1:N--> usuarios --N:1--> roles --N:N--> permisos (via rol_permisos)
  empresas --1:1--> empresas_fiscal_ve

INVENTARIO:
  empresas --1:N--> departamentos (jerarquico)
  empresas --1:N--> productos --N:1--> departamentos, marcas, unidades
  empresas --1:N--> depositos
  productos + depositos --> inventario_stock, kardex, lotes
  productos --1:N--> recetas (BOM servicios)

CAJA Y TESORERIA:
  empresas --1:N--> cajas --1:N--> sesiones_caja --1:N--> sesiones_caja_detalle
  empresas --1:N--> bancos_empresa --1:N--> movimientos_bancarios
  empresas --1:N--> metodos_cobro --N:1--> bancos_empresa
  metodos_cobro --1:N--> movimientos_metodo_cobro

VENTAS:
  empresas --1:N--> clientes --1:N--> ventas
  ventas --1:N--> ventas_det --N:1--> productos, depositos, lotes
  ventas --1:N--> pagos --N:1--> metodos_cobro, monedas
  ventas --1:N--> notas_credito --1:N--> notas_credito_det
  ventas --1:N--> notas_debito --1:N--> notas_debito_det
  ventas --1:N--> retenciones_iva_ventas, retenciones_islr_ventas
  ventas --1:N--> vencimientos_cobrar

CXC:
  clientes --1:N--> movimientos_cuenta (libro auxiliar)

COMPRAS:
  empresas --1:N--> proveedores --1:N--> facturas_compra
  facturas_compra --1:N--> facturas_compra_det
  facturas_compra --1:N--> retenciones_iva, retenciones_islr
  facturas_compra --1:N--> notas_fiscales_compra --1:N--> notas_fiscales_compra_det
  facturas_compra --1:N--> vencimientos_pagar

CXP:
  proveedores --1:N--> movimientos_cuenta_proveedor (libro auxiliar)

CONTABILIDAD:
  empresas --1:N--> plan_cuentas (jerarquico)
  empresas --1:N--> gastos --N:1--> plan_cuentas, metodos_cobro, bancos_empresa
```

---

## 10. Conteo Total de Tablas

| Dominio              | Tablas  | Listado                                                                                                                                                     |
| -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plataforma SaaS**  | 7       | tenants, apps, planes, suscripciones, pagos_suscripcion, tenant_app_access, plataforma_metodos_pago                                                         |
| **Empresa + Auth**   | 3       | empresas, empresas_fiscal_ve, usuarios                                                                                                                      |
| **RBAC**             | 4       | permisos, tenant_permisos, roles, rol_permisos                                                                                                              |
| **Fiscal**           | 4       | monedas, tipos_persona_ve, impuestos_ve, islr_conceptos_ve                                                                                                  |
| **Inventario**       | 14      | departamentos, marcas, unidades, unidades_conversion, depositos, productos, inventario_stock, tipos_movimiento, movimientos_inventario, ajuste_motivos, ajustes, ajustes_det, lotes, recetas |
| **Caja y Tesoreria** | 7       | bancos_empresa, metodos_cobro, cajas, sesiones_caja, sesiones_caja_detalle, movimientos_bancarios, movimientos_metodo_cobro                                  |
| **Ventas + CxC**     | 13      | tasas_cambio, clientes, movimientos_cuenta, ventas, ventas_det, pagos, notas_credito, notas_credito_det, notas_debito, notas_debito_det, retenciones_iva_ventas, retenciones_islr_ventas, vencimientos_cobrar |
| **Compras + CxP**    | 10      | proveedores, proveedores_bancos, facturas_compra, facturas_compra_det, retenciones_iva, retenciones_islr, notas_fiscales_compra, notas_fiscales_compra_det, movimientos_cuenta_proveedor, vencimientos_pagar |
| **Contabilidad**     | 2       | plan_cuentas, gastos                                                                                                                                        |
| **TOTAL**            | **~64** |                                                                                                                                                             |

---

## 11. Checklist de Ejecucion

- [x] Decision D1 aprobada (monedas: global predefinidas)
- [x] Decision D2 aprobada (sync kardex: 6 meses)
- [x] Decision D3 aprobada (archivado: 500K registros)
- [x] Decision D4 aprobada (capa SaaS: ahora)
- [x] Archivo `0001_foundation_saas.sql` creado
- [x] Archivo `0002_auth_rbac.sql` creado
- [x] Archivo `0003_fiscal_monedas.sql` creado
- [x] Archivo `0004_inventario.sql` creado
- [x] Archivo `0005_caja_tesoreria.sql` creado
- [x] Archivo `0006_ventas.sql` creado
- [x] Archivo `0007_compras.sql` creado
- [x] Archivo `0008_contabilidad.sql` creado
- [ ] Ejecutar archivos en Supabase SQL Editor (en orden 0001-0008)
- [ ] Actualizar PowerSync schema (`front/src/core/db/powersync/schema.ts`)
- [ ] Actualizar Kysely types (`front/src/core/db/kysely/types.ts`)
- [ ] Actualizar PowerSync sync rules (`backend/powersync-sync-rules.yaml`)

---

_Plan completado. Todos los archivos SQL creados. Siguiente paso: ejecutar en Supabase y actualizar el frontend._
