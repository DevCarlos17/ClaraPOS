## Exploration: recibo-moneda-presentacion

### Current State

`venta-exitosa-modal.tsx` (`construirRecibo`, lines 77-113) builds a `BuildReciboDataInput` (USD-only line items + `tasa`) and calls `buildReciboData()` in `src/features/ventas/utils/factura-export.ts` (line 143). `buildReciboData` already receives `tasa` and already computes Bs equivalents for: payment methods (`agruparPagosPorMetodo` in `recibo-pagos.ts`, lines 78-104 — computes both `montoUsd` AND `montoBs` for every payment regardless of native currency), the excess/close breakdown (`construirCierreRecibo`, lines 112-144), and the two FINAL total rows (`totalFacturaBs`/`totalGeneralBs`, lines 189/191). Three export renderers share the data (`buildReciboData`) and share `construirFilasTotales` for totals; text/PNG additionally share `construirLineasRecibo` (lines 315-364), but the PDF article table diverges — `buildReciboPdfBlob` builds its own `artBody` (lines 448-454) instead of reusing a shared line-builder, so article-table changes require touching 2 code paths. Payment methods keep their own native currency (confirmed: `ReciboPagoInput.moneda: 'USD'|'BS'`), but native-Bs payments do not currently render their USD equivalent even though the value (`montoUsd`) is already computed by `agruparPagosPorMetodo` — this is a pure rendering gap in `formatMontoPago` (factura-export.ts, lines 238-242), not a data gap.

### Affected Areas

- `src/features/ventas/utils/factura-export.ts` — `ReciboLinea` type (23-30, USD-only), `buildReciboData` line loop (149-176), `construirFilasTotales` (260-293), `formatMontoPago` (238-242), `construirLineasRecibo` article rendering (332-338), `buildReciboPdfBlob` artBody (448-454) and totals table (469-472).
- `src/features/ventas/utils/recibo-pagos.ts` — `agruparPagosPorMetodo` (78-104, data already correct, no change needed) unless montoUsd assertions are added to tests.
- `src/features/configuracion/hooks/use-company.ts` — `EmpresaConfig` interface (5-7, has dead `moneda_contable` field), `parseEmpresaConfig` (9-16), `updateCompany` (50-77, `config` field already writable but never invoked with a value anywhere in the codebase).
- `src/features/configuracion/components/company-data-form.tsx` — natural UI home for the new toggle; currently only edits nombre/rif/direccion/telefono/email, does not touch `config` at all.
- `src/routes/_app/configuracion/datos-empresa.tsx` — hosts `CompanyDataForm` under the "Datos Generales" tab (no route change needed).
- `src/lib/currency.ts` — NOT modified by this change (constraint): reused as-is (`formatUsd`, `formatBs`, `usdToBs`, `bsToUsd`).

### Decisions

**1. Persistence — reuse `empresas.config` JSON, ADD a new field (do not reuse `moneda_contable`).**
`empresas.config` (schema.ts, kysely `types.ts` line ~29) is a per-empresa `text` column already synced via PowerSync, already parsed by `parseEmpresaConfig`, and already accepted (unused) by `updateCompany`'s `config` param — this is a real, working, zero-migration seam. The dead field `moneda_contable?: 'USD'|'BS'` on `EmpresaConfig` is NOT a safe reuse target: its name ("moneda contable" = accounting currency) reads as a bookkeeping/ledger currency concept, semantically distinct from "which currency prints first on customer-facing documents." Reusing it risks silent collision if `moneda_contable` is ever wired up for its original (accounting) purpose later. Recommend adding a new field, e.g. `moneda_presentacion_documentos?: 'USD' | 'BS'` (default `'USD'` when absent), to `EmpresaConfig`. Write path: `CompanyDataForm` reads `parseEmpresaConfig(company.config)`, merges the new field, and calls `updateCompany(company.id, { config: JSON.stringify({ ...currentConfig, moneda_presentacion_documentos: value }) })` — this is the FIRST real caller of `config` in `updateCompany`, so no existing behavior is at risk.

**2. UI home — `src/features/configuracion/components/company-data-form.tsx`, rendered from the "Datos Generales" tab of `src/routes/_app/configuracion/datos-empresa.tsx` (section `'general'`, line 128-129).** This form already owns `useCompany()`/`updateCompany()` and is the only place company-level (non-fiscal) settings are edited today. No new route or nav item needed — add the toggle as a new field inside the existing form and thread it through the existing `handleSubmit`.

