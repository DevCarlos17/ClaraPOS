# Verify Report: Recibo Moneda de Presentación — Work Unit 1

**Change**: `recibo-moneda-presentacion`
**Slice**: Work Unit 1 ONLY (Currency seam, config, settings UI) — PR 1 of 3
**Version**: spec.md (current, uncommitted-to-archive)
**Mode**: Strict TDD
**Branch**: `feat/recibo-moneda-presentacion-wu1`
**Commits**: `1061df3`, `f3c7fae`, `3a6fd5c`, `bb8cf7b`, `d56f6c8` (fix, re-verified below)
**Date**: 2026-08-14 (original), re-verified 2026-08-14
**Model**: anthropic/claude-sonnet-5

> **RE-VERIFY UPDATE (see "RE-VERIFY" section near the bottom)**: the CRITICAL below ("Radix Select lazy-initializer fix does not eliminate the transition race") was addressed by commit `d56f6c8`. It is now **RESOLVED**, independently confirmed by reverting the fix and re-running the regression test (true RED→GREEN reproduction), reading the corrected implementation, and re-running the full suite. Final verdict: **PASS**. The section below is preserved verbatim as the original finding for audit trail.

---

## Completeness

| Metric | Value |
|--------|-------|
| WU1 tasks total | 6 (1.1.1–1.3.2) |
| WU1 tasks complete | 6 |
| WU1 tasks incomplete | 0 |
| WU2/WU3/Final Verification tasks | Correctly NOT started (out of scope for this batch) |

---

## Build & Tests Execution

**Tests**: ✅ **391 passed** / 0 failed / 0 skipped across **28 files** (reproduced independently)

```text
$ yarn test:run
 Test Files  28 passed (28)
      Tests  391 passed (391)
      Duration  12.37s
```

New/modified test files for WU1: `factura-export.test.ts` (+2 tests, 54 total), `use-company.test.ts` (new, 4 tests), `company-data-form.test.tsx` (new, 3 tests). All reproduced green on a fresh run — the 391/391 claim in apply-progress is real.

**Type-check (app code)**: ✅ 0 errors — `yarn type-check` output filtered to non-`*.test.ts(x)` files is clean.

**Type-check (test files)**: ✅ `yarn type-check:test` → clean, `tsc --noEmit --project tsconfig.test.json` exits 0.

**Type-check (unfiltered `yarn type-check`)**: Shows pre-existing `Cannot find name 'expect'/'describe'/'it'` errors in `identity.test.ts`, `utils.test.ts`, `vencimientos.test.ts` — confirmed as EXPECTED, pre-existing vitest-globals noise per orchestrator brief (none of these files were touched by WU1; `git diff develop...HEAD --stat` confirms).

**Coverage**: ➖ No coverage tool configured — skipped, not a failure.

---

## Oracle Verification (independent computation, distrust-green mode)

### `formatParPrimarioContraparte` / `formatMontoBimonetario` (factura-export.ts:126–140)

Test input: `usd=10, bs=5000`.

- `formatBs(5000)` → `toFixed(2)` = `"5000.00"` → thousands-grouped with `.` every 3 digits from the right, `,` as decimal sep → **`Bs. 5.000,00`**. Matches spec literal example exactly (`spec.md:45`, "Bs. 5.000,00").
- `formatUsd(10)` → **`$10.00`**. Matches spec (`spec.md:46`, "$10.00").
- `'USD'` branch: `{ primario: '$10.00', contraparte: 'Bs. 5.000,00' }` → `formatMontoBimonetario` = `'$10.00 (Bs. 5.000,00)'`. **Test asserts exactly this. Independently confirmed correct.**
- `'BS'` branch: `{ primario: 'Bs. 5.000,00', contraparte: '$10.00' }` → `'Bs. 5.000,00 ($10.00)'`. **Test asserts exactly this. Independently confirmed correct.**
- Conversion direction: the test pre-supplies `bs=5000` for `usd=10` — implying `tasa=500` and `bs = usd × tasa` (not divided). This matches `usdToBs` in `lib/currency.ts:60-62` (`toD(usd).times(toD(tasa))`) and matches spec's own worked example (`spec.md:30, 43`: "tasa 500" + "$10.00" line → Bs 5.000,00 in the article-line scenario). **Direction is correct** — no inversion bug.
- Rounding/precision: both `formatUsd`/`formatBs` are reused unmodified from `lib/currency.ts` (design explicitly forbids touching that file — confirmed: `git diff develop...HEAD -- src/lib/currency.ts` is empty). No new rounding logic was introduced; the seam is a pure pass-through formatter. **No assertion-quality issues found in this test** — both branches are exercised with real value assertions (not tautologies, not type-only checks).

