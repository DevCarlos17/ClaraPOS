# Re-Evaluacion Arquitectonica de Base de Datos - ClaraPOS (V2)

> **Fecha**: 2026-04-13
> **Objetivo**: Validar las recomendaciones de V1, identificar problemas adicionales no cubiertos, y evaluar el esquema resultante post-cambios
> **Alcance**: 64 tablas + 4 Edge Functions + PowerSync connector + sync rules

---

## 1. Validacion de Recomendaciones V1

### Recomendaciones CONFIRMADAS (aplicar sin reservas)

| ID | Recomendacion | Veredicto |
|----|---------------|-----------|
| B2 | Corregir RLS de `ajustes_det` y `sesiones_caja_detalle` | **APLICAR YA** - Vulnerabilidad real de aislamiento multi-tenant |
| C2 | Unificar `notas_credito` + `notas_debito` en ventas | **APLICAR** - Ya existe el patron en compras (`notas_fiscales_compra`) |
| D1 | Agregar indices parciales recomendados | **APLICAR** - Sin riesgo, mejora directa |
| D2 | Eliminar indices redundantes con UNIQUE constraints | **APLICAR** - Limpieza sin impacto funcional |
| D4 | Estandarizar `usuario_id` vs `created_by` | **APLICAR** - Eliminar ambiguedad |
| D5 | Eliminar `venta_id` legacy en `movimientos_cuenta` | **APLICAR** - Ya existe `doc_origen_id` + `doc_origen_tipo` |
| G3 | Edge Functions: validar pertenencia de IDs | **PARCIALMENTE RESUELTO** - `create-employee` ya valida `rol_id` pertenencia (linea 109-124). Pero `create-role` NO valida que `permiso_ids` existan (ver seccion 2) |

### Recomendaciones con TRADE-OFFS OCULTOS (aplicar con cuidado)

| ID | Recomendacion | Trade-off descubierto |
|----|---------------|-----------------------|
| B1 | Eliminar capa SaaS (7 tablas) | `register-owner` depende directamente de `tenants` y `tenant_permisos`. Eliminar requiere reescribir esta Edge Function. La tabla `tenant_permisos` controla que permisos estan disponibles a nivel organizacional (encima de `rol_permisos`). Si se elimina, esa capa de control se pierde o debe moverse a `empresas.config` JSONB |
| B3 | JWT custom claim para `empresa_id` | Requiere un Supabase Auth Hook (funcion PL/pgSQL o Edge Function que se ejecuta al login). Si `empresa_id` cambia (raro pero posible), el JWT viejo tendra el valor anterior hasta que expire. Ademas, PowerSync usa su propio JWT flow y habria que verificar compatibilidad |
| C1 | Consolidar retenciones/movimientos/vencimientos | **Perdida de integridad referencial**: `retenciones_iva.factura_compra_id` tiene FK real a `facturas_compra`. Si se unifica con `retenciones_iva_ventas`, el campo se volveria `doc_id UUID` sin FK (polimorfico). Lo mismo para `movimientos_cuenta.cliente_id` (FK real a `clientes`). En un sistema financiero, perder FKs es riesgoso |
| C4 | Natural keys para catalogos | PowerSync usa UUIDs como patron de identificacion. Cambiar PKs de `monedas`, `tipos_persona_ve`, `tipos_movimiento` requiere actualizar ~30+ columnas FK en todo el esquema + el schema.ts de PowerSync + todas las queries del frontend. Alto costo de migracion para beneficio marginal |

### Recomendaciones REVISADAS (cambio de veredicto)

| ID | Recomendacion original | Nuevo veredicto | Razon |
|----|------------------------|-----------------|-------|
| C1 (movimientos_cuenta) | Unificar `movimientos_cuenta` + `movimientos_cuenta_proveedor` | **NO APLICAR** | `movimientos_cuenta.cliente_id` tiene FK real a `clientes`, y el trigger `actualizar_saldo_cliente()` usa logica especifica (context `mov_cuenta`). Unificar requiere un trigger polimorfico que decide si actualizar `clientes` o `proveedores` segun `entidad_tipo` - agrega complejidad sin beneficio real |
| C1 (vencimientos) | Unificar `vencimientos_cobrar` + `vencimientos_pagar` | **NO APLICAR** | Misma razon: FK a `ventas.id` vs `facturas_compra.id`. Perder esa FK en un sistema de cobranzas es inaceptable |
| C1 (retenciones) | Unificar retenciones IVA/ISLR | **APLICABLE CON RESERVAS** | La estructura es identica. Se puede hacer si se mantienen columnas `venta_id` y `factura_compra_id` ambas nullable (en vez de un `doc_id` generico), preservando las FKs reales |
| C4 | Natural keys para catalogos | **POSPONER** | Costo de migracion demasiado alto vs beneficio. Reevaluar solo en greenfield |

