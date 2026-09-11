# Design: Gestion Clientes — Estado de Cuenta funcional + saldo reconciliado

## Technical Approach

Read-only fix in `src/features/clientes/components/cliente-detalle.tsx` + `use-clientes.ts`. No writes, no schema changes, no touching CxC or the 6 `saldo_actual` write-sites. The core move: **eliminate the two-independent-queries architecture** that lets the header count and the table body diverge, and switch the default view from "last 5 rows" to "current month" (spec requirement), which removes the divergence-prone code path entirely.

## Root Cause (definitive, evidenced)

The proposal's hypothesis ("variable mismatch between count and map") is **false** — verified by direct read of `cliente-detalle.tsx:498-523`: `movimientos.map` and `movimientos.length` reference the exact same `movimientos` array. No swap exists.

The **real, structural cause**: the header label and the table body are fed by **two independently-subscribed PowerSync watched queries**:
- Header (no-filter branch, line 488): `totalMovimientos` from `useCountMovimientosCliente` (`use-clientes.ts:128-140`) — a separate `COUNT(*)` query, no `ORDER BY`/`LIMIT`.
- Body (line 523): `movimientos` from `useMovimientosClienteFiltrados` (`use-clientes.ts:95-126`) — a separate `SELECT *` query with `ORDER BY ... LIMIT 5` when unfiltered.

