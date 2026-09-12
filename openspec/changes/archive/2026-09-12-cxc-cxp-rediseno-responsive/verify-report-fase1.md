# Verify Report — cxc-cxp-rediseno-responsive (Phase 1)

**Status: PASS**

## Executive Summary

Phase 1 (3 slices: blue "Importar Saldos" button on CxC/CxP, CxC top-5
client-side short list, CxP search hook + top-5 short list) is implemented
exactly per spec (obs #3421) and tasks (obs #3422/tasks.md, all items `[x]`).
Blast radius is limited to the 5 expected src files + their tests. No SQL
`LIMIT` was added to either KPI-feeding hook (`useClientesConDeuda`,
`useProveedoresConDeuda`); both remain unlimited and both KPI blocks/footers
read from the full, unsliced arrays. The new `useBuscarProveedoresDeuda`
mirrors CxC's search hook exactly (2-char threshold, unescaped `%term%`,
`empresa_id` mandatory, `ORDER BY razon_social ASC LIMIT 20`). Financial
flows (Pagar, Abono Global/Reversar, Imprimir, bimonetario, decimal
precision) were not touched — confirmed via diff, zero lines changed outside
the redesign surface.

A real bug reported by the user at `yarn dev` time (TanStack Router warning
`"... does not export a Route"` for the 2 route-level test files created in
Slice 1) was fixed as part of this verify: `routeFileIgnorePattern` was
added to the `tanstackRouter()` plugin config in `vite.config.ts` to exclude
`__tests__/` and `*.test.tsx|*.spec.tsx` from the route scan, repo-wide —
committed as `747ce43`.

Full suite: **119 files / 1429 tests passing** (matches apply-progress claim
exactly). `yarn type-check:test` clean except the same pre-existing,
unrelated `use-pwa-update.ts` TS6133 (baseline, confirmed not a regression).

**Safe to push + open PR to `develop` for Phase 1.**

## Route-Scan Bug Fix

**Cause**: `tanstackRouter()` plugin (vite.config.ts) had no
`routeFileIgnorePattern` configured, so it scanned every `.tsx` under
`src/routes/`, including the 2 new test files placed in
`src/routes/_app/clientes/__tests__/cuentas-por-cobrar.test.tsx` and
`src/routes/_app/compras/__tests__/cxp.test.tsx` (Slice 1). Neither exports
a `Route`, triggering the `"does not export a Route"` console warning on
every `yarn dev` start.

**Approach chosen**: Option — add `routeFileIgnorePattern:
'__tests__|\\.(test|spec)\\.tsx?$'` to the `tanstackRouter()` config, rather
than relocating the 2 files.

**Why this approach over relocation**:
- Grepped the repo for any precedent of testing route files from outside
  `src/routes/` (e.g. importing via the `@/routes/...` alias) — **none
  found**. These 2 tests are the first and only tests targeting route-level
  components directly (they import `CuentasPorCobrarPage`/`CxpRoutePage`
  from `../cuentas-por-cobrar` / `../cxp` and mock `createFileRoute`).
  Moving them would require rewriting the relative import to the `@/`
  alias with no established convention to follow.
- `routeFileIgnorePattern` fixes the **class** of bug (any future test
  co-located under `src/routes/**/__tests__/`), not just these 2 files.
- Confirmed via `@tanstack/router-generator`'s `configSchema` that the
  default `routesDirectory`/`generatedRouteTree` match this repo's layout
  (`./src/routes`, `./src/routeTree.gen.ts`), so no other config drift.

**Verification performed** (empirical, not just reasoning):
- Instantiated `@tanstack/router-generator`'s `Generator` class directly
  (bypassing the need to run a full dev server) with the default config —
  reproduced the exact 2 warnings from the bug report.
- Re-ran with `routeFileIgnorePattern: '__tests__|\\.(test|spec)\\.tsx?$'`
  applied — **0 warnings**.
- Confirmed `git diff -- src/routeTree.gen.ts` is **0 lines** after
  regeneration: the 2 test files were never producing phantom route
  entries (just the console warning), so the real route tree is
  byte-identical. Per the task's own guidance ("do NOT commit
  routeTree.gen.ts if it regenerates as noise"), nothing was staged/committed
  for that file.
