# Plan de Implementacion - Analisis DB V2

> **Fecha**: 2026-04-13
> **Basado en**: `ANALISIS_DB_V2_REEVALUACION.md`
> **Objetivo**: Detallar cada cambio con dificultad, archivos afectados, SQL/codigo estimado y orden de ejecucion
> **Contexto**: Proyecto en desarrollo, sin datos de produccion. Se pueden DROP tablas sin migrar datos.

---

## Resumen de Dificultad Global

```
                    Esfuerzo   Riesgo    Impacto Frontend   Migraciones
Fase 1 (CRITICA)    Bajo       Bajo      Ninguno             1 SQL
Fase 2 (ALTA)       Medio      Bajo      Solo Edge Functions 1 SQL + 2 TS
Fase 3 (MEDIA)      Medio      Bajo      PowerSync + hooks   2-3 SQL + 6+ TS
```

**Dificultad total**: Media-Baja. Al estar en desarrollo sin datos de produccion, no hay migraciones de datos - solo DROP + CREATE. La mayoria son cambios SQL mecanicos (`CREATE OR REPLACE`, `ALTER TABLE`).

---

## Fase 1: CRITICA (1 dia)

> Solo SQL puro. Cero impacto en frontend. Corrige vulnerabilidades reales.

### 1. Fix race conditions en 4 triggers de saldo

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~1 hora |
| **Riesgo** | Bajo |
| **Archivo** | `migrations/0013_fix_race_conditions_saldo.sql` |
| **Impacto frontend** | Ninguno |

**Que se hace**: Agregar `FOR UPDATE` al `SELECT saldo_actual` en 4 triggers para lockear la fila durante la transaccion y evitar que dos escrituras concurrentes sobreescriban el saldo.

**Triggers afectados**:
- `actualizar_saldo_cliente()` (definida en `0006_ventas.sql`)
- `actualizar_saldo_proveedor()` (definida en `0007_compras.sql`)
- `actualizar_saldo_banco()` (definida en `0005_caja_tesoreria.sql`)
- `actualizar_saldo_metodo_cobro()` (definida en `0005_caja_tesoreria.sql`)

**Patron del cambio** (identico para las 4):

```sql
-- ANTES (vulnerable a race condition):
SELECT saldo_actual INTO NEW.saldo_anterior
FROM clientes WHERE id = NEW.cliente_id;

-- DESPUES (con lock):
SELECT saldo_actual INTO NEW.saldo_anterior
FROM clientes WHERE id = NEW.cliente_id
FOR UPDATE;
```

**Notas**:
- Son `CREATE OR REPLACE FUNCTION`, no rompen nada existente
- `FOR UPDATE` solo agrega un lock de fila dentro de la transaccion activa
- El trigger `actualizar_inventario_stock()` NO necesita fix (ya usa `ON CONFLICT DO UPDATE` atomico)

---

### 2. Fix RLS de `ajustes_det` y `sesiones_caja_detalle`

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~30 minutos |
| **Riesgo** | Bajo |
| **Archivo** | Misma migracion `0013` |
| **Impacto frontend** | Ninguno |

**Que se hace**: Las policies actuales usan `USING (true)` / `WITH CHECK (true)` - cualquier usuario autenticado ve todos los registros de todas las empresas. Cambiar a filtro por `empresa_id`.

**Estado actual** (en `0004_inventario.sql` y `0005_caja_tesoreria.sql`):

```sql
-- ACTUAL: abierto a todos
CREATE POLICY "select_all" ON ajustes_det FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_all" ON ajustes_det FOR INSERT TO authenticated WITH CHECK (true);
-- Idem para sesiones_caja_detalle
```

**Cambio**:

```sql
-- DROP policies abiertas
DROP POLICY IF EXISTS "select_all" ON ajustes_det;
DROP POLICY IF EXISTS "insert_all" ON ajustes_det;
DROP POLICY IF EXISTS "select_all" ON sesiones_caja_detalle;
DROP POLICY IF EXISTS "insert_all" ON sesiones_caja_detalle;

-- Recrear con filtro empresa_id
CREATE POLICY "select_empresa" ON ajustes_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_empresa" ON ajustes_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
-- Idem para sesiones_caja_detalle
```

