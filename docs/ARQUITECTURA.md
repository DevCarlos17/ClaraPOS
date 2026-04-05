# Arquitectura de Carpetas - Nexo21

## Tipo de Arquitectura

Nexo21 utiliza una arquitectura **Feature-Based (por modulo de negocio)** combinada con **File-Based Routing** (TanStack Router). Este patron organiza el codigo por dominio funcional en lugar de por tipo de archivo, lo que significa que todo lo relacionado con "inventario" vive junto, en vez de tener todos los hooks en una carpeta, todos los schemas en otra, etc.

Esta arquitectura tambien se conoce como **"Screaming Architecture"** porque al ver la estructura de carpetas, el proyecto "grita" de que se trata: configuracion, inventario, ventas, clientes, etc.

---

## Vista General del Proyecto

```
Nexo21/
├── CLAUDE.md                 # Contexto maestro para agentes IA
├── PLANIFICACION.md          # Plan de implementacion por fases
├── instrucciones.md          # Especificaciones de UI/UX
├── package.json              # Dependencias del proyecto
├── tsconfig.json             # Configuracion TypeScript (modo estricto)
├── vite.config.ts            # Configuracion de Vite (plugins: React, Tailwind, PWA, WASM)
├── public/
│   └── manifest.json         # Manifiesto PWA (nombre, iconos, tema)
└── src/                      # Todo el codigo fuente vive aqui
```

---

## Estructura de `src/` - Las 7 Capas

```
src/
├── main.tsx          # 1. Punto de entrada
├── index.css         # 2. Estilos globales
├── core/             # 3. Infraestructura compartida
├── routes/           # 4. Paginas (file-based routing)
├── features/         # 5. Modulos de negocio (el corazon de la app)
├── components/       # 6. Componentes compartidos
├── hooks/            # 7. Hooks globales
├── stores/           # 8. Estado global (Zustand)
└── lib/              # 9. Utilidades puras
```

---

## 1. `main.tsx` - Punto de Entrada

```
src/main.tsx
```

Es el archivo raiz de la aplicacion. Configura los **providers** en este orden de anidamiento:

```
QueryClientProvider (React Query)
  └── AuthProvider (Supabase sesion + PowerSync connector)
       └── PowerSyncProvider (base de datos local SQLite)
            └── RouterProvider (TanStack Router)
```

Cada provider envuelve al siguiente, asegurando que la autenticacion este disponible antes de la base de datos, y la base de datos antes de las rutas.

---

## 2. `index.css` - Estilos Globales

```
src/index.css
```

Contiene la configuracion de **Tailwind CSS 4** y las **CSS variables** del tema. Define los colores del sistema (primario: azul `#2563eb`), los radios de borde, tipografia y variables para modo claro/oscuro. Todos los componentes de la app heredan estos estilos base.

---

## 3. `core/` - Infraestructura Compartida

```
src/core/
├── auth/
│   └── auth-provider.tsx       # Sesion Supabase + conexion PowerSync
├── db/
│   ├── powersync/
│   │   ├── schema.ts           # Esquema de tablas en SQLite local
│   │   ├── db.ts               # Instancia de la base de datos SQLite
│   │   ├── connector.ts        # Logica de sync: upload/download con Supabase
│   │   ├── provider.tsx        # React context para acceder a la DB
│   │   └── index.ts            # Re-exportaciones
│   └── kysely/
│       ├── types.ts            # Tipos TypeScript generados del schema
│       └── kysely.ts           # Instancia del query builder tipado
└── hooks/
    └── use-current-user.ts     # Hook para obtener el usuario autenticado
```

**Que es**: La "fontaneria" del sistema. Nada de logica de negocio aqui.

**Como funciona**:
- **`auth/`**: Maneja el ciclo de vida de sesion (login, logout, refresh de tokens). Conecta Supabase Auth con PowerSync para que la sincronizacion funcione con las credenciales del usuario.
- **`db/powersync/`**: Define que tablas existen localmente en SQLite, crea la instancia de la base de datos, y maneja como se sincronizan los cambios locales con Supabase PostgreSQL en la nube.
- **`db/kysely/`**: Proporciona un query builder tipado. En vez de escribir SQL crudo, usas funciones como `db.selectFrom('productos').where('tipo', '=', 'P')` con autocompletado TypeScript.

---

## 4. `routes/` - Paginas (File-Based Routing)

