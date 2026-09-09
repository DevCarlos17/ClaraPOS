# Tasks: Producto Form – Mascara Visual de Decimales

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~600-700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 6 work units below |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user must choose |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | PR | Notes |
|---|---|---|---|
| 1 | `decimal-display-mask.ts` + tests | PR 1 | No UI, zero dependents |
| 2 | Precio Venta $/Bs mask (3 levels) | PR 2 | Reuses existing FullRefs |
| 3 | Precio Final reconciliation + IVA fix | PR 3 | Depends on PR 2 refs |
| 4 | Costo mask + submit fix | PR 4 | Independent |
| 5 | Margen precision widening (33 sites) | PR 5 | Highest risk, isolated |
| 6 | CLAUDE.md docs | PR 6 or bundled with 5 | Docs-only |

Rollback per unit: revert its commit(s); no shared migration/schema state.

## Phase 1: Foundation — Decimal Display Helper

- [x] 1.1 RED: `src/lib/__tests__/decimal-display-mask.test.ts` — 2-decimal mask, 8-decimal full, empty/zero stay empty.
- [x] 1.2 GREEN: `src/lib/decimal-display-mask.ts` — `toMaskedDisplay(value, viewDecimals=2)` / `toFullDisplay(value, calcDecimals=8)` via `decimal.js`.
- [x] 1.3 Verify: `yarn test:run decimal-display-mask`.

## Phase 2: Float Audit Confirmation

- [ ] 2.1 Confirm design.md's Float Audit list (margin %, IVA/Precio Final math, `parseFloat` comparisons) vs current file; fixes land in Phase 4 only.

## Phase 3: Precio Venta Mask (3 levels)

- [x] 3.1 RED: extend `producto-form-precio-precision-submit.test.tsx` — Precio Venta $ masked on blur, full precision on focus (detal/mayor/especial).
- [x] 3.2 RED: Precio Venta Bs derives `usdToBs(fullRef, tasa)` on focus, masked on blur.
- [x] 3.3 GREEN: add `onFocus`/`onBlur` to 3 Precio Venta $ + 3 Bs inputs (~L1900-2000) via the helper, against existing `precioVenta{Usd,Mayor,Especial}UsdFullRef`.
- [x] 3.4 Verify: `yarn test:run producto-form-precio-precision-submit`.

## Phase 4: Precio Final Reconciliation

- [x] 4.1 RED: extend `producto-form-precio-final-live.test.tsx` — focusing any of 6 Precio Final inputs reveals full precision without breaking `precioFinalFocusRef` guard.
- [x] 4.2 RED: `ivaDetalUsd`/`pfDetalUsd` (+mayor/especial, ~L1304-1306) must read `precioVentaUsdFullRef.current`, not `parseFloat(precioVentaUsd)`.
- [x] 4.3 GREEN: fix stray-float reads; add mask onFocus/onBlur to the 6 inputs (~L1947-2171), keeping `precioFinalFocusRef.current.add/delete`.
- [x] 4.4 Verify: `yarn test:run producto-form-precio-final-live`.

## Phase 5: Costo Mask + Submit Fix

- [x] 5.1 RED: extend `producto-form-costo-precision.test.ts` — Costo $ masks/reveals; submit carries full-precision cost even unfocused. (File renamed to `.test.tsx` — JSX rendering requires it; `.ts` cannot compile JSX.)
- [x] 5.2 GREEN: add `costoUsdFullRef` + `setCostoCompleto(fullValue, displayVal)`; replace bare `setCostoUsd()` in `handleCostoUsdChange`/`handleCostoBsChange`/`recalcularCostoSiExplorando`/init sites (producto load, draft load, blank reset); add onFocus/onBlur/onKeyDown(Enter) to Costo $/Bs inputs.
- [x] 5.3 GREEN: `handleSubmit` reads `costoUsdFullRef.current` instead of `parseNumOrZero(costoUsd)`.
- [x] 5.4 Verify: `yarn test:run producto-form-costo-precision` — 10/10 pass. Full suite: 1225/1225 pass (1220 baseline + 5 net new tests).

## Phase 6: Margen Precision Widening (highest risk)