**Notas**:
- Ambas tablas ya tienen `empresa_id` (agregado en migracion `0010`)
- `current_empresa_id()` ya existe (definida en `0002_auth_rbac.sql`)

---

### 3. Cambiar `ON DELETE CASCADE` a `RESTRICT` en FK a empresas

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil pero tedioso |
| **Esfuerzo** | ~2 horas |
| **Riesgo** | Bajo (solo cambia comportamiento de DELETE, que no deberia ejecutarse nunca) |
| **Archivo** | Misma migracion `0013` |
| **Impacto frontend** | Ninguno |

**Que se hace**: Cambiar TODAS las FK `empresa_id REFERENCES empresas(id) ON DELETE CASCADE` a `ON DELETE RESTRICT`. En un sistema financiero, una empresa nunca debe poder eliminarse si tiene datos.

**Tablas afectadas** (~25):

```
departamentos, marcas, unidades, unidades_conversion, depositos,
productos, inventario_stock, lotes, recetas, ajuste_motivos, ajustes,
bancos_empresa, metodos_cobro, cajas, sesiones_caja,
clientes, proveedores, proveedores_bancos,
tasas_cambio, ventas, facturas_compra,
notas_credito, notas_debito, notas_fiscales_compra,
plan_cuentas, gastos, roles,
retenciones_iva_ventas, retenciones_islr_ventas,
retenciones_iva, retenciones_islr,
empresas_fiscal_ve, impuestos_ve
```

**Patron del cambio** (repetir para cada tabla):

```sql
ALTER TABLE departamentos
  DROP CONSTRAINT departamentos_empresa_id_fkey,
  ADD CONSTRAINT departamentos_empresa_id_fkey
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;
```

**Notas**:
- Los nombres de constraint deben verificarse contra la DB real (`SELECT constraint_name FROM information_schema.table_constraints`)
- Si alguna constraint tiene nombre auto-generado por Supabase, hay que descubrirlo primero
- Tablas que ya son RESTRICT (no tocar): `ventas.cliente_id`, `ventas.deposito_id`, `pagos.venta_id`

---

### Resumen Fase 1

```
Migracion: 0013_fix_criticos.sql
Contenido:
  - 4x CREATE OR REPLACE FUNCTION (triggers saldo con FOR UPDATE)
  - 4x DROP POLICY + 4x CREATE POLICY (RLS ajustes_det + sesiones_caja_detalle)
  - ~25x ALTER TABLE (CASCADE -> RESTRICT)
Estimado: ~150 lineas SQL
Tiempo: 3-4 horas
Riesgo: Bajo
Test: Verificar que INSERT en movimientos_cuenta sigue funcionando, que ajustes_det filtra por empresa, que DELETE empresa falla si tiene datos
```

---

## Fase 2: ALTA (2-3 dias)

> SQL + Edge Functions. Sin impacto en componentes frontend (solo backend).

### 4. Fix `handle_new_user()` para metadata invalida

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~1 hora |
| **Riesgo** | Bajo |
| **Archivo** | `migrations/0014_fix_handle_new_user.sql` |
| **Impacto frontend** | Ninguno |

**Que se hace**: Agregar validaciones de NULL y existencia antes del INSERT en `usuarios`, para evitar que un auth user quede huerfano si `empresa_id` o `rol_id` son invalidos.

**Estado actual** (ultima version en `0011_add_telefono_usuarios.sql`):

