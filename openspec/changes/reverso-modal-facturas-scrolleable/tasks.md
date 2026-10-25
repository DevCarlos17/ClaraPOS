# Tasks: Lista de Facturas Afectadas Scrolleable (Panel de Reverso)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~45-55 total (~15-25 in `reverso-modal.tsx`, ~25-30 in test) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Scrollable facturas list + footer always-visible regression, with RED→GREEN tests | PR 1 (single) | Base = main. Single file + its test, well under budget. |

## Phase 1: RED — Failing Tests First

- [x] 1.1 In `src/features/tesoreria/components/__tests__/reverso-modal.test.tsx`, add test asserting a new `data-testid="preview-facturas-lista-scroll"` wrapper exists around the invoice rows and its `className` contains `overflow-y-auto` and `max-h-` (mirror `cxc-list.test.tsx` L108 pattern: `screen.getByTestId(...).className` + `toContain(...)`). Use a mock with `facturasDirectas` non-empty (reuse shape from existing tests, e.g. L463-472).
- [x] 1.2 In the same file, add a regression test rendering >5 facturas (mix of `facturasDirectas` + `facturasSaf`, e.g. 3 + 3) and assert `screen.getByText('Total afectado')` is present AND that the "Total afectado" footer element is NOT inside the scroll wrapper (e.g. assert `screen.getByTestId('preview-facturas-lista-scroll').textContent` does not include `'Total afectado'`, while `screen.getByText('Total afectado')` still resolves in the document).
- [x] 1.3 Run `yarn test:run src/features/tesoreria/components/__tests__/reverso-modal.test.tsx` and confirm both new tests FAIL against current JSX (wrapper/testid does not exist yet) — capture failure output as RED baseline.

## Phase 2: GREEN — Minimal JSX Restructure

- [x] 2.1 In `src/features/tesoreria/components/reverso-modal.tsx`, inside the outer `<div className="space-y-3">` (opens L347), wrap the `facturasDirectas` block (L348-362) and `facturasSaf` block (L364-378) in a new `<div data-testid="preview-facturas-lista-scroll" className="max-h-48 overflow-y-auto space-y-3">...</div>`.
- [x] 2.2 Move the "Total afectado" block (L380-388, the `<div className="flex justify-between border-t pt-2 font-semibold">` + helper `<p className="text-xs text-muted-foreground">`) to render as a sibling AFTER the new scroll wrapper — still inside the outer `space-y-3` div (L347-389), so it stays always visible.
- [x] 2.3 Do not touch: header (`<p className="font-medium">Facturas afectadas por este reverso</p>`, L318), loading/LEGACY/empty states (L320-342), SAF-block warning (L392-401), the outer `aplicaPreview && (...)` conditional, or any hook/prop/type.
- [x] 2.4 Run `yarn test:run src/features/tesoreria/components/__tests__/reverso-modal.test.tsx` and confirm ALL tests pass (new tests GREEN, zero regressions on the 700+ existing lines). → 23/23 passed (21 pre-existing + 2 new).

## Phase 3: Manual Validation

- [~] 3.1 Visually confirm in dev (`yarn dev`) that `max-h-48` shows ~5 facturas before scrolling appears, accounting for the two group labels (`Pago directo` / `Afectada por saldo a favor (SAF)`) reducing effective row count; adjust to `max-h-40`/`max-h-56` only if clearly off, re-running tests after any adjustment. **Not performed**: no browser/visual tooling available in this execution environment. `max-h-48` kept as-is, matching the magnitude of the `abono-global-modal.tsx` precedent (`max-h-40`); recommend a quick manual check in `yarn dev` before merge.
- [~] 3.2 Confirm header and "Total afectado" stay visible and outside scroll while the invoice rows scroll, using the real QA case shape (9 rows from a Bs 5.240 global abono). **Structurally verified via automated test** (regression test with 6 rows confirms "Total afectado" renders outside the scroll wrapper); real-browser scroll behavior not visually confirmed — same limitation as 3.1.

## Phase 4: Wrap-up

- [x] 4.1 Run `yarn type-check` and `yarn lint` to confirm no regressions from the JSX restructure. `yarn type-check`: pre-existing failures unrelated to this change (TS2304/TS2593 "Cannot find name 'vi'/'expect'/'describe'" across multiple `*.test.tsx` files, including this repo's baseline before any edit — confirmed via `git stash` + re-run, same errors present without this change's diff; vitest globals typing not wired into `tsc`'s config, pre-existing repo-wide issue, not introduced here). `yarn lint`: fails with `'eslint' is not recognized` — eslint binary not available in this environment (pre-existing, unrelated to this change's 2-file diff).
- [x] 4.2 Single commit: `fix(tesoreria): scroll facturas afectadas list in reverso modal, keep footer visible` — includes component + test changes together (one work unit, no split needed per Review Workload Forecast).