Both filter identically on `empresa_id + cliente_id` with no date predicate in this branch, so under steady state they agree. But each is its **own `WatchedQuery` subscription** (`@powersync/react`'s `useWatchedQuery` → `powerSync.customQuery(query).watch()`), each independently transitioning loading → data/error on its own timeline per table-change notification. Critically, per PowerSync's own contract (`WatchedQuery.d.ts`: *"Loading becomes false once ... available or an error occurs"*), a failed watched query still resolves `isLoading: false`. `useMovimientosClienteFiltrados` (`use-clientes.ts:124-125`) **discards the `error` field** (`return { movimientos: data ?? [], isLoading }`), so any failure specific to that one query (a re-subscription race, a transient exception) silently degrades to `movimientos: []` — rendered as legitimate "Sin movimientos" — with zero signal that it differs from `totalMovimientos`.

I cannot pin the exact runtime trigger from static reading alone (would require instrumenting `error` on both hooks + logging `watch()` re-subscription timing around a fresh `movimiento` insert). That is **not needed**: the fix removes the architectural precondition — two independent sources of truth for one number — making the bug structurally impossible rather than chasing a nondeterministic race.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Header count source | Derive from `movimientos.length` (same array rendered); delete `useCountMovimientosCliente` (dead code, sole caller) | Keep both queries, add manual reconciliation/retry | Two watched queries for one number is the bug class itself; single-source eliminates it by construction, satisfies spec "rendered rows MUST equal header count" unconditionally |
| Default range | `{fechaDesde: startOfMonth(), fechaHasta: todayStr()}`, always concrete (no blank-string state) | Keep "last 5" as default, add month filter as opt-in | Spec requires month-default; mirrors existing codebase convention (`kardex-list.tsx`, `proveedor-estado-cuenta-modal.tsx`, `rangoMesActual()` in `notas-credito-admin-filters.ts`) |
| Date-range SQL | `datetime(fecha) >= datetime(? \|\| 'T00:00:00' \|\| VE_OFFSET)` / `<=` `23:59:59` variant | Keep naive string concat (`fecha >= ?`, `${hasta}T23:59:59`) | Matches established pattern in `notas-credito-admin-filters.ts`/`kardex-sql.ts`; closes a latent sub-second boundary bug (naive concat has no offset/ms, so a row at `23:59:59.500-04:00` lexically sorts *after* the plain `23:59:59` bound and gets excluded) |
| Query builder testability | Extract WHERE/params construction into a pure function (no I/O) | Test only via mocked `@powersync/react` component render | Mirrors existing `buildFacturasEmpresaFiltro`/`buildNotasCreditoFiltro` pattern — pure functions are fast, deterministic Vitest targets; PowerSync itself stays untested (already proven elsewhere) |
| Saldo precision | Pass `saldo_actual` raw string straight into `formatUsd`/`usdToBs` (both accept `DecimalInput = string \| number \| Decimal`, decimal.js-backed internally) | Keep current `parseFloat(saldoData...)` then pass the JS number | `parseFloat` on a `NUMERIC(20,8)` string is unneeded float coercion — `formatUsd`/`usdToBs` already accept strings natively; matches `saldo-cliente.ts`/`proveedor-estado-cuenta-modal.tsx` convention, satisfies spec "values reused for computation MUST NOT be read via parseFloat" |
| Saldo sign/state | Three-state via shared helper `saldoEstado()` (`src/features/clientes/lib/saldo-estado.ts`) using `new Decimal(saldoStr).comparedTo(0)`: >0 deuda, <0 favor, ==0 neutral | `isPositive()` for a 2-state deuda/favor check (superseded — see below) | `isPositive()` returns `true` for zero, so a settled $0.00 account rendered as deuda (red); two post-apply corrections replaced this with `comparedTo(0)` and a single shared helper imported by both `cliente-detalle.tsx` and `cliente-list.tsx`, per amended spec |
| Multi-tenant | Add `AND empresa_id = ?` to the saldo query (`cliente-detalle.tsx:291`), param `user?.empresa_id ?? ''` | Leave as-is (low risk per proposal) | Explicit proposal requirement; purely additive |

## Data Flow

    cliente-detalle.tsx (mount / cliente.id change)
      fechaDesde = startOfMonth(), fechaHasta = todayStr()   ← single source
             │
             ▼
    useMovimientosClienteFiltrados(clienteId, {fechaDesde, fechaHasta})  (always required, no LIMIT-5 branch)
             │  buildMovimientosClienteFiltro() [pure, tested]
             ▼
    PowerSync watched query → movimientos[]
             │
             ├──→ table body (movimientos.map)
             └──→ header label ("{movimientos.length} movimiento(s) en el periodo")   ← same array, no divergence possible

    saldo query: SELECT saldo_actual FROM clientes WHERE id=? AND empresa_id=?
             └──→ formatUsd(saldoStr) / usdToBs(saldoStr, tasa) / Decimal(saldoStr).isPositive()   ← no parseFloat

## Interfaces / Contracts

```typescript
// use-clientes.ts
export interface RangoFechaMovimientos { fechaDesde: string; fechaHasta: string }

export function buildMovimientosClienteFiltro(
  empresaId: string, clienteId: string, rango: RangoFechaMovimientos
): { sql: string; params: unknown[] }  // pure, no I/O

export function useMovimientosClienteFiltrados(
  clienteId: string | undefined, rango: RangoFechaMovimientos // now required, not optional
): { movimientos: MovimientoCuenta[]; isLoading: boolean }

// useCountMovimientosCliente — DELETED (no other callers, confirmed via grep)
```

`TIPO_LABELS` (`cliente-detalle.tsx:25-32`) gains a `SAL` entry (missing today; `SAF` already present) — small labeling gap, no logic change.

## Testing Strategy (strict TDD, `yarn test:run`, vitest.config.ts standalone)

| Layer | What to Test | Approach |
|---|---|---|
| Unit (pure) | `buildMovimientosClienteFiltro`: correct empresa_id/cliente_id/date-range WHERE + params, no LIMIT ever, ORDER BY DESC | New `src/features/clientes/hooks/__tests__/use-clientes-filtro.test.ts`, no mocks needed |
| Component | Header count === rendered row count for N=0,1,5+ (regression for the bug class); "Sin movimientos" shown iff `movimientos.length===0`; default range passed to the hook on mount = `startOfMonth()`/`todayStr()`; saldo displayed via `formatUsd`/`usdToBs` called with raw string (spy on `@/lib/currency`, assert no `Number`/`parseFloat` coercion reaches them); saldo query params include `empresa_id`; SAL tipo renders its label | `src/features/clientes/components/__tests__/cliente-detalle.test.tsx`, mock `@/features/clientes/hooks/use-clientes`, `@/features/cxc/hooks/use-cxc`, `@/core/hooks/use-current-user`, `@/features/configuracion/hooks/use-tasas`, `@powersync/react` — same pattern as `kardex-list.test.tsx` |
| Integration/E2E | None — read-only view, no cross-module flow to validate beyond unit+component | N/A |

## Migration / Rollout

No migration required. Behavior change (default view shifts from "last 5" to "current month") is UI-only and reversible via `git revert`.

## File Changes

| File | Action | Est. lines |
|---|---|---|
| `src/features/clientes/hooks/use-clientes.ts` | Modify — rewrite `useMovimientosClienteFiltrados`, extract `buildMovimientosClienteFiltro`, delete `useCountMovimientosCliente` | ~35 |
| `src/features/clientes/components/cliente-detalle.tsx` | Modify — month-default state, merge header label, empresa_id filter, drop parseFloat on saldo, `generarReporteEstadoCuenta(saldoActual: string)`, add `SAL` label | ~45 |
| `src/features/clientes/hooks/__tests__/use-clientes-filtro.test.ts` | Create | ~70 |
| `src/features/clientes/components/__tests__/cliente-detalle.test.tsx` | Create | ~180 |

**Total estimate: ~330 changed/new lines** vs the 400-line review budget — fits in one PR; tasks phase may still choose to slice fix vs. tests into two reviewable commits.

## Open Questions

- [ ] Exact runtime trigger of the one reported divergence instance (PowerSync watch-race vs. transient error) — not required to implement the fix, but worth instrumenting `error` logging on both hooks if it recurs post-fix.
