# Tasks: Orden fiscal de IGTF y referencia de factura en abono/excedente del recibo

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~320-400 (B2 ~200 incl. tests, B5 ~140 incl. tests) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes (precautionary — natural B2/B5 split exists) |
| Suggested split | PR 1 (B2: fiscal order) → PR 2 (B5: invoice ref) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 (B2) | Fiscal totals order (TOTAL FACTURA → IGTF → TOTAL + IGTF) in PDF + PNG/texto, via shared `construirFilasTotales` | PR 1 | Base: `feat/recibo-igtf-orden-abono-factura` off `origin/develop`. Touches `factura-export.ts` only (types + new builder + both render sites) + its test file. Independent of B5. |
| 2 (B5) | Invoice reference on SAF cierre (PNG/texto only), threading `invoiceAssignments` | PR 2 | Base: PR 1's branch/commit (same feature branch, sequential) or `feat/recibo-igtf-orden-abono-factura` if PR 1 already merged to develop. Touches `recibo-pagos.ts`, `factura-export.ts` (`formatearCierre` only), `cobro-modal.tsx:516-518`, tests. Independent of B2 logically; sequenced after to keep diffs clean since both edit `factura-export.ts`. |

If combined actual diff lands under 400 lines after implementation, both units MAY ship as a single PR — re-confirm line count before opening PR and downgrade to single-PR only with explicit user confirmation.

Setup (once): `git fetch origin && git checkout -b feat/recibo-igtf-orden-abono-factura origin/develop`.

## Phase 1: B2 — Fiscal Totals Order (Work Unit 1)

- [ ] 1.1 `factura-export.ts` `ReciboTotales` (37-44): add `totalFacturaUsd: number`, `totalFacturaBs: number` (pre-IGTF subtotal fields).
- [ ] 1.2 `factura-export.ts` `buildReciboData` (182-203): compute `totalFacturaUsd = montoExentoUsd + baseImponibleUsd + ivaTotal` and `totalFacturaBs = usdToBs(totalFacturaUsd, tasa)`; keep `totalGeneralUsd/Bs` unchanged (still `totalFactura + igtf`); populate both new fields in the returned `totales`.
- [ ] 1.3 **RED**: `factura-export.test.ts` — test `buildReciboData` totals math: Exento $1 + Base $3 + IVA8% $0.08 + IVA16% $0.16 → `totalFacturaUsd` $4.24 (excludes IGTF); with IGTF $0.06 → `totalGeneralUsd` $4.30, `totalFacturaUsd` still $4.24.
- [ ] 1.4 **RED**: `factura-export.test.ts` — test new `construirFilasTotales(totales)` (not yet exported/implemented): with igtf>0 emits ordered rows Exento → Base → alícuotas → `TOTAL FACTURA` (non-bold, USD-only) → `IGTF` → `TOTAL + IGTF` (bold, bimonetario, final); with igtf=0/null emits Exento → Base → alícuotas → single bold `TOTAL FACTURA` row (bimonetario) as final, no IGTF row, no "+ IGTF" suffix.
- [ ] 1.5 **GREEN**: `factura-export.ts` (~line 253) — add `interface FilaTotal { label: string; usd: string; bs?: string; bold: boolean }` and pure `construirFilasTotales(totales: ReciboTotales): FilaTotal[]` implementing the row order from 1.4 using `formatUsd`/`formatBs`.
- [ ] 1.6 **GREEN**: `factura-export.ts` `construirLineasRecibo` (280-295) — replace inline totals block with `construirFilasTotales(recibo.totales).map(...)` pushed as `LineaRecibo[]` (respect `bold` flag, bimonetario format matching existing `formatUsd`/`formatBs` combined display).
- [ ] 1.7 **GREEN**: `factura-export.ts` `buildReciboPdfBlob` `totalesBody` (418-434) — replace inline totals block with `construirFilasTotales(recibo.totales).map(...)` producing the same `[label, value]` rows consumed by `autoTable`. Do NOT touch PDF fonts/table config/other layout — totals row order/content only.
- [ ] 1.8 **RED+GREEN**: `factura-export.test.ts` — parity test: same fixture through `construirLineasRecibo` and `buildReciboPdfBlob`'s totals extraction produce identical order/values (regression guard for the original divergence bug).
- [ ] 1.9 Run `yarn test:run` scoped to `factura-export.test.ts` — confirm green. Run `yarn type-check:test`.

