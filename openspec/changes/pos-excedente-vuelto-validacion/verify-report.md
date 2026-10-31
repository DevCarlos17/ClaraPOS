# Verification Report

**Change**: pos-excedente-vuelto-validacion
**Version**: N/A
**Mode**: Strict TDD
**Full suite**: SKIPPED per explicit user instruction (scoped-only verify). Regression-coverage boundary noted below.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 28 (4 phases) |
| Tasks complete | 28 |
| Tasks incomplete | 0 |

## Diff Reality Check

`git diff develop...branch` against the **local** `develop` ref was misleading (local `develop` is 3 commits behind `origin/develop` — missing PR #288's merge). Re-ran against `origin/develop` (the true merge-base, confirmed via `merge-base --is-ancestor`):

```
git diff origin/develop...fix/pos-excedente-vuelto-validacion --stat
 9 files changed, 860 insertions(+), 105 deletions(-)
```

9 files = 4 code files + 5 openspec docs (proposal/design/specs×2/tasks for *this* change — expected artifacts, not scope creep).

Code-only (`--numstat`):
| File | +/- |
|------|-----|
| `cobro-modal.test.tsx` | 119/3 |
| `cobro-modal.tsx` | 32/18 |
| `use-ventas.test.ts` | 153/0 |
| `use-ventas.ts` | 210/84 |
| **Total code** | **514/105 = 619** |

✅ Confirmed: **only the 4 claimed files changed** in `src/`.
✅ `migrations/` — zero diff. `src/core/` — zero diff. `use-cuadre.ts` — not in diff (zero touch).
✅ No `PROPINA` case touched (verified by reading full switch — only `DIFERENCIAL_FALTANTE`, `DIFERENCIAL_SOBRANTE`, `VUELTO` cases modified).
✅ No `.atl/` files staged.

## Helper Extraction Correctness (key refactor risk)

Compared `insertDiferencialSobranteMovimiento` / `insertDiferencialFaltanteGasto` (new, `use-ventas.ts` L316-434) byte-for-byte against the original inline bodies pulled from `origin/develop` (`case 'DIFERENCIAL_SOBRANTE'` L1513-1542, `case 'DIFERENCIAL_FALTANTE'` L1412-1479):

| Check | Result |
|-------|--------|
| INSERT columns/placeholders identical | ✅ Yes, verbatim |
| `origen='DIFERENCIAL_CAMBIARIO'` / `descripcion='DIFERENCIAL_CAMBIARIO_FALTANTE'` preserved | ✅ Yes |
| `PERDIDA_DIFERENCIAL_CAMBIARIO` → `gastos_generales` fallback chain preserved | ✅ Yes, identical SELECT order |
| `sin-cuenta` throw preserved | ✅ Yes |
| `empresa_id` param preserved | ✅ Yes |
| Param order/values identical | ✅ Yes |
| Both original call sites (`DIFERENCIAL_SOBRANTE`/`DIFERENCIAL_FALTANTE`) now invoke the helper with the exact same inputs they used inline | ✅ Yes — no drift between call sites |

**Verdict: behaviorally identical.** This is a clean, verified-mechanical extraction — not a risk.

## VUELTO Delta Wiring

Read `case 'VUELTO'` (`use-ventas.ts` L1627-1717):

| Check | Result |
|-------|--------|
| `vueltoDeltaBs < 0` → books SOBRANTE of `\|delta\|` via `insertDiferencialSobranteMovimiento` (INGRESO) | ✅ Confirmed (L1681-1698) |
| `vueltoDeltaBs > 0` → books FALTANTE via `insertDiferencialFaltanteGasto`, converted Bs→USD once via `bsToUsd(delta, tasa)` | ✅ Confirmed (L1699-1714) |
| `vueltoDeltaBs === undefined` or `=== 0` → no extra row | ✅ Confirmed (L1680 guard) |
| Vuelto EGRESO rows + diferencial row in the SAME `writeTransaction` | ✅ Confirmed — single `db.writeTransaction` opens at L453, both the EGRESO loop and the delta branch execute inside that same callback against the same `tx` |
| `empresa_id` + full-precision amounts | ✅ `empresaId: empresa_id` passed through; amount flows Decimal (cobro-modal) → `number` → `Decimal` (use-ventas, only for the Bs→USD conversion) — no precision loss at the public interface |

## Gating Logic (cobro-modal.tsx)

| Check | Result |
|-------|--------|
| No excedente mode pre-selected (useEffect L252-266) | ✅ `discrepancyMode==='VUELTO'` removed from auto-select target; resets stale CREDITO/ABSORBER/DIFERENCIAL_* to `null` instead |
| Procesar disabled when mode `null` under overpago | ✅ `puedeProcesar` L350-367: `estaOverpago` branch falls through to `return false` for `null` — **zero code change needed** here, confirmed by reading the function (matches tasks.md 3.13 claim) |
| Procesar disabled when VUELTO chosen but distribution empty/zero | ✅ `splitVueltoValid = splitVueltoSumBs.gt(0)` (L333), gated at L360 and guarded again at L483 (`handleProcesar`) |
| Procesar ENABLED with non-empty-but-not-ideal distribution | ✅ Old cap (`splitVueltoExceso.lte(umbralBs.plus('0.01'))`) removed — any `sumBs.gt(0)` passes |
| `safEstado==='ok'` AND-gate preserved (bugfix #5293) | ✅ L360: `pagos.length > 0 && splitVueltoValid && safEstado === 'ok'` — gate intact, not regressed |
| `vueltoEntries` (not `splitVuelto[0]`) is the summed source of truth | ✅ `splitVueltoSumBs = splitVuelto.reduce((s,e)=>s.plus(e.montoBs), ...)` (L324) sums ALL entries; `vueltoEntries` passed to `crearVenta` is `splitVuelto.map(...)` (L536), full array — not a single-entry fallback |

## Sobrante/Faltante Message

| Check | Result |
|-------|--------|
| Non-blocking (never affects `puedeProcesar`) | ✅ Confirmed — message rendering is a separate JSX branch, `puedeProcesar` doesn't reference it |
| Correct direction (delta<0→sobrante, delta>0→faltante) | ✅ L1115-1122: `splitVueltoExceso.lt(0)` → "sobrante de caja"; else → "faltante de caja" |
| Spanish copy | ✅ Yes |
| Only shows when `\|delta\| > 0.005` Bs | ✅ `splitVueltoExceso.abs().lte('0.005')` → "✓ Correcto" branch suppresses the message |

## RED Reproduction (Strict-TDD Proof) — Phase 2 Tautology Check

Per the apply's disclosed deviation (Phase 2 VUELTO-delta tests in `use-ventas.test.ts` were written in the same batch as production code — no literal RED), independently reproduced RED by checking out the **pre-change** production files from `origin/develop` while keeping the **new** test files from the branch:

```
git checkout origin/develop -- src/features/ventas/hooks/use-ventas.ts src/features/ventas/components/cobro-modal.tsx
```

**use-ventas.test.ts** (with old production code): **3 failed / 41 passed** (44 total)
- `vueltoDeltaBs<0 ...` → `expected undefined to be defined` (no SOBRANTE row — correct failure reason: old code has no delta branch)
- `vueltoDeltaBs>0 ...` → `expected undefined to be defined` (no FALTANTE gasto row — same reason)
- `vueltoDeltaBs>0 sin cuenta ...` → `promise resolved instead of rejecting` (old code never reaches `insertDiferencialFaltanteGasto`, so no `sin-cuenta` throw — correct failure reason)

→ **No tautology.** All 3 new VUELTO-delta tests fail for the exact right reason when the real production code is absent. This independently proves they are meaningful tests despite skipping literal RED-first.

**cobro-modal.test.tsx** (with old production code): **5 failed / 7 passed** (12 total) — matches apply-progress's self-reported "5/7 RED" for the 7 new/adapted cases (the other 5 pre-existing SAF tests pass unaffected).

Restored production files (`git checkout HEAD -- ...`), confirmed zero diff vs branch HEAD, then re-ran:

**GREEN (both suites)**: **56/56 passed** (44 use-ventas + 12 cobro-modal) — 0 failures.

Note: both runs (RED and GREEN) also surface an **unrelated pre-existing unhandled rejection** (`ReferenceError: Worker is not defined` from `src/core/db/powersync/db.ts`'s module-level `PowerSyncDatabase` singleton, which the Node test environment can't fully instantiate). This causes `vitest` to exit 1 even though all test assertions pass, and it reproduces identically with the OLD production code too (confirmed in the RED run) — `db.ts` has zero diff in this change. **Not a regression introduced by this PR.**

## Type Check

`yarn type-check:test`: 4 pre-existing errors, all in files with **zero diff** in this change (confirmed via `git diff ... --stat`):
- `factura-detalle-cxc.test.tsx` (unrelated CXC type narrowing)
- `producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx` (unrelated Producto fixture typing)
- `use-pwa-update.ts` (unused var)

Zero new type errors introduced by this change.

## Scoped Regression + Type-Check

**Tests**: ✅ 56 passed / ❌ 0 failed (56/56 scoped)
**Type-check**: ✅ 0 new errors (4 pre-existing, unrelated, zero-diff files)
**Full suite**: ⚠️ SKIPPED per explicit user instruction for this verify pass — trusting apply-progress's self-reported "2540 passed / 3 failed (pre-existing, confirmed via git stash on clean HEAD)" claim, **not independently re-verified in this pass**. This is a real coverage gap in this verification — flagged below as a residual risk, not a blocker.

## Line-Count / Review-Burden Judgment

Forecast was ~230-280 lines; actual code diff is **619 lines** (514+/105-), excluding the 5 openspec doc files (348 more lines, expected pipeline artifacts).

Breakdown of the 619:
- **~150 lines mechanical/moved** — the two extracted helper bodies (`insertDiferencialSobranteMovimiento` ~34 lines, `insertDiferencialFaltanteGasto` ~84 lines including JSDoc/type signature overhead) are **behaviorally identical** to the inline code they replaced (verified above byte-for-byte). Low review burden — a reviewer can skim-confirm "same SQL, same params" rather than deep-reasoning about new logic.
- **~90 lines genuinely new production logic** — the VUELTO delta branch (~42 lines in `use-ventas.ts`) + the cobro-modal gating/message changes (32/18 in `cobro-modal.tsx`). This is the real reviewable surface area, and it is small and already matches the approved design doc exactly.
- **~105 lines deleted** — old inline bodies replaced by 1-line helper calls (net reduction, not something to re-review in detail).
- **~272 lines new tests** — `use-ventas.test.ts` +153, `cobro-modal.test.tsx` +119/-3. Necessary under Strict TDD; lower cognitive load than hand-written business logic (asserted values are mechanical: "this SQL ran with this param").

**Verdict: ACCEPTABLE AS SINGLE PR.** The raw line count exceeds the 400-line soft budget, but the composition is favorable: the bulk of the excess is (a) a verified-mechanical, byte-identical extraction and (b) test code, not unreviewed new business logic. The work is already split into 2 clean conventional commits (`e8ee8ab2` engine, `4c76d097` UI) inside the same PR, which gives reviewers a natural checkpoint without the coordination overhead of chaining 2 PRs for a change where the UI and engine halves are not independently shippable (the UI sets `vueltoDeltaBs`; the engine consumes it — shipping one without the other leaves the feature incomplete). **Suggestion**: call out in the PR description that the two helper extractions are byte-identical refactors (point reviewers at this report) so they can fast-skim ~150 of the 619 lines.

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| No mode pre-selected on excedente | Balance appears with no prior selection | `cobro-modal.test.tsx > excedente detectado sin pago previo...` | ✅ COMPLIANT |
| No mode pre-selected on excedente | Sub-cent faltante still auto-selects | pre-existing coverage, unaffected | ✅ COMPLIANT (unchanged) |
| Procesar disabled until option chosen | Excedente with no option chosen | same test as above | ✅ COMPLIANT |
| Procesar disabled for VUELTO w/o distribution | Empty distribution blocks | `"Dar vuelto" elegido pero sin distribuir...` | ✅ COMPLIANT |
| Procesar disabled for VUELTO w/o distribution | Any non-empty distribution enables | `una sola entrada no vacia...habilita Procesar` | ✅ COMPLIANT |
| Procesar disabled for VUELTO w/o distribution | Multi-method counts toward check | Static: `splitVueltoSumBs` reduces over full `splitVuelto` array | ⚠️ PARTIAL (no dedicated multi-method RTL test, but the summation logic is shared/identical code path already covered for single-method; low risk) |
| Simple sobrante/faltante message | Distributed < ideal (sobrante) | `distribuido MENOS que el ideal...` | ✅ COMPLIANT |
| Simple sobrante/faltante message | Distributed > ideal (faltante) | `distribuido MAS que el ideal...` | ✅ COMPLIANT |
| Simple sobrante/faltante message | Distributed == ideal — no message | `distribuido EXACTAMENTE igual al ideal...` | ✅ COMPLIANT |
| Book vuelto EGRESO per `vueltoEntries` entry | Multi-method distribution booked per entry | pre-existing coverage (loop unchanged), unaffected | ✅ COMPLIANT (unchanged) |
| Book sobrante delta when distributed < ideal | Cashier gives less change | `use-ventas.test.ts > vueltoDeltaBs<0...` | ✅ COMPLIANT |
| Book faltante delta when distributed > ideal | Cashier gives more change | `use-ventas.test.ts > vueltoDeltaBs>0...` | ✅ COMPLIANT |
| No diferencial row when distributed == ideal | Exact distribution | `use-ventas.test.ts > vueltoDeltaBs undefined...` | ✅ COMPLIANT |
| Delta at full precision, floating-point epsilon only | Sub-cent rounding doesn't trigger false diferencial | Covered indirectly via `0.005` epsilon constant in both layers; no dedicated floating-point-noise test | ⚠️ PARTIAL (static evidence only — epsilon constant present and consistent, no test exercises a genuine binary-float rounding artifact) |
| Atomic booking inside existing `writeTransaction` | Insert failure rolls back whole sale | `use-ventas.test.ts > vueltoDeltaBs>0 sin cuenta...` (proves the throw propagates; same-tx placement verified statically) | ✅ COMPLIANT |
| No regression to `use-cuadre.ts`/SAF/Propina | Cuadre reflects booked delta unchanged | Zero diff to `use-cuadre.ts` (static); no dedicated cuadre-level test in this change's scope | ✅ COMPLIANT (static — out of scope for new tests per design) |

**Compliance summary**: 12/14 fully COMPLIANT, 2/14 PARTIAL (both low-risk, same-code-path gaps — not blocking).

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Helper extraction behavior-preserving | ✅ Implemented | Verified byte-for-byte against `origin/develop` |
| VUELTO delta sign convention | ✅ Implemented | Matches design.md exactly |
| Atomicity | ✅ Implemented | Single `writeTransaction`, confirmed by reading surrounding scope |
| `empresa_id` propagation | ✅ Implemented | Present in all new/modified INSERT paths |
| Decimal precision | ✅ Implemented | `decimal.js` used throughout; conversion to `number` only at the `DiscrepancyOptions` interface boundary |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Reuse existing INSERT primitives via extraction, no new schema | ✅ Yes | |
| `splitVueltoValid = sumBs.gt(0)`, no sur-distribution cap | ✅ Yes | |
| Epsilon = 0.005 Bs (floating-point hygiene only, not `umbralBs`) | ✅ Yes | Used consistently in both `cobro-modal.tsx` and implicitly via the `undefined`/`!==0` guard in `use-ventas.ts` |
| Non-blocking message | ✅ Yes | |
| Extend `case 'VUELTO'`, no new discrepancy mode | ✅ Yes | |

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in apply-progress #6095 |
| All tasks have tests | ✅ | 28/28 |
| RED confirmed (tests exist) | ✅ | Both test files exist, verified by reading + running |
| GREEN confirmed (tests pass) | ✅ | 56/56 on execution |
| Triangulation adequate | ✅ | 4 cases (sobrante/faltante/no-op/sin-cuenta) + 6 new cobro-modal cases + 1 adapted regression |
| Safety Net for modified files | ✅ | 40/40 + 6/6 baseline confirmed before edits (per apply-progress), independently re-confirmed via RED/GREEN diff above |

**TDD Compliance**: 6/6 checks passed, with one disclosed and independently-verified deviation (Phase 2 batch-write, no literal RED — proven non-tautological above).

### Assertion Quality

Reviewed all new/modified test code in both files. No tautologies, no ghost loops over possibly-empty collections, no smoke-test-only patterns, no mock-heavy ratios. All new assertions pair positive/negative expectations (e.g., "sobrante" present AND "faltante" absent, and the inverse) or assert concrete SQL/param values against mocked `tx.execute` calls.

**Assertion quality**: ✅ All assertions verify real behavior

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 44 (4 new) | 1 (`use-ventas.test.ts`) | Vitest, mocked `db.writeTransaction` |
| Integration | 12 (6 new + 1 adapted) | 1 (`cobro-modal.test.tsx`) | Vitest + React Testing Library + `userEvent` |
| E2E | 0 | 0 | not installed |
| **Total** | **56** | **2** | |

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. Full project regression suite was **not independently re-run** in this verify pass (explicit user instruction to scope to the 2 files). Apply-progress self-reports 2540 passed/3 pre-existing failures, but this claim is **not verified by this pass** — residual trust-boundary risk before merge. Recommend running the full suite at least once before push/PR, even if out-of-scope for this verify session.
2. 2 spec scenarios are only PARTIALLY covered by dedicated tests (multi-method distribution summation, and genuine floating-point-noise epsilon) — both ride on shared code paths already exercised by other passing tests, so risk is low, but a reviewer should know these are inference-covered, not directly tested.

**SUGGESTION**:
1. Point PR reviewers at this report's "Helper Extraction Correctness" section so they can fast-skim the ~150 mechanical lines instead of re-deriving the byte-identical diff themselves.
2. Local `develop` branch ref is 3 commits stale vs `origin/develop` — unrelated to this change, but worth a `git fetch` + fast-forward before the next diff-based review to avoid the same false-positive "scope violation" signal this verify pass had to debug.

## Verdict

**PASS WITH WARNINGS**

Both scoped suites are green (56/56), the RED reproduction independently proves the disclosed Phase-2 TDD deviation did NOT produce tautological tests, the helper extraction is verified byte-identical to the pre-change code, diff scope is confirmed clean (no schema/migration/use-cuadre/SAF/Propina touch), and all production code matches the approved design doc exactly. The two WARNINGs (unverified full-suite claim, 2 partially-tested scenarios) are real but low-risk and do not block merge — they are follow-up/trust items for the owner, not defects found in this pass.

**PR-ready: YES** — with the recommendation to run the full suite once before opening the PR (not re-done here per scope instruction) and to note the byte-identical extraction in the PR description per the SUGGESTION above.
