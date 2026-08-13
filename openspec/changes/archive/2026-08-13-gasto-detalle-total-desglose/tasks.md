# Tasks: Fix Total Factura y Desglose Base/IVA en Detalle de Gasto

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~220-320 planned; actual: 367 insertions / 18 deletions across 4 files (Phases 0-5) + a small Phase 6 post-verify fix commit (`90c6673`, test-only changes, no new prod-code lines beyond the 1-line `deriveGastoTotales` correction) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR, 2 internal work-unit commits |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (not needed — single PR fits budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `deriveGastoTotales()` pure function + table-driven tests (RED→GREEN) in `gasto-montos.ts` | PR 1 | Base branch `feat/gasto-detalle-total-desglose` off `origin/develop`; self-contained, no UI wiring |
| 2 | Wire function into modal + Base/IVA/Total breakdown JSX + dead-code TODO note | PR 1 | Depends on Unit 1; includes manual scenario check + full test/type-check run |

## Phase 0: Setup

- [x] 0.1 Create branch `feat/gasto-detalle-total-desglose` from `origin/develop` (`git fetch origin develop && git checkout -b feat/gasto-detalle-total-desglose origin/develop`).
- [x] 0.2 Stage selectively only files touched by this change (`git add <path>` per file). Do NOT stage `coverage/`, `image*.png`, other `openspec/changes/*` dirs, or `.atl/skill-registry.*` — unrelated working-tree noise.

## Phase 1: Test Foundation (RED)

- [x] 1.1 In `src/features/contabilidad/lib/__tests__/gasto-montos.test.ts`, add table-driven test cases for a not-yet-existing `deriveGastoTotales(gasto, tasaValor)`: cross USD/BS x sin-paralela/con-paralela x tipo_impuesto Gravable/Exento/Exonerado (12 cases).
- [x] 1.2 Assert `totalProveedorUsd` derives from `monto_usd` (total, base+IVA), never from `monto_factura` alone (regression guard per spec scenario "Gasto gravable con IVA 16%").
- [x] 1.3 Assert BS+paralela case converts `monto_usd` (total) by `tasa_proveedor`, not `monto_factura` (spec scenario "Gasto en Bs con tasa paralela").
- [x] 1.4 Run `yarn test:run` and confirm the new tests fail (function not yet exported) — RED confirmed.

## Phase 2: Core Implementation (GREEN)

- [x] 2.1 In `src/features/contabilidad/lib/gasto-montos.ts`, add `GastoTotalesInput` and `GastoTotalesResult` interfaces per design.md contract.
- [x] 2.2 Implement `deriveGastoTotales(gasto, tasaValor)`: `totalContableUsd = montoTotalGasto(gasto)`, `baseUsd = montoCostoGasto(gasto)`, `ivaUsd = montoIvaGasto(gasto)`; `totalProveedorUsd` = `monto_usd` when USD, else divide `monto_usd` by `tasa_proveedor` (paralela) or `tasa` (no paralela) using Decimal.js. **(SUPERSEDED by Phase 6 — see below: this division was a bug, removed post-verify.)**
- [x] 2.3 Derive `esGravable`/`esExento`/`esExonerado` from `tipo_impuesto` + `ivaUsd > 0.005`, matching the dead `gasto-detalle-modal.tsx` three-way switch.
- [x] 2.4 Run `yarn test:run` — all Phase 1 tests pass (GREEN). Run `yarn type-check` clean.

## Phase 3: Integration / Wiring

- [x] 3.1 In `src/features/compras/components/factura-proveedor-modal.tsx`, extend the `GastoRow` interface with `tipo_impuesto`, `porcentaje_iva`, `base_imponible_usd`, `monto_iva_usd` (already fetched by `SELECT g.*`).
- [x] 3.2 Replace the inline `if (tipo === 'GASTO' && gasto) { ... }` body (~L226-249) in the `amounts` `useMemo` with a call to `deriveGastoTotales(gasto, tasaValor)`, preserving the existing `saldo` computation.
- [x] 3.3 Verify the `tipo === 'COMPRA' && compra` branch (~L203-224) is untouched — confirm no shared code path was introduced (CxP non-regression per spec).

## Phase 4: UI Breakdown

- [x] 4.1 In the "Totales" section (~L624-650), add a Base/IVA/Total breakdown block gated by `tipo === 'GASTO'`, dynamic per `amounts.esGravable/esExento/esExonerado`: Gravable shows "Base imponible", "IVA ({porcentajeIva}%)", "Total con IVA"; Exento/Exonerado show a single "Monto Exento/Exonerado (sin IVA)" line.
- [x] 4.2 Show USD + Bs equivalent (`* tasaValor`) on each new breakdown line, matching existing bimonetary presentation pattern used elsewhere in the section.
- [x] 4.3 Manually verify against spec scenario "Coherencia con Confirmar Registro": labels/amounts match `gasto-form.tsx`'s `ResumenConfirm` for the same Gasto.

## Phase 5: Cleanup & Verification

- [x] 5.1 Add a `// TODO(dead-code):` header comment to `src/features/contabilidad/components/gasto-detalle-modal.tsx` noting it is unused (not imported) and kept only as reference; no functional change.
- [x] 5.2 Run full `yarn test:run` and `yarn type-check` — all green, no regressions in existing `gasto-montos.test.ts` or CxP-related tests. (326/326 at this checkpoint.)
- [x] 5.3 Manual check: Gasto Base $10.00 / IVA 16% ($1.60) shows "Total Factura" = $11.60; abono of $11.60 reads "completamente pagada" without exceeding total (spec scenario "Abono igual al total no muestra incoherencia").

## Phase 6: Post-Verify Critical Fix (not originally planned)

First-pass fresh-context verify (engram #1512/#1513, superseded) flagged a CRITICAL double-currency-conversion bug: Phase 2.2's division of `monto_usd` by `tasa_proveedor`/`tasa` for BS gastos was WRONG — `monto_usd` is already the final converted USD total persisted by `crearGasto` (`use-gastos.ts` L204-218), so dividing it again produced values ~40x too small (e.g. $116 displayed as $2.90).

- [x] 6.1 Root-caused against `use-gastos.ts::crearGasto`: confirmed `monto_usd` is always the single canonical, already-converted USD total for all 3 currency modes (USD, BS no-paralela, BS paralela).
- [x] 6.2 RED: rewrote the 6 BS `DERIVE_CASES` table entries and the named BS-paralela regression test to assert the ground-truth value (`monto_usd` directly, e.g. 116), not the old buggy divided value (e.g. 2.90). Added 2 new regression tests: "coherencia Confirmar-Registro" invariant (`baseUsd + ivaUsd === totalContableUsd === totalProveedorUsd`) and "invariante abono <= total". 9/24 tests failed as expected before the fix.
- [x] 6.3 GREEN: fixed `deriveGastoTotales` in `gasto-montos.ts` — `totalProveedorUsd = totalContableUsd` unconditionally, no division, no branching on `moneda_factura`/`usaParalela`. 24/24 tests green.
- [x] 6.4 Confirmed zero regression in `factura-proveedor-modal.tsx` (`git diff --stat` empty for the fix commit) and zero COMPRA-branch diff.
- [x] 6.5 Full suite: `yarn test:run` → 328/328 passed (25 files, +2 net from the new regression tests). `yarn type-check:test` clean.
- [x] 6.6 Fresh-context re-verify (engram #1512, PASS) independently re-traced the math against `crearGasto` and confirmed the fix — no CRITICAL issues remaining.

Commit: `90c6673` "fix(contabilidad): remove double currency conversion in deriveGastoTotales".

## Status: 6/6 phases complete (5 planned + 1 post-verify fix), 328/328 tests green, verify PASS. Ready for archive.
