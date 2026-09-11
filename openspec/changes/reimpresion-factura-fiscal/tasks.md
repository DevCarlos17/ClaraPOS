# Tasks: Reimpresión de Factura Fiscal (Gestión de Clientes)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | PR1 ~120-160, PR2 ~250-320, PR3a ~120-160, PR3b ~180-230 |
| 400-line budget risk | Low (each slice individually under budget; PR2/PR3b approach it) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3a → PR3b |
| Delivery strategy | feature-branch-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Base branch | Notes |
|---|---|---|---|
| PR1 | `esReimpresion` marker + `centrarTexto` in `factura-export.ts`, unit tests | `test/integracion-clientes` (tracker `feat/reimpresion-factura-fiscal` base) | Additive only; default false = byte-identical regression guard |
| PR2 | `recibo-desde-factura.ts` extraction + swap into both NC modals + new tests | PR1 branch | FROZEN-adjacent; existing NC modal tests must stay green UNMODIFIED |
| PR3a | `onRowClick` on `FacturasEmpresaTable` + `cliente-detalle.tsx` wiring | PR2 branch | No per-row button; state only |
| PR3b | `reimprimir-factura-modal.tsx` + tests | PR3a branch | Consumes PR2's hook + PR3a's wiring |

---

## PR1 — `esReimpresion` marker

**File**: `src/features/ventas/utils/factura-export.ts`, tests in `src/features/ventas/utils/__tests__/factura-export.test.ts`

- [ ] T1-01 (RED) Add test: `buildReciboData` without `esReimpresion` produces `ReciboData.esReimpresion === false` and output byte-identical to pre-change fixture.
- [ ] T1-02 (GREEN) Add `esReimpresion?: boolean` to `BuildReciboDataInput` and `ReciboData`; `buildReciboData` sets `esReimpresion: input.esReimpresion ?? false`. Acceptance: T1-01 passes.
- [ ] T1-03 (RED) Add test: `centrarTexto('REIMPRESION', 32)` returns a string of length 32 with the text space-padded and centered (both-side padding, monospace convention).
- [ ] T1-04 (GREEN) Implement pure `centrarTexto(texto: string, ancho: number): string` helper. Acceptance: T1-03 passes.
- [ ] T1-05 (RED) Add test: `construirLineasRecibo` with `esReimpresion: true` includes a centered "REIMPRESION" line between the client-data spacer and the `'Articulos'` line; with `esReimpresion: false`/omitted, no such line exists.
- [ ] T1-06 (GREEN) Inject `centrarTexto('REIMPRESION', RECIBO_ANCHO_CHARS)` in `construirLineasRecibo` (text/PNG path) between the post-client-data spacer (L440) and `'Articulos'` (L441), gated by `esReimpresion`. Acceptance: T1-05 passes.
- [ ] T1-07 (RED) Add test: `buildReciboPdfBlob` with `esReimpresion: true` renders "REIMPRESION" centered (`align: 'center'`) between the info block and the `'Articulos'` label; absent when false/omitted.
- [ ] T1-08 (GREEN) Inject the centered marker in `buildReciboPdfBlob` between the info block (L561) and `'Articulos'` label (L563) using native `{ align: 'center' }`, gated by `esReimpresion`. Acceptance: T1-07 passes.
- [ ] T1-09 (RED) Add test: `buildReciboTextoPlano` with `esReimpresion: true` reflects the marker if it composes from the same lines path; if `buildReciboTextoPlano` does not derive from `construirLineasRecibo`, assert current (unchanged) behavior explicitly instead.
- [ ] T1-10 (GREEN) If `buildReciboTextoPlano` shares the lines pipeline, no extra code needed — confirm T1-09 passes as-is; otherwise wire the same `esReimpresion` gate into its own line construction. Acceptance: T1-09 passes; note in PR description which branch applied.

---

## PR2 — `recibo-desde-factura` extraction

**Files**: `src/features/ventas/utils/recibo-desde-factura.ts` (new), `src/features/ventas/utils/__tests__/recibo-desde-factura.test.ts` (new), `src/features/ventas/components/nota-credito-pos-modal.tsx` (extraction-only), `src/features/ventas/components/crear-ncr-modal.tsx` (extraction-only)