```sql
-- Problema: si empresa_id es NULL o no existe, el INSERT falla
-- pero el auth user YA fue creado (trigger es AFTER INSERT)
INSERT INTO public.usuarios (id, email, nombre, empresa_id, rol_id, telefono)
VALUES (
  NEW.id, NEW.email,
  COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
  (NEW.raw_user_meta_data->>'empresa_id')::UUID,  -- puede ser NULL -> falla cast
  (NEW.raw_user_meta_data->>'rol_id')::UUID,       -- puede ser NULL -> falla FK
  NEW.raw_user_meta_data->>'telefono'
);
```

**Cambio**:

```sql
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id UUID;
  v_rol_id UUID;
BEGIN
  -- Extraer y validar empresa_id
  v_empresa_id := (NEW.raw_user_meta_data->>'empresa_id')::UUID;
  v_rol_id := (NEW.raw_user_meta_data->>'rol_id')::UUID;

  -- Si empresa_id faltante o invalido, no crear registro en usuarios
  -- (evita bloquear auth.users creation)
  IF v_empresa_id IS NULL THEN
    RAISE WARNING 'handle_new_user: empresa_id faltante para user %', NEW.id;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = v_empresa_id) THEN
    RAISE WARNING 'handle_new_user: empresa_id % no existe para user %', v_empresa_id, NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.usuarios (id, email, nombre, empresa_id, rol_id, telefono)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    v_empresa_id, v_rol_id,
    NEW.raw_user_meta_data->>'telefono'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Notas**:
- `RAISE WARNING` permite debugging via logs de Supabase sin romper el flow
- Si `empresa_id` falta, el auth user se crea pero sin registro en `usuarios` - preferible a un error que bloquea el registro completamente
- El flujo normal (via `register-owner` y `create-employee`) siempre envia metadata valida, esto es defensa en profundidad

---

### 5. Validar `permiso_ids` en `create-role`

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~30 minutos |
| **Riesgo** | Bajo |
| **Archivo** | `supabase/functions/create-role/index.ts` (lineas 139-149) |
| **Impacto frontend** | Ninguno (solo backend validation) |

**Que se hace**: Antes de insertar los `rol_permisos`, verificar que cada `permiso_id` existe en la tabla `permisos` y esta activo.

**Estado actual** (lineas 140-149):

```typescript
// ACTUAL: inserta directamente sin validar
const rolPermisos = permiso_ids.map((permisoId: string) => ({
  empresa_id: callerUser.empresa_id,
  rol_id: newRole.id,
  permiso_id: permisoId,
  granted_by: caller.id,
}));
await supabaseAdmin.from("rol_permisos").insert(rolPermisos);
```

**Cambio** (agregar antes del map):

```typescript
// Validar que todos los permiso_ids existen y estan activos
const { data: validPermisos } = await supabaseAdmin
  .from("permisos")
  .select("id")
  .in("id", permiso_ids)
  .eq("is_active", true);

