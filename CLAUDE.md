# CLAUDE.md - ClaraPOS: Sistema POS + Gestion de Negocio

## Identidad del Proyecto

**ClaraPOS** es un sistema POS (Point of Sale) + Gestion de Negocio **multi-tenant** para clinica estetica, con operacion **bimonetaria** (USD base + Bolivares via tasa de cambio) y **auditoria inmutable** sobre todos los registros financieros. El sistema se construye como una **PWA offline-first** con sincronizacion eventual, desplegada en **Cloudflare Workers**.

- **Idioma**: Solo espanol (sin i18n)
- **Multi-tenant**: Cada empresa tiene sus datos aislados via `empresa_id` en todas las tablas y queries
- **Permisos**: Sistema de roles dinamicos (`roles` + `rol_permisos` + `tenant_permisos`). Niveles base: 1=Propietario, 2=Supervisor, 3=Cajero
- **Package manager**: `yarn` (v1.22.22) — nunca usar `npm`
- **Referencia de negocio**: `WORKFLOW_CLARAPOS.md` (en directorio padre `Nexo/`)
- **Referencia de arquitectura frontend**: `vytalis-frontend` (en `ContApp/vytalis-frontend`)
- **Referencia de logica de negocio**: Proyecto Django `fran` (en `ContApp/fran`)

---

## Estructura del Proyecto

> **IMPORTANTE**: El proyecto es un **frontend puro**. No existe carpeta `front/` ni `backend/` — todo el codigo vive en la raiz del repo.

```
ClaraPOS/                     # Raiz del repo = raiz del frontend
├── CLAUDE.md                 # (este archivo) Contexto maestro del proyecto
├── PLANIFICACION.md          # Plan detallado de implementacion por fases
├── package.json              # Dependencias y scripts (yarn)
├── vite.config.ts            # Config Vite + PWA + WASM + CF Workers
├── wrangler.toml             # Config despliegue Cloudflare Workers
├── src/                      # Todo el codigo fuente
│   ├── main.tsx
│   ├── routes/
│   ├── features/
│   ├── components/
│   ├── core/
│   ├── stores/
│   ├── hooks/
│   └── lib/
├── public/
└── .claude/
    └── agents/               # Agentes Claude especializados
```

---

## Stack Tecnologico

### Frontend

| Capa | Tecnologia |
|------|------------|
| Framework | React 19 + TypeScript + Vite 7 |
| Routing | TanStack Router (file-based, auto code-splitting) |
| Formularios | TanStack Form + Zod v4 |
| Server State | TanStack React Query v5 |
| Tablas | TanStack Table |
| Client State | Zustand |
| Offline DB | PowerSync (SQLite via wa-sqlite) + Kysely (query builder) |
| Backend | Supabase (auth, realtime, storage) |
| UI | Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| Iconos | Lucide React + Phosphor Icons |
| Animaciones | Framer Motion |
| Notificaciones | Sonner |
| Command Palette | cmdk |
| Graficos | Recharts |
| Calendario | FullCalendar (react, daygrid, timegrid, interaction, list) |
| Exportacion | jsPDF + jspdf-autotable, xlsx |
| Temas | next-themes (dark mode) |
| Fechas | date-fns |
| PWA | vite-plugin-pwa (Workbox) |
| WASM | vite-plugin-wasm + vite-plugin-top-level-await |
| Deploy | Cloudflare Workers (wrangler) |

### Backend (Supabase — sin carpeta local)

| Capa | Tecnologia |
|------|------------|
| Base de datos | PostgreSQL (via Supabase) |
| Auth | Supabase Auth |
| Seguridad | Row Level Security (RLS) policies |
| Sync | PowerSync Cloud |
| Edge Functions | Supabase Edge Functions (Deno) |
| Triggers | PostgreSQL triggers para inmutabilidad y signals |

> No existe carpeta `backend/` en el repo. Las migraciones SQL y sync rules viven en `migrations/` y `powersync-sync-rules.yaml` en la raiz.

---

## Sistema de Agentes

Los agentes Claude especializados viven en `.claude/agents/`.

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

---

## Dominio de Negocio

### Modulos del Sistema

