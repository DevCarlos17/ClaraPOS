# Tasks: Panel de facturas afectadas — moneda nativa (Bs) + método de pago

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150-200 (hook ~35 + hook test ~60 + panel ~25 + panel test ~50) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Hook query extension + return-shape (`montoAplicadoNativo`/`monedaCodigo`/`metodoNombre`/`tasa`) + tests | PR 1 | Read-only, no design phase — join mirrors `usePagosFactura` |
| 2 | Panel render (`formatMontoPago` + método) + tests | PR 1 | Same PR — depends on unit 1's return shape, trivial to split further |

Single PR, stacked to main. Both units are small and depend on each other's shape (panel consumes hook's new fields); splitting into two PRs would force an intermediate PR with an unused field.

## Phase 1: Hook — Query Extension (RED)

- [x] 1.1 RED in `use-preview-facturas-afectadas.test.ts`: extend the 6 existing mock bridge rows with `monto_usd`/`monto`/`tasa`/`metodo_nombre`/`codigo_iso` keys (mirror `usePagosFactura`'s mocked columns); add `metodoNombre`/`montoAplicadoNativo`/`monedaCodigo`/`tasa` to the `facturasDirectas`/`facturasSaf` `toEqual(...)` assertions for the "escenario simple" and "escenario SAF" tests. Confirm RED (fields `undefined` against current code).
- [x] 1.2 RED: new test "factura directa incluye moneda nativa y metodo" — fixture `monto_aplicado_usd='1.00000000'`, `tasa='500.0000'`, `metodo_nombre='BANESCO PAGO MOVIL'`, `codigo_iso='VES'`; assert `montoAplicadoNativo=500`, `monedaCodigo='VES'`, `metodoNombre='BANESCO PAGO MOVIL'`, `tasa=500`.
- [x] 1.3 RED: new test "monto nativo se deriva de la fila puente, no del pago completo" — fixture `monto_aplicado_usd='1.00000000'` (partial bridge row) + mock `monto='1000.00000000'` (full pago, unused) + `tasa='500.0000'`; assert `montoAplicadoNativo=500` (NOT `1000`), proving the derivation reads `montoAplicadoUsd * tasa`, never `pagos.monto`.
- [x] 1.4 RED: extend "escenario SAF" fixture + `detectarLoteSafDePago` mock so the SAF-path bridge row also carries `tasa`/`metodo_nombre`/`codigo_iso`; assert the pushed `facturasSaf` entry carries `montoAplicadoNativo`/`monedaCodigo`/`metodoNombre`/`tasa` taken from the BRIDGE ROW (not from `detectarLoteSafDePago`'s mocked return, which stays `{ventaId, nroFactura, montoAplicadoUsd}`-only).
- [x] 1.5 RED: extend "aislamiento multi-tenant" test — assert the bridge SQL still contains `empresa_id = ?` and `params` still `toContain('emp-a')` after the new JOINs/columns are added (proves the empresa filter survives the query edit).

## Phase 2: Hook — Implementation (GREEN)

- [x] 2.1 GREEN in `use-preview-facturas-afectadas.ts`: extend the bridge `SELECT` with `p.tasa, p.metodo_cobro_id, p.moneda_id, mc.nombre AS metodo_nombre, mon.codigo_iso`, add `JOIN metodos_cobro mc ON mc.id = p.metodo_cobro_id` and `LEFT JOIN monedas mon ON mon.id = p.moneda_id` — same pattern as `usePagosFactura` (`use-cxc.ts` ~L461-463). Extend `BridgeRow` with `tasa: string`, `metodo_nombre: string`, `codigo_iso: string | null`.
- [x] 2.2 GREEN: extend `FacturaAfectadaPreview` with `montoAplicadoNativo: number`, `monedaCodigo: string`, `metodoNombre: string`, `tasa: number`.
- [x] 2.3 GREEN: in the loop, compute `montoAplicadoNativo = new Decimal(row.monto_aplicado_usd).times(row.tasa).toNumber()` once per row; attach it + `monedaCodigo: row.codigo_iso ?? 'USD'` + `metodoNombre: row.metodo_nombre` + `tasa: new Decimal(row.tasa).toNumber()` to the `facturasDirectas.push({...})` object.
- [x] 2.4 GREEN: enrich `facturasSaf` at the spread site ONLY — replace `facturasSaf.push(...detalle.facturasAfectadas)` with `facturasSaf.push(...detalle.facturasAfectadas.map((f) => ({ ...f, montoAplicadoNativo, monedaCodigo, metodoNombre: row.metodo_nombre, tasa: ... })))`. Do NOT touch `detectarLoteSafDePago`/`reversa-pago-saf.ts`.
- [x] 2.5 Verify: `git diff --stat src/features/cxc/hooks/reversa-pago-saf.ts` is empty (confirms the shared pure function was not modified).
- [x] 2.6 Verify: `yarn test:run use-preview-facturas-afectadas` — all RED tests from Phase 1 now GREEN, 0 regressions in the existing 6 tests.

## Phase 3: Panel — Render (RED)

- [x] 3.1 RED in `reverso-modal.test.tsx`: extend the `facturasDirectas`/`facturasSaf` fixtures in the "estado OK" describe block (~L222-224) and its sibling fixtures (~L263-264, ~L281-282, ~L302-303, ~L392-393, ~L428-429, ~L467-468) with `montoAplicadoNativo`, `monedaCodigo: 'VES'`, `metodoNombre: 'BANESCO PAGO MOVIL'`, `tasa`.
- [x] 3.2 RED: new assertion in the "estado OK" panel test — rendered panel shows `"$1.00 (Bs. 500,00)"` AND `"BANESCO PAGO MOVIL"`, for BOTH a `facturasDirectas` entry and a `facturasSaf` entry (same assertion shape on both arrays — proves uniform treatment per spec).

## Phase 4: Panel — Implementation (GREEN)

- [x] 4.1 GREEN in `reverso-modal.tsx`: import `formatMontoPago` from `@/features/ventas/utils/factura-export`.
- [x] 4.2 GREEN: add a small local mapper `aLineaPago(f: FacturaAfectadaPreview)` → `ReciboPagoLinea`-shaped object. **DEVIATION from the literal wording above** (documented in apply return summary): mapping `moneda: f.monedaCodigo === 'USD' ? 'USD' : 'BS'` would make `formatMontoPago` collapse to **Bs-primary** (`"Bs. 500,00 ($1.00)"`) whenever `monedaCodigo !== 'USD'`, which CONTRADICTS the spec's own locked scenario output `"$1.00 (Bs. 500,00)"` (USD-primary, verified against `formatMontoPago`'s existing test suite in `factura-export.test.ts` L816-818: `moneda:'BS'` + presentacion `'USD'` → Bs-primary). Implemented instead: `{ metodoCobroId: f.ventaId, metodoNombre: f.metodoNombre, moneda: 'USD', montoNativo: f.montoAplicadoUsd, montoUsd: f.montoAplicadoUsd, montoBs: f.montoAplicadoNativo, forzarBimonetario: true }` — forces the USD-primary bimonetario branch uniformly, matching the spec example and the apply-prompt's explicit instruction ("dual-currency \"$X (Bs. Y)\"").
- [x] 4.3 GREEN: in both the `facturasDirectas.map` (~L309-314) and `facturasSaf.map` (~L325-330) blocks, replace `{formatUsd(f.montoAplicadoUsd)}` with `{formatMontoPago(aLineaPago(f), 'USD')}` and add a second line/span rendering `{f.metodoNombre}`.
- [x] 4.4 Verify: `yarn test:run reverso-modal` — all Phase 3 RED tests now GREEN, 0 regressions in the existing panel-state tests (LEGACY, 0-facturas, SAF-block guard).

## Phase 5: Full Verification

- [x] 5.1 Run `yarn test:run` (full suite) — confirm no regressions outside the two touched test files.
- [x] 5.2 Run `yarn type-check:test` — 0 new TS errors. Do NOT run `yarn lint`.

## Spec Requirement Coverage

| Requirement | Tasks |
|---|---|
| Renderizado dual-moneda y método en el panel | 3.1-3.2, 4.1-4.4 |
| JOINs no rompen aislamiento multi-tenant | 1.5, 2.1, 2.6 |
| Resolución de facturas directas vía el puente (+campos) | 1.1-1.3, 2.1-2.3 |
| Resolución de facturas vía SAF (+campos, sin tocar `detectarLoteSafDePago`) | 1.4, 2.4-2.5 |
