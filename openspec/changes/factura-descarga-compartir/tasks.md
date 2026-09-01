# Tasks: Descargar/Compartir Recibo desde Venta Procesada

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~355 (design estimate) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

## Phase 1: Data Layer Consolidation

- [x] 1.1 In `src/features/ventas/hooks/use-notas-credito.ts`, remove the local `useDetalleFactura` (lines ~122-139) and re-export the canonical one from `src/features/cxc/hooks/use-cxc.ts` instead. Verify existing call sites (`ventas-consultas-modal.tsx`, `crear-ncr-modal.tsx`) still compile unchanged. **Deviation**: literal re-export was not possible — see "Deviations from Design" in apply-progress; implemented as a thin wrapper that calls the canonical hook for line items and keeps its own `pagos` query, preserving the existing `{ detalles, pagos, isLoading }` shape both call sites depend on.
- [x] 1.2 In `src/features/cxc/hooks/use-cxc.ts`, extend the `useDetalleFactura` SQL SELECT (line ~201) and `DetalleFacturaCxc` interface (line ~135) to include `tipo_impuesto` and `impuesto_pct` from `ventas_det` — required by the recibo builder for exento marking and alicuota grouping. Confirm this addition does not break existing consumers (`factura-detalle-cxc.tsx`, `crear-ncr-modal.tsx`) since it's additive-only.

## Phase 2: Pure Builders (TDD, RED-first)

- [x] 2.1 RED: Create `src/features/ventas/utils/__tests__/factura-export.test.ts`. Write failing cases for `buildReciboData`: single alicuota, mixed alicuotas (16%+8%), fully exento/exonerado (both types bucket into `montoExentoUsd`, marked `(E)`), IGTF present vs `igtfUsd: null`, `nroFactura`/`fecha`/emisor/cliente fields populated. Run `yarn test:run` — confirm it fails (module `factura-export.ts` missing).
- [x] 2.2 GREEN: Create `src/features/ventas/utils/factura-export.ts` with types `ReciboLinea`, `ReciboAlicuota`, `ReciboTotales`, `ReciboData` (per design's Interfaces/Contracts) and `buildReciboData()` implementing the Totals-by-Alicuota Algorithm from design.md using `decimal.js` (mirror `lib/currency.ts` rounding). Run `yarn test:run` — all Phase 2.1 cases pass.
- [x] 2.3 REFACTOR: Run `yarn type-check:test`; clean up any duplication in `buildReciboData` grouping logic. No behavior change.
- [x] 2.4 RED: Add failing cases to `factura-export.test.ts` for `buildReciboTextoPlano`: assert `(E)` marker present on exento lines, one line per alicuota bucket, IGTF line only when `igtfUsd !== null`, and assert the literal string `"Factura"` never appears in output (only `"RECIBO"`). Run `yarn test:run` — confirm failure (function missing).
- [x] 2.5 GREEN: Implement `buildReciboTextoPlano(recibo: ReciboData): string` in `factura-export.ts` — monospaced text with header emisor/cliente, lineas, totales, meta (nro + fecha). Run `yarn test:run` — cases from 2.4 pass.
- [x] 2.6 REFACTOR: `yarn type-check:test` clean; verify text formatting helpers aren't duplicated with the PDF builder (extract shared line-formatting helpers if any emerge).
- [x] 2.7 RED: Add failing cases for `shareOrDownloadRecibo`: mock `navigator.share` to reject with `DOMException('AbortError', 'AbortError')` — assert it resolves silently (no throw); mock it to reject with a generic `Error` — assert it rethrows. Run `yarn test:run` — confirm failure (function missing).
- [x] 2.8 GREEN: Implement `shareOrDownloadRecibo(recibo: ReciboData): Promise<void>` in `factura-export.ts` — feature-detects `typeof navigator.share === 'function'`; mobile path calls `navigator.share({ text: buildReciboTextoPlano(recibo) })` and swallows `AbortError` only; desktop path builds `buildReciboPdfBlob(recibo)` and triggers anchor+`URL.createObjectURL` download. Run `yarn test:run` — cases from 2.7 pass.
- [x] 2.9 GREEN (no test, per design): Implement `buildReciboPdfBlob(recibo: ReciboData): Blob` in `factura-export.ts` using `jsPDF` + `jspdf-autotable`, reusing the layout pattern from `ventas-consultas-modal.tsx` `handleImprimirPdf` (line ~398-520): header emisor/cliente, lineas table via `autoTable`, totales block (exento, base imponible, one row per alicuota, IGTF if present, total general), meta (nro recibo, fecha), word "RECIBO" not "Factura". Return `doc.output('blob')`.
- [x] 2.10 REFACTOR: `yarn type-check:test` clean across all of `factura-export.ts`; confirm no `any` types, named exports only.

## Phase 3: UI Wiring

- [x] 3.1 In `src/features/ventas/components/cobro-modal.tsx`, add `ventaId: result.ventaId` and `clienteIdentificacion: clienteData?.identificacion ?? ''`, `clienteDireccion: clienteData?.direccion ?? null` to the `onSuccess({...})` call (line ~501-513).
- [x] 3.2 In `src/features/ventas/components/venta-exitosa-modal.tsx`, extend `VentaExitosaData` interface with `ventaId: string`, `clienteIdentificacion: string`, `clienteDireccion: string | null`.
- [x] 3.3 In `venta-exitosa-modal.tsx`, wire `useDetalleFactura(data.ventaId)` (from `use-cxc.ts`) and `useCompany()` to fetch the data needed by `buildReciboData`; add a single smart action button (below/beside "Nueva Venta") that on click calls `buildReciboData(...)` then `shareOrDownloadRecibo(...)`, showing a `sonner` error toast if the returned promise rejects (non-`AbortError` failures).
- [x] 3.4 Confirm the button uses `typeof navigator.share === 'function'` (via `shareOrDownloadRecibo`'s internal feature-detection) and NOT `use-mobile.ts` viewport detection, per design decision.

## Phase 4: Verification

- [x] 4.1 Grep the diff for the literal string `"Factura"` in `factura-export.ts` and the modified UI text of `venta-exitosa-modal.tsx` — confirm zero matches (only `"RECIBO"` appears). Only matches were the `nroFactura` identifier (pre-existing field name, not new UI copy).
- [x] 4.2 Run `yarn test:run` — full suite green, including all new `factura-export.test.ts` cases. Result: 25 files, 301 tests passed (12 new).
- [x] 4.3 Run `yarn type-check:test` — clean, no new errors.
- [ ] 4.4 Manual smoke check (not automated): process a test venta, confirm desktop shows PDF download and mobile emulation (or real device) shows share sheet with plain text — per design's Open Questions, iOS gesture timing is not blocking for this PR.
- [ ] 4.5 Update `proposal.md` Success Criteria checkboxes after `sdd-verify` confirms behavior (deferred to verify phase).