| # | Modulo | Estado | Descripcion |
|---|--------|--------|-------------|
| 1 | **Configuracion** | Implementado | Tasas de cambio, Metodos de pago, Bancos, Cajas, Impuestos, Niveles de precio, Datos empresa, Usuarios (CRUD) |
| 2 | **Inventario** | Implementado | Departamentos, Productos/Servicios, Marcas, Unidades, Depositos, Kardex, Recetas, Lotes, Ajustes |
| 3 | **Clientes** | Implementado | Ficha maestra + CxC + vencimientos |
| 4 | **Ventas (POS)** | Implementado | Facturacion bimonetaria + kardex automatico + pagos multiples + notas credito/debito + retenciones IVA/ISLR |
| 5 | **Cuentas x Cobrar** | Implementado | Pagos a factura especifica + abono global FIFO + vencimientos |
| 6 | **Compras** | Implementado | Facturas de compra, notas fiscales, gastos, retenciones IVA/ISLR, CxP, vencimientos |
| 7 | **Caja** | Implementado | Sesiones de caja, movimientos bancarios, movimientos por metodo de cobro, rendimiento |
| 8 | **Tesoreria** | Implementado | Caja fuerte, movimientos, cuentas, conciliacion, traspasos |
| 9 | **Contabilidad** | Implementado | Plan de cuentas, libro contable, balance de comprobacion, gastos, cuentas config |
| 10 | **Bancos** | Implementado | Conciliacion bancaria, diferencial cambiario |
| 11 | **Proveedores** | Implementado | Ficha maestra + bancos de proveedores |
| 12 | **Reportes** | Implementado | Cuadre de caja, ventas, CxC, inventario |
| 13 | **Dashboard** | Implementado | KPIs, graficos de ventas (Recharts), inventario por depto, top rotacion |
| 14 | **Citas / Agenda** | Implementado | Calendario (FullCalendar), nueva cita, panel, horarios de staff |
| 15 | Clinica | Futuro | Historias clinicas, sesiones, fotos antes/despues, mapas anatomicos |

### Reglas de Negocio Criticas

Estas reglas son **inviolables** y deben respetarse en todo el codigo:

1. **Bimonetario**: USD es moneda base. Bolivares se calculan multiplicando por tasa de cambio vigente. Cada transaccion "fotografia" la tasa del momento.

2. **Inmutabilidad financiera**: Los siguientes registros **nunca** se editan ni borran:
   - `tasas_cambio` - Solo se crean nuevas
   - `movimientos_inventario` (Kardex) - Snapshot de stock antes/despues
   - `movimientos_cuenta` - Snapshot de saldo antes/despues
   - `libro_contable` - Asientos contables historicos

3. **Stock solo via Kardex**: El campo `inventario_stock.cantidad` **jamas** se edita directamente. Solo se modifica como efecto de crear un `movimiento_inventario`.

4. **Saldo solo via signals**: El campo `cliente.saldo_actual` **jamas** se edita directamente. Solo se modifica via trigger PostgreSQL al insertar un `movimiento_cuenta`.

5. **Codigos inmutables**: `departamento.codigo`, `producto.codigo`, `cliente.identificacion` no pueden cambiar despues de crearse.

6. **Servicios sin stock**: Productos tipo 'S' (servicio) tienen `stock = 0` y `stock_minimo = 0` siempre. Consumen productos via recetas al venderse.

7. **Validaciones de precios**: `precio_venta_usd >= costo_usd` y `precio_mayor_usd <= precio_venta_usd`.

8. **Stock no negativo**: Las salidas de inventario no pueden dejar el stock en negativo.

9. **Operaciones atomicas**: Las operaciones financieras (ventas, pagos) deben ser transaccionales. Si falla un paso, todo se revierte.

10. **Precision decimal**: Campos financieros usan `NUMERIC` (nunca `float`). Precios: 2 decimales. Tasas: 4 decimales. Stock: 3 decimales.

11. **Aislamiento multi-tenant**: **Todas** las queries de negocio deben filtrar por `empresa_id` del usuario actual. Nunca mostrar datos de otra empresa. El patron es: `const { user } = useCurrentUser()` y luego `WHERE empresa_id = ?` con `user.empresa_id`.

