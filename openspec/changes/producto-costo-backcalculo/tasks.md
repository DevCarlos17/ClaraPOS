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

- [ ] 3.1 `producto-form.tsx` (L22-29): drop old lib imports; import `debeExplorarCosto`, `calcularCostoDesdeNivel`, `fijarCostoYCascada`.
- [ ] 3.2 Remove `ultimaFuenteMayorRef`/`ultimaFuenteEspecialRef` (L373-377) and all `.current` assignments (reset effect L448-449/504-505; handlers L726,745,815,828,845,858,908,923,939,954).
- [ ] 3.3 Remove `ejecutarBackCalcSiAplica` (L761-810) and its call sites: `onBlur` on margen/PVP Detal (L1700,1718,1738) and calls in `handlePrecioFinalDetalUsd/BsChange` (L884,900). Keep negative-margin clamp (unchanged) and `costoBackCalculado` state/aviso JSX (L1629-1631, semantics widened, no text change).

## Phase 4: Form — Continuous Recalc Wiring

- [ ] 4.1 Add `recalcularCostoSiExplorando(pvpUsd: number, margenPct: number)` near L760: guard `esComboLocal` / `!debeExplorarCosto(...)`, else `calcularCostoDesdeNivel` → `setCostoUsd`/`setCostoBs` (via `calcularCostoBsBackCalculado`) / `setCostoBackCalculado(true)`.
- [ ] 4.2 Call inline at end of `handleMargenChange`/`handleMargenMayorChange`/`handleMargenEspecialChange` (L706-759).
- [ ] 4.3 Call inline at end of `handlePrecioVentaUsdChange/BsChange`, `handlePrecioMayorUsdChange/BsChange`, `handlePrecioEspecialUsdChange/BsChange` (L677-870).
- [ ] 4.4 Call on `onBlur` of Precio Final USD/Bs, all 3 levels: rewire `handlePrecioFinalDetalUsdChange/BsChange` (L873-901) to the new fn; add same call at end of `handlePrecioFinalMayorUsdChange/BsChange` and `handlePrecioFinalEspecialUsdChange/BsChange` (L904-963 — missing today).

## Phase 5: Form — Bidirectional Clear + "Fijar Costo"

- [ ] 5.1 `handleCostoUsdChange`/`handleCostoBsChange` (L657-674): when `val === ''`, clear the other cost field too (reactivates exploration).
- [ ] 5.2 Add "Fijar costo" button after Costos block (~L1656), visible when `debeExplorarCosto(...) && costoUsd.trim() !== '' && !esComboLocal`; `onClick` → `fijarCostoYCascada`, write 3 PVP (USD+Bs), `setCostoBackCalculado(false)`.

**Commit B (PR 2)**: `producto-form.tsx` only.

## Phase 6: Verification

- [ ] 6.1 `yarn test:run` — full suite green, no orphan references to removed lib functions.
- [ ] 6.2 `yarn type-check` + `yarn type-check:test` clean.
- [ ] 6.3 Regression check: combos never call `recalcularCostoSiExplorando`; normal flow (costo fijo) margen⇄PVP mutual recalc unchanged; canonical Caso1 (margen50/pvp150→costo100) and Caso2 (+IVA16/final174→costo100) verified end-to-end.
