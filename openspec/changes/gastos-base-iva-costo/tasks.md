# Tasks: Base Imponible como Costo Real en Gastos y Compras

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-430 |
| Suggested split | PR 1: cargo fix+helper+tests+compra-list+desglose (~230 lines, base=develop) -> PR 2: reports/dashboard migration (~150-200 lines, base=PR 1) |
| Delivery strategy | ask-on-risk |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

## Phase 1: Helper Module (TDD, RED-first)

- [x] 1.1 RED: `src/features/contabilidad/lib/__tests__/gasto-montos.test.ts` — 8 cases (base=100/iva=16; exento(iva=0); base missing->fallback `monto_usd`; manual vs cargo row shape identical; iva missing/0; total cases). `yarn test:run` failed first (module missing).
- [x] 1.2 GREEN: Created `gasto-montos.ts` — `GastoMontos` interface + `montoCostoGasto`/`montoIvaGasto`/`montoTotalGasto` per design. `yarn test:run` passes (8/8).
- [x] 1.3 REFACTOR: `yarn type-check:test` clean. No refactor needed (already minimal).

## Phase 2: Cargo Write-Path Fix

- [x] 2.1 **DEVIATION — NOT applied.** `use-compras.ts:861` left unchanged (`toStorageString(dTotal)` for cargo `monto_usd`). Changing it to `dBase` would contradict design.md's own frozen "Decision: Canonical column semantics" (monto_usd = Total table-wide, alternative (a) explicitly rejected) and would desync cargo rows from manual rows (which write `monto_usd=totalUsd` at use-gastos.ts:271), corrupting `montoTotalGasto()`/Total displays and the out-of-scope files (gastos-kpis.tsx, gasto-list.tsx) that read monto_usd as Total for ALL rows including cargo-sourced gastos. The spec scenario ("costo reportado $1.00, no $1.16") is already satisfied by the EXISTING base_imponible_usd=dBase (L864, unchanged) read via the new `montoCostoGasto()` helper — no write-path change needed. See apply-progress in Engram for full reasoning.
- [x] 2.2 Verified `crearGasto` (use-gastos.ts:218-271) AND `crearGastoDeduccion`/cierre-de-caja path (use-gastos.ts:540-588) already write base/iva/total consistently (Exento path: base=total, iva=0). Cargo INSERT (use-compras.ts:832-873) also already consistent (monto_usd=Total, base_imponible_usd=Base, monto_iva_usd=IVA). No write-path code changes needed anywhere.

## Phase 3: Compra Desglose + Cargo Merge

- [x] 3.1 RED: `compra-lineas-cargo.test.ts` — 5 new cases added (empty cargo unchanged; cargo 0% -> exentoUsd; cargo 16% merges into existing group; cargo 16% creates new group; mixed cargo preserves other-alicuota groups). Failed first (function missing).
- [x] 3.2 GREEN: `compra-lineas-cargo.ts` — added `mergeDesgloseConCargo(desglose, cargo)` + `DesgloseFiscalUsd` type per design. 17/17 tests pass.
- [x] 3.3 **Adjusted from literal instruction.** Kept the original `desgloseUsd`/`totalIvaUsd` destructure UNCHANGED (still feeds `totalUsd`/`totalBs`/CxP calc — moving it after `cargoTotales` as literally worded would double-count cargo IVA into the grand total, since `totalUsd` already adds `totalCargoUsd` separately). Instead added a NEW `desgloseConCargo = useMemo(() => mergeDesgloseConCargo(...))` used ONLY by the render block (L2269+), which now reads `desgloseConCargo.*`. Achieves the spec goal (desglose reconciles with total) without corrupting totalUsd/totalBs.
- [x] 3.4 Manual check: verified arithmetically — `desgloseConCargo` totals (exento+base+iva) always equal product-desglose-total + cargo-total by construction of the pure merge fn, which equals `totalUsd`. Reconciliation holds.

## Phase 4: compra-list.tsx Columns

- [x] 4.1 Added "Base USD"/"IVA USD" `<th>`+`<td>` from `compra.total_base_usd`/`total_iva_usd` via `formatUsd`. Also had to add `total_base_usd`/`total_iva_usd` to the hand-written `Compra` interface (use-compras.ts) — was missing despite `SELECT c.*` already returning them (type-check caught this).

## Phase 5: gasto-reportes.tsx Migration

- [x] 5.1 Swapped `monto_usd` reads to `montoCostoGasto(g)`/`montoIvaGasto(g)`/`montoTotalGasto(g)` in `ReportePorCuenta` accumulation and `TablaDetallada` render.
- [x] 5.2 Added Costo/IVA/Total columns to both `ReportePorCuenta` (incl. grand-total tfoot) and `TablaDetallada` (replacing ambiguous "Monto USD/Bs" with explicit Costo|IVA|Total|Total Bs).

## Phase 6: gastos-dashboard.tsx Migration

- [x] 6.1 Migrated all 18 `monto_usd` display/aggregation sites (chart bucket, resumenItems x3, totalPeriodo, print/PDF report x6, tree render x2, dashboard-tab tfoot, libro-tab table row + tfoot, GastoRow) to `montoCostoGasto(g)`.
- [x] 6.2 Extended `GastoConJoins` type (L928-932) with `base_imponible_usd: string; monto_iva_usd: string`.
- [x] 6.3 **Scoped per design's "non-blocking" open question.** Added IVA+Total breakdown at 3 of the 4 candidate points that have an actual headline UI consumer: "Costo periodo" stat card, Dashboard-tab tfoot, Libro-tab tfoot. The 4th candidate (`resumenItems` CUENTA-criterio total, ~L222) only feeds the pie-chart tooltip/legend (percentages, no $ breakdown UI) — no consumer needed the extra numbers there, so left as cost-only.
- [x] 6.4 Re-ran grep: zero remaining display/aggregation `monto_usd` matches in either file (only the expected type-field declaration remains).

## Phase 7: Regression & Verification

- [x] 7.1 Grep-only confirmed `gastos-kpis.tsx`, `gasto-list.tsx`, `gasto-form.tsx`, `gasto-detalle-modal.tsx` untouched (not in git status diff). Follow-up flagged (unchanged from exploration #1348).
- [x] 7.2 Diff-review confirmed: kardex/product cost logic, `facturas_compra` header totals, `generarAsientosCompra`/`libro_contable`, PR #17 consolidation fn bodies (`consolidarLineasCargo`, `totalizarLineasCargo`) all untouched — only additive `mergeDesgloseConCargo` appended to compra-lineas-cargo.ts.
- [x] 7.3 Manual check covered by automated tests: `gasto-montos.test.ts` "exento" case and `compra-lineas-cargo.test.ts` "cargo 0%" cases both assert cost==total when iva=0.
- [x] 7.4 `yarn test:run`: 278/278 green (265 baseline + 13 new). `yarn type-check:test`: clean. `yarn type-check` (app-wide): zero NEW non-test errors (pre-existing `.test.ts` vitest-globals noise unrelated to this change).
- [ ] 7.5 Update `proposal.md` Success Criteria checkboxes after `sdd-verify` (deferred to verify phase, as instructed).