---

## 2. Problemas Nuevos Descubiertos (no cubiertos en V1)

### CRITICO: Race Conditions en Triggers de Saldo

**Afecta**: `actualizar_saldo_cliente()`, `actualizar_saldo_proveedor()`, `actualizar_saldo_banco()`, `actualizar_saldo_metodo_cobro()`

**Problema**: Todos estos triggers siguen el mismo patron:

```sql
-- Paso 1: Leer saldo actual (sin lock)
SELECT saldo_actual INTO NEW.saldo_anterior FROM clientes WHERE id = NEW.cliente_id;

-- Paso 2: Calcular nuevo saldo
NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;

-- Paso 3: Actualizar entidad
UPDATE clientes SET saldo_actual = NEW.saldo_nuevo WHERE id = NEW.cliente_id;
```

Si dos transacciones concurrentes insertan en `movimientos_cuenta` para el **mismo cliente** al mismo tiempo:

1. Transaccion A lee `saldo_actual = 100`
2. Transaccion B lee `saldo_actual = 100` (misma lectura, sin lock)
3. Transaccion A escribe `saldo_actual = 150` (100 + 50)
4. Transaccion B escribe `saldo_actual = 130` (100 + 30) -- **SOBREESCRIBE** el saldo de A
5. Resultado: saldo = 130, deberia ser 180. Se perdieron $50

**Gravedad**: CRITICA para sistema financiero. Aplica a 4 triggers:
- `actualizar_saldo_cliente()` (CxC)
- `actualizar_saldo_proveedor()` (CxP)
- `actualizar_saldo_banco()` (movimientos bancarios)
- `actualizar_saldo_metodo_cobro()` (metodos de cobro)

**Solucion**: Usar `SELECT ... FOR UPDATE` para lockear la fila antes de leer:

```sql
-- Solucion: lock optimista con FOR UPDATE
SELECT saldo_actual INTO NEW.saldo_anterior
FROM clientes
WHERE id = NEW.cliente_id
FOR UPDATE;  -- bloquea la fila hasta que la transaccion termine
```

O alternativamente, usar aritmetica atomica sin leer:

```sql
-- Alternativa: update atomico sin leer primero
UPDATE clientes
SET saldo_actual = saldo_actual + NEW.monto
WHERE id = NEW.cliente_id
RETURNING saldo_actual - NEW.monto INTO NEW.saldo_anterior;

NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
```

**Nota**: El trigger `actualizar_inventario_stock()` **NO tiene este problema** porque usa `ON CONFLICT DO UPDATE SET cantidad_actual = inventario_stock.cantidad_actual + X`, que es atomico. Pero `productos.stock` se actualiza con un `SUM()` subquery que tambien es seguro.

---

### CRITICO: `register-owner` no es transaccional

**Archivo**: `supabase/functions/register-owner/index.ts`

El flujo de registro ejecuta **7 operaciones secuenciales** via API REST (no una transaccion SQL):

```
1. INSERT tenants         -> si falla: return error (limpio)
2. INSERT empresas        -> si falla: DELETE tenants (rollback manual)
3. INSERT empresas_fiscal -> si falla: DELETE empresas, tenants
4. INSERT roles (x3)      -> si falla: DELETE fiscal, empresas, tenants
5. INSERT tenant_permisos -> si falla: DELETE roles, fiscal, empresas, tenants
6. INSERT rol_permisos    -> si falla: DELETE todo lo anterior
7. CREATE auth user       -> si falla: DELETE todo lo anterior
```

**Problemas**:

