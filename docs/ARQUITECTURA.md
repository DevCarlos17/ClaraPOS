# Arquitectura de Carpetas - ClaraPOS

> Ultima actualizacion: 2026-05-07

## Tipo de Arquitectura

ClaraPOS utiliza una arquitectura **Feature-Based (por modulo de negocio)** combinada con **File-Based Routing** (TanStack Router). Este patron organiza el codigo por dominio funcional en lugar de por tipo de archivo, lo que significa que todo lo relacionado con "inventario" vive junto, en vez de tener todos los hooks en una carpeta, todos los schemas en otra, etc.

Esta arquitectura tambien se conoce como **"Screaming Architecture"** porque al ver la estructura de carpetas, el proyecto "grita" de que se trata: configuracion, inventario, ventas, clientes, contabilidad, etc.

---

## Vista General del Proyecto

```
ClaraPOS/
├── CLAUDE.md                 # Contexto maestro para agentes IA
├── PLANIFICACION.md          # Plan de implementacion por fases
├── docs/                     # Documentacion tecnica del proyecto
│   ├── ARQUITECTURA.md       # (este archivo)
│   ├── PANTALLAS.md          # Estado de implementacion de pantallas
│   ├── PERMISOS.md           # Sistema de roles y permisos
│   ├── POWERSYNC.md          # Guia de sincronizacion offline
│   └── bd/                   # Analisis y planes de base de datos
├── migrations/               # SQL migrations numeradas secuencialmente
├── supabase/                 # Edge Functions (Deno)
├── package.json              # Dependencias del proyecto
├── tsconfig.json             # Configuracion TypeScript (modo estricto)
├── vite.config.ts            # Configuracion de Vite (plugins: React, Tailwind, PWA, WASM)
├── public/
│   └── manifest.json         # Manifiesto PWA (nombre, iconos, tema)
└── src/                      # Todo el codigo fuente vive aqui
```

---

## Estructura de `src/` - Las 9 Capas

```
src/
├── main.tsx          # 1. Punto de entrada
├── index.css         # 2. Estilos globales
├── core/             # 3. Infraestructura compartida
├── routes/           # 4. Paginas (file-based routing)
├── features/         # 5. Modulos de negocio (el corazon de la app)
├── components/       # 6. Componentes compartidos
├── hooks/            # 7. Hooks globales de plataforma
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

Contiene la configuracion de **Tailwind CSS 4** y las **CSS variables** del tema. Define los colores del sistema (primario: azul `#2563eb`), los radios de borde, tipografia y variables para modo claro/oscuro. El store `theme-store.ts` permite cambiar entre 5 temas (clara/jade/rosa/violeta/ambar) sobrescribiendo las variables CSS en runtime.

---

## 3. `core/` - Infraestructura Compartida

```
src/core/
├── auth/
│   └── auth-provider.tsx       # Sesion Supabase + conexion PowerSync
├── db/
│   ├── powersync/
│   │   ├── schema.ts           # Esquema de 45+ tablas en SQLite local
│   │   ├── db.ts               # Instancia de la base de datos SQLite
│   │   ├── connector.ts        # Logica de sync: upload/download con Supabase
│   │   ├── provider.tsx        # React context para acceder a la DB
│   │   └── index.ts            # Re-exportaciones
│   └── kysely/
│       ├── types.ts            # Tipos TypeScript generados del schema
│       └── kysely.ts           # Instancia del query builder tipado
└── hooks/
    ├── use-current-user.ts     # Hook para obtener el usuario autenticado
    └── use-permissions.ts      # Hook para verificar permisos granulares por nivel
```

**Que es**: La "fontaneria" del sistema. Nada de logica de negocio aqui.

