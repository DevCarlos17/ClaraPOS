# Tasks: Replicar consulta de factura en Ventas emitidas y NC-POS

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1050-1225 total (A ~450-550, B ~100-150, C ~300-450, D ~80-150) |
| 400-line budget risk | Overall: High. Per-slice: A=High, B=Low, C=High, D=Low |
| Chained PRs recommended | Yes |
| Suggested split | 4 slices: PR1(A) → PR2(B) → PR3(C, size:exception) → PR4(D) |
| Delivery strategy | ask-always |
| Chain strategy | pending — orchestrator confirms (prior changes used feature-branch-chain; all slices below are written to work under either stacked-to-main or feature-branch-chain) |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Base (feature-branch-chain) | Base (stacked-to-main) |
|---|---|---|---|---|
| A | Screen 1 both tabs: hook/table/modal swap + delete bespoke code + full "Por Factura" tests + "Por Cliente" smoke test | PR1 | tracker branch | main |
| B | Screen 1 "Por Cliente" full test coverage — zero production code | PR2 | PR1 branch | main (after PR1 merges) |
| C | Screen 2 reveal-gate: state + footer state machine + reset triggers + retrofit 47-test suite | PR3 — `size:exception` recommended | PR2 branch (or tracker if independent) | main |
| D | Screen 2 Reimprimir → ConsultaFacturaModal, wired onto PR3's footer button | PR4 | PR3 branch | main (after PR3 merges) |

