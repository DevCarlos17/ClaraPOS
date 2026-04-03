# CLAUDE.md - Nexo21: Sistema POS + Gestion de Negocio

## Identidad del Proyecto

**Nexo21** es un sistema POS (Point of Sale) + Gestion de Negocio para clinica estetica, con operacion **bimonetaria** (USD base + Bolivares via tasa de cambio) y **auditoria inmutable** sobre todos los registros financieros. El sistema se construye como una **PWA offline-first** con sincronizacion eventual.

- **Idioma**: Solo espanol (sin i18n)
- **Monorepo**: `front/` (React PWA) + `backend/` (Supabase + Edge Functions)
- **Referencia de negocio**: `WORKFLOW_CLARAPOS.md` (en directorio padre `Nexo/`)
- **Referencia de arquitectura frontend**: `vytalis-frontend` (en `ContApp/vytalis-frontend`)
- **Referencia de logica de negocio**: Proyecto Django `fran` (en `ContApp/fran`)

---

## Estructura del Monorepo

```
Nexo21/
├── CLAUDE.md                 # (este archivo) Contexto maestro del proyecto
├── PLANIFICACION.md          # Plan detallado de implementacion por fases
├── front/                    # Frontend: React 19 PWA offline-first
│   ├── .claude/
│   │   ├── settings.local.json
│   │   └── agents/           # 9 agentes frontend especializados
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── ...
└── backend/                  # Backend: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
    ├── .claude/
    │   ├── settings.local.json
    │   └── agents/           # 11 agentes backend especializados
    ├── supabase-setup.sql
    ├── powersync-sync-rules.yaml
    └── ...
```

---

## Stack Tecnologico

### Frontend (`front/`)

| Capa | Tecnologia |
|------|------------|
| Framework | React 19 + TypeScript + Vite |
| Routing | TanStack Router (file-based, auto code-splitting) |
| Formularios | TanStack Form + Zod validation |
| Server State | TanStack React Query |
| Tablas | TanStack Table |
| Client State | Zustand |
| Offline DB | PowerSync (SQLite via wa-sqlite) + Kysely (query builder) |
| Backend | Supabase (auth, realtime, storage) |
| UI | Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| Iconos | Lucide React |
| Animaciones | Framer Motion |
| Notificaciones | Sonner |
| Command Palette | cmdk |
| PWA | vite-plugin-pwa (Workbox) |
| WASM | vite-plugin-wasm + vite-plugin-top-level-await |

### Backend (`backend/`)

| Capa | Tecnologia |
|------|------------|
| Base de datos | PostgreSQL (via Supabase) |
| Auth | Supabase Auth |
| Seguridad | Row Level Security (RLS) policies |
| Sync | PowerSync Cloud |
| Edge Functions | Supabase Edge Functions (Deno) - para logica compleja futura |
| Triggers | PostgreSQL triggers para inmutabilidad y signals |

---

## Sistema de Agentes

El proyecto usa agentes Claude especializados organizados por dominio. Cada carpeta (`front/`, `backend/`) tiene su propio orquestador y equipo de agentes.

### Frontend: 9 Agentes

| Agente | Rol | Escribe Codigo? |
|--------|-----|-----------------|
| **frontend-agent-orchestrator** | Dispatcher central. Analiza intent, selecciona agentes, define orden de ejecucion | No |
| **senior-frontend-specialist** | Implementador elite. Componentes, hooks, Tailwind, refactoring | **Si** |
| **frontend-architecture-reviewer** | Analisis arquitectonico read-only. Scorecard 5 estrellas, deuda tecnica | No |
| **frontend-code-reviewer** | Review PR-style de codigo reciente. 8 criterios de evaluacion | No |
| **ux-ui-reviewer** | Review de UX/UI. Accesibilidad, consistencia visual, flujos de usuario | No |
| **dx-standards-guardian** | Auditoria de DX. Naming, tipos, ESLint, complejidad cognitiva | No |
| **frontend-debug-analyst** | Diagnostico de bugs. Metodologia 6 pasos, handoff al implementador | No |
| **react-perf-auditor** | Auditoria de rendimiento. Re-renders, hooks, memoizacion, bundle size | No |
| **frontend-security-guardian** | Auditoria de seguridad. XSS, inputs, tokens, storage, third-party | No |

