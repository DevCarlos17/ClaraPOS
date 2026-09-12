# Verification Report

_Filesystem copy of Engram observation #3341 (`sdd/consulta-factura-evolucion/verify`), created during archive pass 2026-09-11._

**Change**: consulta-factura-evolucion
**Version**: N/A (no delta `specs/` dir was created for this change — `proposal.md` declares Modified Capabilities `reimpresion-factura`/`recibo-venta-exportacion` inline, no `specs/` subfolder exists on disk; verified against proposal.md + design.md + exploration.md + tasks.md as ground truth)
**Mode**: Standard

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 30 (6 PR slices) |
| Tasks complete | 30 |
| Tasks incomplete | 0 |

## Build & Tests Execution

**Build**: N/A (type-check used instead, see below)
**Tests**: ✅ 1375 passed / 0 failed (113 test files) — exactly matches baseline after PR6.
One benign "Unhandled Rejection: Worker is not defined" from `db.ts` (known non-regression, jsdom lacks Worker).
**Type-check** (`yarn type-check:test`): only known pre-existing `use-pwa-update.ts` TS6133 error. No new type errors.

## Per-slice checklist

- PR1 (rename+pagos): ✅ zero dangling `ReimprimirFacturaModal`/`reimprimir-factura-modal` refs in src/ (grep confirmed). Title "Consulta de Factura" confirmed in component + test. `factura-detalle-panel.tsx` L125-141 comment rewritten to document SAF-FIFO caveat (no longer "hidden"). Pagos block un-hidden and tested.
- PR2 (useReversosFactura amount): ✅ SELECT includes `nc.total_usd, nc.total_bs`. `ReversoAplicado.montoUsd/montoBs` set ONLY in the `if (!grupo)` branch (notas-credito-ui.ts L490-501) — never accumulated per line. Explicit 2-line-same-NC test proves montoUsd=150 (not 300). FROZEN: `git diff` on `nota-credito-pos-modal.test.tsx`/`crear-ncr-modal.test.tsx` is empty (zero changes) — both pass as part of the 1375 green.
- PR3 (useEvolucionFactura): ✅ `use-cxc.ts` L293-310 — single `useQuery` filters `WHERE venta_id = ? AND empresa_id = ? AND tipo IN ('PAG','REV','SAFC') ORDER BY fecha ASC`, pre-grouped via 3 `.filter()`. Pure SELECT, no writes nearby. `empresaId` required in guard (`ventaId && empresaId`).
- PR4 (ReciboData.evolucion + composition): ✅ `ReciboData.evolucion?` additive, `buildReciboData` defaults via `buildReciboEvolucion(input.evolucion)`; returns `undefined` when all empty. Bs derivation is uniformly `usdToBs(monto, tasaPago)` (`mapReciboEvolucionMovimiento` in factura-export.ts). `useReciboDesdeFactura` composes `useCurrentUser` → `useReversosFactura`+`useEvolucionFactura`, `isLoading` aggregates `loadingDetalle||loadingPagos||loadingCompany||loadingReversos||loadingEvolucion`.
- PR5 (render injection + regression): ✅ Both `construirLineasRecibo` (text/PNG) and `buildReciboPdfBlob` (PDF) inject after the pagos block/table and before `cierre`, guarded by `if (recibo.evolucion)`, both consuming the single shared pure helper `construirLineasEvolucion`. Regression tests exist and pass: "REGRESION: con evolucion omitida... byte-identical" (text) at line ~1389/1397, and "REGRESION: con evolucion omitida/vacia, solo se dibujan las 3 tablas existentes" (PDF) confirming unchanged autoTable count.
- PR6 (modal render): ✅ `FacturaDetallePanel` renders `recibo.evolucion` via the SAME `construirLineasEvolucion` helper used by PDF/text (single source of truth, no divergence risk). Old quantity-only block guarded by `!recibo.evolucion && reversos.length > 0` — mutually exclusive with the new block, confirmed by explicit test "recibo con evolucion poblada Y reversos prop pasada: NUNCA muestra el bloque viejo (sin doble despliegue)". FROZEN: NC modal test diffs empty, confirmed green.

## FROZEN confirmation