if (!validPermisos || validPermisos.length !== permiso_ids.length) {
  // Rollback: eliminar el rol recien creado
  await supabaseAdmin.from("roles").delete().eq("id", newRole.id);
  return jsonResponse(
    { error: "Algunos permisos no son validos o estan inactivos" },
    400,
  );
}
```

**Notas**:
- La FK `rol_permisos.permiso_id -> permisos.id` ya previene IDs inexistentes a nivel DB
- Esta validacion agrega chequeo de `is_active` y un error descriptivo en vez de un 500 generico
- Si falla, hay que hacer rollback del rol creado en el paso anterior

---

### 6. Refactorizar `register-owner` a RPC transaccional

| Campo | Valor |
|-------|-------|
| **Dificultad** | Media-Alta |
| **Esfuerzo** | ~1 dia |
| **Riesgo** | Medio (toca flujo de registro critico) |
| **Archivos** | `migrations/0014_register_owner_rpc.sql` + `supabase/functions/register-owner/index.ts` |
| **Impacto frontend** | Ninguno (mismo endpoint, misma respuesta) |

**Que se hace**: Mover los pasos 1-6 de `register-owner` (todo excepto la creacion del auth user) a una funcion PL/pgSQL transaccional. La Edge Function solo llama al RPC + crea el auth user.

**Estado actual**: 7 operaciones secuenciales via API REST con rollback manual en cascada (lineas 52-326 de `register-owner/index.ts`). Si un paso intermedio falla y el DELETE de rollback tambien falla, quedan datos huerfanos.

**Funcion SQL nueva**:

```sql
CREATE OR REPLACE FUNCTION register_owner_setup(
  p_nombre_empresa TEXT,
  p_email TEXT,
  p_nombre TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_empresa_id UUID;
  v_admin_rol_id UUID;
  v_permisos_ids UUID[];
BEGIN
  -- 1. Crear tenant
  INSERT INTO tenants (nombre, email_contacto)
  VALUES (p_nombre_empresa, p_email)
  RETURNING id INTO v_tenant_id;

  -- 2. Crear empresa
  INSERT INTO empresas (tenant_id, nombre)
  VALUES (v_tenant_id, p_nombre_empresa)
  RETURNING id INTO v_empresa_id;

  -- 3. Crear registro fiscal VE
  INSERT INTO empresas_fiscal_ve (empresa_id) VALUES (v_empresa_id);

  -- 4. Crear 3 roles por defecto
  INSERT INTO roles (empresa_id, nombre, descripcion, is_system) VALUES
    (v_empresa_id, 'Administrador', 'Rol de sistema con acceso total', true),
    (v_empresa_id, 'Supervisor', 'Acceso amplio con restricciones', false),
    (v_empresa_id, 'Cajero', 'Acceso limitado a caja y ventas', false);

  SELECT id INTO v_admin_rol_id FROM roles
  WHERE empresa_id = v_empresa_id AND nombre = 'Administrador';

  -- 5. Habilitar permisos para el tenant
  INSERT INTO tenant_permisos (tenant_id, permiso_id, habilitado)
  SELECT v_tenant_id, id, true FROM permisos WHERE is_active = true;

  -- 6. Seed rol_permisos (Supervisor y Cajero)
  -- ... (logica de slugs movida aqui)

  -- Si CUALQUIER paso falla, PostgreSQL hace ROLLBACK automatico
  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'empresa_id', v_empresa_id,
    'rol_id', v_admin_rol_id
  );
END;
$$;
```

**Edge Function simplificada**:

```typescript
// 1. Llamar RPC transaccional (pasos 1-6 atomicos)
const { data, error } = await supabaseAdmin.rpc("register_owner_setup", {
  p_nombre_empresa: nombre_empresa.trim(),
  p_email: email.trim(),
  p_nombre: nombre.trim(),
});

if (error) return jsonResponse({ error: error.message }, 500);

// 2. Crear auth user (unico paso fuera de la transaccion)
const { data: authData, error: authError } =
  await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: {
      nombre: nombre.trim(),
      empresa_id: data.empresa_id,
      rol_id: data.rol_id,
    },
  });

if (authError) {
  // Rollback del RPC: eliminar tenant (CASCADE borrara el resto)
  await supabaseAdmin.from("tenants").delete().eq("id", data.tenant_id);
  return jsonResponse({ error: authError.message }, 400);
}
```

**Limitacion**: La creacion del auth user sigue fuera de la transaccion SQL (es una API call a Supabase Auth). Si el auth user falla, hay que hacer UN solo DELETE de `tenants` (que cascadea todo). Esto es mucho mas seguro que los 7 rollbacks manuales actuales.

**Nota importante sobre CASCADE**: Este cambio (#6) depende de que `ON DELETE CASCADE` siga activo en las FK a `tenants` y `empresas`. Si se aplica Fase 1 cambio #3 primero (CASCADE -> RESTRICT), el rollback del RPC requerira eliminar en orden inverso. **Recomendacion**: En la funcion RPC, agregar un parametro opcional para rollback, o mantener CASCADE solo para `tenants -> empresas` (que es la unica entidad donde el DELETE es un rollback legitimo, no un borrado de produccion).

---

### Resumen Fase 2

```
Migraciones: 0014_fix_handle_new_user.sql + 0015_register_owner_rpc.sql
Edge Functions: create-role/index.ts (edit) + register-owner/index.ts (rewrite)
Estimado: ~200 lineas SQL + ~80 lineas TS
Tiempo: 2-3 dias
Riesgo: Bajo (en desarrollo, se puede re-registrar owner si falla)
Test:
  - Registrar nuevo owner -> verificar que tenant+empresa+roles+permisos se crean atomicamente
  - Forzar fallo en auth.createUser -> verificar que se hace rollback limpio
  - Crear rol con permiso_ids invalidos -> verificar error 400
  - Crear auth user con metadata vacia -> verificar que handle_new_user no falla