**3. Dynamic/not-hardcoded seam — do NOT touch `lib/currency.ts`.** The minimal N-currency-ready shape is a type alias, e.g. `export type MonedaPresentacion = 'USD' | 'BS'` (already structurally identical to `ReciboPagoInput['moneda']` and the dead `EmpresaConfig.moneda_contable`), plus a small lookup table living in `factura-export.ts` near the `Recibo*` types: `{ USD: { primary: (l) => l.totalUsd, secondary: (l) => usdToBs(l.totalUsd, tasa) }, BS: { ... } }` (exact shape is a design-phase decision, not explore's job). This is compatible with `buildReciboData`'s current structure: thread a new optional `monedaPresentacion?: MonedaPresentacion` (default `'USD'`) through `BuildReciboDataInput`, keep computing BOTH usd and bs values as it already does for payments/totals, and only let `monedaPresentacion` decide ORDER/emphasis (which one prints as "primary"). No refactor of `formatUsd`/`formatBs`/`usdToBs`/`bsToUsd` is required — they are reused directly by name. Confirmed: this seam does not require changing `lib/currency.ts`'s hardcoded two-currency design.

### "Both currencies always" — exhaustive gap list

| # | Location | Function / lines | Currently shows | Fix scope |
|---|----------|-------------------|------------------|-----------|
| 1 | Article line unit price + line total | `factura-export.ts` `ReciboLinea` type (23-30) + `buildReciboData` loop (149-176) | USD only (`precioUnitarioUsd`, `totalUsd`) | Data model: add `precioUnitarioBs`/`totalBs` computed via `usdToBs(x, tasa)` |
| 1a | ...rendered in text/PNG | `construirLineasRecibo`, lines 332-338 | USD only | Render fix (shared by text+PNG) |
| 1b | ...rendered in PDF (separate path — 2x work) | `buildReciboPdfBlob` `artBody`, lines 448-454 | USD only | Render fix (PDF-only, does NOT reuse 1a) |
| 2 | "Monto Exento" total row | `construirFilasTotales`, lines 263-265 | USD only | Add `bs` field to `FilaTotal`; shared by text/PNG (341-346) AND PDF (469-472) — single fix covers both renderers |
| 3 | "Base Imponible" total row | `construirFilasTotales`, lines 266-268 | USD only | Same as #2 |
| 4 | "IVA {pct}%" row per alicuota | `construirFilasTotales`, lines 269-271 | USD only | Same as #2 |
| 5 | "TOTAL FACTURA" pre-IGTF row (only rendered when IGTF > 0) | `construirFilasTotales`, line 275 | USD only (note: the no-IGTF variant at 284-289 already IS bimonetary) | Same as #2 |
| 6 | "IGTF" row | `construirFilasTotales`, line 276 | USD only | Same as #2 |
| 7 | Native-Bs payment line | `formatMontoPago`, lines 238-242 | Bs only — but `montoUsd` is ALREADY computed by `agruparPagosPorMetodo` (recibo-pagos.ts 91-104) via `bsToUsd`, unused at render time | Pure render fix, no data change; single fix covers text/PNG (line 353) and PDF (line 494), both call `formatMontoPago` |

Note: payment lines (#7), the cierre breakdown (`construirCierreRecibo`), and the two final total rows (`totalFacturaBs`/`totalGeneralBs`) are the ONLY places already bimonetary before this change — confirms prior map's claim was accurate except for the #7 render gap, which the prior map correctly flagged as a gap vs a data gap.

### Test surface

- `src/lib/__tests__/currency.test.ts` — covers `usdToBs`/`bsToUsd`/`formatUsd`/`formatBs`/`formatTasa`. No changes needed if `lib/currency.ts` stays untouched (constraint holds).
- `src/features/ventas/utils/__tests__/recibo-pagos.test.ts` (297 lines) — covers `agruparPagosPorMetodo`, `construirCierreRecibo`, `formatearFacturasAplicadas`, `reconciliarTotalBs`, `wrapCanvasText`. Gap found: the BS-native payment test (lines 51-60, "método Bs no requiere conversión") asserts `montoNativo`/`montoBs` but does NOT assert `montoUsd` — the conversion is implemented (line 93, `bsToUsd`) but untested. A new assertion (not a new test file) closes this gap and should land BEFORE the render fix (#7 above) per TDD.
- `src/features/ventas/utils/__tests__/factura-export.test.ts` (898 lines) — covers `buildReciboData`, `buildReciboTextoPlano`, PDF/text parity, `construirFilasTotales` indirectly via total-row assertions, `RECIBO_ANCHO_CHARS`. This is where new tests for gaps #1-#6 belong (existing file, existing patterns to extend — no new test file needed for the receipt-rendering side).
- No existing test file for `company-data-form.tsx` or `use-company.ts` (checked `src/features/configuracion/**/__tests__/*.test.*` — only `use-bancos.test.ts` and `tasa-schema.test.ts` exist). A new test file will be needed for the UI toggle + persistence write path (Decision 1/2), since STRICT TDD is active (Vitest, `yarn test:run`).

### Open questions for the user

1. **Scope of the toggle**: does "moneda de presentación" apply ONLY to the sales receipt (`venta-exitosa-modal.tsx` → `buildReciboData`), or should it also affect other USD-primary documents that reuse `useCompany()` today (e.g. `ventas-reportes-pdf.tsx`, `cxc-cliente-reporte.tsx`, `compra-reportes.tsx`)? The change name (`recibo-moneda-presentacion`) suggests receipt-only, but the recommended field name (`moneda_presentacion_documentos`) implies a broader, empresa-wide setting. Needs a product decision before `sdd-propose` scopes the change.
2. **How does the toggle interact with "both currencies always"?** Confirm: does the setting only control which currency prints FIRST/bold (primary) in article lines and intermediate totals, while both values are always visible everywhere (as this exploration assumes) — or does it change something else (e.g. hide the secondary currency in some sections)? This affects the design-phase data shape for `MonedaPresentacion`.

### Ready for Proposal

Yes. The data flow, persistence seam, UI home, and every "both currencies" gap are confirmed with exact file/line references. The two open questions above are genuine product decisions (scope + toggle semantics) that should be resolved in `sdd-propose` before scope is locked, not blockers to starting the proposal.