1. **Rollback parcial**: Si el paso 5 falla pero el `DELETE` de roles tambien falla (ej: timeout de red), quedan datos huerfanos
2. **No es atomico**: Una caida del servidor entre pasos deja datos inconsistentes
3. **Cascada de DELETEs manual**: Error-prone, y el orden importa

**Solucion**: Usar una funcion PL/pgSQL `SECURITY DEFINER` que haga todo en una sola transaccion:

```sql
CREATE OR REPLACE FUNCTION register_owner(
  p_nombre TEXT, p_email TEXT, p_nombre_empresa TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_empresa_id UUID;
  v_rol_id UUID;
BEGIN
  -- Todo en una transaccion atomica
  INSERT INTO tenants (...) VALUES (...) RETURNING id INTO v_tenant_id;
  INSERT INTO empresas (...) VALUES (...) RETURNING id INTO v_empresa_id;
  INSERT INTO empresas_fiscal_ve (...) VALUES (...);
  INSERT INTO roles (...) VALUES (...) RETURNING id INTO v_rol_id;
  -- ... etc
  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'empresa_id', v_empresa_id, 'rol_id', v_rol_id);
  -- Si cualquier paso falla, PostgreSQL hace ROLLBACK automatico
END;
$$;
```

Y la Edge Function solo llama a `supabaseAdmin.rpc('register_owner', {...})` + crea el auth user.

---

### ALTO: `create-role` no valida `permiso_ids`

**Archivo**: `supabase/functions/create-role/index.ts` lineas 140-149

```typescript
const rolPermisos = permiso_ids.map((permisoId: string) => ({
  rol_id: newRole.id,
  permiso_id: permisoId,
  granted_by: caller.id,
}));
await supabaseAdmin.from("rol_permisos").insert(rolPermisos);
```

Los `permiso_ids` se insertan directamente sin verificar que:
- Cada ID existe en la tabla `permisos`
- Cada permiso esta `is_active = true`
- El tenant tiene habilitado ese permiso en `tenant_permisos`

Un usuario malicioso podria enviar UUIDs arbitrarios. La FK `rol_permisos.permiso_id -> permisos.id` previene IDs inexistentes, pero no valida activacion.

**Solucion**: Agregar validacion:

```typescript
const { data: validPermisos } = await supabaseAdmin
  .from("permisos")
  .select("id")
  .in("id", permiso_ids)
  .eq("is_active", true);

if (!validPermisos || validPermisos.length !== permiso_ids.length) {
  return jsonResponse({ error: "Algunos permisos no son validos" }, 400);
}
```

---

### ALTO: `handle_new_user()` puede crear usuarios huerfanos

**Archivo**: migracion 0002, linea 168-181

```sql
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre, empresa_id, rol_id, telefono)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    (NEW.raw_user_meta_data->>'empresa_id')::UUID,  -- puede fallar si es NULL
    (NEW.raw_user_meta_data->>'rol_id')::UUID,       -- puede fallar si es NULL
    NEW.raw_user_meta_data->>'telefono'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Problemas**:
1. Si `empresa_id` en metadata es NULL, el cast `::UUID` falla con error, pero el usuario en `auth.users` **ya fue creado** (el trigger es `AFTER INSERT`). Resultado: usuario auth sin registro en `usuarios`
2. Si `empresa_id` no referencia una empresa existente, la FK falla igualmente
3. Si `rol_id` no existe, la FK falla igualmente

**Solucion**: Agregar validacion con manejo de errores:

```sql
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id UUID;
  v_rol_id UUID;
BEGIN
  v_empresa_id := (NEW.raw_user_meta_data->>'empresa_id')::UUID;
  v_rol_id := (NEW.raw_user_meta_data->>'rol_id')::UUID;

  IF v_empresa_id IS NULL THEN
    RAISE WARNING 'handle_new_user: empresa_id faltante para user %', NEW.id;
    RETURN NEW;  -- no crear registro en usuarios, evitar bloquear auth
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

---

### ALTO: ON DELETE CASCADE en tablas financieras

Varias tablas usan `ON DELETE CASCADE` en la FK a `empresas`, lo cual significa que si se elimina una empresa, **se borran silenciosamente todos los registros financieros**:

```sql
-- Ejemplo: eliminar una empresa borra TODA su contabilidad
CREATE TABLE departamentos (
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE, -- PELIGROSO
  ...
);
```