```

---

## Fase 3: MEDIA (2-3 dias)

> SQL + PowerSync schema + frontend hooks/componentes. Requiere clear IndexedDB + re-login.
> Simplificado: sin datos de produccion, todas las tablas se pueden DROP + CREATE limpiamente.

### 7. Unificar `notas_credito` + `notas_debito` -> `notas_fiscales_venta`

| Campo | Valor |
|-------|-------|
| **Dificultad** | **Media** (simplificado por estar en desarrollo sin datos) |
| **Esfuerzo** | ~1 dia |
| **Riesgo** | Bajo |
| **Archivos SQL** | `migrations/0016_unificar_notas_venta.sql` |
| **Archivos frontend** | 6+ archivos (ver lista abajo) |
| **Impacto PowerSync** | Requiere clear IndexedDB + re-login |

**Que se hace**: DROP 4 tablas viejas, CREATE 2 nuevas (`notas_fiscales_venta`, `notas_fiscales_venta_det`) con campo `tipo` que distingue NC vs ND. Sin migrar datos (proyecto en desarrollo).

**Archivos frontend afectados**:

| Archivo | Cambio |
|---------|--------|
| `src/core/db/powersync/schema.ts` | Eliminar 4 tablas, agregar 2 con campo `tipo` |
| `src/core/db/kysely/types.ts` | Actualizar tipos |
| `src/features/ventas/hooks/use-notas-credito.ts` | Refactorizar a query con `WHERE tipo = 'NC'` |
| `src/features/ventas/hooks/use-notas-debito.ts` | Refactorizar a query con `WHERE tipo = 'ND'` |
| `src/features/ventas/schemas/nota-debito-schema.ts` | Actualizar nombre de tabla |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Actualizar nombre de tabla en inserts |
| `powersync-sync-rules.yaml` | Actualizar nombres de tablas |

**Migracion SQL** (simplificada - sin migracion de datos):

```sql
-- 1. Dropear tablas viejas (no hay datos que preservar)
DROP TABLE IF EXISTS notas_credito_det CASCADE;
DROP TABLE IF EXISTS notas_credito CASCADE;
DROP TABLE IF EXISTS notas_debito_det CASCADE;
DROP TABLE IF EXISTS notas_debito CASCADE;

-- 2. Crear tabla unificada
CREATE TABLE notas_fiscales_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('NC', 'ND')),
  nro_documento TEXT NOT NULL,  -- antes nro_ncr / nro_ndb
  venta_id UUID REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  motivo TEXT,
  moneda_id UUID REFERENCES monedas(id),
  tasa NUMERIC(12,4),
  total_exento_usd NUMERIC(12,2) DEFAULT 0,
  total_base_usd NUMERIC(12,2) DEFAULT 0,
  total_iva_usd NUMERIC(12,2) DEFAULT 0,
  total_usd NUMERIC(12,2) DEFAULT 0,
  total_bs NUMERIC(12,2) DEFAULT 0,
  afecta_inventario BOOLEAN DEFAULT false,  -- solo aplica a NC
  usuario_id UUID REFERENCES usuarios(id),
  fecha TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  UNIQUE(empresa_id, tipo, nro_documento)
);

-- 3. Crear detalle unificado
CREATE TABLE notas_fiscales_venta_det ( ... );