**Yes.** `git diff feat/reimpresion-factura-fiscal..feat/consulta-factura-evolucion -- nota-credito-pos-modal* crear-ncr-modal*` returns empty (zero changes to either file across all 6 PRs), and both suites pass as part of the 1375-test green run.

## Regression-guard confirmation

**Yes.** Text path: explicit test proves empty/undefined evolucion produces byte-identical text output (`toBe`) vs. pre-injection baseline. PDF path: explicit test proves only 3 autoTable calls (articulos+totales+pagos) when evolucion is empty/undefined, no 4th "Evolucion" table drawn.

## Pure-read confirmation

**Yes.** `useEvolucionFactura` (use-cxc.ts) and the extended `useReversosFactura` SELECT (use-notas-credito.ts) are both pure `useQuery` SELECTs. Grepped `use-cxc.ts`/`use-notas-credito.ts` for writeTransaction/INSERT/UPDATE/DELETE near these hooks — all write statements found belong to pre-existing unrelated functions (`aplicarPagoFacturaEnTx`, `registrarPagoFactura`, `crearNotaCredito`, etc.), none in the new/changed evolution-hook code paths.

## empresa_id-in-new-code confirmation

**Yes.** `useEvolucionFactura(ventaId, empresaId)` requires both non-empty (`ventaId && empresaId` guard) and filters `WHERE venta_id = ? AND empresa_id = ?` — does not repeat the pre-existing gap in `useDetalleFactura`/`usePagosFactura` (those remain venta_id-only, unchanged, out of scope per design). Explicit test asserts `sql` contains `WHERE venta_id = ? AND empresa_id = ?`.

## Multi-SAFC edge case assessment

`reducirSaldoAFavorGenerado` (recibo-desde-factura.ts) sums `monto` across all SAFC rows via Decimal (no NaN risk) and uses the LAST row's `tasa_pago` (rows are ASC-ordered by `fecha` from the SQL, so this is genuinely "most recent") for Bs conversion. Logically sound and crash-safe (tasaPago null → montoBs 0 via existing `mapReciboEvolucionMovimiento` null-guard, no throw). **Gap (at verify time)**: no test exercised the 2+-row `saldoAFavor` branch specifically. Low real-world risk (design/exploration confirm one SAFC per invoice in practice) — flagged as WARNING, not CRITICAL.

> **Resolved post-verify, pre-archive**: commit `072cccd` (`test(ventas): cubrir caso multi-SAFC en reducirSaldoAFavorGenerado [PR4]`) added the missing 2+-row test. Full suite re-run: 1376/1376 green (was 1375; +1 new test). This WARNING is now closed — see archive-report.md.

## Test suite results

1375 tests / 113 files, 0 failures (at verify time). Type-check: 1 known pre-existing error only.

## Scope creep / spec deviations / risks

- No scope creep found — diff matches design.md's File Changes table exactly (20 files changed, matches enumerated list).
- No delta `specs/` directory exists for this change (proposal.md declares "Modified Capabilities" inline instead) — process deviation from typical SDD structure, but does not affect implementation correctness; verified against proposal/design/exploration as ground truth instead. Reconciled during archive: `openspec/specs/reimpresion-factura/spec.md` and `openspec/specs/recibo-venta-exportacion/spec.md` were updated directly from proposal/design/exploration content (see archive-report.md "Specs Synced").
- Documented SAF-FIFO capped-pagos caveat (from exploration.md) is correctly reflected in the L125-141 comment rewrite in factura-detalle-panel.tsx, and Part C's "Genero saldo a favor" line does compensate on the source-invoice side as designed.
- WARNING (resolved, see above): multi-SAFC (2+ rows) `reducirSaldoAFavorGenerado` branch was logically sound but untested directly at verify time — closed by commit `072cccd` before archive.

## Verdict

**PASS WITH WARNINGS** (at verify time) → **PASS** (post `072cccd`, pre-archive)

All 6 PR slices verified against design/exploration ground truth; full test suite green (1375/1375 at verify, 1376/1376 after the follow-up test commit) matching baseline exactly; FROZEN NC modal suites untouched and green; both regression guards (byte-identical text, unchanged PDF table count) present and passing; pure-read and empresa_id discipline both confirmed in new code. The single non-blocking WARNING (2+-row saldoAFavor aggregation path untested) was resolved before archiving. Proceeding to archive.
