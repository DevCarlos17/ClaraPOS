# Design: Existencias por Deposito

## Technical Approach

One flat `useQuery` joins `inventario_stock` to `productos` (`empresa_id`-filtered, `tipo='P'`), fetched once by a new hook `useExistenciasPorDeposito()`. All matrix logic (pivot, zero-defaulting, column derivation) is extracted into **pure, PowerSync-free functions** in `src/features/inventario/lib/existencias-pivot.ts` — same "SQL builder + pure pivot, thin hook wrapper" pattern already used by `kardex-sql.ts` and `stock-deposito.ts`. The hook stays a thin `useQuery` + pure-function call; the component is a hand-rolled `<table>` mirroring `ProductoList`, wrapped into the `traspasos` route via a `Tabs` (`variant="line"`) mirroring `horarios-staff-page.tsx`.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Pivot location | Pure function `pivotExistencias()` in `lib/existencias-pivot.ts`, called from the hook | Pivot inline inside the hook body | Strict TDD: pure function is unit-testable without PowerSync/wa-sqlite mocking, matches `computeStockDelta`/`buildTraspasoKardexPair` precedent |
| Row base set | Iterate `productos` (from the joined rows), not `inventario_stock` | Iterate `inventario_stock` rows | `inventario_stock` rows are lazily created (only after first movement); using it as the base set would silently drop never-moved products. Matches proposal's Approach section |
| SQL shape | One `LEFT JOIN` (`productos` outer, `inventario_stock` inner side), `tipo='P'` in `WHERE` | Two separate queries (products, stock) joined client-side | Single round-trip, same idiom as `useStockPorDeposito`/`useStockPorProducto` in the same file |
| Columns source | `useDepositosActivos()`, sorted client-side `es_principal DESC, nombre ASC` | New dedicated deposito query | Reuses existing hook (already used by `TraspasoForm`); sort is a 2-key comparator, cheap to unit test in isolation |
| Component base | Hand-rolled `<table>`, not `DataTable` | Generic `DataTable` (TanStack Table) | Proposal decision — `DataTable` is unused in the codebase; `ProductoList`/`TraspasoList` precedent is hand-rolled tables with local search state |

## Data Flow

    useDepositosActivos()  ──┐
                              ├─→ ExistenciasPorDeposito (component)
    useExistenciasPorDeposito() ─┘        │
         │                                 ├─ buildColumnas(depositos) [pure]
         │ useQuery (raw JOIN rows)        └─ filter by nombre/codigo (local state)
         └─→ pivotExistencias(rows, productoIds) [pure] ─→ rows: ExistenciaRow[]

## Interfaces / Contracts

```ts
// src/features/inventario/lib/existencias-pivot.ts
export interface ExistenciaRawRow {
  producto_id: string; codigo: string; nombre: string
  deposito_id: string | null; cantidad_actual: string | null
}
export interface ExistenciaRow {
  producto_id: string; codigo: string; nombre: string
  cantidadPorDeposito: Record<string, string>  // deposito_id -> '0.000'-formatted string
}
export function pivotExistencias(rows: ExistenciaRawRow[]): ExistenciaRow[]
export function ordenarDepositosColumnas<T extends { id: string; nombre: string; es_principal: number }>(depositos: T[]): T[]
export function buildExistenciasPorDepositoSql(): string  // exposed for SQL-shape assertions, kardex-sql.ts precedent
```

Hook (`use-inventario-stock.ts` addition):

```ts
export function useExistenciasPorDeposito() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { data, isLoading } = useQuery(buildExistenciasPorDepositoSql(), [empresaId])
  const rows = useMemo(() => pivotExistencias((data ?? []) as ExistenciaRawRow[]), [data])
  return { rows, isLoading }
}
```

SQL (one query, `deposito_id`/`cantidad_actual` nullable via LEFT JOIN — missing pair means product never moved to that deposito, defaulted client-side, not per-row):