-- 4. RLS + triggers (prevent_mutation) + publication
```

**Notas**:
- `movimientos_cuenta.doc_origen_tipo` ya usa 'NCR'/'NDB', no necesita cambio
- El campo `afecta_inventario` solo aplica a NC, en ND siempre es false
- Despues de aplicar: clear IndexedDB y re-logear para full re-sync

---

### 8. Mover capa SaaS a schema separado

| Campo | Valor |
|-------|-------|
| **Dificultad** | Media |
| **Esfuerzo** | ~4 horas |
| **Riesgo** | Medio |
| **Archivo** | `migrations/0017_schema_saas.sql` |
| **Impacto frontend** | Minimo (sync rules + schema.ts si alguna tabla SaaS se sincroniza) |

**Que se hace**: Crear schema `saas_platform` y mover 7 tablas:

```sql
CREATE SCHEMA IF NOT EXISTS saas_platform;

ALTER TABLE tenants SET SCHEMA saas_platform;
ALTER TABLE apps SET SCHEMA saas_platform;
ALTER TABLE planes SET SCHEMA saas_platform;
ALTER TABLE suscripciones SET SCHEMA saas_platform;
ALTER TABLE pagos_suscripcion SET SCHEMA saas_platform;
ALTER TABLE tenant_permisos SET SCHEMA saas_platform;
ALTER TABLE permisos SET SCHEMA saas_platform;  -- compartida, evaluar
```

**Dependencias a actualizar**:
- `register-owner/index.ts`: referencia `tenants` y `tenant_permisos` directamente via API Supabase (el service role key tiene acceso a todos los schemas, pero hay que verificar que PostgREST expone el schema `saas_platform`)
- `current_tenant_id()` en `0002_auth_rbac.sql`: hace query a `tenants` -> necesita `saas_platform.tenants`
- `user_has_permission()`: hace query a `tenant_permisos` -> necesita `saas_platform.tenant_permisos`
- PowerSync sync rules: `tenant_permisos` esta en bucket `by_empresa` -> mover a referencia con schema

**Riesgo**: PostgREST (API de Supabase) por defecto solo expone `public`. Para exponer `saas_platform`, hay que configurar `db_extra_search_path` en Supabase Dashboard o usar funciones RPC. Esto puede complicar la implementacion.

**Alternativa mas segura**: En vez de mover tablas, usar prefijo `saas_` en los nombres y mantenerlas en `public`. Menos limpio pero sin riesgos de configuracion PostgREST.

---

### 9. Agregar indices parciales PostgreSQL

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~30 minutos |
| **Riesgo** | Nulo |
| **Archivo** | Incluir en migracion de Fase 3 |
| **Impacto frontend** | Ninguno |

**Indices recomendados** (del analisis V1):

```sql
-- Productos activos por empresa
CREATE INDEX IF NOT EXISTS idx_productos_empresa_activo
  ON productos(empresa_id) WHERE is_active = true;

-- Ventas recientes por empresa
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_fecha
  ON ventas(empresa_id, fecha DESC);

-- Movimientos por producto
CREATE INDEX IF NOT EXISTS idx_mov_inv_empresa_producto
  ON movimientos_inventario(empresa_id, producto_id, created_at DESC);

-- Clientes activos
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_activo
  ON clientes(empresa_id) WHERE is_active = true;

-- Movimientos cuenta por cliente
CREATE INDEX IF NOT EXISTS idx_mov_cuenta_cliente
  ON movimientos_cuenta(cliente_id, created_at DESC);

-- Sesiones caja abiertas
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_abierta
  ON sesiones_caja(empresa_id) WHERE status = 'ABIERTA';

-- Facturas compra por proveedor
CREATE INDEX IF NOT EXISTS idx_fact_compra_proveedor
  ON facturas_compra(empresa_id, proveedor_id);