12. **Numeracion por empresa**: Los consecutivos (nro_factura, nro_ncr, nro_ndb) son **por empresa**, no globales. El COUNT para generar el siguiente numero filtra por `empresa_id`.

---

## Esquema de Base de Datos

El schema de PowerSync define **63 tablas** organizadas en 9 dominios. Ver `src/core/db/powersync/schema.ts` para la definicion completa.

### Dominios y Tablas

```
Catalogos globales:
  monedas, tipos_persona_ve, islr_conceptos_ve, tipos_movimiento, permisos

Core / Auth:
  empresas, empresas_fiscal_ve, usuarios, roles, rol_permisos, tenant_permisos

Configuracion:
  tasas_cambio, metodos_cobro, bancos_empresa, cajas, impuestos_ve, niveles_precio

Inventario:
  departamentos, marcas, unidades, unidades_conversion, depositos,
  productos, inventario_stock, movimientos_inventario,
  recetas, ajuste_motivos, ajustes, ajustes_det, lotes

Clientes / CxC:
  clientes, movimientos_cuenta, vencimientos_cobrar

Ventas:
  ventas, ventas_det, pagos, notas_credito, notas_credito_det,
  notas_debito, notas_debito_det

Caja / Tesoreria:
  sesiones_caja, sesiones_caja_detalle, movimientos_metodo_cobro,
  movimientos_bancarios, caja_fuerte, mov_caja_fuerte, traspasos_tesoreria

Retenciones ventas:
  retenciones_iva_ventas, retenciones_islr_ventas

Proveedores / CxP:
  proveedores, proveedores_bancos, facturas_compra, facturas_compra_det,
  retenciones_iva, retenciones_islr, notas_fiscales_compra,
  notas_fiscales_compra_det, movimientos_cuenta_proveedor, vencimientos_pagar

Contabilidad:
  plan_cuentas, gastos, gasto_pagos, cuentas_config, libro_contable

Agenda / Citas:
  citas, citas_servicios, horarios_staff, cita_trabajadores, cita_log,
  cita_items_extras, horarios_descansos, horarios_excepciones, horarios_plantillas
```

> **Todas** las tablas de negocio tienen columna `empresa_id` (FK a empresas).

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
- Solo UPDATE permitido en: departamentos, productos, metodos_cobro
- Solo DELETE permitido en: recetas
- Tablas inmutables no permiten UPDATE ni DELETE via RLS (+ triggers como segunda capa)
- **Nota**: RLS no filtra por empresa_id actualmente. El aislamiento multi-tenant se hace a nivel de queries en el frontend (filtro `WHERE empresa_id = ?`)

### Edge Functions (Supabase Deno)

| Funcion | Metodo | Auth | Descripcion |
|---------|--------|------|-------------|
| `register-owner` | POST | Publica (apikey) | Crea empresa + usuario nivel 1 (Propietario) |
| `create-employee` | POST | JWT (Propietario) | Crea usuario nivel 2 o 3 dentro de la empresa |
| `update-employee` | PATCH | JWT (Propietario) | Modifica level, activo, nombre de un empleado |

**Patron de auth en Edge Functions autenticadas**:
1. Extraer token del header `Authorization: Bearer <token>`
2. Verificar via `supabaseAdmin.auth.getUser(token)` (NO crear cliente anon separado)
3. Consultar tabla `usuarios` para obtener `level` y `empresa_id` del caller
4. Validar permisos (solo nivel 1 puede gestionar empleados)

**Headers requeridos desde el frontend**:
- `apikey: SUPABASE_ANON_KEY` (requerido por el API Gateway de Supabase)
- `Authorization: Bearer <access_token>` (JWT del usuario logueado, o anon key para funciones publicas)
- `Content-Type: application/json`

---

## Sincronizacion Offline (PowerSync)

### Arquitectura

```
[React App] <-> [SQLite local (wa-sqlite)] <-> [PowerSync Cloud] <-> [Supabase PostgreSQL]
```