```
src/routes/
├── __root.tsx                    # Layout raiz (Toaster global + PWA banner)
├── index.tsx                     # Redireccion: "/" → dashboard o login
├── (auth)/                       # Grupo: rutas PUBLICAS (sin auth requerido)
│   ├── route.tsx                 # Layout auth: redirige si ya esta logueado
│   ├── login.tsx                 # /login
│   └── register.tsx              # /register
└── _app/                         # Grupo: rutas PROTEGIDAS (auth requerido)
    ├── route.tsx                 # Layout app: guard de auth + Sidebar + TopBar
    ├── dashboard.tsx             # /dashboard
    ├── configuracion/
    │   ├── tasa-cambio.tsx       # /configuracion/tasa-cambio
    │   ├── datos-empresa.tsx     # /configuracion/datos-empresa
    │   ├── usuarios.tsx          # /configuracion/usuarios
    │   ├── bancos.tsx            # /configuracion/bancos
    │   └── metodos-pago.tsx      # /configuracion/metodos-pago
    ├── inventario/
    │   ├── departamentos.tsx     # /inventario/departamentos
    │   ├── productos.tsx         # /inventario/productos
    │   ├── kardex.tsx            # /inventario/kardex
    │   ├── recetas.tsx           # /inventario/recetas
    │   ├── compras.tsx           # /inventario/compras
    │   └── reportes.tsx          # /inventario/reportes
    ├── clientes.tsx              # /clientes
    ├── clientes/
    │   ├── gestion.tsx           # /clientes/gestion
    │   ├── cuentas-por-cobrar.tsx # /clientes/cuentas-por-cobrar
    │   └── reportes.tsx          # /clientes/reportes
    ├── ventas/
    │   ├── nueva.tsx             # /ventas/nueva (POS)
    │   ├── notas-credito.tsx     # /ventas/notas-credito
    │   ├── cuadre-de-caja.tsx    # /ventas/cuadre-de-caja
    │   └── reportes.tsx          # /ventas/reportes
    ├── cxc.tsx                   # /cxc (cuentas por cobrar)
    ├── reportes.tsx              # /reportes
    └── clinica.tsx               # /clinica
```

**Que es**: Cada archivo `.tsx` en `routes/` se convierte automaticamente en una URL de la aplicacion.

**Como funciona**:
- **TanStack Router file-based**: El nombre del archivo define la ruta. `inventario/productos.tsx` = URL `/inventario/productos`.
- **`(auth)/`**: El parentesis indica un **grupo de layout** sin segmento de URL. Las rutas dentro comparten el layout de `route.tsx` (pagina de login sin sidebar).
- **`_app/`**: El guion bajo indica un **layout wrapper**. Todas las rutas dentro comparten el layout protegido (sidebar + topbar + guard de autenticacion).
- **`__root.tsx`**: Layout que envuelve TODA la app (notificaciones toast, banner PWA).
- **Los archivos de ruta son delgados**: Solo importan el componente correspondiente de `features/` y lo renderizan. La logica real vive en `features/`.

**Convencion de TanStack Router**:
| Prefijo/Sufijo | Significado |
|---|---|
| `__root.tsx` | Layout raiz global |
| `(nombre)/` | Grupo de layout (no afecta URL) |
| `_nombre/` | Layout wrapper con prefijo |
| `route.tsx` | Layout del directorio padre |
| `archivo.tsx` | Pagina con URL = ruta del archivo |

---

## 5. `features/` - Modulos de Negocio

```
src/features/
├── auth/                   # Autenticacion
├── dashboard/              # Panel principal
├── configuracion/          # Tasas de cambio, empresa, etc.
├── inventario/             # Departamentos, productos, kardex, recetas
├── clientes/               # Ficha de clientes
├── ventas/                 # POS, notas de credito
├── cxc/                    # Cuentas por cobrar
└── reportes/               # Reportes y cuadre de caja
```

**Que es**: El **corazon** de la aplicacion. Cada carpeta es un modulo de negocio completo e independiente.

**Estructura interna de cada feature** (ejemplo: `inventario/`):

```
inventario/
├── hooks/                          # CAPA DE DATOS
│   ├── use-departamentos.ts        # Queries y mutaciones para departamentos
│   ├── use-productos.ts            # Queries y mutaciones para productos
│   ├── use-kardex.ts               # Queries para movimientos de inventario
│   └── use-recetas.ts              # Queries y mutaciones para recetas
├── schemas/                        # CAPA DE VALIDACION
│   ├── departamento-schema.ts      # Reglas Zod: codigo obligatorio, unico, inmutable
│   ├── producto-schema.ts          # Reglas Zod: precio_venta >= costo, etc.
│   ├── kardex-schema.ts            # Reglas Zod: cantidad > 0, tipo entrada/salida
│   └── receta-schema.ts            # Reglas Zod: cantidad > 0, producto padre tipo 'S'
└── components/                     # CAPA DE PRESENTACION
    ├── departamentos/
    │   ├── departamento-list.tsx    # Tabla con busqueda y ordenamiento
    │   └── departamento-form.tsx    # Dialog modal para crear/editar
    ├── productos/
    │   ├── producto-list.tsx        # Tabla con precios USD/Bs
    │   ├── producto-form.tsx        # Formulario bimonetario
    │   └── precio-display.tsx       # Componente de visualizacion USD + Bs
    ├── kardex/
    │   ├── kardex-list.tsx          # Journal inmutable (sin editar/borrar)
    │   └── movimiento-form.tsx      # Formulario de entrada/salida
    └── recetas/
        ├── receta-manager.tsx       # Editor de recetas para servicios
        └── ingrediente-form.tsx     # Lineas de ingredientes
```