```

---

### 10. Eliminar indices redundantes

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~15 minutos |
| **Riesgo** | Nulo |
| **Archivo** | Incluir en migracion de Fase 3 |
| **Impacto frontend** | Ninguno |

Identificar indices que duplican UNIQUE constraints y eliminarlos. Requiere verificar en la DB real cuales existen.

---

### 11. Estandarizar `usuario_id` -> `created_by`

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil (simplificado: sin datos, DROP + ADD directo) |
| **Esfuerzo** | ~1 hora |
| **Riesgo** | Bajo |
| **Archivo** | Migracion SQL + schema.ts + types.ts + hooks que referencien `usuario_id` |
| **Impacto frontend** | Medio (renombrar columna en queries) |

**Tablas afectadas**: `ventas`, `notas_fiscales_venta` (ya unificada), `facturas_compra`, `gastos`

```sql
-- Sin datos que preservar: DROP directo
ALTER TABLE ventas DROP COLUMN IF EXISTS usuario_id;
-- Si created_by ya existe, no hacer nada. Si no, agregarlo.
-- Repetir para cada tabla
```

**Impacto frontend**: Buscar todas las queries y componentes que usen `usuario_id` en estas tablas y cambiar a `created_by`.

---

### 12. Eliminar `venta_id` de `movimientos_cuenta`

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~1 hora |
| **Riesgo** | Bajo |
| **Archivo** | Migracion SQL + schema.ts + types.ts |
| **Impacto frontend** | Bajo (verificar que nadie usa `movimientos_cuenta.venta_id`) |

```sql
ALTER TABLE movimientos_cuenta DROP COLUMN IF EXISTS venta_id;
```

**Prerequisito**: Verificar que el frontend usa `doc_origen_id` + `doc_origen_tipo` en vez de `venta_id`.

---

### 13. Agregar indices locales en PowerSync schema

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~1 hora |
| **Riesgo** | Nulo |
| **Archivo** | `src/core/db/powersync/schema.ts` |
| **Impacto** | Mejora rendimiento offline |

**Cambio**: Agregar objetos `indexes` a tablas de consulta frecuente:

```typescript
const productos = new Table(
  { ... },
  {
    indexes: {
      empresa_tipo: ['empresa_id', 'tipo'],
      empresa_depto: ['empresa_id', 'departamento_id'],
    }
  }
)

const ventas = new Table(
  { ... },
  {
    indexes: {
      empresa_fecha: ['empresa_id', 'fecha'],
      empresa_status: ['empresa_id', 'status'],
    }
  }
)

const movimientos_inventario = new Table(
  { ... },
  {
    indexes: {
      empresa_producto: ['empresa_id', 'producto_id'],
    }
  }
)

const clientes = new Table(
  { ... },
  {
    indexes: {
      empresa_activo: ['empresa_id', 'is_active'],
    }
  }
)
```

**Nota**: Requiere clear IndexedDB y re-login para que los indices se creen en SQLite local.

---

### 14. Estandarizar precision de costos a NUMERIC(12,4)

| Campo | Valor |
|-------|-------|
| **Dificultad** | Facil |
| **Esfuerzo** | ~30 minutos |
| **Riesgo** | Nulo (ampliar precision nunca pierde datos) |
| **Archivo** | Incluir en migracion de Fase 3 |
| **Impacto frontend** | Ninguno |

**Columnas a cambiar**:

```sql
ALTER TABLE productos ALTER COLUMN costo_usd TYPE NUMERIC(12,4);
ALTER TABLE facturas_compra_det ALTER COLUMN costo_unitario_usd TYPE NUMERIC(12,4);
ALTER TABLE ventas_det ALTER COLUMN precio_unitario_usd TYPE NUMERIC(12,4);
```

---

### Resumen Fase 3

```
Migraciones: 0016_unificar_notas.sql, 0017_schema_saas.sql (opcional),
             0018_indices_limpieza.sql (indices + precision + campos redundantes)
