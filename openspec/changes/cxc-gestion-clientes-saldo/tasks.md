# Tasks: Gestion Clientes — Estado de Cuenta funcional + saldo reconciliado

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~330 (2 files modified, 2 test files created) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR, 4 work-unit commits |
| Delivery strategy | ask-always |
| Chain strategy | pending (no chaining needed; confirm single-PR before apply) |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units (commits within one PR)

| Unit | Goal | Files | Notes |
|---|---|---|---|
| 1 | Pure query builder + hook rewrite | `use-clientes.ts` + `use-clientes-filtro.test.ts` | Deletes `useCountMovimientosCliente` |
| 2 | Header/body count-parity + month-default | `cliente-detalle.tsx` (state/hook wiring) + `cliente-detalle.test.tsx` | Removes divergence-prone path |
| 3 | Multi-tenant empresa_id on saldo query | `cliente-detalle.tsx:290-293` + test addition | Purely additive filter |
| 4 | Saldo precision (drop parseFloat) | `cliente-detalle.tsx` saldo/report | Uses `Decimal(...).isPositive()` |

~330 total lines fits the 400-line budget as a single PR. Because delivery strategy is `ask-always`, confirm with user before `sdd-apply` regardless of low risk.

## Phase 1: Pure Query Builder (RED → GREEN)

- [x] 1.1 RED: Create `src/features/clientes/hooks/__tests__/use-clientes-filtro.test.ts`. Assert `buildMovimientosClienteFiltro(empresaId, clienteId, {fechaDesde, fechaHasta})` returns SQL with `empresa_id = ?`, `cliente_id = ?`, `datetime(fecha) >= datetime(? || 'T00:00:00' || VE_OFFSET)` / `<= ...T23:59:59...`, `ORDER BY fecha DESC, created_at DESC, rowid DESC`, and **no `LIMIT`** ever (mirrors `kardex-sql.ts` template). Run `yarn test:run` — must fail (function undefined).
- [x] 1.2 GREEN: In `src/features/clientes/hooks/use-clientes.ts` add `export interface RangoFechaMovimientos { fechaDesde: string; fechaHasta: string }` and pure `buildMovimientosClienteFiltro(empresaId, clienteId, rango)` (no I/O). Run `yarn test:run` — 1.1 passes.
- [x] 1.3 Rewrite `useMovimientosClienteFiltrados(clienteId, rango: RangoFechaMovimientos)` (rango required, no optional fields) to call the builder; delete the `hasFilter`/`LIMIT 5` branch. Delete `useCountMovimientosCliente` (sole caller removed in Phase 2). Run `yarn test:run` — green.

## Phase 2: Header/Body Parity + Month Default (RED → GREEN)

- [x] 2.1 RED: Create `src/features/clientes/components/__tests__/cliente-detalle.test.tsx` (mock `use-clientes`, `use-cxc`, `use-current-user`, `use-tasas`, `@powersync/react`, pattern from `kardex-list.test.tsx`). Assert: header count === `movimientos.length` for N=0,1,5+; "Sin movimientos" shown iff `movimientos.length===0`; on mount the hook receives `{fechaDesde: startOfMonth(), fechaHasta: todayStr()}`; `SAL` tipo renders a label. Run `yarn test:run` — fails.
- [x] 2.2 GREEN: In `cliente-detalle.tsx`: replace `useState('')` for `fechaDesde`/`fechaHasta` with `useState(startOfMonth)`/`useState(todayStr)` (import `@/lib/dates`); update the `cliente.id`-change `useEffect` to reset to `startOfMonth()`/`todayStr()` (never `''`); drop `useCountMovimientosCliente` import/call; collapse the header label (~line 485-489) to one branch: `` `${movimientos.length} movimiento(s) en el periodo` ``; add `SAL: { label: 'Saldo Anterior', color: '...' }` to `TIPO_LABELS`. Run `yarn test:run` — 2.1 passes.

## Phase 3: Multi-Tenant Saldo Query (RED → GREEN)

- [x] 3.1 RED: extend `cliente-detalle.test.tsx` — assert the saldo `useQuery` call includes `AND empresa_id = ?` with `user.empresa_id` as a param. Run `yarn test:run` — fails.
- [x] 3.2 GREEN: update query at `cliente-detalle.tsx:290-293` to `'SELECT saldo_actual FROM clientes WHERE id = ? AND empresa_id = ?'`, params `[cliente.id, user?.empresa_id ?? '']`. Run `yarn test:run` — passes.

## Phase 4: Saldo Precision — No parseFloat (RED → GREEN)

- [x] 4.1 RED: extend `cliente-detalle.test.tsx` — spy on `@/lib/currency` (`formatUsd`, `usdToBs`) asserting they receive the raw saldo string (never a `Number`); assert the sign branch uses `Decimal(saldoStr).isPositive()`. Run `yarn test:run` — fails.
- [x] 4.2 GREEN: remove `parseFloat` at `cliente-detalle.tsx:294-298`, keep `saldoStr` as a string; use `new Decimal(saldoStr).isPositive()` (from `decimal.js`) for the `text-red-600`/`text-green-600` branch (~line 426) and the print report's `deuda`/`ok` class (~line 127); change `generarReporteEstadoCuenta` to accept `saldoActual: string` and pass it straight into `formatUsd`/`usdToBs`. Run `yarn test:run` — passes.

## Phase 5: Final Verification

- [x] 5.1 Run `yarn test:run` — full suite green (all phases above + no regressions elsewhere). 108 test files, 1271 tests, all passed.
- [x] 5.2 Run `yarn type-check` for app code; run `yarn type-check:test` for the two test files (app type-check shows spurious vitest-global errors on `*.test.ts`). `type-check:test` shows one PRE-EXISTING unrelated error (`src/hooks/use-pwa-update.ts` unused var) — not introduced by this change, no files in this change's diff involved.
- [x] 5.3 Diff review: confirm no write to `movimientos_cuenta`, `clientes.saldo_actual`, or any CxC table was introduced (read-only invariant); confirm every touched/new query still filters `empresa_id`. Confirmed — only `use-clientes.ts` and `cliente-detalle.tsx` touched, both read-only (`useQuery`/`buildMovimientosClienteFiltro`); saldo query now filters `empresa_id`; movimientos query always filters `empresa_id + cliente_id`.