**Flujo tipico**: Orquestador -> Architecture Reviewer -> Frontend Specialist -> Code Reviewer -> (opcional) Perf/Security/UX

### Backend: 11 Agentes

| Agente | Rol | Escribe Codigo? |
|--------|-----|-----------------|
| **backend-orchestrator** | Coordinador senior. Produce planes de delegacion estructurados | No |
| **backend-specialist** | Implementador elite. Endpoints, servicios, middleware, integraciones | **Si** |
| **backend-architect** | Guia arquitectonica estrategica. Decisiones y trade-offs | No |
| **backend-code-reviewer** | Review de codigo backend. Correctness, seguridad, patterns | No |
| **backend-debug-expert** | Diagnostico de errores runtime y performance | No |
| **api-designer** | Diseno de API REST. Contratos, schemas, paginacion, versionado | No |
| **backend-performance-optimizer** | Optimizacion. N+1, indices, caching, connection pooling | No |
| **database-specialist** | Esquema DB, queries, migraciones, RLS, indices | **Si** (SQL) |
| **data-integrity-guardian** | Integridad transaccional, constraints, validaciones | No |
| **security-guardian** | Auditoria de seguridad. Auth, injection, payments, headers | No |
| **infra-deploy-advisor** | Infraestructura, CI/CD, monitoring, logging, deploy | No |

**Flujo tipico**: Orquestador -> Architect/API Designer -> Backend Specialist -> Code Reviewer -> (opcional) Security/Performance/Data Integrity

---

## Dominio de Negocio

### Modulos del Sistema

| # | Modulo | Estado | Descripcion |
|---|--------|--------|-------------|
| 1 | **Configuracion** | Fase 1 | Tasas de cambio USD/Bs |
| 2 | **Inventario** | Fase 1 | Departamentos, Productos/Servicios, Kardex, Recetas |
| 3 | Clientes | Futuro | Ficha maestra + libro auxiliar de cuenta |
| 4 | Ventas (POS) | Futuro | Facturacion bimonetaria + descuento de inventario |
| 5 | Cuentas x Cobrar | Futuro | Pagos a facturas + abono global FIFO |
| 6 | Clinica | Futuro | Historias clinicas, sesiones, fotos, mapas anatomicos |
| 7 | Reportes | Futuro | Cuadre de caja, KPIs |

### Reglas de Negocio Criticas

Estas reglas son **inviolables** y deben respetarse en todo el codigo:

1. **Bimonetario**: USD es moneda base. Bolivares se calculan multiplicando por tasa de cambio vigente. Cada transaccion "fotografia" la tasa del momento.

2. **Inmutabilidad financiera**: Los siguientes registros **nunca** se editan ni borran:
   - `tasas_cambio` - Solo se crean nuevas
   - `movimientos_inventario` (Kardex) - Snapshot de stock antes/despues
   - `movimientos_cuenta` (futuro) - Snapshot de saldo antes/despues

3. **Stock solo via Kardex**: El campo `producto.stock` **jamas** se edita directamente. Solo se modifica como efecto de crear un `movimiento_inventario`.

4. **Saldo solo via signals**: El campo `cliente.saldo_actual` (futuro) **jamas** se edita directamente. Solo se modifica via trigger PostgreSQL al insertar un `movimiento_cuenta`.

5. **Codigos inmutables**: `departamento.codigo`, `producto.codigo`, `cliente.identificacion` no pueden cambiar despues de crearse.

6. **Servicios sin stock**: Productos tipo 'S' (servicio) tienen `stock = 0` y `stock_minimo = 0` siempre. Consumen productos via recetas al venderse.

7. **Validaciones de precios**: `precio_venta_usd >= costo_usd` y `precio_mayor_usd <= precio_venta_usd`.