**Como funciona**:
- **`auth/`**: Maneja el ciclo de vida de sesion (login, logout, refresh de tokens). Conecta Supabase Auth con PowerSync para que la sincronizacion funcione con las credenciales del usuario.
- **`db/powersync/`**: Define que tablas existen localmente en SQLite (~45 tablas), crea la instancia de la base de datos, y maneja como se sincronizan los cambios locales con Supabase PostgreSQL en la nube.
- **`db/kysely/`**: Proporciona un query builder tipado. En vez de escribir SQL crudo, usas funciones como `db.selectFrom('productos').where('tipo', '=', 'P')` con autocompletado TypeScript.
- **`use-permissions.ts`**: Lee los permisos del usuario (nivel 1/2/3) desde PowerSync y expone helpers como `can('inventory.adjust')` para controlar acceso en UI.

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
    ├── clinica.tsx               # /clinica (placeholder, modulo futuro)
    ├── reportes.tsx              # /reportes
    │
    ├── configuracion/            # Modulo: Configuracion del sistema
    │   ├── tasa-cambio.tsx       # /configuracion/tasa-cambio
    │   ├── datos-empresa.tsx     # /configuracion/datos-empresa
    │   ├── metodos-pago.tsx      # /configuracion/metodos-pago
    │   ├── bancos.tsx            # /configuracion/bancos
    │   ├── cajas.tsx             # /configuracion/cajas
    │   ├── impuestos.tsx         # /configuracion/impuestos
    │   ├── niveles-precio.tsx    # /configuracion/niveles-precio
    │   └── usuarios/
    │       ├── index.tsx         # /configuracion/usuarios
    │       ├── nuevo.tsx         # /configuracion/usuarios/nuevo
    │       └── $usuarioId.editar.tsx
    │
    ├── inventario/               # Modulo: Inventario
    │   ├── departamentos.tsx
    │   ├── productos.tsx
    │   ├── kardex.tsx
    │   ├── recetas.tsx
    │   ├── marcas.tsx
    │   ├── unidades.tsx
    │   ├── depositos.tsx
    │   ├── lotes.tsx
    │   ├── ajustes.tsx
    │   ├── compras.tsx
    │   └── reportes.tsx
    │
    ├── clientes/                 # Modulo: Clientes
    │   ├── index.tsx
    │   ├── gestion.tsx
    │   ├── cuentas-por-cobrar.tsx
    │   └── reportes.tsx
    │
    ├── ventas/                   # Modulo: Ventas / POS
    │   ├── nueva.tsx
    │   ├── notas-credito.tsx
    │   ├── notas-debito.tsx
    │   ├── cuadre-de-caja.tsx
    │   ├── prestamos.tsx
    │   └── reportes.tsx
    │
    ├── caja/                     # Modulo: Tesoreria / Caja
    │   ├── sesiones.tsx
    │   └── movimientos.tsx
    │
    ├── compras/                  # Modulo: Compras / Proveedores
    │   ├── facturas.tsx
    │   ├── notas-fiscales.tsx
    │   ├── cxp.tsx
    │   ├── gastos.tsx
    │   ├── gastos-dashboard.tsx
    │   └── retenciones.tsx
    │
    ├── contabilidad/             # Modulo: Contabilidad General
    │   ├── plan-cuentas.tsx
    │   ├── gastos.tsx
    │   ├── gastos-dashboard.tsx
    │   ├── libro-contable.tsx
    │   ├── balance-comprobacion.tsx
    │   └── cuentas-config.tsx
    │
    ├── bancos/                   # Modulo: Bancos
    │   ├── conciliacion.tsx
    │   └── diferencial-cambiario.tsx
    │
    └── cxc/                      # Cuentas por cobrar (shortcut)
        └── ...