### `parseEmpresaConfig` / `resolveMonedaPresentacion` (use-company.ts:10–28)

Read the source (not just the test) and traced all branches:

| Input | Code path | Result | Spec-correct? |
|---|---|---|---|
| `null` | `!configJson` → early return | `'USD'` | ✅ |
| `'{"moneda_contable":"BS"}'` (field absent) | parsed OK, `resolveMonedaPresentacion(undefined)` → not in `Set` → | `'USD'` | ✅ |
| `'{"moneda_presentacion_documentos":"BS"}'` | in `Set` → passthrough | `'BS'` | ✅ (does NOT coerce valid `'BS'` to `'USD'` — confirmed) |
| `'{"moneda_presentacion_documentos":"EUR"}'` | not in `Set` | `'USD'` | ✅ |
| Not test-covered but traced from source: `''`, `0`, malformed JSON | `''`/`0` fail `typeof === 'string' && Set.has(...)` → `'USD'`; malformed JSON → `catch` → `'USD'` | `'USD'` | ✅ (verified via source reading, matches spec's "ausente o inválido") |

All 4 test assertions are real value assertions on the actual return value (no tautologies, no type-only checks). The additional untested-but-traced cases (`''`, `0`, malformed JSON) also resolve correctly per source inspection — no gap found.

### Options-not-hardcoded (company-data-form.tsx:9–12, 163–169)

`MONEDA_PRESENTACION_OPTIONS` is a local array of `{ value, label }`; `SelectItem`s are generated via `.map()` over it (line 164–168) — **no hardcoded per-currency JSX**. This matches the design's explicit "Config UI" decision (design.md:106–114), which deliberately chose a local array over importing `MonedaPresentacion` from `factura-export.ts` to avoid `configuracion` → `ventas` coupling (structural typing keeps both `'USD' | 'BS'` literals assignment-compatible). Not a violation — this is the literal instruction in design.md, followed correctly. **SUGGESTION**: if a third currency is ever added, `MonedaPresentacion` and `MONEDA_PRESENTACION_OPTIONS`/`EmpresaConfig`'s inline literal must be updated in three unlinked places by hand (no compiler enforcement across the module boundary) — acceptable given 2 currencies today and the documented coupling-avoidance rationale, but worth a comment or a shared type export if a 3rd currency is ever planned.

---

## Backward-Compat / Scope Discipline

`git diff develop...HEAD -- src/features/ventas/utils/recibo-pagos.ts src/features/ventas/components/venta-exitosa-modal.tsx` → **empty**. Neither file was touched.

`git diff develop...HEAD -- src/features/ventas/utils/factura-export.ts` → only additive: `MonedaPresentacion` type (line 24) + the two new seam functions (lines 118-140). **No existing function was modified.** Confirmed via full-file read: `ReciboLinea`, `ReciboTotales`, `ReciboAlicuota`, `ReciboData`, `BuildReciboDataInput`, `construirFilasTotales`, `construirLineasRecibo`, `buildReciboPdfBlob`'s `artBody`, `formatMontoPago` are all byte-identical to `develop` — **zero WU2/WU3 leakage confirmed** (no `precioUnitarioBs`/`totalBs` on `ReciboLinea`, no `monedaPresentacion` param on `construirFilasTotales`, no PDF `artBody` changes, no payment-counterpart render changes).

---

## Commit Hygiene

- `git diff develop...HEAD --stat`: 13 files changed, 823 insertions / 5 deletions. No `.atl/` files in the diff (the `.atl/skill-registry.md` / `.atl/.skill-registry.cache.json` modifications seen in `git status` are **uncommitted working-tree noise unrelated to this branch's commits**, not part of any WU1 commit).
- `package.json`/`yarn.lock`: adds `@testing-library/dom@^10.4.1` — legitimately needed (it's a required peer dependency of `@testing-library/react`, and `company-data-form.test.tsx` is the first `.test.tsx`/RTL component test in the project, so the gap was previously latent). Confirmed present as a real peer-dep resolution in `yarn.lock`, not an unrelated dependency bump.

---

## CRITICAL: Radix Select "lazy initializer" fix — rationale does not hold for the real async data path

**Claim under test** (tasks.md:43, apply-progress): the lazy `useState` initializer for `monedaPresentacion` — reading `company?.config` directly instead of relying solely on the `useEffect` — is described as *"a genuine defensive fix relevant to production too... since the same isLoading-gated first-paint timing applies at runtime."*

**Independent trace of the real data path** (not just the test):

1. `useCompany()` → `@powersync/react`'s `useQuery(...)`. Read `node_modules/@powersync/react/src/hooks/watched/useQuery.ts` and `useWatchedQuery.ts`: the watched-query result defaults to `isLoading: true` (`_loadingState = { isLoading: true, data: [], ... }`, and `useWatchedQuery` returns `isLoading: result?.isLoading ?? true`). The underlying `WatchedQuery` executes against wa-sqlite through a Worker (`postMessage`), which is **inherently asynchronous** — it cannot resolve synchronously on the very first render.
2. Therefore, on mount, `isLoading` **is** `true` and `company` **is** `null/undefined` at the moment `CompanyDataForm`'s hooks (including the lazy `useState` initializer for `monedaPresentacion`) execute for the first time. The lazy initializer captures `'USD'` (the fallback), exactly as the OLD (pre-fix) code would have via the `useEffect`.
3. `if (isLoading) return <spinner>` means the `Select` is **not mounted** during this first render.
4. When the query resolves, the component **re-renders** (same instance — hooks state persists) with `isLoading=false` and `company` populated **in the same render pass** where `if (isLoading)` first evaluates to `false`. This is the render where the `Select` (Radix component) **actually mounts for the first time** — and at this point `monedaPresentacion` is still `'USD'` (the stale value captured at step 2; the lazy initializer only runs once, at the original mount, and does NOT re-run when `company` later becomes available).
5. Only **after** this render commits does the `useEffect([company])` fire and call `setMonedaPresentacion(...)` with the real value (e.g. `'BS'`) — triggering a state update on an **already-mounted** Select, one render after its initial paint.

This is **exactly** the "same-tick 'USD' → real-value transition right after mount" scenario the deviation note describes as the trigger for the Radix native-`<select>` `<option>`-registration race — the fix does not eliminate that transition for the real (async) data path; it only eliminates it in the scenario where `company` is already synchronously available at the very first render, which does not happen with the actual `@powersync/react` `useQuery` hook.

**Why this was not caught by the tests**: `company-data-form.test.tsx` mocks `useCompany` to return `{ company: baseCompany(), isLoading: false }` **synchronously from the very first render** (no loading→loaded transition is ever exercised). This means the RTL suite validates only the scenario where the "fix" happens to be correct by construction (company already available at mount) and never reproduces the actual production timing (isLoading:true → isLoading:false transition) that the fix claims to solve. This matches the project's known failure mode called out in the brief: **a green test suite with a wrong/incomplete oracle** — the tests pass, but they do not prove the claimed defensive property holds for the real, async-backed hook.

**Severity**: CRITICAL. The stated production rationale for a documented design deviation is not supported by the actual behavior of `@powersync/react`'s `useQuery`, based on static source inspection of the hook implementation in `node_modules`. If the original Radix bug (value resets to `''` on a same-tick post-mount transition) is real, it is very likely **still present** for real users on first load of the Datos de Empresa page — the fix only helps on subsequent re-renders where `company` reference doesn't change (e.g., internal re-renders from other state), not on the initial load path that motivated the fix in the first place.

**Recommendation** (report only, not implemented): add an integration test that mocks `useCompany` to return `{ company: undefined, isLoading: true }` on an initial render and then transitions to `{ company: <BS config>, isLoading: false }` on a subsequent render (e.g. via `rerender()` from RTL), and assert the `Select`'s committed value is `'BS'` (not `''`/reset) immediately after that transition. If this reproduces the reset, either move the correction into `useLayoutEffect` (still one tick after mount, does not fully solve it either) or key the `Select`/its `SelectTrigger` off `company?.id` so React remounts a fresh Radix instance once real data lands, avoiding the value-transition race entirely (the pattern already possible since the component already gates on `isLoading`).

---

## Spec Compliance Matrix (scoped to what WU1 can cover)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Configuración de moneda de presentación por empresa | Config 'BS' vs ausente/inválida | `use-company.test.ts` (4 cases) | ✅ COMPLIANT (parse/default only — wiring into recibo render is WU2/WU3, not yet applicable) |
| Seam tipado de moneda de presentación | Type exists as `'USD'\|'BS'`, not boolean | `factura-export.ts:24` (static) + consumed by seam functions | ✅ COMPLIANT (type-level); the full scenario ("Builder recibe el tipo explícito" via `BuildReciboDataInput.monedaPresentacion`) is WU2 scope — correctly UNTESTED here, not a gap in WU1 |
| Moneda primaria y contraparte en montos del recibo | Bs primero en 'BS', USD primero en default | `factura-export.test.ts:85-101` (both orientations, exact spec literal values) | ✅ COMPLIANT for the mapping helper itself. Wiring into actual article-line/totals render output is WU2/WU3 — not yet applicable |
| Ambas monedas siempre visibles (article lines, totals) | — | — | ➖ N/A — WU2/WU3 scope, correctly not implemented |
| Desglose de métodos de pago con reconciliación (MODIFIED) | — | — | ➖ N/A — WU2 scope, correctly not implemented |

**Compliance summary**: 3/3 WU1-applicable scenario slices compliant; 2 requirements are fully out of WU1 scope by design and correctly untouched.

---

## Correctness (Static Evidence)

| Item | Status | Notes |
|------|--------|-------|
| `MonedaPresentacion` type | ✅ Implemented | `factura-export.ts:24`, matches design contract exactly |
| `formatParPrimarioContraparte`/`formatMontoBimonetario` | ✅ Implemented, oracle-verified | Pure, single seam point, reuses `lib/currency.ts` unmodified |
| `EmpresaConfig.moneda_presentacion_documentos` + default resolution | ✅ Implemented, oracle-verified | `use-company.ts:5-28` |
| Select UI bound to field, options from array | ✅ Implemented | `company-data-form.tsx:9-12,153-171` |
| Persistence via `updateCompany` preserving other config keys | ✅ Implemented, test-verified | `company-data-form.test.tsx:89-108` spreads existing config correctly |
| Radix Select lazy-init fix | ⚠️ Rationale unproven for real async path | See CRITICAL finding above |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Currency mapping — single lookup-table function, no `tasa` param in render layer | ✅ Yes | `formatParPrimarioContraparte(usd, bs, moneda)` takes pre-computed values only |
| `MonedaPresentacion` canonical in `factura-export.ts`; `use-company.ts` uses structurally-identical inline literal | ✅ Yes | No cross-feature import added |
| No changes to `lib/currency.ts` | ✅ Yes | Confirmed empty diff |
| Config UI: local options array, not hardcoded JSX | ✅ Yes | See "Options-not-hardcoded" section above |

---

## Issues Found

**CRITICAL**:
1. Radix Select lazy-initializer "fix" (company-data-form.tsx:29-31) does not eliminate the described post-mount value-transition race for the real `@powersync/react` `useQuery`-backed data path (isLoading is always `true` on first render per source inspection of `useWatchedQuery.ts`). The RTL test suite only validates a synchronous-`company`-at-mount scenario that never occurs in production, so green tests do not prove the fix works. See full analysis above. Recommend adding a loading→loaded transition test before relying on this as a real fix.

**WARNING**: None.

**SUGGESTION**:
1. `MONEDA_PRESENTACION_OPTIONS` / `EmpresaConfig.moneda_presentacion_documentos` / `MonedaPresentacion` are three independently-maintained `'USD'|'BS'` literals with no compiler-enforced link across the `configuracion`/`ventas` boundary (deliberate per design, but worth a shared-type promotion if a 3rd currency is ever added).

---

## Verdict (original, superseded by RE-VERIFY below)

**PASS WITH WARNINGS** — escalated to CRITICAL on the Radix-fix rationale.

WU1's testable surface (currency-mapping seam, config parse/default, UI wiring/persistence) is correctly implemented, oracle-verified independently, in-scope, and does not leak WU2/WU3 work. Full suite (391/391) and both type-checks are clean and reproducible. The one CRITICAL finding does not fail any WU1 spec requirement or test — it concerns the truthfulness of a documented deviation's stated production rationale, uncovered by tracing the real `@powersync/react` hook implementation instead of trusting the report. Recommend the orchestrator require a loading-transition regression test (or an alternate fix, e.g. remounting the `Select` via `key={company?.id}`) before treating the Radix bug as closed, but this does not block WU1 from being merged as a config/UI-only slice — no receipt render path is affected by this finding.

---

## RE-VERIFY: CRITICAL resolution (commit `d56f6c8`)

**Scope of this pass**: focused, adversarial re-check of the fix commit only. Fresh context, distrust-green. Did not re-derive the full report above; confirmed it still holds and re-tested the one CRITICAL.

### 1. Suite reproduced independently

```text
$ yarn test:run
 Test Files  28 passed (28)
      Tests  392 passed (392)   # +1 vs. original report's 391 (the new regression test)
      Duration  12.01s

$ yarn type-check:test
 tsc --noEmit --project tsconfig.test.json  → exit 0, no output
```

### 2. Regression test is a TRUE oracle — RED→GREEN independently reproduced (not trusted from the commit message)

The commit added `"transicion real isLoading:true -> false (company llega despues del mount): el Select refleja 'BS' persistido, no el fallback 'USD'"` in `company-data-form.test.tsx`. Rather than trust the commit message's claim that this test fails against the old code, I:

1. Extracted the **pre-fix** `company-data-form.tsx` via `git show d56f6c8^:...` and temporarily overwrote the working file with it (test file left at HEAD, i.e. including the new regression test).
2. Ran `yarn vitest run src/features/configuracion/components/__tests__/company-data-form.test.tsx`.
3. **Result: 1 failed / 3 passed.** The new test failed with `expect(element).toHaveAttribute("aria-selected", "true") — Received: "false"` — i.e., against the pre-fix code, the Select's BS `<option>` was NOT selected after the `isLoading:true→false` transition. This is a genuine RED against the pre-fix implementation, not a tautology or a weak proxy — the assertion targets the rendered Radix listbox's `aria-selected` state, which reflects the Select's actual committed value.
4. Restored the fixed `company-data-form.tsx` (`git diff` confirmed byte-identical restoration) and re-ran the same command: **4/4 passed.**

This confirms the RED→GREEN linkage is real, not a self-reported claim taken at face value. The test genuinely reproduces the production transition: `mockedUseCompany` first returns `{ company: null, isLoading: true }` (matching `useWatchedQuery`'s real first-render `isLoading: true` state, as traced from `node_modules/@powersync/react` in the original report), then `rerender()` swaps the mock to `{ company: <BS config>, isLoading: false }` **without unmounting** — exactly matching how `@powersync/react`'s `useQuery` resolves in place on the same component instance. The assertion checks the actual rendered `aria-selected` attribute on the `BS` option (and the inverse on `USD`), not a weaker proxy like internal state or a mock call.

### 3. Fix correctness — "adjust state while rendering" pattern

Read `company-data-form.tsx:14-38` in full.

```ts
const [monedaPresentacion, setMonedaPresentacion] = useState<'USD' | 'BS'>('USD')
const [monedaSyncedForCompanyId, setMonedaSyncedForCompanyId] = useState<string | undefined>(undefined)
if (company && company.id !== monedaSyncedForCompanyId) {
  setMonedaSyncedForCompanyId(company.id)
  setMonedaPresentacion(parseEmpresaConfig(company.config).moneda_presentacion_documentos ?? 'USD')
}
```

- **(a) Follows React's documented pattern correctly.** This is React's official "adjust state while rendering" idiom (calling `setState` unconditionally-but-guarded during the render body, before `return`): React detects the state change during the same render pass, throws away the in-progress render output, and re-invokes the component function immediately with the new state — before anything commits/paints. Because this happens before the `if (isLoading) return <spinner>` / the form's `return`, the `Select` never mounts with the stale `'USD'` value; it only ever mounts (first paint) once `monedaPresentacion` already holds the resolved value. This directly closes the race the original CRITICAL identified (the old code relied on a `useEffect`, which runs one tick *after* commit, i.e. after the `Select` had already mounted/painted with the fallback).
- **(b) Guard prevents infinite render loop.** The condition is `company.id !== monedaSyncedForCompanyId` — a comparison of two primitive strings, not object identity. On the render that performs the sync, `monedaSyncedForCompanyId` is set to `company.id`, so on the immediately-following re-render (which React triggers to reflect the updated state) the guard evaluates `company.id !== company.id` → `false`, and the block does not re-fire. Independently traced: no infinite loop is possible here, because the guard key is a primitive that becomes equal to itself on the next pass, not a reference that could differ across renders (e.g. if `useQuery` returns a new object each time PowerSync's live query re-fires for unrelated reasons, `company.id` — a string — stays the same, so the guard still holds and the block does not re-fire spuriously).
- **(c) Handles absent→present and company.id-changing correctly.** While `company` is `null` (isLoading: true), the `if (company && ...)` guard short-circuits — no-op, as expected. When `company` first becomes non-null, `company.id !== undefined` is `true` → syncs once. If the user later switches to a different empresa (`company.id` changes, e.g. `"1"` → `"2"`), the guard fires again and re-syncs to the new empresa's persisted currency — correct: carrying over a previous empresa's `moneda_presentacion_documentos` selection into a different empresa's form would be a cross-tenant data leak in the UI, so resetting on `company.id` change is the desired behavior, not a bug.
- **Does the render-time set clobber an unsaved user selection?** Traced through the scenario: user opens the form, `company.id` sync fires once (id `"1"` != `undefined`), `monedaSyncedForCompanyId` becomes `"1"`. User then changes the Select to `'BS'` (calls `setMonedaPresentacion('BS')` via `onValueChange`) without saving. If `useCompany()`'s underlying PowerSync live query re-fires afterward and returns a **new object reference** with the **same `id: "1"`** (e.g. due to an unrelated background sync or query re-evaluation) — the guard is `company.id !== monedaSyncedForCompanyId` → `"1" !== "1"` → `false` → the block does **not** re-run, so the user's in-progress unsaved selection is **not** clobbered. The sync only fires again if `company.id` itself changes (a genuine empresa switch), in which case discarding the previous, different-empresa's unsaved edit is correct, not a bug. No clobbering issue found; no infinite loop found.

### 4. Scope discipline unchanged

```text
$ git show d56f6c8 --stat
 .../__tests__/company-data-form.test.tsx | 21 ++++++++++++++++
 .../components/company-data-form.tsx     | 29 ++++++++++++++--------
 2 files changed, 40 insertions(+), 10 deletions(-)
```

Confirmed the fix commit touches **only** `company-data-form.tsx` and its test — `git diff d56f6c8^ d56f6c8 --stat -- src/features/ventas` returns empty. `factura-export.ts` render functions, `recibo-pagos.ts`, and `venta-exitosa-modal.tsx` are untouched by this commit (consistent with the original report's already-confirmed WU1/WU2/WU3 boundary, which this fix does not cross).

### 5. No regressions to the other WU1 assertions

Full suite run (§1 above) shows `factura-export.test.ts` (54 tests), `use-company.test.ts` (4 tests), and all other WU1-related files still green at 392/392 total (28/28 files) — the currency-mapping helper (both orientations) and the config default/parse logic were not perturbed by this commit, consistent with the commit touching only `company-data-form.tsx`.

### Re-verify issues found

**CRITICAL**: None (the prior CRITICAL is RESOLVED — see §2–3).
**WARNING**: None new.
**SUGGESTION**: None new. The original SUGGESTION (shared-type promotion for `MONEDA_PRESENTACION_OPTIONS`/`EmpresaConfig`/`MonedaPresentacion` if a 3rd currency is ever added) still stands, unrelated to this fix.

---

## Verdict (current)

**PASS**

The previously-open CRITICAL (Radix Select value-transition race on the real `isLoading:true→false` async PowerSync path) is **RESOLVED** by commit `d56f6c8`. Verified independently, not by trusting the commit message: (1) reverted the fix and reproduced a genuine RED against the pre-fix code with the new regression test, then restored and reproduced GREEN; (2) read the "adjust state while rendering" implementation and confirmed it follows React's documented pattern, the `monedaSyncedForCompanyId` guard correctly prevents both infinite render loops and spurious re-syncs on reference-only `company` object changes, correctly handles the absent→present and empresa-switch transitions, and does not clobber an in-progress unsaved user selection; (3) confirmed 392/392 tests pass and both type-checks are clean; (4) confirmed the fix commit's diff is scoped to `company-data-form.tsx` + its test only, with zero receipt-render-path leakage. WU1 is ready to merge as a config/UI-only slice.
