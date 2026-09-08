# Tasks: Modo Exploración de Costo Continuo + "Fijar Costo"

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-580 (lib ~130, lib tests ~200, form.tsx ~220) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: lib + tests (~330) → PR 2: form.tsx (~220) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user must pick |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

This REWORKS code already committed (`396d365`, `d4cc005`) on the old blur-anchor model. No history rewrite — new forward commits delete/replace old code. Net per-file diff is larger than the original ~300-380 estimate: 9 continuous-recalc wiring sites (was 5 blur sites), IVA duality on 3 levels, a new button, and two full test-suite rewrites (old fn tests removed, new fn tests added).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Rework `producto-precio-gating.ts` + tests: remove `debeBackCalcularCosto`/`backcalcularCostoYCascada`/`FuentePrecio`, add `debeExplorarCosto`/`calcularCostoDesdeNivel`/`fijarCostoYCascada` | PR 1 | Zero UI risk; ~330 lines; independent, merges alone |
| 2 | Remove old form wiring (refs, `ejecutarBackCalcSiAplica`, blur back-calc, old aviso semantics) | PR 2 (commit 1) | Depends on Unit 1 exports |
| 3 | Wire continuous recalc (9 `onChange` sites + 3 `onBlur` final), bidirectional cost clear, "Fijar costo" button | PR 2 (commit 2) | Same file as Unit 2; keep as 2 commits, 1 PR unless it nears 400 alone |

If Unit 2+3 combined exceed 400 lines during apply, split PR 2 at the commit boundary (Unit 2 alone, then Unit 3).

## Phase 1: Pure Lib — Tests First (RED)

- [x] 1.1 `producto-precio-gating.test.ts`: add failing tests for `debeExplorarCosto` (preview→true, both empty→true, either has value→false). Verify: `yarn test:run` RED (missing export). **DEVIATION**: old `describe('debeBackCalcularCosto')`/`describe('backcalcularCostoYCascada')` blocks NOT removed — see Phase 2 deviation note.
- [x] 1.2 Add failing tests for `calcularCostoDesdeNivel`: canonical (pvp150/margen50→100.00), pvp<=0→null, margen 0%→costo=pvp. Verify RED.
- [x] 1.3 Add failing tests for `fijarCostoYCascada`: cascade (costo100, margen detal50/mayor25/especial0.01→detal150/mayor125/especial100.01), negative margin clamped to 0 before cascading. Verify RED.

## Phase 2: Pure Lib — Implementation (GREEN)

- [x] 2.1 **DEVIATION**: `FuentePrecio`, `debeBackCalcularCosto`, `backcalcularCostoYCascada` NOT removed — `producto-form.tsx` (PR 2 scope) still imports all 3. Removing them now would break `yarn type-check` on the form before PR 2 lands. Kept in place, marked `@deprecated` with JSDoc pointing to their PR-1 replacements; their original tests also kept untouched (18 tests, unmodified). PR 2 deletes both the exports and their tests together with the form rewiring. `calcularCostoBsBackCalculado` untouched as planned.
- [x] 2.2 Add `debeExplorarCosto(p)` — GREEN 1.1. Signature follows `design.md` exactly (object param incl. `costoEsPreview`), not the simplified 2-positional-arg paraphrase from the orchestrator prompt — design.md is the authoritative source and PR 2's wiring (`costoBackCalculado` → `costoEsPreview`) depends on this shape.
- [x] 2.3 Add `calcularCostoDesdeNivel({pvpUsd, margenPct})` with `decimal.js`, no rounding, returns `Decimal | null` (null when `pvpUsd <= 0`) — GREEN 1.2. No `ivaPct` param (matches design.md; IVA→PVP resolution is the caller's responsibility per design.md's own canonical-with-IVA example).
- [x] 2.4 Add `fijarCostoYCascada({costoUsd, margenDetalPct, margenMayorPct, margenEspecialPct})`, clamp margins `>= 0` — GREEN 1.3. Verify: `yarn type-check` clean (zero errors in `producto-precio-gating.ts` or `producto-form.tsx`; only pre-existing test-file global noise elsewhere, unrelated).

**Commit A (PR 1)**: `producto-precio-gating.ts` + `.test.ts`. ✅ Ready — 30/30 lib tests green, 1160/1160 full suite green, `producto-form.tsx` still compiles.

## Phase 3: Form — Remove Old Wiring