- [x] T2-01 (RED) Add test: `buildReciboDataDesdeFacturaGuardada(factura, detalle, pagos, company)` maps a fixture `FacturaParaAnular` + `detalle` + `pagos` + `company` to the exact `ReciboData` fields the current inline blocks produce (no `esReimpresion`, no `monedaPresentacion` passed → both undefined/default).
- [x] T2-02 (GREEN) Create `recibo-desde-factura.ts` with pure `buildReciboDataDesdeFacturaGuardada(factura, detalle, pagos, company, opts?)`, calling `buildReciboData(...)` internally. Acceptance: T2-01 passes.
- [x] T2-03 (RED) Add test: `buildReciboDataDesdeFacturaGuardada(..., { esReimpresion: true, monedaPresentacion: 'BS' })` passes both through to the returned `ReciboData` unchanged (opt-in passthrough).
- [x] T2-04 (GREEN) Wire `opts.esReimpresion`/`opts.monedaPresentacion` straight into the `buildReciboData` call. Acceptance: T2-03 passes.
- [x] T2-05 (RED) Add test for `useReciboDesdeFactura(venta, opts?)`: mock `@powersync/react` `useQuery` for `useDetalleFactura`/`usePagosFactura`/`useCompany` — assert `{ recibo: null, isLoading: true }` while any source is loading, and `{ recibo: ReciboData, isLoading: false }` once all resolve; `venta === null` returns `{ recibo: null, isLoading: false }` without querying.
- [x] T2-06 (GREEN) Implement `useReciboDesdeFactura` composing `useDetalleFactura`/`usePagosFactura`/`useCompany` + `buildReciboDataDesdeFacturaGuardada`. When `opts.derivarMonedaPresentacion` is true, read `parseEmpresaConfig(company?.config).moneda_presentacion_documentos`. Acceptance: T2-05 passes.
- [x] T2-07 (Extraction-only, behavior-neutral) In `nota-credito-pos-modal.tsx`, replace the `recibo` `useMemo` body (L263-291) with a call to `buildReciboDataDesdeFacturaGuardada(...)`; delete the now-unused local `toTipoImpuestoLinea`. Do NOT touch hook calls or `useMemo` deps arrays. Acceptance: existing `__tests__/nota-credito-pos-modal.test.tsx` passes UNMODIFIED. **Deviation**: `toTipoImpuestoLinea` was NOT deleted — it is still referenced by the separate `lineasParaNc` useMemo (NC PARCIAL line selection), unrelated to the recibo mapping. Deleting it would break that second call site. Kept as-is; only the `recibo` useMemo body was swapped.
- [x] T2-08 (Extraction-only, behavior-neutral) In `crear-ncr-modal.tsx`, apply the same swap (L121-149). Acceptance: existing `__tests__/crear-ncr-modal.test.tsx` passes UNMODIFIED. Same deviation as T2-07 applies (`toTipoImpuestoLinea` still used by `lineasParaNc`).
- [x] T2-09 (Verification) Run `__tests__/nota-credito-pos-modal.test.tsx` and `__tests__/crear-ncr-modal.test.tsx` unmodified against the extracted code. Acceptance: both suites green, zero diff to test files (behavior-neutral proof per spec §"Neutralidad de comportamiento"). Confirmed: 62/62 tests passed (47 + 15), `git diff --stat` on both test files empty.

---

## PR3a — `onRowClick` wiring

**Files**: `src/features/ventas/components/facturas-empresa-tab.tsx`, `src/features/ventas/components/__tests__/facturas-empresa-tab.test.tsx`, `src/features/clientes/components/cliente-detalle.tsx`, `src/features/clientes/components/__tests__/cliente-detalle.test.tsx`