**Tablas afectadas con CASCADE peligroso**:
- `departamentos`, `marcas`, `unidades`, `depositos` (inventario base)
- `productos` (catalogo completo)
- `lotes` (trazabilidad)
- `ajustes`, `ajuste_motivos`
- `bancos_empresa`, `metodos_cobro`, `cajas` (tesoreria)
- `clientes` (aunque `ventas.cliente_id` es RESTRICT, `clientes.empresa_id` es CASCADE)
- `proveedores`
- `facturas_compra` (finanzas)
- `notas_credito`, `notas_debito` (documentos fiscales)
- `plan_cuentas`, `gastos` (contabilidad)
- `roles` (seguridad)

**Tablas correctamente protegidas con RESTRICT**:
- `ventas.cliente_id -> clientes` (RESTRICT)
- `ventas.deposito_id -> depositos` (RESTRICT)
- `pagos.venta_id -> ventas` (RESTRICT)
- `movimientos_inventario.empresa_id -> empresas` (sin CASCADE ni RESTRICT, default NO ACTION)

**Recomendacion**: Cambiar TODAS las FKs `empresa_id REFERENCES empresas(id)` de `CASCADE` a `RESTRICT`:

```sql
ALTER TABLE departamentos DROP CONSTRAINT departamentos_empresa_id_fkey;
ALTER TABLE departamentos ADD CONSTRAINT departamentos_empresa_id_fkey
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;
-- Repetir para todas las tablas
```

En un sistema financiero, una empresa **nunca debe poder eliminarse** si tiene datos. Solo desactivar via `is_active = false`.

---

### MEDIO: PowerSync schema sin indices locales

**Archivo**: `src/core/db/powersync/schema.ts`

Todas las tablas tienen `{ indexes: {} }` - cero indices locales en SQLite.

```typescript
const productos = new Table(
  { ... },
  { indexes: {} }  // Sin indices locales
)
```

Para queries frecuentes offline (buscar productos por nombre, filtrar ventas por fecha, etc.), la ausencia de indices SQLite degrada el rendimiento.

**Recomendacion**: Agregar indices locales para tablas de consulta frecuente:

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
```

---

### MEDIO: Inconsistencia de precision en costos

| Columna | Precision | Tabla |
|---------|-----------|-------|
| `costo_usd` | NUMERIC(12,**2**) | `productos` |
| `costo_promedio` | NUMERIC(12,**4**) | `productos` |
| `costo_ultimo` | NUMERIC(12,**4**) | `productos` |
| `costo_unitario` | NUMERIC(12,**4**) | `movimientos_inventario` |
| `costo_unitario` | NUMERIC(12,**4**) | `ajustes_det` |
| `costo_unitario` | NUMERIC(12,**4**) | `lotes` |
| `costo_unitario_usd` | NUMERIC(12,**2**) | `facturas_compra_det` |
| `precio_unitario_usd` | NUMERIC(12,**2**) | `ventas_det` |

`costo_usd` en productos es (12,2) pero `costo_promedio` es (12,4). Cuando se calcula el costo promedio ponderado y se guarda en `costo_usd`, se pierde precision por truncamiento.

**Recomendacion**: Unificar a NUMERIC(12,4) para TODOS los campos de costo. Los precios de venta pueden quedarse en (12,2) porque son valores fijos, no calculados.

---

### MEDIO: `user_has_permission()` no se usa en RLS

La funcion `user_has_permission(p_slug TEXT)` en migracion 0002 hace un JOIN de 5 tablas para verificar permisos. Pero **ninguna policy RLS la usa**. Todas las policies solo verifican `empresa_id`, no permisos granulares.

Esto significa que un **Cajero puede hacer lo mismo que un Administrador** a nivel de base de datos: INSERT en todas las tablas, UPDATE donde este permitido. La diferenciacion de permisos solo existe en el frontend.

**Opciones**:
1. **Aceptar** (defensa en profundidad via frontend + Edge Functions para operaciones criticas) - pragmatico para el volumen actual
2. **Endurecer** con RLS basado en permisos para operaciones sensibles:

```sql
-- Ejemplo: solo usuarios con permiso 'inventario.ajustar' pueden insertar ajustes
CREATE POLICY "insert_con_permiso" ON ajustes FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND public.user_has_permission('inventario.ajustar')
  );