- [x] 3.1 `producto-form.tsx`: dropped old lib imports; import `debeExplorarCosto`, `calcularCostoDesdeNivel`, `fijarCostoYCascada`. Also removed the now-unused deprecated lib exports (`debeBackCalcularCosto`, `backcalcularCostoYCascada`, `FuentePrecio`) and their tests, deferred from Phase 2 per the Phase 2 deviation note.
- [x] 3.2 Removed `ultimaFuenteMayorRef`/`ultimaFuenteEspecialRef` and all `.current` assignments (reset effect + all margen/PVP/precio-final handlers).
- [x] 3.3 Removed `ejecutarBackCalcSiAplica` and its call sites: `onBlur` on margen/PVP Detal, and the calls in `handlePrecioFinalDetalUsd/BsChange` (replaced with `recalcularCostoSiExplorando`). Kept negative-margin clamp unchanged and `costoBackCalculado` state/aviso JSX (semantics widened, no text change).

## Phase 4: Form — Continuous Recalc Wiring

- [x] 4.1 Added `recalcularCostoSiExplorando(pvpUsd: number, margenPct: number)`: guards `esComboLocal` / `!debeExplorarCosto(...)`, else `calcularCostoDesdeNivel` → `setCostoUsd`/`setCostoBs` (via `calcularCostoBsBackCalculado`) / `setCostoBackCalculado(true)`. **DEVIATION (defensive)**: passes `pvpUsd || 0`/`margenPct || 0` and checks `costo.isNaN()` before writing — design's pseudocode didn't guard NaN margen mid-edit reaching Decimal; given the PR-1 div-by-zero lesson, this avoids writing literal `"NaN"` into a financial field.
- [x] 4.2 Wired inline at end of `handleMargenChange`/`handleMargenMayorChange`/`handleMargenEspecialChange`.
- [x] 4.3 Wired inline at end of `handlePrecioVentaUsdChange/BsChange`, `handlePrecioMayorUsdChange/BsChange`, `handlePrecioEspecialUsdChange/BsChange`.
- [x] 4.4 Wired on `onBlur` of Precio Final USD/Bs, all 3 levels: rewired `handlePrecioFinalDetalUsdChange/BsChange` to the new fn; added the same call to `handlePrecioFinalMayorUsdChange/BsChange` and `handlePrecioFinalEspecialUsdChange/BsChange` (previously missing).

## Phase 5: Form — Bidirectional Clear + "Fijar Costo"

- [x] 5.1 `handleCostoUsdChange`/`handleCostoBsChange`: when `val === ''`, clear the other cost field too (reactivates exploration).
- [x] 5.2 Added "Fijar costo" button after Costos block, visible when `!esComboLocal && debeExplorarCosto(...) && costoUsd.trim() !== ''`; `onClick` → `fijarCostoYCascada`, writes 3 PVP (USD+Bs), `setCostoBackCalculado(false)`.

**Commit B (PR 2)**: `producto-form.tsx` (+79/-71) + `producto-precio-gating.ts` (+2/-87) + `producto-precio-gating.test.ts` (+0/-102). Ready — full suite green, type-check clean. Orchestrator handles the actual commit/branch/push.

## Phase 6: Verification

- [x] 6.1 `yarn test:run` — full suite green: 93 test files / 1153 tests (lib test file 33→23 after removing 10 deprecated-fn tests). No orphan references to removed lib functions (`ejecutarBackCalcSiAplica`, `FuentePrecio`, `ultimaFuenteMayorRef`, `ultimaFuenteEspecialRef`, `debeBackCalcularCosto`, `backcalcularCostoYCascada` — zero grep hits outside historical doc comments).
- [x] 6.2 `yarn type-check:test` clean except the pre-existing unrelated `use-pwa-update.ts` swUrl-unused error. `yarn type-check` has expected spurious `describe/it/expect` noise on `*.test.ts` (app tsconfig lacks vitest globals) — zero errors reference `producto-form.tsx` or `producto-precio-gating.ts`.
- [x] 6.3 Regression check: `esComboLocal` short-circuits `recalcularCostoSiExplorando` as its first guard (combos never explore); normal-flow margen⇄PVP mutual recalc left untouched in all handlers (only appended the new recalc call, didn't alter existing logic); canonical Caso1/Caso2 covered by the 23 lib unit tests (`calcularCostoDesdeNivel`, `fijarCostoYCascada`), form-level manual/component verification flagged out of scope per design.md Testing Strategy.