```

**Convenciones de TanStack Router**:

| Prefijo/Sufijo | Significado |
|---|---|
| `__root.tsx` | Layout raiz global |
| `(nombre)/` | Grupo de layout (no afecta URL) |
| `_nombre/` | Layout wrapper con prefijo |
| `route.tsx` | Layout del directorio padre |
| `$param.tsx` | Parametro dinamico en URL |
| `archivo.tsx` | Pagina con URL = ruta del archivo |

**Nota**: Los archivos de ruta son **delgados**. Solo importan el componente correspondiente de `features/` y lo renderizan. La logica real vive en `features/`.

---

## 5. `features/` - Modulos de Negocio

```
src/features/
├── auth/                   # Autenticacion (login, registro)
├── dashboard/              # Panel principal con KPIs y graficos
├── configuracion/          # Tasas, empresa, usuarios, cajas, bancos, metodos pago
├── inventario/             # Departamentos, productos, kardex, recetas, ajustes, lotes
├── clientes/               # Ficha de clientes + libro auxiliar de cuenta
├── ventas/                 # POS, notas de credito/debito, cuadre de caja
├── caja/                   # Sesiones de caja, movimientos de tesoreria
├── compras/                # Facturas de compra, CxP, retenciones, gastos
├── cxc/                    # Cuentas por cobrar: vencimientos y reportes
├── contabilidad/           # Plan de cuentas, libro contable, balance de comprobacion
├── proveedores/            # Ficha maestra de proveedores
├── bancos/                 # Conciliacion bancaria, diferencial cambiario
└── reportes/               # Reportes transversales (ventas, inventario, CxC)
```

**Que es**: El **corazon** de la aplicacion. Cada carpeta es un modulo de negocio completo e independiente.

**Estructura interna de cada feature** (ejemplo completo: `inventario/`):

```
inventario/
├── hooks/                          # CAPA DE DATOS
│   ├── use-departamentos.ts
│   ├── use-productos.ts
│   ├── use-kardex.ts
│   ├── use-recetas.ts
│   ├── use-marcas.ts
│   ├── use-unidades.ts
│   ├── use-unidades-conversion.ts
│   ├── use-depositos.ts
│   ├── use-ajuste-motivos.ts
│   ├── use-ajustes.ts
│   ├── use-lotes.ts
│   ├── use-inventario-stock.ts
│   ├── use-compras.ts
│   └── use-catalogo-global.ts
├── schemas/                        # CAPA DE VALIDACION (Zod)
│   ├── departamento-schema.ts
│   ├── producto-schema.ts
│   ├── kardex-schema.ts
│   └── ... (12 schemas)
├── components/                     # CAPA DE PRESENTACION
│   ├── departamentos/
│   ├── productos/
│   ├── kardex/
│   └── recetas/
└── utils/                          # Utilidades especificas del feature
    └── productos-export.ts         # Logica de exportacion a Excel
```

**Variacion - features con estado propio** (ejemplo: `contabilidad/`):

```
contabilidad/
├── hooks/
├── schemas/
├── components/
├── stores/                         # Store Zustand LOCAL al feature
│   └── gasto-borrador-store.ts     # Estado de borrador de gastos
└── lib/                            # Utilidades locales del feature
    ├── plan-cuentas-csv.ts         # Importacion/exportacion CSV
    └── generar-asientos.ts         # Logica de asientos contables
```

> **Patron avanzado**: Cuando un feature necesita estado complejo especifico (no global), puede tener su propio `stores/` y `lib/`. Esto evita contaminar los stores globales con logica de un solo modulo.

**Flujo de datos**:

```
┌─────────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Componente │────>│   Hook   │────>│  Kysely Query │────>│  PowerSync   │
│  (UI/Form)  │     │ (logica) │     │  (SQL tipado) │     │  (SQLite)    │
└─────────────┘     └──────────┘     └──────────────┘     └──────┬───────┘
                                                                  │ sync bg
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
| `stores/` | Estado Zustand local al feature (opcional) | `gasto-borrador-store.ts` persiste borrador entre renders |
| `lib/` | Utilidades puras del feature (opcional) | `generar-asientos.ts` calcula asientos contables |
| `utils/` | Helpers del feature (opcional) | `productos-export.ts` exporta a Excel |

---

## 6. `components/` - Componentes Compartidos