- Re-ran `yarn test:run` after the config change: the 2 relocated-in-place
  test files (`cuentas-por-cobrar.test.tsx`, `cxp.test.tsx`) still execute
  and pass — Vitest's test discovery is independent of the Vite Router
  plugin's route scan.

**Commit**: `747ce43` — `fix(build): excluir archivos de test del escaneo de
rutas de tanstack router` (branch `feat/cxc-cxp-rediseno-responsive`, on top
of `9ce2515`). Only file touched: `vite.config.ts` (+6 lines).

**skill_resolution**: `work-unit-commits` loaded before this commit (build
config change, single work unit) — paths-injected.

## Per-Slice Compliance

| Slice | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Both buttons use `variant="default"` (blue), icon/label/onClick unchanged | `cuentas-por-cobrar.tsx`/`cxp.tsx` diff: only `variant="outline"` removed; route tests assert `data-variant="default"` + click still opens modal | ✅ PASS |
| 1 | Button not rendered when `isOwner=false` (preexisting, unchanged) | No diff to the `{isOwner && (...)}` guard | ✅ PASS |
| 2 | Search-empty renders only top-5 of `useClientesConDeuda` (client-side slice) | `cxc-list.tsx`: `clientes = !isSearching && !filtroSAF ? clientesFiltrados.slice(0, TOP_N_DEUDORES) : clientesFiltrados` | ✅ PASS |
| 2 | No SQL LIMIT added to `useClientesConDeuda` | Read full hook body — unchanged, no `LIMIT` | ✅ PASS |
| 2 | SAF filter runs BEFORE the slice (full array) | `clientesFiltrados` computed from `clientesBase` (full `allClientes` or search results) *before* `.slice()`; slice only applies `!isSearching && !filtroSAF` | ✅ PASS |
| 2 | KPI totals use FULL list | `clientesDeuda`/`clientesSAF` (KPI cards) computed from `allClientes`, never `clientesFiltrados`/`clientes` | ✅ PASS |
| 3 | New `useBuscarProveedoresDeuda` filters by `empresa_id`, mirrors CxC semantics | 2-char threshold, unescaped `%term%`, `p.empresa_id = ?` x3 (subqueries + outer), `ORDER BY razon_social ASC LIMIT 20` — read in full | ✅ PASS |
| 3 | Search input added, same UX pattern as CxC | `MagnifyingGlass` icon, same Tailwind classes, placeholder in Spanish | ✅ PASS |
| 3 | Top-5 client-side (search-empty) | `proveedoresVisibles = isSearching ? searchResults : proveedores.slice(0, TOP_N_DEUDORES)` | ✅ PASS |
| 3 | KPIs (Deuda Total, Proveedores con Deuda, Mayor Deuda) use FULL list | `deudaTotal`/`nroProveedores`/`proveedorMayorDeuda` all derive from `proveedores` (from `useProveedoresConDeuda`), never `proveedoresVisibles` | ✅ PASS |
| 3 | `useProveedoresConDeuda` has no SQL LIMIT | Read full hook body — unchanged, no `LIMIT` | ✅ PASS |

## CRITICAL Checks

- **No SQL LIMIT on KPI-feeding queries**: `useClientesConDeuda` (use-cxc.ts:96) and `useProveedoresConDeuda` (use-cxp.ts:77) both read in full — neither has a `LIMIT` clause. Confirmed by direct source read, not just grep. ✅
- **`empresa_id` filtering preserved**: all 4 relevant hooks (`useClientesConDeuda`, `useBuscarClientesDeuda`, `useProveedoresConDeuda`, new `useBuscarProveedoresDeuda`) filter by `empresa_id` sourced from `useCurrentUser()`, defaulting to `''` (never omitted) when user is null. ✅
- **Pagar / Abono Global / Imprimir / bimonetario / decimal precision unchanged**: `registrarPagoCxP`, `reversarAbonoCxP`, `registrarDiferencialCxP` in `use-cxp.ts` and all CxC payment/print flows have zero diff lines vs. base (`1637a81`). Confirmed via full-file diff stat — only the 2 new hook exports were added; nothing existing was modified. ✅

## Test & Type-Check Evidence

```
yarn test:run
Test Files  119 passed (119)
     Tests  1429 passed (1429)
    Errors  1 error (Unhandled Rejection: "Worker is not defined" in
            cliente-detalle.test.tsx — pre-existing, present in baseline,
            unrelated to this change; causes process exit code 1 despite
            all 1429 tests passing)
```