- **Escrituras locales**: Se ejecutan en SQLite via `db.writeTransaction()` (atomicidad local)
- **Sync eventual**: PowerSync sincroniza cambios con Supabase en background
- **Conflict resolution**: Last-write-wins (PowerSync default)
- **Bucket strategy**: Bucket parametrizado `empresa[]` que filtra por `empresa_id` del usuario (aislamiento a nivel de sync). Bucket `global` para catalogos compartidos. El frontend tambien filtra por `empresa_id` como defensa en profundidad

### PowerSync Connector

El connector maneja:
- Autenticacion via Supabase (JWT tokens)
- Upload de cambios locales a Supabase (PUT/PATCH/DELETE -> upsert/update/delete)
- Persistencia de sesion offline (sin depender de Supabase client directamente)

---

## Estructura Frontend (`src/`)

```
src/
├── main.tsx                  # Entry point: QueryClient -> AuthProvider -> PowerSyncProvider -> RouterProvider
├── index.css                 # Tailwind 4 + CSS variables (theme azul #2563eb)
├── routes/                   # TanStack Router file-based routing (65+ rutas)
│   ├── __root.tsx            # Toaster + PWABanner
│   ├── index.tsx             # Redirect raiz
│   ├── (auth)/               # Rutas publicas
│   │   ├── route.tsx         # Layout: redirect a dashboard si ya autenticado
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── _app/                 # Rutas protegidas (requiere auth)
│       ├── route.tsx         # Layout: auth guard + Sidebar + TopBar
│       ├── dashboard.tsx
│       ├── perfil.tsx
│       ├── clinica.tsx
│       ├── cxc.tsx
│       ├── reportes.tsx
│       ├── configuracion/    # tasa-cambio, metodos-pago, bancos, cajas, impuestos,
│       │                     #   niveles-precio, datos-empresa, usuarios/
│       ├── inventario/       # departamentos, productos, kardex, recetas, marcas,
│       │                     #   unidades, depositos, lotes, ajustes, compras, reportes
│       ├── ventas/           # nueva, notas-credito, prestamos, reportes, cuadre-de-caja
│       ├── clientes/         # index, gestion, cuentas-por-cobrar, reportes
│       ├── compras/          # facturas, notas-fiscales, gastos, gastos-dashboard,
│       │                     #   retenciones, cxp
│       ├── caja/             # sesiones, movimientos, rendimiento
│       ├── contabilidad/     # plan-cuentas, gastos, gastos-dashboard, libro-contable,
│       │                     #   balance-comprobacion, cuentas-config
│       ├── bancos/           # conciliacion, diferencial-cambiario
│       ├── proveedores/      # gestion
│       └── citas/            # index, panel, nueva, calendario, horarios-staff
├── core/                     # Infraestructura compartida
│   ├── auth/
│   │   └── auth-provider.tsx # Manejo de sesion Supabase + PowerSync connector
│   ├── db/
│   │   ├── powersync/        # Schema (63 tablas), connector, db instance, provider
│   │   └── kysely/           # Query builder tipado (types.ts + kysely.ts)
│   └── hooks/
│       ├── use-current-user.ts
│       └── use-permissions.ts
├── features/                 # Modulos de negocio (feature-based organization)
│   ├── auth/
│   ├── dashboard/
│   ├── configuracion/        # tasas, metodos-pago, bancos, cajas, impuestos,
│   │                         #   usuarios, niveles-precio, datos empresa
│   ├── inventario/           # departamentos, productos, marcas, unidades,
│   │                         #   depositos, kardex, recetas, lotes, ajustes
│   ├── clientes/
│   ├── ventas/               # ventas, notas-credito, notas-debito, retenciones
│   ├── compras/              # facturas, notas-fiscales, retenciones, CxP
│   ├── caja/
│   ├── tesoreria/
│   ├── contabilidad/
│   ├── bancos/
│   ├── proveedores/
│   └── reportes/
├── components/               # Componentes compartidos
│   ├── ui/                   # shadcn/ui (button, input, dialog, table, tabs, badge, etc.)
│   ├── layout/               # page-header.tsx
│   ├── pwa/                  # pwa-install-banner.tsx
│   ├── shared/               # placeholder-page.tsx, require-permission.tsx
│   └── data-table/           # DataTable generico basado en TanStack Table
├── hooks/                    # Hooks globales
│   ├── use-pwa-install.ts
│   └── use-mobile.ts
├── stores/                   # Zustand stores
│   ├── sidebar-store.ts
│   └── facturas-espera-store.ts
└── lib/                      # Utilidades puras
    ├── utils.ts              # cn() = twMerge + clsx
    ├── currency.ts           # usdToBs(), bsToUsd(), formatUsd(), formatBs()
    ├── format.ts             # Formateo de fechas y numeros
    └── auth-utils.ts
```

