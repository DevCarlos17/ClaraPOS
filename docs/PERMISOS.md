# Sistema de Permisos por Nivel — ClaraPOS

## Resumen

El sistema reemplaza el antiguo campo `rol` (texto) por un campo `level` (entero) con una tabla `level_permissions` que define permisos granulares por nivel. Toda la logica de acceso se resuelve en el frontend (offline-first via PowerSync).

---

## Niveles de Usuario

| Level | Nombre | Descripcion |
|:-----:|--------|-------------|
| **1** | Dueno | Acceso total. No necesita registros en BD — hardcoded `return true` |
| **2** | Supervisor | Todos los permisos operativos (10 permisos) |
| **3** | Cajero | Permisos basicos de operacion diaria (4 permisos) |

> El nivel se almacena en `usuarios.level` (INTEGER, default 3). Nuevos usuarios creados via Supabase Auth se registran automaticamente como nivel 3.

---

## Matriz de Permisos

| Permiso | Constante TS | Cajero (3) | Supervisor (2) | Dueno (1) |
|---------|-------------|:----------:|:--------------:|:---------:|
| `sales.create` | `PERMISSIONS.SALES_CREATE` | SI | SI | SI |
| `sales.void` | `PERMISSIONS.SALES_VOID` | — | SI | SI |
| `inventory.view` | `PERMISSIONS.INVENTORY_VIEW` | SI | SI | SI |
| `inventory.adjust` | `PERMISSIONS.INVENTORY_ADJUST` | — | SI | SI |
| `inventory.edit_prices` | `PERMISSIONS.INVENTORY_EDIT_PRICES` | — | SI | SI |
| `reports.view` | `PERMISSIONS.REPORTS_VIEW` | SI | SI | SI |
| `reports.cashclose` | `PERMISSIONS.REPORTS_CASHCLOSE` | — | SI | SI |
| `config.rates` | `PERMISSIONS.CONFIG_RATES` | — | — | SI |
| `config.users` | `PERMISSIONS.CONFIG_USERS` | — | — | SI |
| `clients.manage` | `PERMISSIONS.CLIENTS_MANAGE` | SI | SI | SI |
| `clients.credit` | `PERMISSIONS.CLIENTS_CREDIT` | — | SI | SI |
| `clinic.access` | `PERMISSIONS.CLINIC_ACCESS` | — | SI | SI |

---

## Visibilidad del Sidebar por Nivel

### Cajero (nivel 3) ve:
- Dashboard
- Ventas > Nueva Venta
- Ventas > Reportes
- Inventario > Departamentos, Productos/Servicios, Kardex, Recetas/Combos, Reportes de Inventario
- Clientes > Gestion de Clientes

### Supervisor (nivel 2) ve todo lo anterior mas:
- Ventas > Nota de Credito, Cuadre de Caja
- Inventario > Compras
- Proveedores > Gestion de Proveedores
- Clientes > Cuentas por Cobrar, Reportes de CxC
- Clinica

### Dueno (nivel 1) ve todo lo anterior mas:
- Configuracion > Datos Empresa, Tasa de Cambio, Usuarios y Perfiles, Bancos, Metodos de Pago

---

## Rutas Protegidas

Estas rutas tienen guardias a nivel de componente con `<RequirePermission>`. Si un usuario accede directamente por URL sin permiso, ve la pagina "Acceso denegado".

| Ruta | Permiso requerido |
|------|-------------------|
| `/configuracion/usuarios` | `config.users` |
| `/configuracion/tasa-cambio` | `config.rates` |
| `/ventas/cuadre-de-caja` | `reports.cashclose` |
| `/ventas/notas-credito` | `sales.void` |

---

## Arquitectura Tecnica

### Flujo de datos

```
[Supabase PostgreSQL]
    |
    | (sync via PowerSync Cloud)
    v
[SQLite local (wa-sqlite)]
    |
    | useQuery('SELECT permission FROM level_permissions WHERE level = ?')
    v
[usePermissions() hook]
    |
    ├── hasPermission(key)      → boolean
    ├── hasAnyPermission(keys)  → boolean
    ├── hasAllPermissions(keys) → boolean
    ├── level                   → number
    └── loading                 → boolean
         |
         ├── <RequirePermission>   (componente declarativo)
         ├── Sidebar filtering     (filtra menu items)
         └── Uso directo en hooks  (logica condicional)
```

### Fallback offline

Si la tabla `level_permissions` esta vacia localmente (primera carga o cache limpio), el hook consulta Supabase directamente y siembra los registros en SQLite local. Este patron es identico al usado en `use-metodos-pago.ts`.