**Como funciona el flujo de datos**:

```
┌─────────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Componente │────>│   Hook   │────>│  Kysely Query │────>│  PowerSync   │
│  (UI/Form)  │     │ (logica) │     │  (SQL tipado) │     │  (SQLite)    │
└─────────────┘     └──────────┘     └──────────────┘     └──────┬───────┘
                                                                  │ sync
                                                           ┌──────▼───────┐
                                                           │   Supabase   │
                                                           │ (PostgreSQL) │
                                                           └──────────────┘
```

1. El **componente** renderiza la UI y captura interacciones del usuario
2. El **hook** ejecuta la logica: consulta datos, valida con Zod, ejecuta transacciones
3. **Kysely** genera el SQL tipado contra la base de datos local
4. **PowerSync** ejecuta el SQL en SQLite local y sincroniza con Supabase en background

**Subcarpetas de cada feature**:

| Subcarpeta | Responsabilidad | Ejemplo |
|---|---|---|
| `hooks/` | Acceso a datos, mutaciones, logica de negocio | `useProductos()` retorna `{ productos, crear, editar }` |
| `schemas/` | Validacion de formularios con Zod | `productoSchema` valida que `precio_venta >= costo` |
| `components/` | Componentes React de presentacion | `ProductoForm` renderiza inputs, usa el hook para guardar |

---

## 6. `components/` - Componentes Compartidos

```
src/components/
├── ui/                         # Primitivos shadcn/ui
│   ├── button.tsx
│   ├── input.tsx
│   ├── dialog.tsx
│   ├── card.tsx
│   ├── table.tsx
│   ├── badge.tsx
│   ├── select.tsx
│   ├── checkbox.tsx
│   ├── tabs.tsx
│   ├── tooltip.tsx
│   ├── popover.tsx
│   ├── dropdown-menu.tsx
│   ├── scroll-area.tsx
│   ├── separator.tsx
│   ├── skeleton.tsx
│   ├── label.tsx
│   ├── sonner.tsx              # Wrapper de toast notifications
│   ├── command.tsx             # Command palette (cmdk)
│   ├── confirm-dialog.tsx      # Modal de confirmacion reutilizable
│   └── currency-display.tsx    # Visualizador USD/Bs
│
├── data-table/                 # Tabla generica reutilizable
│   ├── data-table.tsx          # Componente principal (TanStack Table)
│   ├── toolbar.tsx             # Barra de busqueda y filtros
│   ├── pagination.tsx          # Controles de paginacion
│   ├── column-header.tsx       # Headers ordenables
│   ├── faceted-filter.tsx      # Filtros por facetas
│   ├── view-options.tsx        # Visibilidad de columnas
│   └── index.ts                # Exportaciones
│
├── layout/                     # Estructura visual de la app
│   ├── sidebar.tsx             # Navegacion lateral (drawer en mobile)
│   ├── top-bar.tsx             # Barra superior con menu de usuario
│   └── page-header.tsx         # Titulo de pagina + breadcrumbs
│
├── sync/
│   └── sync-status-indicator.tsx  # Indicador de conexion/sincronizacion
│
├── pwa/
│   └── pwa-install-banner.tsx     # Banner para instalar la PWA
│
└── shared/
    └── placeholder-page.tsx       # Pagina stub para features futuras
```

**Que es**: Componentes que se usan en **multiples features**. Si un componente solo se usa en una feature, vive dentro de esa feature.

**Organizacion**:

| Carpeta | Que contiene | Quien lo usa |
|---|---|---|
| `ui/` | Componentes atomicos de shadcn/ui (botones, inputs, modals) | Toda la app |
| `data-table/` | Tabla generica con filtros, paginacion, ordenamiento | Todas las listas (departamentos, productos, kardex, etc.) |
| `layout/` | Estructura visual: sidebar, topbar, encabezados de pagina | El layout protegido `_app/route.tsx` |
| `sync/` | Indicador de estado de sincronizacion offline | TopBar |
| `pwa/` | Banner de instalacion PWA | Root layout |
| `shared/` | Componentes genericos (placeholders, etc.) | Paginas futuras |

