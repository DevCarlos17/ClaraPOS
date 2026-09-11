# Tasks: Consulta de Factura + Evolución Post-Emisión

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~860-1220 (6 slices, see per-slice below) |
| 400-line budget risk | Low (pre-sliced) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 |
| Delivery strategy | feature-branch-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Rename modal + un-hide pagos | PR1, base=`feat/reimpresion-factura-fiscal` | Behavior-neutral rename + additive JSX |
| 2 | Extend `useReversosFactura` with amount | PR2, base=PR1 branch | Touches FROZEN-adjacent NC modal type, tests unmodified |
| 3 | New `useEvolucionFactura` hook | PR3, base=PR2 branch | Pure new read hook, empresa_id-scoped |
| 4 | `ReciboData.evolucion` type + composition | PR4, base=PR3 branch | Additive types + pure mapper + hook composition |
| 5 | Inject render in text/PNG + PDF + regression | PR5, base=PR4 branch | Touches both renderer functions; byte-identical guard |
| 6 | Modal evolution render | PR6, base=PR5 branch | Final integration, tracker `feat/consulta-factura-evolucion` |

## PR1 — Rename modal + un-hide "Métodos de pago" (~120-200 ln)

- [x] 1.1 Rename `reimprimir-factura-modal.tsx` → `consulta-factura-modal.tsx`; `ReimprimirFacturaModal` → `ConsultaFacturaModal`; title "Reimprimir Factura" → "Consulta de Factura". Same props `{ venta, isOpen, onClose }`. Behavior-neutral except title text.
- [x] 1.2 TDD: RED — rename `reimprimir-factura-modal.test.tsx` → `consulta-factura-modal.test.tsx`, update import + assert title "Consulta de Factura" (fails against old file/title). GREEN — task 1.1 makes it pass.
- [x] 1.3 Update `cliente-detalle.tsx`: import path + JSX tag `ConsultaFacturaModal`.
- [x] 1.4 TDD: RED — update `cliente-detalle.test.tsx` mock path (`consulta-factura-modal`) + `data-testid` string (fails until 1.3). GREEN — task 1.3 makes it pass.
- [x] 1.5 In `factura-detalle-panel.tsx`: add "Métodos de pago" JSX block after totals (current ~L115), mirroring `construirLineasRecibo`'s payment section (factura-export.ts L486-499); reuse exported `formatMontoPago`/`sumarAbonos`/`formatMontoBimonetario`. Rewrite L117-132 comment: no longer "hidden", document accepted SAF-FIFO capped-amount caveat (compensated by evolución's future "saldo a favor generado" line).
- [x] 1.6 TDD: RED — extend `factura-detalle-panel.test.tsx`: renders "Metodos de pago" with correct USD/Bs amounts for a fixture with `recibo.pagos` populated (fails, block doesn't exist). GREEN — task 1.5 makes it pass.

## PR2 — Extend `useReversosFactura` with amount (~120-180 ln)

- [x] 2.1 `use-notas-credito.ts`: add `nc.total_usd, nc.total_bs` to `useReversosFactura`'s SELECT; extend `ReversoFacturaRow` with `total_usd`/`total_bs` (additive).
- [x] 2.2 TDD: RED — extend `use-notas-credito.test.ts` describe block (L1172) additively: assert SELECT includes `total_usd`/`total_bs` columns and returned rows carry them (fails, columns absent). GREEN — task 2.1 makes it pass.
- [x] 2.3 `notas-credito-ui.ts`: extend `ReversoFacturaRowInput` + `ReversoAplicado` with `montoUsd`/`montoBs` (additive); fix `agruparReversosPorNc` to read `total_usd`/`total_bs` ONLY in the `if (!grupo)` new-group branch, never in the per-line `grupo.lineas.push(...)` loop.
- [x] 2.4 TDD: RED — new test in `notas-credito-ui.test.ts`: 2+ line NC fixture asserts `montoUsd`/`montoBs` on the group equals the NC's own total ONCE (not summed per line) (fails, field absent / would double-count without the `if (!grupo)` fix). GREEN — task 2.3 makes it pass.
- [x] 2.5 FROZEN regression check: run `nota-credito-pos-modal.test.tsx` and `crear-ncr-modal.test.tsx` UNMODIFIED — confirm both suites stay green after 2.1-2.3. No file edits to these two test files or their subject components.

## PR3 — New `useEvolucionFactura` hook (~120-160 ln)

- [x] 3.1 `use-cxc.ts`: add `EvolucionFacturaRow` interface (`tipo: 'PAG'|'REV'|'SAFC'`, `monto`, `tasa_pago`, `fecha`, `referencia`, `observacion`) and `useEvolucionFactura(ventaId, empresaId)` — single `useQuery` on `movimientos_cuenta WHERE venta_id=? AND empresa_id=? AND tipo IN ('PAG','REV','SAFC') ORDER BY fecha ASC`, returns pre-grouped `{ abonos, reversosPago, saldoAFavor, isLoading }` via 3 in-memory `.filter()` by `tipo`. PURE READ, empresa_id-scoped (rule #11) — do not reuse `useAfectacionCxc`.
- [x] 3.2 TDD: RED — new describe block in `use-cxc.test.ts` mirroring `useAfectacionCxc` tests: asserts WHERE includes `empresa_id`, `tipo IN (...)` filter, and rows group correctly into `abonos`/`reversosPago`/`saldoAFavor` by `tipo` (fails, hook doesn't exist). GREEN — task 3.1 makes it pass.

## PR4 — `ReciboData.evolucion` type + composition (~150-200 ln)

- [ ] 4.1 `factura-export.ts`: add `ReciboEvolucionReverso`, `ReciboEvolucionMovimiento`, `ReciboEvolucion` output types; `ReciboEvolucionReversoInput`, `ReciboEvolucionMovimientoInput`, `ReciboEvolucionInput` input types; add `ReciboData.evolucion?: ReciboEvolucion` and `BuildReciboDataInput.evolucion?: ReciboEvolucionInput` (both additive, optional).
- [ ] 4.2 `factura-export.ts`: new pure `buildReciboEvolucion(input?: ReciboEvolucionInput): ReciboEvolucion | undefined` — maps reversos/abonos/reversosPago/saldoAFavorGenerado; Bs via single formula `usdToBs(monto, tasa_pago)` (monto is always USD per rule verified in design); returns `undefined` when everything is empty (byte-identical guard).
- [ ] 4.3 TDD: RED — new describe block in `factura-export.test.ts`: `buildReciboEvolucion(undefined)` and empty-arrays input → `undefined`; multi-case input → correct USD/Bs per case via `usdToBs` (fails, function doesn't exist). GREEN — tasks 4.1-4.2 make it pass.
- [ ] 4.4 `factura-export.ts`: wire `buildReciboData` to set `evolucion` from `input.evolucion` via `buildReciboEvolucion` (default undefined when omitted).
- [ ] 4.5 TDD: RED — extend `factura-export.test.ts` `buildReciboData` tests: omitted `evolucion` input → `recibo.evolucion === undefined`; populated input → `recibo.evolucion` matches `buildReciboEvolucion` output (fails until 4.4). GREEN — task 4.4 makes it pass.
- [ ] 4.6 `recibo-desde-factura.ts`: `useReciboDesdeFactura` adds `useCurrentUser()` for `empresaId`, composes `useReversosFactura(ventaId, empresaId)` (extended) + `useEvolucionFactura(ventaId, empresaId)`; aggregates `isLoading` across all hooks (existing `loadingDetalle || loadingPagos || loadingCompany` plus `loadingReversos || loadingEvolucion`).
- [ ] 4.7 `recibo-desde-factura.ts`: `buildReciboDataDesdeFacturaGuardada` gains additive `evolucion?: ReciboEvolucionInput` param (default undefined), passed through to `buildReciboData`.
- [ ] 4.8 TDD: RED — extend `recibo-desde-factura.test.ts`: hook composes new sources into loading aggregation; `buildReciboDataDesdeFacturaGuardada` called without `evolucion` produces `recibo.evolucion === undefined`, called with it produces populated `recibo.evolucion` (fails until 4.6-4.7). GREEN — tasks 4.6-4.7 make it pass.

## PR5 — Inject into both render paths + regression (~200-280 ln)

- [ ] 5.1 `factura-export.ts` — `construirLineasRecibo`: insert "Evolucion" section after pagos block (~L499, before `if (recibo.cierre)` ~L501), guarded by `recibo.evolucion` non-undefined. Render per-case lines: reverso (`nroNcr` + tipo label + `formatMontoBimonetario`), abono (`formatDateTime` + monto), reversoPago (same shape), saldo a favor (`Genero saldo a favor: ...` when `saldoAFavorGeneradoUsd != null`).
- [ ] 5.2 TDD: RED — extend `factura-export.test.ts` `construirLineasRecibo` tests: populated `recibo.evolucion` produces the 4 expected line shapes in order; omitted `evolucion` produces no "Evolucion" section (fails until 5.1). GREEN — task 5.1 makes it pass.
- [ ] 5.3 `factura-export.ts` — `buildReciboPdfBlob`: insert third `autoTable` (same `theme: 'grid'`/header styling as pagos table L651-660) after pagos autoTable's `finalY` (~L663, before `if (recibo.cierre)` ~L665), same guard and 4-case body rows as 5.1.
- [ ] 5.4 TDD: RED — extend `factura-export.test.ts` `buildReciboPdfBlob` tests: populated `evolucion` triggers a third `autoTable` call with expected body rows; omitted `evolucion` triggers only the existing 2 tables (fails until 5.3). GREEN — task 5.3 makes it pass.
- [ ] 5.5 REGRESSION GUARD: new test mirroring the existing `esReimpresion` byte-identical test — invoice with empty/undefined `evolucion` produces byte-identical text/PNG output AND byte-identical PDF output vs pre-change baseline.
- [ ] 5.6 TDD: RED — write the regression test from 5.5 first against current (pre-injection) fixtures/snapshots; confirm it passes on the PR4 state, then re-run after 5.1/5.3 land to prove no diff. GREEN — confirm identical output after 5.1+5.3.

## PR6 — Modal evolution render (~150-200 ln)

- [ ] 6.1 `factura-detalle-panel.tsx`: render evolution block after totals/pagos blocks (~L115), replacing the quantity-only "Notas de credito aplicadas" block (L134-156) for the Consulta surface — 4-case JSX cards mirroring PDF/text rendering (reverso/abono/reversoPago/saldo-a-favor), reading `recibo.evolucion`.
- [ ] 6.2 TDD: RED — extend `factura-detalle-panel.test.tsx`: populated `recibo.evolucion` renders the 4 expected card shapes; omitted `evolucion` renders nothing new (fails until 6.1). GREEN — task 6.1 makes it pass.
- [ ] 6.3 Verify `reversos` prop on `FacturaDetallePanelProps` stays untouched/functional — the 2 FROZEN NC modals (`nota-credito-pos-modal.tsx`, `crear-ncr-modal.tsx`) keep passing `reversos` for their max-double-credit quantity gating, never `evolucion`; confirm nothing new renders for them (no code change, verification-only task).
- [ ] 6.4 TDD: RE-RUN — `nota-credito-pos-modal.test.tsx` and `crear-ncr-modal.test.tsx` UNMODIFIED, both suites green after 6.1.