Frontend: schema.ts, types.ts, hooks, componentes de notas
Estimado: ~300 lineas SQL + ~150 lineas TS
Tiempo: ~2-3 dias (reducido: sin migracion de datos)
Riesgo: Bajo (DROP + CREATE limpio, sin datos que preservar)
Test:
  - Crear NC y ND en tabla unificada -> verificar que tipo y nro_documento son correctos
  - Verificar PowerSync sync con nueva tabla
  - Verificar rendimiento offline con indices locales
  - Verificar que precision (12,4) no rompe calculos existentes
```

---

## Dependencias entre Cambios

```
Cambio #3 (CASCADE->RESTRICT) ──> Cambio #6 (register-owner RPC)
  El rollback del RPC necesita que tenants->empresas mantenga CASCADE,
  o ajustar el RPC para hacer cleanup explicito

Cambio #7 (unificar notas) ──> Cambio #11 (usuario_id->created_by)
  Si se unifican notas primero, el rename de columna se hace en la tabla nueva
  directamente (menos trabajo)

Cambio #8 (schema SaaS) ──> Cambio #6 (register-owner RPC)
  Si se mueven tablas SaaS a otro schema, el RPC debe referenciar
  saas_platform.tenants en vez de public.tenants
```

**Orden optimo de ejecucion**:

```
0013: Fase 1 completa (race conditions + RLS + CASCADE->RESTRICT)
       Nota: mantener CASCADE en tenants->empresas para rollback de register-owner
0014: Fix handle_new_user()
0015: Fix create-role validacion (Edge Function)
0016: Refactorizar register-owner a RPC
0017: Unificar notas_credito + notas_debito
0018: Indices + precision + limpieza de campos
0019: Schema SaaS (opcional, posponer si PostgREST es complicacion)
```

---

## Matriz de Riesgo

> **Nota**: Al estar en desarrollo sin datos de produccion, el riesgo de todos los cambios baja significativamente. Si algo sale mal, se puede re-ejecutar `cleanup_all_data.sql` y las migraciones desde cero.

| Cambio | Si sale mal... | Rollback |
|--------|----------------|----------|
| #1 Race conditions | Lock excesivo bajo alta concurrencia (improbable) | `CREATE OR REPLACE` sin FOR UPDATE |
| #2 RLS fix | Queries de ajustes_det fallan si `current_empresa_id()` retorna NULL | Restaurar `USING (true)` |
| #3 CASCADE->RESTRICT | DELETE de empresa en dev/testing falla | Revertir constraint individual |
| #4 handle_new_user | Auth users sin registro en `usuarios` (ya pasa hoy, esto lo hace controlado) | `CREATE OR REPLACE` con version anterior |
| #5 create-role validation | Falso positivo rechaza permisos validos | Revert del archivo TS |
| #6 register-owner RPC | Registro de empresas nuevas falla | Revert a version actual (rollback manual) |
| #7 Unificar notas | DROP tablas viejas (sin datos, no hay perdida) | Recrear tablas viejas desde migracion 0006 |
| #8 Schema SaaS | PostgREST no expone el schema, rompe register-owner | `ALTER TABLE SET SCHEMA public` |

---

## Recomendacion Final

Al estar en desarrollo, se puede ejecutar todo en una sola pasada sin riesgo de perdida de datos. El orden recomendado es:

**Sprint 1 (~2 dias)**: Fase 1 + Fase 2
- #1, #2, #3 (fixes criticos SQL)
- #4, #5 (handle_new_user + create-role validation)
- #6 (register-owner RPC)

**Sprint 2 (~2-3 dias)**: Fase 3
- #7 (unificar notas - DROP + CREATE limpio)
- #9, #10, #13, #14 (indices + precision - faciles)
- #11, #12 (limpieza de campos)

**Posponer** (beneficio marginal vs esfuerzo):
- #8 (schema SaaS) - complicaciones con PostgREST, reevaluar cuando el proyecto madure

**Tiempo total estimado: ~4-5 dias** (vs ~2 semanas si hubiera datos de produccion)