## Phase 2: B5 — Invoice Reference on SAF Cierre (Work Unit 2)

- [ ] 2.1 `recibo-pagos.ts` `ReciboCierre` (26-30): add `facturasAplicadas?: Array<{ nroFactura: string; montoUsd: number; montoBs: number }>`.
- [ ] 2.2 `recibo-pagos.ts` `ReciboDiscrepancyInput` (32-36): add `invoiceAssignments?: Array<{ nroFactura: string; montoUsd: number }>`.
- [ ] 2.3 **RED**: `recibo-pagos.test.ts` — test `construirCierreRecibo` with `discrepancy.mode === 'SAF'` and `invoiceAssignments` of 1 factura → `cierre.facturasAplicadas` has 1 entry with `montoBs = usdToBs(montoUsd, tasa)`; with 2 facturas → 2 entries, correct per-entry `montoBs`; with `invoiceAssignments` absent/empty → `facturasAplicadas` undefined (fallback path unaffected).
- [ ] 2.4 **RED**: `factura-export.test.ts` — test `formatearCierre` (via exported behavior or `construirLineasRecibo`) SAF branch: 1 factura → `"Abono aplicado a factura(s) 1234 por Bs 500 ($1)"`; 2 facturas (FIFO) → both listed with own amounts; no `facturasAplicadas` → unchanged `"Saldo a favor del cliente: Bs X ($Y)"`; VUELTO/PROPINA/DIFERENCIAL_SOBRANTE/CREDITO unchanged (no facturas reference, no regression).
- [ ] 2.5 **GREEN**: `recibo-pagos.ts` `construirCierreRecibo` (97-119) — when `mode === 'SAF'` and `discrepancy.invoiceAssignments?.length`, map each to `{ nroFactura, montoUsd, montoBs: usdToBs(montoUsd, tasa).toNumber() }` and set on returned `cierre.facturasAplicadas`.
- [ ] 2.6 **GREEN**: `recibo-pagos.ts` — add pure `formatearFacturasAplicadas(facturas): string` producing `"1234 por Bs 500 ($1)"` (1) or comma-joined list (N).
- [ ] 2.7 **GREEN**: `factura-export.ts` `formatearCierre` (237-251) — SAF case: if `cierre.facturasAplicadas?.length`, render `` `Abono aplicado a factura(s) ${formatearFacturasAplicadas(cierre.facturasAplicadas)}` ``; else keep current `"Saldo a favor del cliente: ..."` text. PDF path unaffected (out of scope per spec).
- [ ] 2.8 `cobro-modal.tsx` `onSuccess` payload (516-518) — stop stripping `invoiceAssignments`: include `invoiceAssignments: discrepancy.invoiceAssignments` in the `discrepancy` object passed to `onSuccess` (alongside existing `mode`, `montoUsd`, `montoBs`).
- [ ] 2.9 Run `yarn test:run` scoped to `recibo-pagos.test.ts` and `factura-export.test.ts` — confirm green. Run `yarn type-check:test`.

## Phase 3: Verification (Both Units)

- [ ] 3.1 Run full `yarn test:run` — all suites green, no regressions in unrelated recibo scenarios.
- [ ] 3.2 Run `yarn type-check:test` — no type errors from new optional fields across `VentaExitosaData` → `ReciboDiscrepancyInput` → `ReciboCierre` chain.
- [ ] 3.3 `git diff -- src/features/ventas/utils/factura-export.ts` on the PDF section (`buildReciboPdfBlob`) — confirm the ONLY change is the totals row order/content (no font, table config, or other layout diff).
- [ ] 3.4 Confirm actual changed-line count per work unit (`git diff --stat`); if combined stays under 400, note it and ask user whether to merge into a single PR instead of the planned split.
