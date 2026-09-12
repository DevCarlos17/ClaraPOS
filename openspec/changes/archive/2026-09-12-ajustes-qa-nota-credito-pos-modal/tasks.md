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

- [x] 1.1 [RED] Assert modal `h2` text is exactly "Facturas Emitidas - Sesion Actual".
- [x] 1.2 [GREEN] Update `nota-credito-pos-modal.tsx:431`.

## Phase 2: Right-panel header removal (Item 2)

- [x] 2.1 [RED] In `factura-detalle-panel.test.tsx`, assert `hideFacturaTitle` suppresses the "Factura" label/number; default/`false` keeps it (Tradicional/Consulta regression guard).
- [x] 2.2 [GREEN] Add `hideFacturaTitle?: boolean` (default `false`) to `FacturaDetallePanelProps`; wrap lines 73-76 in the guard.
- [x] 2.3 [RED] In NC-POS suite, assert selecting a factura renders the Artículos table first — no "Cliente:" text before it (the "Tasa:" absence check was dropped: Item 3 legitimately reuses that same text prefix on the session-list cards).
- [x] 2.4 [GREEN] Delete local header (`nota-credito-pos-modal.tsx:527-536`); pass `hideFacturaTitle` to `<FacturaDetallePanel>`.

## Phase 3: Tasa on every session card (Item 3)

- [x] 3.1 [RED] Assert every card (selected and not) shows `formatTasa(f.tasa)` below the Bs amount, for 2+ facturas with distinct tasas.
- [x] 3.2 [GREEN] Add the tasa line under `formatBs(f.total_bs)` (~line 517).

## Phase 4: Shared border darkening (Item 4)

- [x] 4.1 [GREEN] `border-slate-200` → `border-slate-300` at `factura-detalle-panel.tsx:78,110,144`.

## Phase 5: Remove TOTAL/PARCIAL pre-selection (Item 5)

- [x] 5.1 [RED] Rewrite the Slice 3b "TOTAL por defecto" test: reveal section, assert neither Total nor Parcial is active and no confirm button renders.
- [x] 5.2 [RED] Add case: factura with `tiene_reverso_parcial=1` also reveals with nothing preselected (no auto-jump to Parcial).
- [x] 5.3 [GREEN] Widen `tipoNc` to `'TOTAL' | 'PARCIAL' | null`; `useState(null)`; close-effect resets to `null`; on-select handler (~line 492) always sets `null` (delete the guess).
- [x] 5.4 [GREEN] Add neutral third branch to the 662-691 ternary when `tipoNc === null` (no alert, no line-selector).

## Phase 6: Relocate TOTAL confirmation, collapse footer (Item 6)

- [x] 6.1 [RED] Assert clicking "Total" reveals an in-section "Confirmar Anulación" button beside the red alert.
- [x] 6.2 [RED] Assert post-reveal footer (before any Total/Parcial click) shows ONLY `[Volver, Editar métodos de pago]`.
- [x] 6.3 [GREEN] Add in-section confirm button under the red alert (TOTAL branch), `onClick={handleConfirmarClick}`, `disabled={loading || depositoInvalido}`, styled like `SeleccionLineasNc`'s own button.
- [x] 6.4 [GREEN] Delete footer block `nota-credito-pos-modal.tsx:751-759`.
- [x] 6.5 [GREEN] Stable min-height on the right column (~line 526) to stop reveal/collapse jitter — implemented as inline `style={{ minHeight: '420px' }}` instead of a Tailwind `min-h-[Npx]` class, to avoid an unpredictable same-utility-group class-order conflict with the pre-existing `min-h-0` (needed for the flex/overflow-y-auto behavior). No dedicated behavioral test (CSS-only; per strict-tdd's ban on CSS-class assertions) — verified visually to be a non-regressing structural change only.

## Phase 7: Retrofit existing suite (mechanical, zero behavior change)

- [x] 7.1 Audited every `revelarSeccionNc(user)` call followed by a `Confirmar Anulación` interaction/assertion — 17 sites needed `await user.click(screen.getByRole('button', { name: 'Total' }))` inserted right after reveal (wider than the initial 8-12/15-18 estimate); 3 additional sites needed an explicit "Parcial" click instead (tests that assumed PARCIAL auto-selected for already-partially-reversed invoices). Zero original emitirNc/anulacion assertions weakened.
- [x] 7.2 `yarn test:run` — 114 files, 1402/1402 passing (1397 baseline + 5 net new). Pre-existing "Worker is not defined" unhandled rejection from `cliente-detalle.test.tsx` confirmed not a regression (same as prior sessions).
- [x] 7.3 `yarn type-check:test` — clean except the same pre-existing `use-pwa-update.ts` TS6133 unused-var (not a regression).

## Phase 8: Final verification

- [x] 8.1 Full-suite `yarn test:run` green (1402/1402).
- [x] 8.2 Diff: +220/-71 across 4 files (implementation commit), well under the 400-line budget.