- [x] 6.1 RED: regression test (style of `producto-precio-gating.test.ts`) asserting back-calc/cascade stays unchanged, before touching call sites. (`producto-form-margen-precision.test.tsx`, "REGRESSION NET" describe block, 4 tests — confirmed GREEN against the pre-Phase-6 baseline via `git stash push --keep-index` before implementing, then GREEN again after.)
- [x] 6.2 RED: new `producto-form-margen-precision.test.tsx` (design/tasks named it `-mascara-visual.test.tsx`; renamed to match this session's naming and stay consistent with `-costo-precision`/`-precio-precision-submit` sibling files) — Margen masks/reveals like other price fields; full value participates in back-calc.
- [x] 6.3 GREEN: added `margenFullRef`/`margenMayorFullRef`/`margenEspecialFullRef` + `setMargenCompleto`/`setMargenMayorCompleto`/`setMargenEspecialCompleto` wrappers (mirrors `setCostoCompleto`).
- [x] 6.4 GREEN: replaced all 33 `setMargen*()` call sites with the matching `Completo` wrapper, same untruncated number — math untouched (verified via regression net, byte-identical cascade results).
- [x] 6.5 GREEN: added onFocus/onBlur/onKeyDown(Enter) mask to the 3 Margen inputs (mirrors Costo/Precio Venta pattern exactly, `> 0 ? mask : ''` guard).
- [x] 6.6 Verify: `yarn test:run` (full suite) — 1233/1233 passed, 102 files (was 1225/1225, 101 files pre-session). Zero regressions in `producto-precio-gating.test.ts` (23/23 unchanged) or any other back-calc/gating test.

**Deviation**: Float Audit item #1 (`Math.max(0, costoN * (1 + margenEfectivoN / 100))` native float math in `handleMargenChange`/Mayor/Especial) was NOT converted to decimal.js. design.md's "Float Audit (report only, not fixed here)" section explicitly states "only item 2 [IVA/Precio Final] is touched here" — item 1 (margin math) and item 3 (`parseFloat` comparisons) are deferred to a future change. The orchestrator's task prompt said to fix item 1 "IF AND ONLY IF the design assigns it here" — the design does not. Left untouched, as instructed.

## Phase 5.1: CORRECTION — Full-Ref Read Integrity (post-verify fixes)

Fresh adversarial re-verify (engram `sdd/producto-form-mascara-decimales/verify-report`, obs #3134) found the Phase 3-6 work wired `*FullRef` on the WRITE side + `handleSubmit` but never rewired the internal READ sites that consume those fields for back-calc — a systemic bypass. Fixed here, TDD RED-first.

- [x] 5.1.1 RED: new `producto-form-full-ref-cross-field.test.tsx` — 9 tests (3 CRITICAL-1 blur-then-cross-edit repros, 2 CRITICAL-2 stale-ref repros via `handleTipoChange('C')`/`handleLimpiar`, 4 WARNING-3 explicit-zero-vs-empty cases). All 8 non-trivial cases confirmed RED against pre-fix code (1 trivially passed: empty-stays-empty, not a bug repro).
- [x] 5.1.2 GREEN (CRITICAL 1): re-grepped and fixed ~43 internal read sites across `applyPricesFromCosto`, `handleFijarCosto`, the tasa-change sync `useEffect`, and all margin/PVP/Precio-Final handlers — every computational read of `costoUsd`/`margen*`/`precioVentaUsd`/`precioMayorUsd`/`precioEspecialUsd` now reads the matching `*FullRef.current` instead of `parseFloat(maskedDisplay)`. Cascade formulas themselves untouched (mechanical read-source swap only).
- [x] 5.1.3 GREEN (CRITICAL 2): `handleTipoChange('C')` and `handleLimpiar` now route their Costo reset through `setCostoCompleto(0, ...)` instead of a bare `setCostoUsd(...)`, so `costoUsdFullRef` never goes stale relative to the display.
- [x] 5.1.4 GREEN (WARNING 3): the 7 masked fields' `onBlur` (Costo $, Margen×3, Precio Venta $×3) now distinguish "" (never-set, stays empty) from an explicitly-typed "0" (masks to "0.00") by checking the display string's `.trim() === ''` instead of `ref.current > 0`.
- [x] 5.1.5 Verify: all 9 new tests GREEN. `yarn test:run producto-form` (glob) — 8 files, 66/66 passed. Full suite: `yarn test:run` → **1242/1242 passed, 103 files** (was 1233/1233, 102 files — net +9, zero regressions), including `producto-precio-gating.test.ts` (23/23 unchanged) and the `producto-form-margen-precision.test.tsx` REGRESSION NET (4/4 unchanged, byte-identical cascade values — confirms formulas were not touched, only read sources). `yarn type-check` targeted grep on `producto-form.tsx`: 0 errors (pre-existing project-wide gap where `tsconfig.json` lacks vitest globals affects ALL `__tests__` files identically, old and new — unrelated to this change, out of scope).

## Phase 7: Documentation

- [x] 7.1 Add "Mascara visual de precios" subsection to `CLAUDE.md` near rule #10: 2-decimal default, full precision on focus, full ref reaches `handleSubmit`; cross-reference `decimal-display-mask.ts`.
- [x] 7.2 Verify: manual review — reconciled `spec.md`'s "Margen Extended Precision" scenario (WARNING 4 from the verify report: margin is never persisted, wording no longer implies a payload field).

## Phase 7.1: CORRECTION — isSubmitDisabled Full-Ref Read (post-verify SUGGESTION)

Fresh adversarial re-verify (engram `sdd/producto-form-mascara-decimales/verify-report`, obs #3134) found a new theoretical gap introduced by Costo's blur-masking: `isSubmitDisabled` (and its sibling hint text / title tooltip) read `parseNumOrZero(costoUsd)` — the masked display — instead of `costoUsdFullRef.current`. A real cost between 0 and 0.005 masks to "0.00" and would incorrectly disable the submit button.

- [x] 7.1.1 RED: new tests in `producto-form-costo-precision.test.tsx` — costo `0.003` (masks to "0.00" on blur) must NOT disable the "Crear" button; triangulation confirms an empty costo still disables it (gate semantics preserved).
- [x] 7.1.2 GREEN: swapped all 3 occurrences of `parseNumOrZero(costoUsd) === 0` (the `isSubmitDisabled` gate, the footer hint text, and the submit button's `title` tooltip — all 3 use the identical predicate) to `costoUsdFullRef.current === 0`, so the button, hint, and tooltip stay consistent with each other and with the real value.
- [x] 7.1.3 Verify: `yarn test:run producto-form-costo-precision` — 12/12 passed (was 10/10 pre-fix). Full suite: 1244/1244 passed, 103 files (was 1242/1242 pre-fix) — zero regressions.

## Phase 8: CORRECTION — Post-QA fixes (edit-mode open mask + non-blocking draft banner)

Tester-confirmed bug + a UX follow-up requested after Phase 7 closed: (1) editing an existing product opened the Costo/Precio Venta/Precio Mayor/Precio Especial/Margen inputs showing the RAW 8-decimal DB string until the first focus/blur, instead of the masked 2-decimal display used everywhere else; (2) the "datos recuperados" draft-restore notice used a blocking native `<dialog>` requiring an explicit "Entendido" click, interrupting the user instead of informing them.

- [x] 8.1 RED: new `producto-form-edit-open-mask.test.tsx` — editing a product with `costo_usd="1.00000000"`/`precio_venta_usd="2.69004000"` (raw 8-decimal DB strings) must render `"1.00"`/`"2.69"` on initial open, with no focus/blur; confirmed RED (raw strings rendered) against pre-fix code.
- [x] 8.2 GREEN: routed the edit-populate branch's Costo/Precio Venta/Precio Mayor/Precio Especial `displayVal` argument through `toMaskedDisplay(numericValue)` instead of the raw DB string; the numeric full-value argument to each `*Completo()` setter is untouched (still the unrounded `parseFloat` of the raw string), so focus-reveal and submit still carry full precision. Also switched the 3 edit-populate Margen calls from `.toFixed(1)` to `toMaskedDisplay(margenCalc)` for consistency with the Margen input's own blur mask (2 decimals) — a pre-existing 1-vs-2-decimal inconsistency, fixed per instructions.
- [x] 8.3 Verify: `producto-form-edit-open-mask.test.tsx` — 3/3 passed (initial mask, focus-reveal/blur-remask triangulation, submit precision).
- [x] 8.4 RED: rewrote `producto-form-aviso-borrador.test.tsx` for the new non-blocking-banner contract (no "Entendido" button, dismiss on "Limpiar", dismiss on first field edit); confirmed RED against the pre-fix blocking `<dialog>` (4/6 failing).
- [x] 8.5 GREEN: replaced the nested `<dialog>` + `avisoBorradorRef` + its `showModal()` effect with an inline `<div role="status">` banner rendered inside the modal's sticky header (right below the title/close row). Added `draftSnapshotRef` (captured at the moment the draft is restored) + a single `useEffect` (after `buildDraft`) comparing the live `buildDraft()` against the snapshot to auto-dismiss the banner on the first real field change — no per-field `onChange` wiring. `handleLimpiar` also dismisses the banner explicitly. The draft-restore population logic itself (field values) is unchanged.
- [x] 8.6 Verify: `producto-form-aviso-borrador.test.tsx` — 6/6 passed.
- [x] 8.7 Full-suite verify: `yarn test:run` → **1249/1249 passed, 104 files** (was 1244/1244, 103 files — net +5, zero regressions). Targeted `yarn type-check` grep on `producto-form.tsx` (excluding `__tests__`): 0 errors (the project-wide vitest-globals type-check gap affects all `__tests__` files identically, pre-existing, unrelated to this change).

## Spec Requirement Coverage

| Requirement | Tasks |
|---|---|
| Masked Default Display | 1, 3.3, 4.3, 5.2, 6.5, 8.2 |
| Full Precision Reveal On Focus | 1, 3.3, 4.3, 5.2, 6.5 |
| Re-mask On Blur | 3.3, 4.3, 5.2, 6.5 |
| Full-Precision Value Reaches Persistence | 3.3, 4.1, 5.2-5.3, 6.4-6.5 |
| Field Isolation On Focus | 3.3, 4.1, 4.3 |
| Margen Extended Precision | 6.1-6.5 |
| Cost-Exploration Mode Unaffected | 2.1, 6.1 |
| Decimal-Safe Value Chain | 1.2, 4.2-4.3 |
| Mask Pattern Documented | 7.1 |