### Archivos clave

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/core/hooks/use-permissions.ts` | Hook principal. Define `PERMISSIONS`, `PermissionKey`, `usePermissions()` |
| `src/core/hooks/use-current-user.ts` | Obtiene el `level` del usuario actual desde `usuarios` |
| `src/lib/auth-utils.ts` | Helpers: `getLevelName()`, `isOwner()`, `isManagement()` |
| `src/components/shared/require-permission.tsx` | Componente `<RequirePermission>` para proteger contenido |
| `src/components/shared/access-denied-page.tsx` | Pagina "Acceso denegado" con enlace al dashboard |
| `src/components/layout/sidebar.tsx` | Filtrado de menu basado en permisos |

---

## Uso en Codigo

### 1. Proteger una pagina completa

```tsx
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

function MiPaginaProtegida() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      {/* contenido de la pagina */}
    </RequirePermission>
  )
}
```

### 2. Ocultar un boton o seccion

```tsx
import { RequirePermission } from '@/components/shared/require-permission'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

function MiComponente() {
  return (
    <div>
      <h1>Inventario</h1>
      <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST}>
        <Button>Ajustar Stock</Button>
      </RequirePermission>
    </div>
  )
}
```

### 3. Logica condicional en un hook

```tsx
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'

function MiComponente() {
  const { hasPermission, level } = usePermissions()

  const puedeEditarPrecios = hasPermission(PERMISSIONS.INVENTORY_EDIT_PRICES)

  return (
    <input
      disabled={!puedeEditarPrecios}
      value={precio}
      onChange={handleChange}
    />
  )
}
```

### 4. Verificar multiples permisos

```tsx
<RequirePermission
  permission={[PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_EDIT_PRICES]}
  requireAll={true}
  fallback={<p>No tienes todos los permisos necesarios</p>}
>
  {/* Solo visible si tiene AMBOS permisos */}
</RequirePermission>
```

### 5. Mostrar nombre del nivel

```tsx
import { getLevelName } from '@/lib/auth-utils'
import { useCurrentUser } from '@/core/hooks/use-current-user'

function PerfilUsuario() {
  const { user } = useCurrentUser()
  return <span>{getLevelName(user?.level ?? 3)}</span> // "Dueno", "Supervisor" o "Cajero"
}
```

---

## Base de Datos

### Tabla `level_permissions`

```sql
CREATE TABLE level_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(level, permission)
);
```

- RLS habilitado: solo SELECT para usuarios autenticados
- No se permite INSERT/UPDATE/DELETE desde el frontend
- Los datos se siembran via SQL (seed)

### Columna `usuarios.level`

```sql
ALTER TABLE usuarios ADD COLUMN level INTEGER NOT NULL DEFAULT 3 CHECK (level IN (1, 2, 3));
```

Reemplaza el antiguo `rol TEXT CHECK (rol IN ('admin', 'cajero', 'gerente'))`.

### Migracion de datos

```sql
UPDATE usuarios SET level = 1 WHERE rol = 'admin';
UPDATE usuarios SET level = 2 WHERE rol = 'gerente';
UPDATE usuarios SET level = 3 WHERE rol = 'cajero';
ALTER TABLE usuarios DROP COLUMN rol;
```

---

## Como Agregar un Nuevo Permiso

1. **SQL**: Insertar en `level_permissions` para los niveles correspondientes
   ```sql
   INSERT INTO level_permissions (level, permission) VALUES (2, 'mi_modulo.mi_accion');
   INSERT INTO level_permissions (level, permission) VALUES (3, 'mi_modulo.mi_accion');
   ```

2. **TypeScript**: Agregar la constante en `src/core/hooks/use-permissions.ts`
   ```typescript
   export const PERMISSIONS = {
     // ... existentes
     MI_MODULO_MI_ACCION: 'mi_modulo.mi_accion',
   } as const
   ```

3. **Sidebar** (si aplica): Agregar `requiredPermission` al menu item en `sidebar.tsx`

4. **Ruta** (si aplica): Envolver la pagina con `<RequirePermission>`

> No es necesario modificar el esquema de PowerSync ni los tipos de Kysely — la tabla ya sincroniza todos los registros.

---

## Pasos Manuales Post-Deploy

Estos pasos se ejecutan una sola vez en produccion:

1. Ejecutar el bloque de migracion SQL en **Supabase SQL Editor**
2. Ejecutar `ALTER PUBLICATION powersync ADD TABLE level_permissions;` en Supabase
3. Re-deploy sync rules en **PowerSync Cloud Dashboard**
