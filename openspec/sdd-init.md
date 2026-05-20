# SDD Init — ClaraPOS
> Artifact store: openspec (file-based)
> Init date: 2026-05-20
> topic_key: sdd-init/ClaraPOS

---

## Project Identity

- **Name**: ClaraPOS
- **Type**: Multi-tenant POS + Business Management — PWA offline-first
- **Domain**: Aesthetic clinic (clínica estética)
- **Language**: Spanish only (no i18n)
- **Multi-tenant**: every business query MUST filter by `empresa_id`
- **Currency model**: bimonetary — USD base + Bolivares via exchange rate (tasa de cambio)
- **User levels**: 1 = Propietario, 2 = Supervisor, 3 = Cajero

---

## Stack

### Frontend — root of repo (`src/`)

> Note: CLAUDE.md mentions `front/src/` but the actual source is at `src/` (root level).

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript + Vite 7 |
| Routing | TanStack Router (file-based, auto code-splitting) |
| Forms | TanStack Form + Zod validation |
| Server state | TanStack Query v5 |
| Tables | TanStack Table v8 |
| Client state | Zustand 5 |
| Offline DB | PowerSync (SQLite via wa-sqlite) + Kysely (typed query builder) |
| Auth + API | Supabase JS v2 |
| UI | Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| Icons | Phosphor Icons (replaced Lucide) |
| Animations | Framer Motion |
| Notifications | Sonner |
| Charts | Recharts |
| Calendar | FullCalendar 6 |
| PDF | jspdf + jspdf-autotable |
| Export | xlsx |
| Package manager | Yarn 1.22.22 |

### Backend — Supabase-managed (`backend/`)

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Security | Row Level Security (RLS) |
| Sync | PowerSync Cloud |
| Edge Functions | Supabase Edge Functions (Deno) |
| Migrations | `backend/migrations/` — numbered 0001–0007 |

---

## Testing Capabilities

- **Test runner**: NONE detected
- **Strict TDD mode**: `false`
- **Test command**: N/A
- No vitest, jest, or @testing-library in devDependencies

---

## Source Structure

```
ClaraPOS/
├── src/                          # Frontend source (root level, not front/)
│   ├── main.tsx                  # Entry: QueryClient → AuthProvider → PowerSyncProvider → RouterProvider
│   ├── routes/
│   │   ├── (auth)/               # Public routes: login, register
│   │   └── _app/                 # Protected routes (auth-guarded + sidebar layout)
│   │       ├── dashboard.tsx
│   │       ├── configuracion/    # tasa-cambio, metodos-pago, bancos, cajas, impuestos, usuarios
│   │       ├── inventario/       # departamentos, productos, marcas, unidades, depositos, recetas, kardex, compras
│   │       ├── clientes/
│   │       ├── ventas/           # notas-credito, prestamos
│   │       ├── cxc.tsx
│   │       ├── compras/          # facturas, notas-fiscales, gastos
│   │       ├── caja/             # movimientos, sesiones
│   │       ├── contabilidad/     # plan-cuentas, libro-contable, balance-comprobacion, cuentas-config, diferencial-cambiario
│   │       ├── proveedores/
│   │       └── reportes.tsx
│   ├── core/
│   │   ├── auth/auth-provider.tsx
│   │   ├── db/
│   │   │   ├── powersync/        # schema, connector, db instance, provider
│   │   │   └── kysely/           # types.ts + kysely.ts
│   │   └── hooks/use-current-user.ts
│   ├── features/                 # Feature-based modules
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── configuracion/
│   │   ├── inventario/
│   │   ├── compras/
│   │   ├── contabilidad/
│   │   └── cxc/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components
│   │   ├── layout/               # sidebar, top-bar, page-header
│   │   ├── data-table/           # generic TanStack Table wrapper
│   │   ├── shared/               # placeholder-page, require-permission, access-denied
│   │   └── sync/                 # sync-status-indicator
│   ├── stores/                   # Zustand stores
│   ├── hooks/                    # Global hooks
│   └── lib/                      # utils.ts, currency.ts, format.ts
├── backend/
│   ├── migrations/               # 0001–0007 SQL migrations
│   ├── supabase-setup.sql
│   └── powersync-sync-rules.yaml
├── openspec/                     # SDD artifact store (this directory)
│   ├── sdd-init.md               # This file — project context
│   └── changes/                  # One subfolder per SDD change
├── package.json                  # Yarn workspace root (frontend)
├── CLAUDE.md                     # Master context (slightly outdated on paths)
└── PLANIFICACION.md              # Detailed implementation plan
```

---

## Implemented Modules (as of 2026-05-20)