- [x] T3a-01 (RED) Add test in `facturas-empresa-tab.test.tsx`: clicking a table row calls `onRowClick` with that row's `FacturaParaAnular`; no per-row button is rendered.
- [x] T3a-02 (GREEN) Add `onRowClick?: (f: FacturaParaAnular) => void` prop to `FacturasEmpresaTable`, pass through to `DataTable`'s existing `onRowClick` prop (zero `DataTable` changes). Acceptance: T3a-01 passes.
- [x] T3a-03 (RED) Add test in `cliente-detalle.test.tsx`: clicking a row in `FacturasEmpresaTable` updates `facturaSeleccionada` state (assert via a rendering side-effect, e.g. a test double/spy on the modal placeholder consuming the state).
- [x] T3a-04 (GREEN) In `cliente-detalle.tsx`, add `facturaSeleccionada` state (`FacturaParaAnular | null`) and wire `onRowClick={setFacturaSeleccionada}` (no per-row actions column). Acceptance: T3a-03 passes. **Note**: no modal exists yet (PR3b). Type-safety/observability for the unused-looking state is achieved via a tiny commented-out placeholder (`data-testid="factura-seleccionada-placeholder"`, `className="hidden"`) that PR3b will delete and replace with `<ReimprimirFacturaModal .../>` at the same spot (marked with a `{/* PR3b: ... */}` comment).

---

## PR3b — Reimprimir factura modal

**Files**: `src/features/ventas/components/reimprimir-factura-modal.tsx` (new), `src/features/ventas/components/__tests__/reimprimir-factura-modal.test.tsx` (new), `src/features/clientes/components/cliente-detalle.tsx` (render gate)

- [x] T3b-01 (RED) Add test: modal renders `FacturaDetallePanel` fed by `useReciboDesdeFactura(venta, { esReimpresion: true, derivarMonedaPresentacion: true })` once loading resolves; shows a loading state while the hook resolves.
- [x] T3b-02 (GREEN) Create `reimprimir-factura-modal.tsx`: call `useReciboDesdeFactura` with those opts, render `FacturaDetallePanel` when `recibo` is ready, loading indicator otherwise. Acceptance: T3b-01 passes.
- [x] T3b-03 (RED) Add test: "Descargar PDF" button click calls `descargarReciboPdf(recibo)` with `recibo.esReimpresion === true`.
- [x] T3b-04 (GREEN) Wire "Descargar PDF" button (JSX mirrors `venta-exitosa-modal.tsx` L286-309) to `descargarReciboPdf`. Acceptance: T3b-03 passes.
- [x] T3b-05 (RED) Add test: with `navigator.share` defined, "Compartir" button click calls `compartirReciboImagen(recibo)`; with `navigator.share` undefined, the button is not rendered.
- [x] T3b-06 (GREEN) Wire "Compartir" button conditionally on `navigator.share` presence, calling `compartirReciboImagen`. Acceptance: T3b-05 passes.
- [x] T3b-07 (RED) Add test: when `compartirReciboImagen` rejects with `AbortError`, no error UI/toast appears.
- [x] T3b-08 (GREEN) Swallow `AbortError` in the Compartir click handler (same contract as `venta-exitosa-modal.tsx`). Acceptance: T3b-07 passes. **Note**: `puedeCompartir` is computed per-render (not module-level like `venta-exitosa-modal.tsx`) so `vi.stubGlobal('navigator', ...)` works per-test; the AbortError guard is duplicated defense-in-depth (component checks `err.name === 'AbortError'` itself) since the test mocks `compartirReciboImagen` at the module boundary, bypassing its internal swallow logic.
- [x] T3b-09 (RED) Add test in `cliente-detalle.test.tsx` (extends T3a-03/04): when `facturaSeleccionada` is set, `ReimprimirFacturaModal` mounts with that factura; closing it clears `facturaSeleccionada` and unmounts the modal (no dangling per-row button).
- [x] T3b-10 (GREEN) In `cliente-detalle.tsx`, render `<ReimprimirFacturaModal venta={facturaSeleccionada} isOpen={!!facturaSeleccionada} onClose={() => setFacturaSeleccionada(null)} />`. Acceptance: T3b-09 passes.

---

## Out of scope (documented, not tasked)

- `empresa_id` gap in `useDetalleFactura`/`usePagosFactura`: pre-existing tech debt, NOT fixed here — `venta.id` arrives already empresa-scoped via `useFacturasEmpresa` upstream (per design.md §Data Flow, proposal.md §Risks).
- Reprint inside `nota-credito-pos-modal.tsx` (FROZEN), `ventas-consultas-modal.tsx` ad-hoc PDF, any per-row action button — deferred per proposal.md §Out of Scope.
