# Tasks: NotaCreditoPosModal responsive (mobile master-detail)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~90-160 (prod ~15-25, tests ~75-135) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR/commit on `feat/consulta-factura-ventas-caja` |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain (direct follow-up commit on the same tracker branch, no child branch needed for this slice) |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

Note: `ask-always` overrides the Low-risk default — orchestrator MUST still confirm with the user before `sdd-apply`, even though this is a single small, low-risk slice (one file's className/style edits + matching test updates).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Responsive master-detail classes + full-screen dialog + scoped `minHeight` | Same commit chain as `feat/consulta-factura-ventas-caja` | Single file (`nota-credito-pos-modal.tsx`) + its test file; no shared-file or new-state risk |

## Phase 1: RED — Failing Tests for New Responsive Behavior

- [x] 1.1 In `__tests__/nota-credito-pos-modal.test.tsx`, add a test: with `factura` null (no selection), the left column container does NOT carry `hidden` and the right column container DOES carry `hidden` at the mobile-default class level — assert via container `className` on the rendered nodes (query by test-friendly selector, e.g. `container.querySelector` scoped to the grid children, since there's no `data-testid` today — add minimal `data-testid="nc-pos-columna-lista"` / `data-testid="nc-pos-columna-detalle"` to the two column divs to make this assertion robust, since class-string matching alone is brittle).
- [x] 1.2 Add a test: after selecting a factura (`facturaId` set via clicking a row), the list column carries `hidden` and the detail column does NOT (both queried via the same `data-testid`s).
- [x] 1.3 Add a test: after selecting a factura then clicking "Volver", the list column returns to NOT `hidden` and the detail column returns to `hidden`.
- [x] 1.4 Add a test asserting the dialog element's className includes the mobile full-screen tokens (`w-screen`, `h-dvh`, `rounded-none`) AND the `md:` override tokens (`md:max-w-4xl`, `md:rounded-lg`) simultaneously present (Tailwind mobile-first: both class sets coexist, browser resolves via media query — test asserts presence, not resolved visual state).
- [x] 1.5 Add a test asserting the detail column's inline `style` no longer sets `minHeight` unconditionally — assert the `420px` value is NOT present in the base inline `style` object (it must move to a `md:`-scoped mechanism, e.g. a class or a conditional style keyed off nothing — verify via className containing a `md:min-h-[420px]`-style token instead of `style={{ minHeight }}`).
- [x] 1.6 Run `yarn test:run -- nota-credito-pos-modal` and confirm the 5 new tests FAIL for the right reason (missing `data-testid`s / classes / dialog tokens / old unconditional `minHeight` still present) — capture the failure output as RED evidence.

## Phase 2: GREEN — Implement Responsive Classes

- [x] 2.1 In `nota-credito-pos-modal.tsx`, add `data-testid="nc-pos-columna-lista"` to the left column div (~line 446) and `data-testid="nc-pos-columna-detalle"` to the right column div (~line 529).
- [x] 2.2 Update left column className to `` `${factura ? 'hidden' : 'flex'} md:flex flex-col min-h-0` ``.
- [x] 2.3 Update right column className to `` `${factura ? 'flex' : 'hidden'} md:flex flex-col min-h-0 md:border-l md:pl-4 overflow-y-auto` `` and remove the unconditional `style={{ minHeight: '420px' }}`; replace with a `md:min-h-[420px]` Tailwind class (scoped to `md:` only, no inline style needed since the fixed-px value at `md:` breakpoint is a valid arbitrary-value utility).
- [x] 2.4 Update `<dialog>` className (~line 429) to mobile-first full-screen with `md:` override: `w-screen h-dvh max-w-none rounded-none md:w-full md:max-w-4xl md:max-h-[85vh] md:rounded-lg` (keep `backdrop:bg-black/50 shadow-xl`).
- [x] 2.5 Update the inner wrapper className (~line 431, currently `p-6 flex flex-col max-h-[85vh]`) to `p-6 flex flex-col h-full md:h-auto md:max-h-[85vh]` so the full-screen mobile dialog's content area fills the screen height correctly.
- [x] 2.6 Run `yarn test:run -- nota-credito-pos-modal` and confirm all 5 new tests pass (GREEN) and all 59 pre-existing tests in this file remain green (zero regressions).

## Phase 3: Verification — Full Suite + Type Check

- [x] 3.1 Run full `yarn test:run` and confirm no regressions outside the target file (baseline: 1402/1402 passing before this change; 1407/1407 passing after — the +5 are the new responsive tests). One pre-existing unrelated infra error (`Worker is not defined` in PowerSync init, surfaced via `cliente-detalle.test.tsx`) was confirmed present on a clean stash of this branch BEFORE this change too — not a regression.
- [x] 3.2 Run `yarn type-check:test` and confirm no new TypeScript errors (pre-existing unrelated `use-pwa-update.ts` TS6133 is not a regression).
- [ ] 3.3 Manually verify in a real mobile viewport (or browser devtools device emulation) that: list-only view on open, detail-only view after selecting a factura, Volver returns to list, dialog is truly full-screen, no forced scroll from the old `minHeight` on a short viewport (jsdom cannot verify actual CSS visibility — this is the mandatory manual gate). **PENDING — requires a human with a real device/devtools; cannot be executed by this agent.**

## Phase 4: Cleanup

- [x] 4.1 Review the two new `data-testid`s don't leak into any snapshot or accessibility-tree assertion elsewhere in the suite (grep usage). Confirmed: `nc-pos-columna-lista`/`nc-pos-columna-detalle` are used only inside the new responsive `describe` block.
- [x] 4.2 Confirm no `useMobile` import was introduced anywhere in the diff. Confirmed via diff review — zero new imports besides none (pure className/style edits).