```
src/components/
├── ui/                         # Primitivos shadcn/ui + custom
│   ├── button.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── select.tsx              # Select nativo Radix
│   ├── native-select.tsx       # Select nativo HTML (performance)
│   ├── separator.tsx
│   ├── tabs.tsx
│   ├── tooltip.tsx
│   ├── checkbox.tsx
│   ├── scroll-area.tsx
│   ├── card.tsx
│   ├── badge.tsx
│   ├── table.tsx
│   ├── skeleton.tsx
│   ├── command.tsx             # Command palette (cmdk)
│   ├── popover.tsx
│   ├── context-menu.tsx
│   ├── sonner.tsx              # Wrapper de toast notifications
│   ├── currency-display.tsx    # Visualizador USD/Bs bimonetario
│   ├── confirm-dialog.tsx      # Modal de confirmacion reutilizable
│   └── supervisor-pin-dialog.tsx # Dialog de verificacion PIN supervisor
│
├── data-table/                 # Tabla generica reutilizable (TanStack Table)
│   ├── data-table.tsx          # Componente principal
│   ├── toolbar.tsx             # Barra de busqueda y filtros
│   ├── pagination.tsx          # Controles de paginacion
│   ├── column-header.tsx       # Headers ordenables
│   ├── faceted-filter.tsx      # Filtros por facetas
│   ├── view-options.tsx        # Visibilidad de columnas
│   └── index.ts                # Exportaciones
│
├── layout/                     # Estructura visual de la app
│   ├── sidebar.tsx             # Navegacion lateral (drawer mobile, hover-expand desktop)
│   ├── top-bar.tsx             # Barra superior con sync + menu usuario
│   └── page-header.tsx         # Titulo de pagina + breadcrumbs
│
├── shared/                     # Componentes transversales
│   ├── placeholder-page.tsx    # Pagina stub para features futuras
│   ├── access-denied-page.tsx  # Pagina de acceso denegado (403)
│   ├── require-permission.tsx  # Guard de permisos: oculta children si sin permiso
│   ├── global-context-menu.tsx # Menu contextual global (click derecho)
│   ├── table-row-context-menu.tsx # Menu contextual para filas de tabla
│   └── segmented-tabs.tsx      # Tabs estilo segmented control
│
├── sync/
│   └── sync-status-indicator.tsx  # Indicador de conexion/sincronizacion offline
│
├── pwa/
│   └── pwa-install-banner.tsx     # Banner para instalar la PWA
│
└── theme-picker.tsx               # Selector de tema de color (5 temas)
```

**Organizacion**:

| Carpeta | Que contiene | Quien lo usa |
|---|---|---|
| `ui/` | Componentes atomicos de shadcn/ui + custom | Toda la app |
| `data-table/` | Tabla generica con filtros, paginacion, ordenamiento | Todas las listas |
| `layout/` | Estructura visual: sidebar, topbar, encabezados | Layout protegido `_app/route.tsx` |
| `shared/` | Guards de permisos, menus contextuales, pages stub | Features que necesitan control de acceso |
| `sync/` | Indicador de estado de sincronizacion offline | TopBar |
| `pwa/` | Banner de instalacion PWA | Root layout |
| `theme-picker.tsx` | Cambia paleta de colores de la app | TopBar / Config |

**Regla**: Si un componente se usa en **un solo** feature, vive dentro de ese feature. Si se reutiliza en 2+, va a `components/`.

---

## 7. `hooks/` - Hooks Globales de Plataforma

```
src/hooks/
├── use-pwa-install.ts    # Detecta si la PWA se puede instalar y maneja el prompt
├── use-mobile.ts         # Detecta si el viewport es mobile (para sidebar responsive)
└── use-debounce.ts       # Debounce generico para inputs de busqueda
```

**Diferencia con `features/*/hooks/`**: Los hooks de features encapsulan acceso a datos de negocio (`useProductos`, `useTasas`). Los hooks globales manejan comportamiento de plataforma (PWA, responsive, debounce).

---

## 8. `stores/` - Estado Global (Zustand)