Rationale for `size:exception` on C: design (obs #3357) determined the gate and its ~35-45-test retrofit cannot ship in separate PRs without breaking green-main under strict TDD — the retrofit is a direct, unavoidable, same-PR consequence of landing the gate. Retrofit lines are mechanical one-liners (low cognitive load despite raw count).

---

## Slice A (PR1) — Screen 1: hook/table/modal swap, both tabs

Satisfies: `reimpresion-factura` — "Búsqueda histórica completa preservada", "PDF...usa el recibo térmico compartido", "Apertura del detalle por click en fila" (scenario "...desde Ventas → Consultas").

Files: `src/features/reportes/components/ventas-consultas-modal.tsx`, `src/features/reportes/hooks/use-ventas-reportes.ts`, `src/features/ventas/hooks/use-facturas-empresa.ts`. New test: `src/features/reportes/components/__tests__/ventas-consultas-modal.test.tsx`.

**RED**
- [x] A.1 In new `ventas-consultas-modal.test.tsx`, write "Por Factura" tests: old-month invoice found (wide `fechaDesde`, no current-month restriction), row-click opens `ConsultaFacturaModal`, close unmounts + list shows no per-row reprint button, no jsPDF/autoTable call.
- [x] A.2 Add one "Por Cliente" smoke test: select cliente → table renders → row-click opens `ConsultaFacturaModal` with that factura.
- [x] A.3 Add regression test asserting `enabled: false` on `useFacturasEmpresa` skips the query (empty-SQL pattern) without changing the 3 existing callers.

**GREEN**
- [x] A.4 Add optional `enabled?: boolean` (default `true`) to `FiltroFacturasEmpresaHook` in `use-facturas-empresa.ts`; `false` → empty-SQL skip, mirroring `useFacturasPorCliente`'s existing pattern.
- [x] A.5 Swap `BuscarPorFactura` internals to `useFacturasEmpresa({ busqueda, fechaDesde: FECHA_INICIO_HISTORICO, fechaHasta: todayStr(), enabled: busqueda.length > 0 })` + `FacturasEmpresaTable(mostrarAcciones=false)` with `onRowClick`.
- [x] A.6 Swap `BuscarPorCliente` internals the same way, filtering by `clienteId`.
- [x] A.7 Add top-level `facturaSeleccionada: FacturaParaAnular | null` state; mount `<ConsultaFacturaModal venta={facturaSeleccionada} isOpen={!!facturaSeleccionada} onClose={...} />`. "Por Producto" tab untouched.
- [x] A.8 Delete `FacturaDetalle` (L385-693, jsPDF/autoTable), `FacturasList` (L339-381), `StatusBadge` (L707-721), and now-unused imports from `ventas-consultas-modal.tsx`.
- [x] A.9 Delete `useBuscarFacturas`, `useFacturasPorCliente`, `FacturaBusqueda` from `use-ventas-reportes.ts` (zero other consumers, confirmed by design grep).
- [x] A.10 Run `yarn test:run` and `yarn type-check` — new suite green, no orphan-import errors.

Verification: `yarn test:run src/features/reportes/components/__tests__/ventas-consultas-modal.test.tsx` green; `yarn test:run src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` still 47/47 green (file untouched by this slice); `yarn type-check` clean.

Rollback boundary: revert the PR1 branch — `ventas-consultas-modal.tsx`, `use-ventas-reportes.ts`, and the additive `enabled` flag on `use-facturas-empresa.ts` all revert together; no other slice depends on this being merged except B (test-only).

---

## Slice B (PR2) — Screen 1: "Por Cliente" full test coverage

Satisfies: `reimpresion-factura` — "Apertura del detalle por click en fila" (full "Por Cliente" scenario coverage beyond A's smoke test).

Files: `src/features/reportes/components/__tests__/ventas-consultas-modal.test.tsx` only. Zero production code expected.

**RED**
- [ ] B.1 Add full `describe("Por Cliente")`: select client → table shows only that client's facturas (empresa_id filtered) → old invoice included (no month restriction) → row-click → `ConsultaFacturaModal` opens with the correct `venta` → close → unmounts.
- [ ] B.2 Add edge cases: no client selected → table not rendered (`enabled=false` skip); client with zero facturas → empty state.

**GREEN**
- [ ] B.3 If any test exposes a gap in A's `clienteId` wiring, fix minimally in `ventas-consultas-modal.tsx` (expected: none — A already wires it).
- [ ] B.4 Run `yarn test:run` — full "Por Factura" + "Por Cliente" suite green; NC suite untouched/green.

Verification: `yarn test:run src/features/reportes/components/__tests__/ventas-consultas-modal.test.tsx` — all scenarios from both tabs pass; no regression on A's tests.

Rollback boundary: revert PR2 branch — only removes added test cases, zero production risk (no production code change expected).

---

## Slice C (PR3, `size:exception`) — Screen 2: reveal-gate + retrofit

Satisfies: `notas-credito-pos` — "Reveal-gate de la sección de emisión de NC" (all 4 scenarios), "Selección de tipo de nota de crédito" (MODIFIED — buttons now gated, zero logic change).

Files: `src/features/ventas/components/nota-credito-pos-modal.tsx`, `src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx`.

**RED**
- [ ] C.1 Add `describe("Reveal-gate de NC")` test: on factura selection, NC section + "Tipo de nota de crédito" absent from DOM; footer shows exactly `[Volver, Reimprimir, Emitir nota de crédito]`.
- [ ] C.2 Add test: click "Emitir nota de crédito" → NC section renders; footer swaps to `[Volver, Editar métodos de pago, Confirmar Anulación]`.
- [ ] C.3 Add test: gate revealed for factura A, select factura B → B's panel starts hidden (only detail + 3-action footer).
- [ ] C.4 Add test: gate revealed → "Volver" → returns directly to empty selection state, no intermediate step.

**GREEN**
- [ ] C.5 Add `const [ncSectionRevealed, setNcSectionRevealed] = useState(false)` to `nota-credito-pos-modal.tsx`.
- [ ] C.6 Gate the existing NC block at L534 with `&& ncSectionRevealed` — zero change inside the block.
- [ ] C.7 Restructure footer (L676-709) into a two-branch conditional: gate closed → `[Volver | Reimprimir | Emitir nota de crédito]`; gate open → existing `[Volver | Editar métodos de pago | Confirmar Anulación]` (Reimprimir button rendered but wired in Slice D).
- [ ] C.8 Wire gate reset in the 3 existing trigger points: row-select handler (L464-480), `isOpen`-close effect (L196-209), "Volver" handler (L678-685) — add `setNcSectionRevealed(false)`, no change to existing `setFacturaId(null)` logic.
- [ ] C.9 Run `yarn test:run` on this file — new gate tests pass; confirm which of the 47 original tests now fail (expected ~35-45) because the NC block is hidden by default.
- [ ] C.10 Add shared test helper `revelarSeccionNc()` (clicks "Emitir nota de crédito") in the test file; insert one call at the top of every failing test from C.9 — mechanical one-liner, zero change to any existing assertion or NC logic.
- [ ] C.11 Run full `yarn test:run` on `nota-credito-pos-modal.test.tsx` — all 47 original + new gate tests green.

Verification: `yarn test:run src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` reports 0 failing; diff review shows only the one-line helper-call insertion in retrofitted tests, zero assertion/logic changes (proves additive-only per constraint).

Rollback boundary: revert PR3 branch entirely — `nota-credito-pos-modal.tsx` and its test file both return to pre-gate state (NC section always visible on selection). Self-contained; does not touch Slice A/B files. Slice D depends on this merging first (button exists here, wired there).

---

## Slice D (PR4) — Screen 2: Reimprimir

Satisfies: `notas-credito-pos` — "Reimpresión desde la entrada POS de NC".

Files: `src/features/ventas/components/nota-credito-pos-modal.tsx`, `src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx`.

**RED**
- [ ] D.1 Add `describe("Reimprimir en NC-POS")` test: factura selected → click "Reimprimir" → `ConsultaFacturaModal` opens with that factura's detail + evolución (same test-double pattern as `cliente-detalle.tsx`'s existing tests for `useReciboDesdeFactura`/`useEvolucionFactura`).
- [ ] D.2 Add test: closing the Reimprimir modal does not affect `ncSectionRevealed` — gate state is independent.

**GREEN**
- [ ] D.3 Add `const [reimprimirOpen, setReimprimirOpen] = useState(false)`; wire the footer's "Reimprimir" button (rendered in C.7) `onClick → setReimprimirOpen(true)`; mount `<ConsultaFacturaModal venta={factura} isOpen={reimprimirOpen} onClose={() => setReimprimirOpen(false)} />` as a sibling `Dialog`.
- [ ] D.4 Run `yarn test:run` — D tests + all of C's 47+gate tests + Slice A/B tests all green.

Verification: `yarn test:run src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` full green; confirms `ConsultaFacturaModal` is the same component instance used in `cliente-detalle.tsx` and Slice A (zero new modal component).

Rollback boundary: revert PR4 branch only — Reimprimir button reverts to inert, gate (C) unaffected, zero blast radius on A/B/C.

---

## Cross-cutting constraints (all slices)

- TypeScript strict, no `any`; named exports; kebab-case files; Spanish UI copy only.
- Every touched query preserves `WHERE empresa_id = ?` filtering (no new queries bypass multi-tenant isolation).
- No change to bimonetario/decimal-precision/immutability rules — this change is read-only UI wiring plus one additive hook flag.
- `yarn test:run` must be green after every GREEN task before moving to the next slice; strict TDD — no slice merges with a failing or skipped test.