8. **Stock no negativo**: Las salidas de inventario no pueden dejar el stock en negativo.

9. **Operaciones atomicas**: Las operaciones financieras (ventas, pagos) deben ser transaccionales. Si falla un paso, todo se revierte.

10. **Precision decimal**: Campos financieros usan `NUMERIC` (nunca `float`). Precios: 2 decimales. Tasas: 4 decimales. Stock: 3 decimales.

---

## Esquema de Base de Datos

### Tablas (Fase 1)

```
usuarios           - Enlaza con auth.users de Supabase
tasas_cambio       - Historial de tasas USD/Bs (inmutable)
departamentos      - Categorias de productos
productos          - Catalogo maestro (Productos tipo='P' y Servicios tipo='S')
recetas            - BOM: que productos consume un servicio
movimientos_inventario  - Kardex: toda entrada/salida de stock (inmutable)
metodos_pago       - Catalogo de formas de pago
```

### Tablas (Fases Futuras)

```
clientes           - Ficha maestra con saldo_actual
movimientos_cuenta - Libro auxiliar del cliente (inmutable)
ventas             - Cabecera de factura con foto de tasa
detalle_venta      - Lineas de factura con precio historico
pagos              - Pagos bimonetarios con conversion
notas_credito      - Anulacion de facturas
```

### Triggers PostgreSQL

| Trigger | Tabla | Funcion |
|---------|-------|---------|
| `trg_*_updated` | usuarios, departamentos, productos | Auto-actualizar `updated_at` |
| `trg_kardex_no_update` | movimientos_inventario | Prevenir UPDATE |
| `trg_kardex_no_delete` | movimientos_inventario | Prevenir DELETE |
| `trg_tasa_no_update` | tasas_cambio | Prevenir UPDATE |
| `trg_tasa_no_delete` | tasas_cambio | Prevenir DELETE |
| `on_auth_user_created` | auth.users | Auto-crear registro en `usuarios` |

### RLS (Row Level Security)

- Todas las tablas tienen RLS habilitado
- Usuarios autenticados pueden leer todo (SELECT)
- Usuarios autenticados pueden insertar en todas las tablas
- Solo UPDATE permitido en: departamentos, productos, metodos_pago
- Solo DELETE permitido en: recetas
- Tablas inmutables no permiten UPDATE ni DELETE via RLS (+ triggers como segunda capa)

---

## Sincronizacion Offline (PowerSync)

### Arquitectura

```
[React App] <-> [SQLite local (wa-sqlite)] <-> [PowerSync Cloud] <-> [Supabase PostgreSQL]
```

- **Escrituras locales**: Se ejecutan en SQLite via `db.writeTransaction()` (atomicidad local)
- **Sync eventual**: PowerSync sincroniza cambios con Supabase en background
- **Conflict resolution**: Last-write-wins (PowerSync default)
- **Bucket strategy**: Un solo bucket `global` para Fase 1 (todos los usuarios ven todo)

### PowerSync Connector

El connector maneja:
- Autenticacion via Supabase (JWT tokens)
- Upload de cambios locales a Supabase (PUT/PATCH/DELETE -> upsert/update/delete)
- Persistencia de sesion offline (sin depender de Supabase client directamente)

---

## Estructura Frontend (`front/src/`)