```
src/stores/
├── sidebar-store.ts          # Estado del sidebar: abierto/cerrado, mobile toggle
├── theme-store.ts            # Tema de color activo (clara/jade/rosa/violeta/ambar)
└── moneda-contable-store.ts  # Moneda preferida para el modulo de contabilidad
```

**Que va aqui vs en `features/*/stores/`**:
- `stores/` globales: estado que afecta a multiples features o al layout (sidebar, tema)
- `features/*/stores/`: estado que solo tiene sentido dentro de ese modulo (ej: borrador de gasto)

---

## 9. `lib/` - Utilidades Puras

```
src/lib/
├── utils.ts          # cn() = twMerge + clsx (combinar clases Tailwind)
├── currency.ts       # usdToBs(), bsToUsd(), formatUsd(), formatBs()
├── format.ts         # Formateo de fechas y numeros en espanol
├── dates.ts          # Utilidades de manejo de fechas (wrappers date-fns)
├── auth-utils.ts     # Helpers de autenticacion (extraer claims de JWT, etc.)
└── crypto.ts         # Utilidades de cifrado (PINs, hash)
```

**Que es**: Funciones puras sin estado ni side effects. No usan React, no usan hooks, no importan componentes.

**Funciones clave**:
- `cn()`: Combina clases de Tailwind resolviendo conflictos (`cn("p-4", "p-2")` → `"p-2"`)
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
                    │  (Paginas = URLs, ~52 rutas) │
                    │  Solo importan de features/  │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────────────────────┐
                    │              features/ (13 modulos)          │
                    │                                              │
                    │  auth  dashboard  configuracion  inventario  │
                    │  clientes  ventas  caja  compras  cxc        │
                    │  contabilidad  proveedores  bancos  reportes │
                    │                                              │
                    │  ┌────────┬────────┬───────┬───────┬──────┐ │
                    │  │ hooks/ │schemas/│comps/ │stores/│ lib/ │ │
                    │  │(datos) │(valid.)│ (UI)  │(local)│(util)│ │
                    │  └───┬────┴────────┴───┬───┴───────┴──────┘ │
                    └──────┼─────────────────┼────────────────────┘
                           │                 │
              ┌────────────▼──┐    ┌─────────▼──────────┐
              │    core/db/   │    │   components/       │
              │ (PowerSync +  │    │ (ui/, data-table/   │
              │  Kysely)      │    │  layout/, shared/)  │
              └───────┬───────┘    └────────────────────┘
                      │
              ┌───────▼───────────────┐
              │  stores/ (globales)   │
              │  sidebar, tema, moneda│
              └───────┬───────────────┘
                      │
              ┌───────▼───────────────┐
              │    lib/ (utilidades)  │
              │ currency, format,     │
              │ dates, utils, crypto  │
              └───────────────────────┘
```

**Flujo de dependencias** (de arriba hacia abajo, nunca al reves):
1. `routes/` importa de `features/`
2. `features/` importa de `core/`, `components/`, `lib/`, `stores/`
3. `core/` importa de `lib/`
4. `components/` importa de `lib/` y `stores/`
5. `lib/` no importa de nadie (funciones puras)

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
| **Encapsulacion de features** | Features complejos pueden tener stores/ y lib/ propios |
| **Control de acceso granular** | `require-permission.tsx` + `use-permissions.ts` para RBAC en UI |

---

## Patron de Control de Acceso en UI

```tsx
// En cualquier componente:
import { RequirePermission } from '@/components/shared/require-permission'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

function InventarioActions() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST}>
      <Button onClick={abrirFormularioAjuste}>Ajustar Stock</Button>
    </RequirePermission>
  )
}
```

Los niveles de acceso son:
- **Nivel 1 (Dueno)**: Acceso total, hardcoded `return true`
- **Nivel 2 (Supervisor)**: Todos los permisos operativos
- **Nivel 3 (Cajero)**: Permisos basicos de operacion diaria

Ver `docs/PERMISOS.md` para la matriz completa de permisos.
