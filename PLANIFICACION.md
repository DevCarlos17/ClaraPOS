# Nexo21 - POS + Business Management PWA

## Contexto

**Nexo21** es un sistema POS + Gestión de Negocio como PWA offline-first. Replica la arquitectura de `vytalis-frontend` (React 19 + Supabase + PowerSync) adaptada al dominio POS definido en `WORKFLOW_CLARAPOS.md`. La lógica de negocio está implementada y probada en el proyecto Django `fran` (ClaraPos) - usamos esa implementación como referencia exacta para validaciones, flujos atómicos, signals, y reglas de negocio.

**Primera fase**: Shell de la app + Configuración (tasas de cambio) + Inventario (departamentos, productos, kardex, recetas).

**Proyecto destino**: `C:\Users\Duarte\Desktop\ContApp\Nexo21`
**Idioma**: Solo español (sin i18n)
**Supabase**: Setup completo desde cero

### Proyectos de referencia

| Proyecto | Ruta | Qué se toma |
|----------|------|-------------|
| `vytalis-frontend` | `ContApp/vytalis-frontend` | Arquitectura: React 19 + Vite + PowerSync + Supabase + PWA offline-first |
| `fran` (ClaraPos) | `ContApp/fran` | Lógica de negocio: modelos Django, validaciones, signals, flujos atómicos, UI patterns |

---

## Fase 1: Scaffold del Proyecto

### 1.1 Inicializar proyecto con Vite + React + TypeScript

```bash
npm create vite@latest nexo21 -- --template react-ts
```

### 1.2 `package.json` - Dependencias

**Producción** (mismo stack que vytalis, sin i18n, sin landing page animations):
- `react`, `react-dom` (^19.2.0)
- `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/react-router-devtools`
- `@tanstack/react-form`, `@tanstack/react-query`, `@tanstack/react-table`
- `@powersync/web`, `@powersync/react`, `@powersync/kysely-driver`, `@powersync/common`
- `@journeyapps/wa-sqlite`, `kysely`
- `@supabase/supabase-js`
- `tailwindcss`, `@tailwindcss/vite`, `tailwind-merge`, `clsx`, `class-variance-authority`
- Radix UI: `dialog`, `dropdown-menu`, `popover`, `select`, `separator`, `slot`, `tabs`, `tooltip`, `checkbox`, `scroll-area`
- `lucide-react`, `sonner`, `cmdk`, `framer-motion`
- `zod`, `zustand`, `date-fns`, `uuid`

**Desarrollo**:
- `vite`, `@vitejs/plugin-react`, `typescript`
- `vite-plugin-pwa`, `vite-plugin-wasm`, `vite-plugin-top-level-await`
- `@tanstack/devtools-vite`
- `tw-animate-css`, `prettier`, `eslint`

### 1.3 `vite.config.ts`
Replicar exactamente vytalis: wasm(), topLevelAwait(), TanStack Router (autoCodeSplitting), VitePWA (autoUpdate, workbox 5MB, navigateFallback), alias `@` -> `./src`.

### 1.4 `tsconfig.json`
Copiar vytalis: ES2022, react-jsx, bundler mode, strict, path aliases `@/*`.