```sql
SELECT p.id AS producto_id, p.codigo, p.nombre, s.deposito_id, s.cantidad_actual
FROM productos p
LEFT JOIN inventario_stock s ON s.producto_id = p.id
WHERE p.empresa_id = ? AND p.tipo = 'P' AND p.is_active = 1
ORDER BY p.nombre ASC
```

`pivotExistencias` groups rows by `producto_id` (Map), building `cantidadPorDeposito` only from rows actually present; the component fills missing deposito keys with `'0.000'` at render time via the column list (keeps the pure function's contract simple — it doesn't need to know the full deposito set).

## Component Design

`existencias-por-deposito.tsx`: `useExistenciasPorDeposito()` + `useDepositosActivos()` (sorted via `ordenarDepositosColumnas`). Local `filtroTexto` state, same nombre/codigo `.includes()` filter as `ProductoList`. Columns rendered dynamically from the sorted deposito list; each cell reads `row.cantidadPorDeposito[deposito.id] ?? '0.000'`. Empty states: no productos (`tipo='P'`) → "No hay productos almacenables"; zero active depositos → "No hay depositos activos configurados"; search yields nothing → "No se encontraron productos" (mirrors `ProductoList`). Loading: same skeleton-row pattern as `ProductoList`/`TraspasoList`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/inventario/lib/existencias-pivot.ts` | Create | `pivotExistencias`, `ordenarDepositosColumnas`, `buildExistenciasPorDepositoSql` — pure, PowerSync-free |
| `src/features/inventario/lib/__tests__/existencias-pivot.test.ts` | Create | Unit tests for the 3 pure functions |
| `src/features/inventario/hooks/use-inventario-stock.ts` | Modify | Add `useExistenciasPorDeposito()` + `ExistenciaRawRow`/`ExistenciaRow` re-export |
| `src/features/inventario/components/existencias/existencias-por-deposito.tsx` | Create | Matrix table + search |
| `src/features/inventario/components/existencias/__tests__/existencias-por-deposito.test.tsx` | Create | Render/search/empty-state tests |
| `src/routes/_app/inventario/traspasos.tsx` | Modify | Wrap in `Tabs`/`TabsList variant="line"`/`TabsContent`; tab 1 = new component (default), tab 2 = existing `TraspasoList` (unchanged import) |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (`existencias-pivot.test.ts`) | Missing `(producto, deposito)` pair defaults to `'0.000'`; multiple depositos per producto grouped correctly; `ordenarDepositosColumnas` puts `es_principal=1` first then `nombre` ASC; `buildExistenciasPorDepositoSql` contains `WHERE p.empresa_id = ?`, `p.tipo = 'P'`, `p.is_active = 1` (string-assertion, `kardex-sql.test.ts` precedent) | Pure functions, no mocking |
| Component (`existencias-por-deposito.test.tsx`) | Renders one row per producto, one column per deposito ordered correctly; search filters by nombre and codigo; 3 empty states; zero-value cell rendering | `vi.mock('@/core/db/powersync/db', ...)` + mock `useExistenciasPorDeposito`/`useDepositosActivos`/`useCurrentUser`, `traspaso-form.test.tsx` boilerplate pattern |
| Manual/Integration | Route renders both tabs, default tab is "Existencias", switching tabs preserves `TraspasoList` behavior unchanged | Not automated (no PowerSync integration harness for route-level rendering in this codebase yet) |

Commands: `yarn test:run` (vitest), `yarn type-check:test` (`tsc --noEmit --project tsconfig.test.json`), `yarn type-check` for app code.

## Migration / Rollout

No migration required — read-only, additive, no schema/write-path changes. Purely additive files + one route wrap; revert is a single-commit operation per the proposal's Rollback Plan.

## Open Questions

None — all decisions ratified in the proposal's Decisions section; this design translates them 1:1 into concrete files/functions.
