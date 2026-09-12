# Tasks: Consulta de factura por click de fila en Facturas emitidas (admin)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~60-100 total (1 line `stopPropagation` + ~20-30 lines wiring in `facturas-empresa-tab.tsx`; ~40-70 lines of new tests) |
| Chained PRs recommended | No |
| 400-line budget risk | Low |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain (standalone — this change's own PR to `develop`, no prior slice in this chain) |

```text
Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low
```

### Suggested Work Units

| Unit | Goal | Likely PR | Base |
|---|---|---|---|
| A (only unit) | `stopPropagation()` fix on shared NC button + local `onRowClick`/`ConsultaFacturaModal` wiring in `FacturasEmpresaTab` + full test coverage | PR1 (this change's own PR) | `develop` |

Single small slice — well under the 400-line budget, no sub-splitting needed.

---

## Slice A (PR1) — Row-click opens ConsultaFacturaModal, button stays isolated

Satisfies: `reimpresion-factura` — "Apertura del detalle por click en fila"
(third-surface scenario + button/row mutual-exclusion scenario);
`notas-credito-admin` — "Pestaña Facturas..." (row-click scenarios + button
mutual-exclusion + independent-state scenario).

Files:
- `src/features/ventas/components/facturas-empresa-tab.tsx` (both
  `FacturasEmpresaTable` and `FacturasEmpresaTab` live here)
- `src/features/ventas/components/__tests__/facturas-empresa-tab.test.tsx`

**RED**

- [x] A.1 Add `describe('FacturasEmpresaTab — consulta por click de fila')`:
      test that clicking a row (outside the "Aplicar nota de crédito"
      button) renders `ConsultaFacturaModal` open with that row's
      `venta` prop equal to the clicked `FacturaParaAnular`. Mock
      `ConsultaFacturaModal` (module-boundary mock, same convention as
      `cliente-detalle.test.tsx`) to assert props without depending on its
      internal hooks.
- [x] A.2 Add test: closing `ConsultaFacturaModal` (via its `onClose`)
      unmounts it / resets to closed state.
- [x] A.3 Add test: clicking the "Aplicar nota de crédito" button does
      NOT open `ConsultaFacturaModal` — assert it stays absent/closed —
      while `CrearNcrModal` still opens with that row's factura (reuse
      existing `CrearNcrModal` mock pattern from the file's Slice D
      tests).
- [x] A.4 Add test: open `ConsultaFacturaModal` via row-click for factura
      A, close it, then click "Aplicar nota de crédito" on factura B —
      assert `CrearNcrModal` opens with B and `ConsultaFacturaModal`
      shows no residual state (independent `useState` pairs).
- [x] A.5 Run `yarn test:run src/features/ventas/components/__tests__/facturas-empresa-tab.test.tsx`
      — confirm A.1-A.4 fail RED (`ConsultaFacturaModal` not rendered /
      button not guarded yet) and confirm the PRE-EXISTING "Aplicar nota
      de crédito" tests (lines ~135-206, `mostrarAcciones`/`onRowClick`
      describe blocks) still pass unmodified at this point (no regression
      introduced by only adding new tests).

**GREEN**

- [x] A.6 In `FacturasEmpresaTable`'s "acciones" column `cell`, change the
      button's `onClick` from `() => onAplicarNc?.(f)` to
      `(e) => { e.stopPropagation(); onAplicarNc?.(f) }`. This is the
      shared-component fix (Modified Capability `reimpresion-factura`) —
      additive guard, zero behavior change for the 3 other callers
      (`cliente-detalle.tsx`, `ventas-consultas-modal.tsx` x2) since they
      all render with `mostrarAcciones={false}`.
- [x] A.7 Import `ConsultaFacturaModal` in `facturas-empresa-tab.tsx`.
- [x] A.8 In `FacturasEmpresaTab`, add a new, fully independent state pair:
      `const [facturaConsulta, setFacturaConsulta] = useState<FacturaParaAnular | null>(null)`
      and `const [consultaAbierta, setConsultaAbierta] = useState(false)`
      (or fold into one nullable-driven `isOpen={!!facturaConsulta}` like
      `cliente-detalle.tsx`'s PR3a/PR3b pattern — prefer that simpler
      single-state form for consistency with the reference pattern).
      MUST NOT reuse or touch `facturaSeleccionada`/`modalOpen` (the
      existing `CrearNcrModal` state).
- [x] A.9 Pass `onRowClick={setFacturaConsulta}` to
      `<FacturasEmpresaTable ... />` in `FacturasEmpresaTab`'s render.
- [x] A.10 Mount `<ConsultaFacturaModal venta={facturaConsulta} isOpen={!!facturaConsulta} onClose={() => setFacturaConsulta(null)} />`
      as a sibling of the existing `<CrearNcrModal ... />`.
- [x] A.11 Run `yarn test:run src/features/ventas/components/__tests__/facturas-empresa-tab.test.tsx`
      — A.1-A.4 GREEN; all pre-existing tests in the file still green
      (zero regressions).
- [x] A.12 Run `yarn test:run` (full suite) and `yarn type-check` —
      confirm no orphan regressions in `cliente-detalle.test.tsx` or
      `ventas-consultas-modal.test.tsx` (both rely on the same shared
      `FacturasEmpresaTable`/button code path touched in A.6).

Verification:
- `yarn test:run src/features/ventas/components/__tests__/facturas-empresa-tab.test.tsx` — 0 failing, new row-click/button-isolation/independent-state tests green, pre-existing "Aplicar nota de crédito" describe blocks unmodified and green.
- `yarn test:run src/features/clientes/components/__tests__/cliente-detalle.test.tsx` and `yarn test:run src/features/reportes/components/__tests__/ventas-consultas-modal.test.tsx` — green, no regression from the shared `stopPropagation` change (both callers use `mostrarAcciones={false}`, dead-code path for them).
- `yarn type-check` clean.

Rollback boundary: revert this single commit/PR — `facturas-empresa-tab.tsx` and its test file both return to pre-change state (button without guard, no `ConsultaFacturaModal` wiring). Self-contained; no other slice or PR depends on this.

---

## Cross-cutting constraints

- TypeScript strict, no `any`; named exports; kebab-case files; Spanish UI copy only; `yarn` only.
- No new queries — reuses `useFacturasEmpresa` (already `empresa_id`-filtered) and `useReciboDesdeFactura`/`useEvolucionFactura` inside `ConsultaFacturaModal` (unchanged).
- No change to bimonetario/decimal-precision/immutability rules — pure UI wiring + one additive event-handler guard.
- `yarn test:run` must be green after every GREEN task — strict TDD, no task merges with a failing or skipped test.
- Do not touch `DataTable`, `ConsultaFacturaModal`, or `CrearNcrModal` internals — only the two components inside `facturas-empresa-tab.tsx`.
