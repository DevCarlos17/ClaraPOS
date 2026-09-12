# Proposal: Ajustes QA — Nota de Crédito POS Modal

## Intent

Tester feedback on `NotaCreditoPosModal` (from the just-pushed `replicar-consulta-factura-ventas-caja`, branch `feat/consulta-factura-ventas-caja`). Six UI/UX corrections: header duplication, missing tasa on session cards, premature type pre-selection, and — the key fix — the TOTAL confirmation button sitting in the exact same footer slot as the reveal button (double-click hazard).

## Scope

### In Scope
1. Modal title → "Facturas Emitidas - Sesion Actual" (`nota-credito-pos-modal.tsx:431`).
2. Remove the local Cliente/Tasa header (lines 527-536) AND suppress `FacturaDetallePanel`'s own "Factura" title block for this consumer only, via a new opt-in prop `hideFacturaTitle?: boolean` (default `false`). Right panel starts directly at Artículos.
3. Show tasa (4 decimales, `formatTasa`) below the Bs. amount on EVERY session-list card. Confirmed via code read: `useFacturasSesionActiva` already `SELECT`s `v.tasa` and `FacturaParaAnular.tasa` already exists — **no data-layer change needed**.
4. Darken shared section-card borders in `factura-detalle-panel.tsx`: `border-slate-200` → `border-slate-300` (lines 78/110/144). User-approved cross-screen impact (Tradicional NC + Consulta/Reimprimir).
5. Remove TOTAL pre-selection: widen `tipoNc` to `'TOTAL' | 'PARCIAL' | null`, init `null` (was `'TOTAL'`) at both the `useState` and the on-select guess (line 492) — no auto-guess for already-reversed invoices either, per explicit user decision. Render ternary (662-691) gains a neutral third branch when `null`.
6. Relocate TOTAL confirmation into an in-section button (mirrors `SeleccionLineasNc`'s own PARCIAL button), reusing `handleConfirmarClick` unchanged. Delete the footer "Confirmar Anulación" block (751-759) — post-reveal footer keeps only `[Editar métodos de pago]` beside `Volver`. Add a stable `min-height` on the right column to stop visual jitter.

### Out of Scope
- `emitirNc`/`crearNotaCredito` logic (button relocation only, zero behavior change).
- Pre-existing `useDetalleFactura`/`usePagosFactura` `empresa_id` debt.
- CxC/refund gaps already tracked as spec debt.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `notas-credito-pos`: title, header layout, tasa visibility, type pre-selection, confirmation-button location/footer shape.

## Approach

Two source files: `nota-credito-pos-modal.tsx` (items 1,2,3,5,6 — all local) and `factura-detalle-panel.tsx` (item 4 border color, all consumers; item 2's `hideFacturaTitle` prop, POS-only opt-in, zero visual change for Tradicional/Consulta since default stays `false`). Strict TDD retrofit on `__tests__/nota-credito-pos-modal.test.tsx`.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modified | Items 1,2,3,5,6 |
| `src/features/ventas/components/factura-detalle-panel.tsx` | Modified | Item 4 (border, shared) + item 2 (`hideFacturaTitle` prop, opt-in) |
| `.../__tests__/nota-credito-pos-modal.test.tsx` | Modified | ~15-18 sites need `click('Total')` inserted before `Confirmar Anulación` assertions (widened from initial 8-12 estimate after full grep); new tests per item |
| `.../__tests__/factura-detalle-panel.test.tsx` | Modified (optional) | Coverage for `hideFacturaTitle` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Item 4 darkens borders on Tradicional NC + Consulta/Reimprimir too | Certain (accepted) | User explicitly approved Option A cross-screen impact |
| `hideFacturaTitle` prop technically touches shared file | Low | Additive, default `false` — zero output change for other 2 consumers |
| Removing TOTAL pre-selection breaks presence-timing assertions | Medium | Enumerated during grep; fix is mechanical (`click('Total')` before asserting), never weakens original assertions |

## Rollback Plan

Revert the 2 source files + 1-2 test files (single commit on `feat/consulta-factura-ventas-caja`). No migrations, no data changes — safe `git revert`.

## Dependencies

Builds on the already-pushed `ncSectionRevealed`/`reimprimirOpen` reveal-gate from `replicar-consulta-factura-ventas-caja` (same branch).

## Success Criteria

- [ ] All 6 items implemented; existing NC-POS suite green with zero weakened assertions
- [ ] `yarn test:run` and `yarn type-check` clean
- [ ] Diff stays under the 400-line review budget