### 1.5 `index.html`
Mismo patrón que vytalis, `<div id="app">`, lang="es", title="Nexo21", theme-color azul (#2563eb).

### 1.6 `.env.example`
```
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=...
VITE_POWERSYNC_URL=https://...
```

---

## Fase 2: PWA Setup

### 2.1 `public/manifest.json`
```json
{
  "name": "Nexo21",
  "short_name": "Nexo21",
  "description": "Sistema POS y gestión de negocio offline-first",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "orientation": "any",
  "theme_color": "#2563eb",
  "background_color": "#ffffff",
  "categories": ["business", "finance", "productivity"],
  "icons": [/* 72-512px como vytalis */]
}
```

### 2.2 `src/hooks/use-pwa-install.ts`
Copiar el patrón de vytalis: `beforeinstallprompt` listener + `display-mode: standalone` check.

### 2.3 `src/components/pwa/pwa-install-banner.tsx`
Banner de instalación adaptado con branding Nexo21 (azul en vez de teal).

---

## Fase 3: Core - Supabase + PowerSync + Auth

### 3.1 Supabase SQL Setup (`supabase-setup.sql`)

```sql
-- =============================================
-- NEXO21: ESQUEMA COMPLETO DE BASE DE DATOS
-- =============================================

-- Extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- USUARIOS (enlaza con auth.users) ----
CREATE TABLE usuarios (
  id UUID PRIMARY KEY,  -- = auth.users.id
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cajero' CHECK (rol IN ('admin', 'cajero', 'gerente')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- TASAS DE CAMBIO ----
CREATE TABLE tasas_cambio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valor NUMERIC(12,4) NOT NULL CHECK (valor > 0),
  moneda_destino TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- DEPARTAMENTOS ----
CREATE TABLE departamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo TEXT UNIQUE NOT NULL CHECK (codigo ~ '^[A-Z0-9-]+$'),
  nombre TEXT NOT NULL CHECK (char_length(nombre) >= 3),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- PRODUCTOS/SERVICIOS ----
CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('P', 'S')),
  nombre TEXT NOT NULL CHECK (char_length(nombre) >= 3),
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  costo_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_mayor_usd NUMERIC(12,2),
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
  medida TEXT NOT NULL DEFAULT 'UND' CHECK (medida IN ('UND', 'GRA')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_precio_costo CHECK (precio_venta_usd >= costo_usd),
  CONSTRAINT chk_precio_mayor CHECK (precio_mayor_usd IS NULL OR precio_mayor_usd <= precio_venta_usd),
  CONSTRAINT chk_servicio_stock CHECK (tipo != 'S' OR (stock = 0 AND stock_minimo = 0))
);

CREATE INDEX idx_productos_depto ON productos(departamento_id);
CREATE INDEX idx_productos_tipo ON productos(tipo);
CREATE INDEX idx_productos_activo ON productos(activo);

-- ---- RECETAS (BOM para Servicios) ----
CREATE TABLE recetas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(servicio_id, producto_id)
);

-- ---- MOVIMIENTOS DE INVENTARIO (KARDEX) ----
CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('E', 'S')),
  origen TEXT NOT NULL CHECK (origen IN ('MAN', 'FAC', 'VEN', 'AJU')),
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  stock_anterior NUMERIC(12,3) NOT NULL,
  stock_nuevo NUMERIC(12,3) NOT NULL,
  motivo TEXT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  venta_id UUID,  -- FK a ventas (fase futura)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mov_inv_producto ON movimientos_inventario(producto_id);
CREATE INDEX idx_mov_inv_fecha ON movimientos_inventario(fecha);

-- ---- METODOS DE PAGO (referencia para fase POS) ----
CREATE TABLE metodos_pago (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- TRIGGERS ----
-- ... (ver supabase-setup.sql para detalle completo)

-- ---- RLS POLICIES ----
-- ... (ver supabase-setup.sql para detalle completo)

-- ---- DATOS INICIALES ----
INSERT INTO metodos_pago (nombre, moneda) VALUES
  ('Efectivo USD', 'USD'),
  ('Efectivo Bs', 'BS'),
  ('Zelle', 'USD'),
  ('Transferencia Bs', 'BS'),
  ('Punto de Venta', 'BS'),
  ('Pago Movil', 'BS');
```

### 3.2 PowerSync Schema (`src/core/db/powersync/schema.ts`)

Define las tablas locales que PowerSync sincroniza:

```typescript
// Tablas: usuarios, tasas_cambio, departamentos, productos,
//         recetas, movimientos_inventario, metodos_pago
// Patron: mismo que vytalis (column.text para text, column.integer para boolean, column.real para numeric)
```

### 3.3 PowerSync Sync Rules (`powersync-sync-rules.yaml`)

```yaml
bucket_definitions:
  global:
    data:
      - SELECT * FROM usuarios
      - SELECT * FROM tasas_cambio
      - SELECT * FROM departamentos WHERE activo = true
      - SELECT * FROM productos
      - SELECT * FROM recetas
      - SELECT * FROM movimientos_inventario
      - SELECT * FROM metodos_pago WHERE activo = true
```

### 3.4 PowerSync Connector (`src/core/db/powersync/connector.ts`)
Copiar de vytalis, adaptar: quitar lógica de `clinical_entries` / `parseEntryData`, uploadData genérico.

### 3.5 PowerSync DB (`src/core/db/powersync/db.ts`)
```typescript
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'nexo21.db' },
});
```

### 3.6 PowerSync Provider (`src/core/db/powersync/provider.tsx`)
Copiar de vytalis, cambiar branding (logo Nexo21, texto "Cargando...").

### 3.7 Kysely Wrapper (`src/core/db/kysely/`)
- `kysely.ts`: `wrapPowerSyncWithKysely<DB>(powerSyncDb)`
- `types.ts`: Tipos manuales para Nexo21

### 3.8 Auth Provider (`src/core/auth/auth-provider.tsx`)
Copiar de vytalis exactamente. Misma lógica de connector.registerListener.

---

## Fase 4: App Shell

### 4.1 `src/main.tsx`
```typescript
// Providers: QueryClient -> AuthProvider -> PowerSyncProvider -> RouterProvider
// Sin ModuleProvider, ShellProvider, ContextMenuProvider, DndProvider (simplificar)
```

### 4.2 `src/index.css`
Tailwind 4 setup + CSS variables para el tema. Color primario: blue-600 (#2563eb).

### 4.3 Estructura de Rutas (`src/routes/`)

```
src/routes/
├── __root.tsx                    # Toaster + PWABanner
├── (auth)/
│   ├── route.tsx                 # Auth layout (centrado, fondo)
│   └── login.tsx                 # Formulario login
└── _app/
    ├── route.tsx                 # Auth guard + Sidebar + TopBar
    ├── dashboard.tsx             # Dashboard (placeholder)
    ├── configuracion/
    │   └── tasa-cambio.tsx       # Gestion de tasas
    └── inventario/
        ├── departamentos.tsx     # CRUD departamentos
        ├── productos.tsx         # CRUD productos/servicios
        ├── kardex.tsx            # Movimientos de inventario
        └── recetas.tsx           # Recetas (BOM)
```

### 4.4 Sidebar (`src/components/layout/sidebar.tsx`)
Replicar el patrón de vytalis (hover-expand desktop + drawer mobile), con la navegación de Nexo21:

```typescript
const menuItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  {
    title: 'Inventario',
    icon: Package,
    children: [
      { title: 'Departamentos', url: '/inventario/departamentos', icon: FolderTree },
      { title: 'Productos', url: '/inventario/productos', icon: ShoppingBag },
      { title: 'Kardex', url: '/inventario/kardex', icon: ArrowLeftRight },
      { title: 'Recetas', url: '/inventario/recetas', icon: BookOpen },
    ],
  },
  { title: 'Clientes', url: '/clientes', icon: Users, disabled: true },
  { title: 'Nueva Venta', url: '/ventas/nueva', icon: ShoppingCart, disabled: true },
  { title: 'Cuentas x Cobrar', url: '/cxc', icon: CreditCard, disabled: true },
  { title: 'Reportes', url: '/reportes', icon: BarChart3, disabled: true },
  { title: 'Clinica', url: '/clinica', icon: Heart, disabled: true },
  {
    title: 'Configuracion',
    icon: Settings,
    children: [
      { title: 'Tasas de Cambio', url: '/configuracion/tasa-cambio', icon: DollarSign },
    ],
  },
]
```

Items `disabled: true` se muestran grayed-out para indicar módulos futuros.

### 4.5 TopBar (`src/components/layout/top-bar.tsx`)
Barra superior: botón menu (mobile), título de sección, indicador de sincronización, usuario.

### 4.6 Sidebar Store (`src/stores/sidebar-store.ts`)
Copiar de vytalis exactamente.

### 4.7 Sync Status Indicator (`src/components/sync/sync-status-indicator.tsx`)
Indicador visual: verde (sincronizado), amarillo (sincronizando), rojo (offline). Usa PowerSync status.

---

## Fase 5: Feature - Configuracion (Tasas de Cambio)

### Archivos:
- `src/features/configuracion/hooks/use-tasas.ts` - Hook con Kysely queries
- `src/features/configuracion/schemas/tasa-schema.ts` - Zod schema (valor > 0)
- `src/features/configuracion/components/tasa-form.tsx` - Formulario inline para nueva tasa
- `src/features/configuracion/components/tasa-list.tsx` - Tabla de últimas 10 tasas
- `src/routes/_app/configuracion/tasa-cambio.tsx` - Página que compone form + list

### Lógica (replicando `fran/app_config`):
- Mostrar tasa actual destacada (card grande) + historial de últimas 10
- Formulario simple: input numérico (step 0.0001, precision 4 decimales) -> crear nuevo registro
- Inmutable: no editar, no borrar (enforced por triggers en Supabase)
- Ordenado por fecha DESC (más reciente primero)
- Conversiones USD<->Bs en tiempo real usando tasa actual

---

## Fase 6: Feature - Inventario

### 6.1 Departamentos

**Archivos:**
- `src/features/inventario/hooks/use-departamentos.ts`
- `src/features/inventario/schemas/departamento-schema.ts`
- `src/features/inventario/components/departamentos/departamento-form.tsx` (dialog modal)
- `src/features/inventario/components/departamentos/departamento-list.tsx` (DataTable)
- `src/routes/_app/inventario/departamentos.tsx`

**Lógica:**
- DataTable con columnas: código, nombre, activo, acciones
- Modal para crear/editar
- Código: auto-mayúsculas, solo A-Z/0-9/guiones, **inmutable después de crear**
- Nombre: min 3 chars, auto-mayúsculas
- Toggle activo/inactivo (no borrar)
- Validación: no desactivar si tiene productos activos

### 6.2 Productos/Servicios

**Archivos:**
- `src/features/inventario/hooks/use-productos.ts`
- `src/features/inventario/schemas/producto-schema.ts`
- `src/features/inventario/components/productos/producto-form.tsx`
- `src/features/inventario/components/productos/producto-list.tsx`
- `src/features/inventario/components/productos/precio-display.tsx`
- `src/routes/_app/inventario/productos.tsx`

**Lógica (replicando `fran/app_inventory`):**
- **Cards resumen** encima de tabla: total valor inventario, cantidad productos stock critico
- DataTable con filtros por departamento, tipo (P/S), activo
- Modal formulario: código (inmutable post-creación), tipo, nombre, departamento, costos/precios, medida
- **Validaciones Zod**: `precio_venta_usd >= costo_usd`, `precio_mayor_usd <= precio_venta_usd`
- **Servicios (tipo='S')**: campos stock y stock_minimo ocultos/disabled
- Mostrar precios en USD y Bs (calculado con tasa actual)
- Stock es **read-only** (solo cambia por Kardex)
- Indicador visual si stock < stock_minimo (badge rojo "BAJO")

### 6.3 Kardex (Movimientos de Inventario)

**Archivos:**
- `src/features/inventario/hooks/use-kardex.ts`
- `src/features/inventario/schemas/kardex-schema.ts`
- `src/features/inventario/components/kardex/kardex-list.tsx`
- `src/features/inventario/components/kardex/movimiento-form.tsx`
- `src/routes/_app/inventario/kardex.tsx`

**Lógica (replicando `fran/app_inventory` registrar_movimiento):**
- DataTable: producto, tipo (E/S badge color), origen, cantidad, stock anterior->nuevo, motivo, usuario, fecha
- Filtros: por producto (búsqueda), por tipo, por rango de fechas
- Formulario de ajuste manual (dialog): seleccionar producto, tipo (E/S), cantidad (>0), motivo
- Al guardar (flujo atómico):
  1. Leer stock actual del producto
  2. Calcular `stock_nuevo = stock_anterior +/- cantidad`
  3. Validar no negativo (si salida): `stock_nuevo >= 0`
  4. Crear movimiento (origen='MAN') + actualizar `producto.stock = stock_nuevo`
  5. `usuario_id` = usuario autenticado actual
- Registros inmutables: no hay botones editar/borrar
- Solo productos tipo 'P' pueden tener movimientos manuales

### 6.4 Recetas (Bill of Materials)

**Archivos:**
- `src/features/inventario/hooks/use-recetas.ts`
- `src/features/inventario/schemas/receta-schema.ts`
- `src/features/inventario/components/recetas/receta-manager.tsx`
- `src/features/inventario/components/recetas/ingrediente-form.tsx`
- `src/routes/_app/inventario/recetas.tsx`

**Lógica:**
- Seleccionar servicio (tipo='S') -> mostrar sus ingredientes
- Agregar ingrediente: seleccionar producto (tipo='P'), cantidad
- Editar cantidad de ingrediente existente
- Eliminar ingrediente
- Constraint: combinación (servicio + producto) única

---

## Fase 7: Componentes UI (shadcn/ui)

Instalar con `npx shadcn@latest add`:

```
button, input, label, select, dialog, dropdown-menu, popover,
separator, tabs, tooltip, checkbox, scroll-area, card, badge,
table, skeleton, command, sonner
```

Componentes custom:
- `src/components/ui/data-table.tsx` - Tabla genérica con TanStack Table
- `src/components/ui/currency-display.tsx` - Muestra USD + Bs
- `src/components/ui/confirm-dialog.tsx` - Dialog de confirmación

---

## Fase 8: Utilidades

- `src/lib/utils.ts` - `cn()` (twMerge + clsx)
- `src/lib/currency.ts` - Helpers bimonetarios:
  - `usdToBs(usd, tasa)` / `bsToUsd(bs, tasa)`
  - `formatUsd(val)` / `formatBs(val)`
- `src/lib/format.ts` - Formateo fechas, números

---

## Estructura Final de Archivos

```
Nexo21/
├── src/
│   ├── main.tsx
│   ├── index.css
│   ├── routeTree.gen.ts          (auto-generado)
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── (auth)/
│   │   │   ├── route.tsx
│   │   │   └── login.tsx
│   │   └── _app/
│   │       ├── route.tsx
│   │       ├── dashboard.tsx
│   │       ├── configuracion/
│   │       │   └── tasa-cambio.tsx
│   │       └── inventario/
│   │           ├── departamentos.tsx
│   │           ├── productos.tsx
│   │           ├── kardex.tsx
│   │           └── recetas.tsx
│   ├── core/
│   │   ├── auth/
│   │   │   └── auth-provider.tsx
│   │   ├── db/
│   │   │   ├── powersync/
│   │   │   │   ├── connector.ts
│   │   │   │   ├── db.ts
│   │   │   │   ├── provider.tsx
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   └── kysely/
│   │   │       ├── kysely.ts
│   │   │       └── types.ts
│   │   └── hooks/
│   │       └── use-current-user.ts
│   ├── features/
│   │   ├── auth/
│   │   │   └── components/
│   │   │       └── login-page.tsx
│   │   ├── dashboard/
│   │   │   └── components/
│   │   │       └── dashboard-page.tsx
│   │   ├── configuracion/
│   │   │   ├── hooks/
│   │   │   │   └── use-tasas.ts
│   │   │   ├── schemas/
│   │   │   │   └── tasa-schema.ts
│   │   │   └── components/
│   │   │       ├── tasa-form.tsx
│   │   │       └── tasa-list.tsx
│   │   └── inventario/
│   │       ├── hooks/
│   │       │   ├── use-departamentos.ts
│   │       │   ├── use-productos.ts
│   │       │   ├── use-kardex.ts
│   │       │   └── use-recetas.ts
│   │       ├── schemas/
│   │       │   ├── departamento-schema.ts
│   │       │   ├── producto-schema.ts
│   │       │   ├── kardex-schema.ts
│   │       │   └── receta-schema.ts
│   │       └── components/
│   │           ├── departamentos/
│   │           │   ├── departamento-form.tsx
│   │           │   └── departamento-list.tsx
│   │           ├── productos/
│   │           │   ├── producto-form.tsx
│   │           │   ├── producto-list.tsx
│   │           │   └── precio-display.tsx
│   │           ├── kardex/
│   │           │   ├── kardex-list.tsx
│   │           │   └── movimiento-form.tsx
│   │           └── recetas/
│   │               ├── receta-manager.tsx
│   │               └── ingrediente-form.tsx
│   ├── components/
│   │   ├── ui/                   (shadcn/ui)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── top-bar.tsx
│   │   │   └── page-header.tsx
│   │   ├── pwa/
│   │   │   └── pwa-install-banner.tsx
│   │   └── sync/
│   │       └── sync-status-indicator.tsx
│   ├── hooks/
│   │   ├── use-pwa-install.ts
│   │   └── use-mobile.ts
│   ├── stores/
│   │   └── sidebar-store.ts
│   └── lib/
│       ├── utils.ts
│       ├── currency.ts
│       └── format.ts
├── public/
│   ├── manifest.json
│   └── icons/
├── powersync-sync-rules.yaml
├── supabase-setup.sql
├── vite.config.ts
├── tsconfig.json
├── package.json
├── components.json
├── .env.example
└── index.html
```

---

## Orden de Implementacion

1. **Scaffold**: package.json, vite.config, tsconfig, index.html, .env.example
2. **Instalar dependencias**: `npm install`
3. **shadcn/ui init**: `npx shadcn@latest init` + agregar componentes
4. **Core DB**: schema.ts, db.ts, connector.ts, provider.tsx, kysely wrapper, types
5. **Auth**: auth-provider.tsx, login page
6. **App Shell**: main.tsx, __root.tsx, _app/route.tsx, sidebar, topbar
7. **Configuracion**: tasa de cambio (form + list + hook + schema)
8. **Inventario - Departamentos**: CRUD completo
9. **Inventario - Productos**: CRUD con validaciones bimonetarias
10. **Inventario - Kardex**: Movimientos con lógica de stock
11. **Inventario - Recetas**: BOM manager
12. **PWA**: manifest.json, install banner, sync indicator
13. **Supabase SQL**: Ejecutar setup cuando el usuario tenga el proyecto Supabase listo

---

## Archivos de Referencia en vytalis-frontend

| Archivo Nexo21 | Basado en (vytalis) |
|-----------------|---------------------|
| `vite.config.ts` | `vytalis-frontend/vite.config.ts` (copiar, ajustar) |
| `tsconfig.json` | `vytalis-frontend/tsconfig.json` (copiar) |
| `core/db/powersync/connector.ts` | `vytalis-frontend/src/core/db/powersync/connector.ts` (adaptar) |
| `core/db/powersync/db.ts` | `vytalis-frontend/src/core/db/powersync/db.ts` (cambiar dbFilename) |
| `core/db/powersync/provider.tsx` | `vytalis-frontend/src/core/db/powersync/provider.tsx` (cambiar branding) |
| `core/db/powersync/schema.ts` | `vytalis-frontend/src/core/db/powersync/schema.ts` (nuevas tablas) |
| `core/db/kysely/kysely.ts` | `vytalis-frontend/src/core/db/kysely/kysely.ts` (copiar) |
| `core/auth/auth-provider.tsx` | `vytalis-frontend/src/core/auth/auth-provider.tsx` (copiar) |
| `stores/sidebar-store.ts` | `vytalis-frontend/src/stores/sidebar-store.ts` (copiar) |
| `components/layout/sidebar.tsx` | `vytalis-frontend/src/components/layout/sidebar.tsx` (adaptar nav) |
| `hooks/use-pwa-install.ts` | `vytalis-frontend/src/hooks/use-pwa-install.ts` (copiar) |
| `main.tsx` | `vytalis-frontend/src/main.tsx` (simplificar providers) |

---

## Verificacion

1. `npm run dev` -> App carga sin errores
2. Login con Supabase -> Sesión persiste
3. Crear tasa de cambio -> Aparece en lista, no se puede editar
4. CRUD departamentos -> Código inmutable, nombre editable
5. CRUD productos -> Validaciones de precios, servicios sin stock
6. Ajuste Kardex -> Stock se actualiza, movimiento inmutable
7. Recetas -> Agregar/editar/eliminar ingredientes
8. PWA -> Instalable en Chrome/Edge, funciona offline
9. Offline -> Hacer cambios sin internet, reconectar -> datos sincronizados
10. Responsive -> Sidebar drawer en mobile, hover-expand en desktop

---

## Fases Futuras (documentadas del proyecto fran para referencia)

### Fase F1: Clientes (replicando `fran/app_clients`)

**Tablas Supabase adicionales**: `clientes`, `movimientos_cuenta`

**Modelo Cliente** (`fran/app_clients/models.py: cli_cliente`):
- `identificacion` (V-12345678, J-98765432) - único, inmutable
- `nombre_social`, `direccion`, `telefono`
- `limite_credito` (Decimal 12,2 USD)
- `saldo_actual` (Decimal 12,2) - **SOLO se modifica via trigger/signal**

**Modelo Movimiento Cuenta** (`cli_movimiento`):
- tipo: FAC (factura), PAG (pago), NCR (nota crédito), NDB (nota débito)
- `monto`, `saldo_anterior`, `saldo_nuevo` - inmutables

**Signal critico** (`fran/app_clients/signals.py: SIG_CLI_01`):
- En Django: `post_save` de `cli_movimiento` actualiza `cliente.saldo_actual`
- En Supabase: se replica como trigger PostgreSQL `AFTER INSERT ON movimientos_cuenta`
- FAC/NDB -> suma al saldo (aumenta deuda)
- PAG/NCR -> resta del saldo (reduce deuda)

**UI**: Lista de clientes + modal crear/editar + búsqueda AJAX (min 2 chars, max 10 resultados)

---

### Fase F2: Ventas/POS (replicando `fran/app_sales/views.py: crear_venta`)

**Tablas**: `ventas`, `detalle_venta`, `pagos`, `metodos_pago`, `notas_credito`

**Flujo atomico completo** (transaction.atomic + select_for_update en fran):
1. Bloquear cliente
2. Crear cabecera venta (foto tasa, totales USD/Bs, auto-generar nro_factura con zfill 6)
3. Por cada línea:
   - Si PRODUCTO: validar stock -> restar stock -> crear kardex (origen='VEN')
   - Si SERVICIO: explotar receta -> por cada ingrediente: validar stock -> restar -> kardex (origen='AJU')
4. Procesar pagos (USD directo, BS convertir con tasa)
5. Si CREDITO y queda saldo > $0.01: crear `movimiento_cuenta` tipo FAC -> trigger actualiza saldo

**Pagos bimonetarios**: cada pago tiene moneda, tasa, monto original, monto_usd normalizado

---

### Fase F3: Cuentas por Cobrar (replicando `fran/app_sales/views.py` + `cxc_gestion.js`)

**Pago a factura especifica**: validar monto <= saldo pendiente -> crear pago -> reducir `venta.saldo_pend_usd` -> crear `movimiento_cuenta` PAG

**Abono global FIFO** (`procesar_abono_global` en fran):
1. Convertir a USD si paga en BS
2. Obtener facturas pendientes ORDER BY fecha ASC
3. Cascada: `monto_aplicar = min(saldo_factura, monto_restante)` por cada factura
4. Sobrante -> anticipo (pago sin factura, `pag_venta=NULL`)
5. UN solo `movimiento_cuenta` PAG por el total -> trigger actualiza saldo UNA vez

---

### Fase F4: Notas de Credito (replicando `fran/app_sales/models.py: ven_nota_credito`)

- OneToOne con venta (una nota por factura)
- Snapshot: tasa historica, montos USD/Bs
- Genera `movimiento_cuenta` tipo NCR -> trigger reduce saldo cliente

---

### Fase F5: Reportes - Cuadre de Caja (replicando `fran/app_sales/views.py: get_datos_cuadre`)

**KPIs del dia**:
- Total USD, Total BS, cantidad tickets, ticket promedio
- Margen ganancia: `sum((precio_venta - costo) * cantidad) / total * 100`
- Ventas por departamento (agrupado)
- CxC del dia (ventas credito con saldo pendiente)
- Pagos por metodo
- Top 15 productos mas vendidos
- Auditoria: listado completo de facturas con datos del cliente