```
yarn type-check:test
1 error: src/hooks/use-pwa-update.ts(8,20): TS6133 'swUrl' declared but
never read — pre-existing, unrelated, confirmed baseline.
```

No NEW failures. Test count (119/1429) matches apply-progress's exact claim.

`yarn type-check` (main `tsconfig.json`, not `tsconfig.test.json`) was also
run out of extra caution; it fails on `*.test.ts(x)` files repo-wide
(missing Vitest globals — `describe`/`it`/`expect`/`vi`) including
pre-existing unrelated test files (`utils.test.ts`, `vencimientos.test.ts`).
This is expected: the main tsconfig doesn't type-check test files by
design, `type-check:test`/`tsconfig.test.json` is the correct command for
tests and was already reported clean above. Not a regression.

## Blast Radius

Confirmed via `git diff --stat 1637a81..HEAD -- src/`:

```
src/routes/_app/clientes/cuentas-por-cobrar.tsx          |  4 +-
src/routes/_app/clientes/__tests__/cuentas-por-cobrar.test.tsx | 69 ++
src/routes/_app/compras/cxp.tsx                          |  4 +-
src/routes/_app/compras/__tests__/cxp.test.tsx           | 69 ++
src/features/cxc/components/cxc-list.tsx                 | 14 +-
src/features/cxc/components/__tests__/cxc-list.test.tsx  | 124 ++
src/features/compras/hooks/use-cxp.ts                    | 41 ++
src/features/compras/hooks/__tests__/use-cxp.test.ts     | 94 ++
src/features/compras/components/cxp-page.tsx             | 50 +-
src/features/compras/components/__tests__/cxp-page.test.tsx | 133 ++
```

Plus this verify's fix: `vite.config.ts` (+6 lines, `747ce43`). No other
`src/` files touched. Matches expectation exactly.

## Manual Visual QA Checklist (for the user, browser-side)

- [ ] `/clientes/cuentas-por-cobrar` — "Importar Saldos" button renders
      solid blue (`bg-primary`), not outline.
- [ ] `/compras/cxp` — "Importar Saldos" button renders solid blue, not
      outline.
- [ ] CxC panel with 6+ debtors and empty search shows only 5 rows; KPI
      cards and footer total reflect the full count/sum, not 5.
- [ ] CxC: activating the "SAF" filter with empty search still applies the
      SAF filter over the full list (not just the visible 5) — count should
      reflect all SAF clients, capped at 5 rows only when SAF filter is off.
- [ ] CxC: typing 2+ chars in search shows results unclipped (can exceed 5).
- [ ] CxP panel with 6+ debtors and empty search shows only 5 rows; KPIs
      (Deuda Total, Proveedores con Deuda, Mayor Deuda) and footer total
      reflect the full count/sum.
- [ ] CxP: new search input (magnifying glass icon) present and functional;
      typing 2+ chars shows unclipped results.
- [ ] Selecting a debtor from either short list still opens the correct
      detail panel (CxC) / DetallePanel with facturas+gastos (CxP).
- [ ] `yarn dev` console: no more `"does not export a Route"` warnings.

## Risks

- **None CRITICAL.** The route-scan fix is additive/config-only and was
  empirically verified (0 warnings, 0 routeTree diff, tests still pass).
- **Low**: the pre-existing `Worker is not defined` test error causes
  `yarn test:run` to exit non-zero even though all 1429 tests pass — this
  is baseline behavior unrelated to Phase 1 or this verify's fix, but will
  need separate attention if CI treats exit code as the sole pass/fail
  signal.

## Next Recommended

- Push `feat/cxc-cxp-rediseno-responsive` and open PR(s) to `develop` for
  Phase 1 (per the chained-PR plan already in tasks.md: PR1=Slice1,
  PR2=Slice2, PR3=Slice3, or a single PR if preferred by the user).
- Phase 2 (mobile row→card, master-detail 2-step) remains deferred — needs
  its own propose/spec/tasks pass.

## Skill Resolution

- `sdd-verify` — loaded (this phase).
- `work-unit-commits` — loaded before committing the `vite.config.ts` fix
  (single work unit, build config change) — paths-injected.