### Patrones Frontend

- **Feature-based organization**: Cada modulo tiene sus hooks, schemas y components
- **Hooks como data layer**: Cada feature expone hooks que encapsulan queries PowerSync. **Todos** filtran por `empresa_id`
- **useCurrentUser()**: Hook central que provee `{ user, loading }`. Usa datos de PowerSync con fallback a JWT `user_metadata`. Retorna `{ id, email, nombre, level, empresa_id }`
- **usePermissions()**: Hook para verificar permisos de rol dinamico sobre acciones especificas
- **Patron de query con empresa_id**:
  ```typescript
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { data } = useQuery('SELECT * FROM tabla WHERE empresa_id = ?', [empresaId])
  ```
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

## Estado de Implementacion

### Completado

Todos los modulos de la tabla anterior marcados como "Implementado" tienen:
- Schema PowerSync definido
- Hooks de datos con filtro `empresa_id`
- Schemas Zod para validacion
- Rutas TanStack Router
- Componentes UI con estados loading/error/empty

### Pendiente / En construccion

- **Clinica**: Historias clinicas, sesiones de tratamiento, fotos antes/despues, mapas anatomicos
- **Tests**: No existe infraestructura de testing. Cero archivos `*.test.ts` o `*.spec.ts`. Riesgo alto para modulos financieros

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
# Desarrollo (desde la raiz del repo)
yarn dev             # Servidor de desarrollo
yarn build           # Build de produccion
yarn type-check      # Verificacion de tipos TypeScript
yarn lint            # ESLint
yarn format          # Prettier
yarn deploy          # Deploy a Cloudflare Workers
yarn preview         # Preview local CF Workers (wrangler)

# Agregar componente shadcn/ui
npx shadcn@latest add [component]

# Supabase SQL
# Las migraciones viven en migrations/ con numeracion secuencial.
# Aplicar en orden desde el SQL Editor de Supabase Dashboard:
#   migrations/0001_initial_schema.sql        (setup base + RLS + triggers)
#   migrations/0002_fix_rls_recursion.sql     (patch idempotente para DBs antiguas)
# Ver migrations/README.md para convenciones y como agregar nuevas migraciones.
```

---

## Notas para Agentes

### Rutas de archivos — CRITICO

> El codigo vive en la **raiz del repo**, no bajo `front/`. Cualquier referencia a `front/X` en documentacion antigua debe leerse como `X` desde la raiz.
>
> - `front/src/` → `src/`
> - `front/package.json` → `package.json`
> - `front/vite.config.ts` → `vite.config.ts`

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
10. **Filtrar por empresa_id**: Toda query de negocio DEBE incluir `WHERE empresa_id = ?`. Usar `useCurrentUser()` para obtener el `empresa_id`. Nunca mostrar datos sin filtrar
11. **Edge Functions con apikey**: Al llamar Edge Functions desde el connector, siempre enviar header `apikey: SUPABASE_ANON_KEY` ademas del `Authorization`
12. **Usar yarn**: Nunca `npm install`. Siempre `yarn add` o `yarn`

### Al revisar codigo:

1. Verificar que las 12 reglas de negocio criticas se cumplen
2. Verificar TypeScript estricto (no `any`)
3. Verificar que registros inmutables no tienen UI de edicion/borrado
4. Verificar que stock y saldos no se editan directamente
5. Verificar precision decimal correcta en cada campo
6. Verificar que la UI es responsive (mobile + desktop)
7. Verificar que los estados loading/error/empty estan cubiertos
8. **Verificar que TODA query filtra por `empresa_id`** - es la regla mas critica para multi-tenant
9. Verificar que Edge Functions usan `supabaseAdmin.auth.getUser(token)` para verificar JWT