```

**Advertencia**: Esto agrega latencia por la complejidad del JOIN en `user_has_permission()`. Solo aplicar en tablas criticas.

---

### BAJO: CHECK constraints faltantes como defensa en profundidad

| Tabla | Columna | CHECK faltante |
|-------|---------|----------------|
| `movimientos_inventario` | `stock_nuevo` | `CHECK (stock_nuevo >= -0.001)` (solo se valida en trigger) |
| `inventario_stock` | `cantidad_actual` | `CHECK (cantidad_actual >= 0)` |
| `bancos_empresa` | `saldo_actual` | Sin CHECK (puede ir negativo sin aviso) |
| `metodos_cobro` | `saldo_actual` | Sin CHECK (puede ir negativo sin aviso) |
| `clientes` | `saldo_actual` | Sin CHECK (puede ser negativo - es correcto? significa saldo a favor) |

---

## 3. Esquema Resultante Post-Cambios

Aplicando SOLO las recomendaciones confirmadas y las correcciones nuevas:

### Cambios a aplicar

| # | Cambio | Tablas afectadas | Tipo |
|---|--------|------------------|------|
| 1 | Fix RLS `ajustes_det` y `sesiones_caja_detalle` | 2 | Migracion SQL |
| 2 | Unificar `notas_credito` + `notas_debito` -> `notas_fiscales_venta` | -2 tablas | Migracion SQL |
| 3 | Agregar 7 indices parciales | - | Migracion SQL |
| 4 | Eliminar 3 indices redundantes | - | Migracion SQL |
| 5 | Eliminar `usuario_id` de ventas/notas/facturas/gastos (usar `created_by`) | 5 tablas | Migracion SQL |
| 6 | Eliminar `venta_id` de `movimientos_cuenta` | 1 tabla | Migracion SQL |
| 7 | Fix race conditions en 4 triggers de saldo (FOR UPDATE) | 4 funciones | Migracion SQL |
| 8 | Cambiar `ON DELETE CASCADE` a `RESTRICT` en FK a empresas | ~25 tablas | Migracion SQL |
| 9 | Agregar CHECK constraints defensivos | 4 tablas | Migracion SQL |
| 10 | Fix `handle_new_user()` para manejar metadata invalida | 1 funcion | Migracion SQL |
| 11 | Mover capa SaaS a schema separado `CREATE SCHEMA saas_platform` | 7 tablas | Migracion SQL |
| 12 | Validar `permiso_ids` en Edge Function `create-role` | 1 archivo | Codigo TS |
| 13 | Refactorizar `register-owner` a usar RPC transaccional | 1 funcion SQL + 1 archivo TS | Migracion + Codigo |
| 14 | Agregar indices locales en PowerSync schema | 1 archivo | Codigo TS |

### Conteo de tablas resultante

```
Esquema actual:           64 tablas
- Unificacion notas:      -2 (notas_credito, notas_credito_det, notas_debito, notas_debito_det -> notas_fiscales_venta, notas_fiscales_venta_det)
- SaaS a schema separado: -7 (se mueven, no se eliminan)
= Schema public:          55 tablas
= Schema saas_platform:    7 tablas
```

---

## 4. Evaluacion del Esquema Resultante

### Lo que MEJORA

| Area | Antes | Despues |
|------|-------|---------|
| **Seguridad multi-tenant** | 2 tablas con RLS abierto | Todas las tablas con RLS correcto |
| **Integridad financiera** | Race conditions en 4 triggers de saldo | Locks atomicos con FOR UPDATE |
| **Proteccion contra borrado** | CASCADE en tablas financieras | RESTRICT en todas las FK a empresas |
| **Consistencia** | NC/ND separadas en ventas, unificadas en compras | Patron unificado en ambos lados |
| **Registro de propietario** | 7 llamadas API sin transaccion | 1 RPC transaccional |
| **Rendimiento offline** | 0 indices SQLite locales | Indices en tablas criticas |
| **Claridad** | 64 tablas en schema public | 55 tablas de negocio + 7 SaaS aisladas |

### Lo que se MANTIENE BIEN

- Inmutabilidad financiera (triggers `prevent_mutation`)
- Pattern de snapshot en movimientos
- Kardex con validacion matematica
- RBAC con permisos granulares
- Aislamiento por `empresa_id` en todas las queries
- PowerSync sync rules correctos

### Lo que QUEDA PENDIENTE (futuro)

| Pendiente | Razon para posponer |
|-----------|---------------------|
| Natural keys para catalogos | Costo de migracion alto, beneficio marginal |
| JWT custom claim para RLS | Requiere Auth Hook de Supabase, evaluar compatibilidad PowerSync |
| Consolidar retenciones IVA/ISLR | Posible, pero requiere diseno cuidadoso de FKs nullable |
| Consolidar movimientos_cuenta | Perdida de integridad referencial no justificada |
| Filtro temporal en sync rules | Implementar cuando el volumen lo justifique |
| RLS basado en permisos | Evaluar impacto en rendimiento primero |
| Particionado de tablas de alto volumen | Implementar cuando se superen ~1M filas |

---

## 5. Resumen Priorizado Final (V2)

| Prioridad | Accion | Esfuerzo | Impacto |
|-----------|--------|----------|---------|
| **CRITICA** | Fix race conditions en triggers de saldo (FOR UPDATE) | Bajo | Corrige perdida de dinero potencial |
| **CRITICA** | Fix RLS de `ajustes_det` y `sesiones_caja_detalle` | Bajo | Cierra fuga de datos multi-tenant |
| **CRITICA** | Cambiar `ON DELETE CASCADE` a `RESTRICT` en FK a empresas | Medio | Previene borrado catastrofico de datos financieros |
| **ALTA** | Refactorizar `register-owner` a RPC transaccional | Medio | Elimina estados inconsistentes en registro |
| **ALTA** | Fix `handle_new_user()` para metadata invalida | Bajo | Previene usuarios auth huerfanos |
| **ALTA** | Validar `permiso_ids` en `create-role` | Bajo | Cierra vector de input no validado |
| **MEDIA** | Unificar `notas_credito` + `notas_debito` en ventas | Medio | Consistencia, 2 tablas menos |
| **MEDIA** | Mover capa SaaS a schema separado | Medio | Claridad arquitectonica |
| **MEDIA** | Agregar indices parciales PostgreSQL | Bajo | Rendimiento |
| **MEDIA** | Agregar indices locales PowerSync | Bajo | Rendimiento offline |
| **MEDIA** | Estandarizar precision de costos a (12,4) | Bajo | Precision en calculos |
| **BAJA** | Eliminar campos redundantes | Bajo | Limpieza |
| **BAJA** | Agregar CHECK constraints defensivos | Bajo | Defensa en profundidad |

---

## 6. Veredicto Final

> **Si se aplican las soluciones, seria una base de datos significativamente mejor?**

**Si, con matices**:

- **Seguridad**: De "vulnerable en 2+ puntos criticos" a "solida". Los fixes de RLS, race conditions y CASCADE son correcciones de errores reales, no mejoras cosmeticas.

- **Integridad**: De "puede perder dinero bajo concurrencia" a "atomicamente segura". Los triggers con FOR UPDATE eliminan un bug silencioso que podria manifestarse en produccion con multiples cajeros.

- **Mantenibilidad**: De 64 tablas con patrones inconsistentes a 55 tablas limpias con patron uniforme (NC/ND unificados, schema SaaS separado).

- **Lo que NO cambia**: La estructura fundamental del esquema es correcta. No hay sobre-normalizacion grave ni sub-normalizacion. Las consolidaciones mas agresivas (retenciones, movimientos) tienen trade-offs que no justifican el riesgo para un sistema financiero.

**Recomendacion de orden de ejecucion**:

```
Fase 1 (Urgente - 1 dia):
  -> Fix race conditions (4 triggers)
  -> Fix RLS (2 policies)
  -> Fix CASCADE -> RESTRICT

Fase 2 (Esta semana):
  -> Fix handle_new_user()
  -> Fix create-role validacion
  -> Refactorizar register-owner a RPC

Fase 3 (Proximo sprint):
  -> Unificar notas_credito + notas_debito
  -> Mover SaaS a schema separado
  -> Agregar indices
  -> PowerSync indices locales
  -> Limpieza de campos redundantes
```