---

## 7. `hooks/` - Hooks Globales

```
src/hooks/
├── use-pwa-install.ts    # Detecta si la PWA se puede instalar y maneja el prompt
└── use-mobile.ts         # Detecta si el viewport es mobile (para sidebar responsive)
```

**Que es**: Hooks que no pertenecen a ningun feature especifico. Son transversales a toda la app.

**Diferencia con `features/*/hooks/`**: Los hooks de features encapsulan acceso a datos de negocio (`useProductos`, `useTasas`). Los hooks globales manejan comportamiento de plataforma (PWA, responsive).

---

## 8. `stores/` - Estado Global (Zustand)

```
src/stores/
└── sidebar-store.ts      # Estado del sidebar: abierto/cerrado, mobile toggle
```

**Que es**: Stores de Zustand para estado de UI global que necesita compartirse entre componentes sin relacion padre-hijo.

**Por que Zustand y no Context**: Zustand es mas eficiente para re-renders. Solo los componentes que usan un selector especifico se re-renderizan cuando ese valor cambia.

---

## 9. `lib/` - Utilidades Puras

```
src/lib/
├── utils.ts          # cn() = twMerge + clsx (combinar clases Tailwind)
├── currency.ts       # usdToBs(), bsToUsd(), formatUsd(), formatBs()
├── format.ts         # Formateo de fechas y numeros en espanol
├── dates.ts          # Utilidades de manejo de fechas
└── auth-utils.ts     # Helpers de autenticacion
```

**Que es**: Funciones puras sin estado ni side effects. No usan React, no usan hooks, no importan componentes.

**Funciones clave**:
- `cn()`: Combina clases de Tailwind resolviendo conflictos (ej: `cn("p-4", "p-2")` → `"p-2"`)
- `usdToBs(usd, tasa)`: Convierte dolares a bolivares usando tasa de cambio
- `formatUsd(amount)`: Formatea `1234.5` → `$1,234.50`
- `formatBs(amount)`: Formatea `1234.5` → `Bs. 1.234,50`

---

## Archivo Auto-generado

```
src/routeTree.gen.ts    # Generado automaticamente por TanStack Router
```

**No editar manualmente.** TanStack Router escanea `routes/` y genera este archivo con el arbol de rutas tipado. Se regenera cada vez que se agregan/eliminan archivos en `routes/`.

---

## Resumen Visual de la Arquitectura

```
                    ┌─────────────────────────────┐
                    │         main.tsx             │
                    │  (Providers: Query, Auth,    │
                    │   PowerSync, Router)         │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │         routes/              │
                    │  (Paginas = URLs)            │
                    │  Solo importan de features/  │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │        features/             │
                    │  ┌────────┬────────┬──────┐  │
                    │  │ hooks/ │schemas/│comps/ │  │
                    │  │(datos) │(valid.)│ (UI)  │  │
                    │  └───┬────┴────────┴──┬───┘  │
                    └──────┼────────────────┼──────┘
                           │                │
              ┌────────────▼──┐    ┌────────▼─────────┐
              │    core/db/   │    │   components/     │
              │ (PowerSync +  │    │ (ui/, data-table/ │
              │  Kysely)      │    │  layout/, etc.)   │
              └───────────────┘    └──────────────────┘
                           │
              ┌────────────▼──────────────┐
              │    lib/ (utilidades)       │
              │ currency, format, utils    │
              └───────────────────────────┘
```

**Flujo de dependencias** (de arriba hacia abajo, nunca al reves):
1. `routes/` importa de `features/`
2. `features/` importa de `core/`, `components/`, `lib/`
3. `core/` importa de `lib/`
4. `lib/` no importa de nadie (funciones puras)

---

## Principios Clave de esta Arquitectura

| Principio | Como se aplica |
|---|---|
| **Feature-first** | Codigo agrupado por dominio de negocio, no por tipo de archivo |
| **Separation of Concerns** | hooks (datos) / schemas (validacion) / components (UI) |
| **Offline-first** | Toda operacion escribe primero en SQLite local, sync eventual |
| **Inmutabilidad financiera** | Registros criticos no tienen UI de editar/borrar |
| **Bimonetario** | USD como base, Bs calculado con tasa vigente en cada transaccion |
| **TypeScript estricto** | Sin `any`, tipos generados del schema de DB |
| **Componentes delgados** | Las rutas solo renderizan, la logica vive en hooks |
| **DRY via compartidos** | `components/ui/` y `data-table/` evitan duplicacion entre features |