```
src/
├── main.tsx                  # Entry point: QueryClient -> AuthProvider -> PowerSyncProvider -> RouterProvider
├── index.css                 # Tailwind 4 + CSS variables (theme azul #2563eb)
├── routes/                   # TanStack Router file-based routing
│   ├── __root.tsx            # Toaster + PWABanner
│   ├── (auth)/               # Rutas publicas (login)
│   │   ├── route.tsx         # Layout: redirect a dashboard si ya autenticado
│   │   └── login.tsx
│   └── _app/                 # Rutas protegidas (requiere auth)
│       ├── route.tsx         # Layout: auth guard + Sidebar + TopBar
│       ├── dashboard.tsx
│       ├── configuracion/
│       │   └── tasa-cambio.tsx
│       └── inventario/
│           ├── departamentos.tsx
│           ├── productos.tsx
│           ├── kardex.tsx
│           └── recetas.tsx
├── core/                     # Infraestructura compartida
│   ├── auth/
│   │   └── auth-provider.tsx # Manejo de sesion Supabase + PowerSync connector
│   ├── db/
│   │   ├── powersync/        # Schema, connector, db instance, provider
│   │   └── kysely/           # Query builder tipado (types.ts + kysely.ts)
│   └── hooks/
│       └── use-current-user.ts
├── features/                 # Modulos de negocio (feature-based organization)
│   ├── auth/components/
│   ├── dashboard/components/
│   ├── configuracion/
│   │   ├── hooks/            # use-tasas.ts
│   │   ├── schemas/          # tasa-schema.ts (Zod)
│   │   └── components/       # tasa-form.tsx, tasa-list.tsx
│   └── inventario/
│       ├── hooks/            # use-departamentos, use-productos, use-kardex, use-recetas
│       ├── schemas/          # Zod schemas por entidad
│       └── components/       # Subcarpetas: departamentos/, productos/, kardex/, recetas/
├── components/               # Componentes compartidos
│   ├── ui/                   # shadcn/ui (button, input, dialog, table, etc.)
│   ├── layout/               # sidebar.tsx, top-bar.tsx, page-header.tsx
│   ├── pwa/                  # pwa-install-banner.tsx
│   └── sync/                 # sync-status-indicator.tsx
├── hooks/                    # Hooks globales
│   ├── use-pwa-install.ts
│   └── use-mobile.ts
├── stores/                   # Zustand stores
│   └── sidebar-store.ts
└── lib/                      # Utilidades puras
    ├── utils.ts              # cn() = twMerge + clsx
    ├── currency.ts           # usdToBs(), bsToUsd(), formatUsd(), formatBs()
    └── format.ts             # Formateo de fechas y numeros
```

### Patrones Frontend

- **Feature-based organization**: Cada modulo tiene sus hooks, schemas y components
- **Hooks como data layer**: Cada feature expone hooks que encapsulan queries Kysely contra PowerSync
- **Zod para validacion**: Schemas Zod en carpeta `schemas/` de cada feature, usados en formularios
- **Componentes de presentacion**: Components reciben datos via props, hooks manejan la logica
- **shadcn/ui como base**: Todos los componentes UI derivan de shadcn, customizados via Tailwind
- **DataTable generico**: Componente `data-table.tsx` basado en TanStack Table, reutilizado en todas las listas
- **Dialogs para formularios**: Crear/editar entidades usa Dialog modals
- **Sonner para feedback**: Toast notifications para operaciones exitosas/fallidas
- **Path alias**: `@/` mapea a `./src/`

### Convenciones Frontend

- **TypeScript estricto**: No `any`, no `as` salvo casos justificados
- **Named exports**: Siempre `export function`, nunca default exports
- **Naming**: PascalCase componentes, camelCase hooks/utils, kebab-case archivos
- **Sin comentarios obvios**: Solo comentar logica no evidente
- **Auto-mayusculas**: Nombres y codigos se transforman a mayusculas en la UI
- **Responsive**: Mobile-first. Sidebar drawer en mobile, hover-expand en desktop

---

## Convenciones de Base de Datos

- **UUIDs**: Todas las PKs son UUID v4
- **Timestamps**: `created_at` y `updated_at` con timezone (TIMESTAMPTZ)
- **Booleanos en PowerSync**: Se mapean como `column.integer` (0/1) porque SQLite no tiene boolean nativo
- **Decimals en PowerSync**: Se mapean como `column.text` (strings) para preservar precision
- **Nombres de tabla**: snake_case, plural en espanol
- **Nombres de columna**: snake_case en espanol
- **Indices**: En columnas usadas frecuentemente en WHERE y ORDER BY

---

## Fases de Implementacion

### Fase 1 (Actual) - Shell + Configuracion + Inventario

