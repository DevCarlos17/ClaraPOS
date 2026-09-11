# Tasks: Ajustes QA — Nota de Crédito POS Modal

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250-300 (2 source files + 1-2 test files) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR, same commit chain on `feat/consulta-factura-ventas-caja` |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain (same tracker branch, no new PR split needed) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | All 6 QA items + test retrofit | One commit on `feat/consulta-factura-ventas-caja`; well under budget, no slicing needed |

## Phase 1: Title (Item 1)

- [ ] 1.1 [RED] Assert modal `h2` text is exactly "Facturas Emitidas - Sesion Actual".
- [ ] 1.2 [GREEN] Update `nota-credito-pos-modal.tsx:431`.

## Phase 2: Right-panel header removal (Item 2)

- [ ] 2.1 [RED] In `factura-detalle-panel.test.tsx`, assert `hideFacturaTitle` suppresses the "Factura" label/number; default/`false` keeps it (Tradicional/Consulta regression guard).
- [ ] 2.2 [GREEN] Add `hideFacturaTitle?: boolean` (default `false`) to `FacturaDetallePanelProps`; wrap lines 73-76 in the guard.
- [ ] 2.3 [RED] In NC-POS suite, assert selecting a factura renders the Artículos table first — no "Cliente:", "Tasa:" text before it.
- [ ] 2.4 [GREEN] Delete local header (`nota-credito-pos-modal.tsx:527-536`); pass `hideFacturaTitle` to `<FacturaDetallePanel>`.

## Phase 3: Tasa on every session card (Item 3)

- [ ] 3.1 [RED] Assert every card (selected and not) shows `formatTasa(f.tasa)` below the Bs amount, for 2+ facturas with distinct tasas.
- [ ] 3.2 [GREEN] Add the tasa line under `formatBs(f.total_bs)` (~line 517).

## Phase 4: Shared border darkening (Item 4)

- [ ] 4.1 [GREEN] `border-slate-200` → `border-slate-300` at `factura-detalle-panel.tsx:78,110,144`.

## Phase 5: Remove TOTAL/PARCIAL pre-selection (Item 5)

- [ ] 5.1 [RED] Rewrite the Slice 3b "TOTAL por defecto" test: reveal section, assert neither Total nor Parcial is active and no confirm button renders.
- [ ] 5.2 [RED] Add case: factura with `tiene_reverso_parcial=1` also reveals with nothing preselected (no auto-jump to Parcial).
- [ ] 5.3 [GREEN] Widen `tipoNc` to `'TOTAL' | 'PARCIAL' | null`; `useState(null)`; close-effect resets to `null`; on-select handler (~line 492) always sets `null` (delete the guess).
- [ ] 5.4 [GREEN] Add neutral third branch to the 662-691 ternary when `tipoNc === null` (no alert, no line-selector).

## Phase 6: Relocate TOTAL confirmation, collapse footer (Item 6)

- [ ] 6.1 [RED] Assert clicking "Total" reveals an in-section "Confirmar Anulación" button beside the red alert.
- [ ] 6.2 [RED] Assert post-reveal footer (before any Total/Parcial click) shows ONLY `[Volver, Editar métodos de pago]`.
- [ ] 6.3 [GREEN] Add in-section confirm button under the red alert (TOTAL branch), `onClick={handleConfirmarClick}`, `disabled={loading || depositoInvalido}`, styled like `SeleccionLineasNc`'s own button.
- [ ] 6.4 [GREEN] Delete footer block `nota-credito-pos-modal.tsx:751-759`.
- [ ] 6.5 [RED→GREEN] Assert + add a stable `min-height` class on the right column (~line 526) to stop reveal/collapse jitter.

## Phase 7: Retrofit existing suite (mechanical, zero behavior change)

- [ ] 7.1 Audit every `revelarSeccionNc(user)` call followed by a `Confirmar Anulación` interaction/assertion (~15-18 sites, full list wider than the initial 8-12 estimate) and insert `await user.click(screen.getByRole('button', { name: 'Total' }))` right after reveal, before the existing line — never delete or weaken the original assertion.
- [ ] 7.2 `yarn test:run` — 0 regressions in the pre-existing 53+ NC-POS tests.
- [ ] 7.3 `yarn type-check:test` — clean (same pre-existing unrelated noise only).

## Phase 8: Final verification

- [ ] 8.1 Full-suite `yarn test:run` green.
- [ ] 8.2 Confirm total diff stays under the 400-line budget.