| Module | Status | Notes |
|--------|--------|-------|
| Auth (login/register) | ✅ Done | Supabase Auth + PowerSync connector |
| Dashboard | ✅ Done | KPIs, charts |
| Configuración → Tasa de cambio | ✅ Done | Immutable — insert only |
| Configuración → Métodos de pago | ✅ Done | |
| Configuración → Bancos | ✅ Done | |
| Configuración → Cajas | ✅ Done | |
| Configuración → Impuestos | ✅ Done | |
| Configuración → Usuarios | ✅ Done | Edge Functions: register-owner, create-employee, update-employee |
| Inventario → Departamentos | ✅ Done | Immutable código |
| Inventario → Productos/Servicios | ✅ Done | Bimonetary pricing, recipes |
| Inventario → Marcas | ✅ Done | |
| Inventario → Unidades | ✅ Done | |
| Inventario → Depósitos | ✅ Done | |
| Inventario → Recetas | ✅ Done | BOM for services |
| Inventario → Kardex | ✅ Done | Immutable, stock via movements only |
| Inventario → Compras | ✅ Done | |
| Clientes | ✅ Done | Master card + account ledger |
| Ventas (POS) | ✅ Done | Bimonetary + multi-payment + kardex deduction |
| Notas de Crédito | ✅ Done | Invoice cancellation |
| CXC (Cuentas x Cobrar) | ✅ Done | Specific + FIFO global payments |
| Compras → Facturas | ✅ Done | |
| Compras → Notas Fiscales | ✅ Done | |
| Compras → Gastos | ✅ Done | |
| Caja → Movimientos | ✅ Done | |
| Caja → Sesiones | ✅ Done | |
| Contabilidad → Plan de Cuentas | ✅ Done | |
| Contabilidad → Libro Contable | ✅ Done | |
| Contabilidad → Balance Comprobación | ✅ Done | |
| Contabilidad → Gastos Dashboard | ✅ Done | |
| Contabilidad → Diferencial Cambiario | ✅ Done | |
| Proveedores | ✅ Done | Master card |
| Reportes (cuadre de caja) | ✅ Done | |
| Citas (agenda clínica) | 🔄 In progress | Migrations 0003–0007, Google Calendar integration |
| Clínica (historias clínicas, sesiones) | 🔮 Future | |

---

## Critical Business Rules (must be enforced in every change)

1. **Bimonetary**: USD base. Bolivares = amount × tasa_cambio. Each transaction snapshots the rate.
2. **Immutable records**: `tasas_cambio`, `movimientos_inventario` — no UPDATE, no DELETE (DB triggers enforce this).
3. **Stock via Kardex only**: `producto.stock` is NEVER updated directly. Only via `movimientos_inventario`.
4. **Balance via signals**: `cliente.saldo_actual` only updated via PostgreSQL trigger on `movimientos_cuenta` insert.
5. **Immutable codes**: `departamento.codigo`, `producto.codigo`, `cliente.identificacion` — cannot change after creation.
6. **Services no stock**: Tipo 'S' products always have `stock = 0`. Consume products via recetas when sold.
7. **Price validation**: `precio_venta_usd >= costo_usd` and `precio_mayor_usd <= precio_venta_usd`.
8. **Non-negative stock**: outgoing movements cannot leave stock negative.
9. **Atomic operations**: financial ops (ventas, pagos) use `db.writeTransaction()`. All-or-nothing.
10. **Decimal precision**: NUMERIC fields only. Prices: 2 decimals. Rates: 4 decimals. Stock: 3 decimals.
11. **Multi-tenant isolation**: EVERY business query filters by `empresa_id`. Use `useCurrentUser()` → `user.empresa_id`.
12. **Consecutive numbering per company**: nro_factura, nro_ncr — COUNT filtered by `empresa_id`.

---

## Frontend Conventions

- **TypeScript strict**: no `any`, no `as` unless justified
- **Named exports only**: never default exports
- **Naming**: PascalCase components, camelCase hooks/utils, kebab-case files
- **No obvious comments**: only comment non-evident logic
- **Auto-uppercase**: names and codes uppercased in UI
- **Responsive**: mobile-first. Sidebar drawer on mobile, hover-expand on desktop
- **Feature hooks as data layer**: encapsulate PowerSync queries. Always filter by `empresa_id`.
- **Zod schemas** in `features/<module>/schemas/` for all user input
- **shadcn/ui base** for all UI components, customized via Tailwind
- **Generic DataTable** (`components/data-table/`) for all lists

---

## PowerSync Conventions

- **Booleans**: mapped as `column.integer` (0/1) — SQLite has no native boolean
- **Decimals**: mapped as `column.text` — preserves precision
- **Write pattern**: `db.writeTransaction()` for atomic local operations
- **Sync**: PowerSync Cloud → Supabase PostgreSQL eventual sync
- **Bucket strategy**: parametrized `empresa[]` bucket filters by `empresa_id`

---

## Edge Function Conventions

- Auth: extract JWT from `Authorization: Bearer <token>` → verify via `supabaseAdmin.auth.getUser(token)`
- Always query `usuarios` table for caller's `level` and `empresa_id`
- Frontend must always send `apikey: SUPABASE_ANON_KEY` header alongside `Authorization`

---

## SDD Configuration

```yaml
artifact_store: openspec
changes_dir: openspec/changes/
strict_tdd: false
test_command: null
execution_mode: interactive  # default — ask user before each phase
delivery_strategy: ask-on-risk  # default
```
