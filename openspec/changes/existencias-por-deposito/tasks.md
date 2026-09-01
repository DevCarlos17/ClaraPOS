# Tasks: Existencias por Deposito

TDD: strict, RED (failing test) before GREEN (impl). Test runner `yarn test:run`, types `yarn type-check:test`.

## Review Workload Forecast

| File | Action | Est. lines | Precedent used |
|---|---|---|---|
| `lib/existencias-pivot.ts` | New | ~70 | `lib/traspasos.ts` (123 for 2 fns; ours is 3 smaller fns) |
| `lib/__tests__/existencias-pivot.test.ts` | New | ~90 | `lib/__tests__/traspasos.test.ts` (64 for 2 fns) |
| `hooks/use-inventario-stock.ts` | Modify (additions) | ~25 | existing file's own hook shape (60 lines total, 2 hooks) |
| `components/existencias/existencias-por-deposito.tsx` | New | ~130 | `traspaso-list.tsx` (118, read-only table) + dynamic cols + 3 empty states |
| `components/existencias/__tests__/existencias-por-deposito.test.tsx` | New | ~150 | `traspaso-form.test.tsx` (270, but fewer mocked hooks: 3 vs 5) |
| `routes/_app/inventario/traspasos.tsx` | Modify | ~35 | current file is 21 lines; Tabs wrap adds imports + JSX restructure |
| `routes/_app/inventario/__tests__/traspasos.test.tsx` | New | ~70 | no route-test precedent exists; mocks both tab components |
| **Total** | | **~570** | |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

Estimate (~570) exceeds the 400-line budget as one PR, driven by the pure-function test file the design added (not in the original proposal's ~250-300 estimate). Each work unit below stays under 400 individually.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pure pivot/sort/SQL functions + tests + hook wiring (~185 lines) | PR 1 | Base = tracker branch `feat/existencias-por-deposito`. No UI. |
| 2 | Matrix component + tests + route Tabs restructure + route test (~385 lines) | PR 2 | Base = PR 1's branch. Depends on PR 1's hook + types. |

## Phase 1: Pure Pivot Functions (`lib/existencias-pivot.ts`)

- [ ] 1.1 [RED] `existencias-pivot.test.ts`: `pivotExistencias` — missing (producto,deposito) pair defaults `'0.000'`; multiple depositos grouped per producto.
- [ ] 1.2 [GREEN] Implement `pivotExistencias` + `ExistenciaRawRow`/`ExistenciaRow` interfaces in `existencias-pivot.ts`.
- [ ] 1.3 [RED] Failing test: `ordenarDepositosColumnas` sorts `es_principal` DESC then `nombre` ASC.
- [ ] 1.4 [GREEN] Implement `ordenarDepositosColumnas`.
- [ ] 1.5 [RED] String-assertion test for `buildExistenciasPorDepositoSql`: `WHERE p.empresa_id=? AND p.tipo='P'`, LEFT JOIN shape (`kardex-sql.ts` precedent).
- [ ] 1.6 [GREEN] Implement `buildExistenciasPorDepositoSql`.

## Phase 2: Hook Wiring (`hooks/use-inventario-stock.ts`)

- [ ] 2.1 Add `useExistenciasPorDeposito()`: `useCurrentUser` → `empresaId`, `useQuery(buildExistenciasPorDepositoSql(), [empresaId])`, `useMemo(() => pivotExistencias(data ?? []), [data])`.
- [ ] 2.2 Re-export `ExistenciaRawRow`/`ExistenciaRow` types for component consumers.

## Phase 3: Matrix Component (`components/existencias/existencias-por-deposito.tsx`)

- [ ] 3.1 [RED] `existencias-por-deposito.test.tsx`: mock `@/core/db/powersync/*` + `useExistenciasPorDeposito`/`useDepositosActivos`/`useCurrentUser` (`traspaso-form.test.tsx` boilerplate). Test: one row per producto, columns ordered `es_principal` first then `nombre` ASC.
- [ ] 3.2 [GREEN] Implement table: columns from `ordenarDepositosColumnas(depositos)`, cell = `row.cantidadPorDeposito[deposito.id] ?? '0.000'`.
- [ ] 3.3 [RED] Failing test: text filter narrows rows by nombre/codigo, case-insensitive substring (`ProductoList` behavior).
- [ ] 3.4 [GREEN] Add `filtroTexto` local state + filter logic.
- [ ] 3.5 [RED] Failing tests for 3 empty states: zero `tipo='P'` productos, zero active depositos, search yields nothing.
- [ ] 3.6 [GREEN] Implement empty-state branches + loading skeleton (`ProductoList`/`TraspasoList` pattern).

## Phase 4: Route Restructure (`routes/_app/inventario/traspasos.tsx`)

- [ ] 4.1 Export `TraspasosPage` as a named export (enables RTL testing without router harness; zero behavior change).
- [ ] 4.2 [RED] `traspasos.test.tsx`: mock `ExistenciasPorDeposito` and `TraspasoList`; assert "Existencias por deposito" tab active by default, both `TabsTrigger`s render.
- [ ] 4.3 [GREEN] Wrap content in `Tabs` (`variant="line"`, `horarios-staff-page.tsx` precedent): tab 1 = `<ExistenciasPorDeposito/>` (default), tab 2 = unchanged `<TraspasoList/>`.
- [ ] 4.4 Verify: `yarn test:run`, `yarn type-check:test`; grep confirms `TraspasoList` import/props unchanged.

## Dependency Order

`Phase 1 → Phase 2 → Phase 3 → Phase 4`, strictly sequential (component depends on hook, hook depends on pure functions).

## Branch/PR Topology (feature-branch-chain)

Tracker: `feat/existencias-por-deposito` (from `develop`). Only tracker merges to `develop`.

| # | Unit | Branch | PR base |
|---|---|---|---|
| 1 | Phase 1+2 | `feat/existencias-por-deposito/1-pivot-hook` | tracker |
| 2 | Phase 3+4 | `feat/existencias-por-deposito/2-component-route` | `1-pivot-hook` |
| — | tracker | `feat/existencias-por-deposito` | `develop` (final PR) |