1. Scaffold del proyecto (Vite + React + TS + deps)
2. shadcn/ui init + componentes base
3. Core DB (PowerSync schema + connector + Kysely types)
4. Auth (Supabase auth + provider + login)
5. App Shell (rutas, sidebar, topbar, sync indicator)
6. Configuracion: Tasas de cambio (form + lista + inmutabilidad)
7. Inventario: Departamentos (CRUD + codigo inmutable)
8. Inventario: Productos/Servicios (CRUD + validaciones precios + bimonetario)
9. Inventario: Kardex (movimientos atomicos + stock update)
10. Inventario: Recetas (BOM para servicios)
11. PWA (manifest, install banner, offline)
12. Supabase SQL setup

### Fase F1 (Futura) - Clientes
- Ficha maestra con identificacion inmutable
- Libro auxiliar de cuenta con signal para saldo
- Busqueda AJAX (min 2 chars, max 10 resultados)

### Fase F2 (Futura) - Ventas/POS
- Flujo atomico completo con kardex automatico
- Explosion de recetas para servicios
- Pagos bimonetarios multiples
- Credito con movimiento de cuenta

### Fase F3 (Futura) - Cuentas por Cobrar
- Pago a factura especifica
- Abono global FIFO (cascada por fecha)

### Fase F4 (Futura) - Notas de Credito
- Anulacion de facturas con snapshot historico

### Fase F5 (Futura) - Reportes
- Cuadre de caja: KPIs, ventas por depto, top productos, auditoria

### Fase F6 (Futura) - Clinica
- Historias clinicas, sesiones, fotos antes/despues, mapas anatomicos

---

## Proyectos de Referencia

| Proyecto | Ruta | Que aporta |
|----------|------|------------|
| `vytalis-frontend` | `ContApp/vytalis-frontend` | Arquitectura exacta: React 19 + Vite + PowerSync + Supabase + PWA. Se copian y adaptan: vite.config, tsconfig, connector, provider, auth, sidebar, stores |
| `fran` (ClaraPos) | `ContApp/fran` | Logica de negocio probada en Django: modelos, validaciones, signals, flujos atomicos, UI patterns. Se replican las reglas exactas |
| `WORKFLOW_CLARAPOS.md` | `ContApp/Nexo/` | Documentacion completa de todos los workflows del negocio |

---

## Variables de Entorno

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_POWERSYNC_URL=https://xxx.powersync.journeyapps.com
```

---

## Comandos Clave

```bash
# Frontend (desde front/)
npm run dev          # Servidor de desarrollo
npm run build        # Build de produccion
npm run type-check   # Verificacion de tipos TypeScript
npx shadcn@latest add [component]  # Agregar componente shadcn/ui

# Supabase SQL
# Ejecutar supabase-setup.sql en el SQL Editor de Supabase Dashboard
```

---

## Notas para Agentes

### Al implementar features:

1. **Leer PLANIFICACION.md** para detalle completo de cada fase
2. **Consultar WORKFLOW_CLARAPOS.md** para reglas de negocio exactas
3. **Referenciar vytalis-frontend** para patrones de arquitectura (connector, provider, sidebar, auth)
4. **Referenciar fran** para logica de negocio (validaciones, flujos atomicos, signals)
5. **Respetar inmutabilidad**: Nunca crear UI de editar/borrar para registros inmutables
6. **Respetar bimonetario**: Siempre mostrar USD y Bs donde corresponda
7. **Respetar offline-first**: Usar `db.writeTransaction()` para operaciones atomicas locales
8. **Validar con Zod**: Toda entrada de usuario pasa por schema Zod antes de llegar a la DB
9. **Solo espanol**: Todos los textos, labels, mensajes, placeholders en espanol

### Al revisar codigo:

1. Verificar que las 10 reglas de negocio criticas se cumplen
2. Verificar TypeScript estricto (no `any`)
3. Verificar que registros inmutables no tienen UI de edicion/borrado
4. Verificar que stock y saldos no se editan directamente
5. Verificar precision decimal correcta en cada campo
6. Verificar que la UI es responsive (mobile + desktop)
7. Verificar que los estados loading/error/empty estan cubiertos
