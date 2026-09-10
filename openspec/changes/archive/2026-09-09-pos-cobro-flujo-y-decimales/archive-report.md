# Archive Report: pos-cobro-flujo-y-decimales

_Change: pos-cobro-flujo-y-decimales | Archived: 2026-09-09 | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, PASS WITH WARNINGS, MERGED

## Executive Summary

Six user-reported issues on the POS checkout path, resolved as one additive/corrective change: 2 UX friction fixes (R1 USD total typography, R2 mobile search dropdown width), 1 financial-display bug fix (R3 — "Pendiente" was re-derived through a float `.toFixed(2)` midpoint, violating rule #10; now threads the exact Decimal chain from `cobro-modal.tsx` through to the success screen), and 3 checkout-gate guards (R4 removes silent `CREDITO` auto-select; R5 blocks Procesar/mode-switch on an uncommitted payment entry; R6 blocks processing when a payment method is selected with no amount). No schema change, no write-path change (`currency.ts` and `crearVenta` untouched).

**Verification result**: PASS WITH WARNINGS. 27/27 tasks, 96 test files / 1165 tests passing (+2 files/+12 tests vs the true `develop` baseline of 94/1153, 0 regressions — independently re-measured by the verify phase after a git-incident correction). 0 CRITICAL. 2 WARNING, both reporting-accuracy issues on upstream artifacts (stale absolute test-count baseline quoted by the orchestrator brief/apply-progress; a commit-count labeling nuance) — neither is a functional defect. 0 SUGGESTION. See `verify-report.md` for the full compliance matrix (12/12 scenario groups compliant: 7 test-covered, 5 manual-verify/code-inspection per the design's own testing strategy for non-testable visual/gating logic).

**Merge**: PR #94 (`feat/pos-cobro-flujo-y-decimales` → `develop`), merge commit `f49153b`. Subsequently promoted `develop` → `main` via PR #95, merge commit `77fc433`. Both merged; the 6 POS fixes (R1–R6) are live on `develop` and `main`.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/pos-cobro-checkout-guards/spec.md` | **Created** (canonical location did not exist) | Copied verbatim from this change's delta — 3 Requirements ("No discrepancy mode pre-selected by default on open", "Block processing and mode switching on uncommitted payment entry", "Block processing when a payment method is selected without an amount"), 9 scenarios. No prior spec existed for this domain, so this is a promotion, not a merge. |
| `openspec/specs/pos-cobro-pendiente-exacto/spec.md` | **Created** (canonical location did not exist) | Copied verbatim from this change's delta — 2 Requirements ("Pendiente Bs equals the exact source Decimal, not a re-derivation", "Pendiente USD aligns with the same source of truth"), 5 scenarios. Promotion, not a merge. |
| `openspec/specs/pos-cobro-presentacion/spec.md` | **Created** (canonical location did not exist) | Copied verbatim from this change's delta — 2 Requirements ("USD total is more readable on the desktop POS panel", "Search results dropdown is fully usable on mobile"), 4 scenarios. Promotion, not a merge. |

**Note on merge type**: All 3 capabilities are new — none had a pre-existing spec at `openspec/specs/{domain}/spec.md`. Per this change's own proposal ("Modified Capabilities: None"), no MODIFIED/REMOVED delta headers exist to reconcile against prior text. Each canonical spec file is therefore a direct, unmodified copy of its delta spec — no content was invented or altered during promotion.

---

## Archive Contents

- `proposal.md` — ✅
- `explore.md` — ✅ (pre-existing exploration artifact, carried through unchanged)
- `specs/pos-cobro-checkout-guards/spec.md` — ✅ (delta, preserved as-authored)
- `specs/pos-cobro-pendiente-exacto/spec.md` — ✅ (delta, preserved as-authored)
- `specs/pos-cobro-presentacion/spec.md` — ✅ (delta, preserved as-authored)
- `design.md` — ✅
- `tasks.md` — ✅ (27/27 sub-tasks `[x]`)
- `verify-report.md` — ✅ (filesystem copy; matches Engram `sdd/pos-cobro-flujo-y-decimales/verify-report`, obs #3157)

---

## Follow-up Debt (recorded, NOT fixed in this archive pass)

1. **Stale absolute test-count baseline in upstream artifacts.** The verify report flags that the orchestrator brief and apply-progress artifact both quoted an absolute baseline of "104 files/1249 tests → 106 files/1261 tests" that does not match the true repository state ("94 files/1153 tests → 96 files/1165 tests" on a clean re-measurement). The **relative** delta (+2 files/+12 tests, 0 regressions) is correct and independently reproduced; only the absolute figures are wrong, almost certainly residue from a git-incident where the apply phase's working tree briefly shared state with the unrelated `feat/producto-costo-backcalculo` branch before a cherry-pick/reset correction. No functional impact — recorded here so a future reader does not trust the stale absolute numbers if they resurface in Engram search results.
2. **Deferred-by-design scope, not a defect**: the proposal explicitly deferred the R1 typography pattern for the mobile bottom bar/Sheet totals ("Out of Scope"). If mobile totals ever need the same readability treatment as the desktop panel, that is a new, separate change — not a gap in this one.

---

## Verification Evidence

- **Verify report** (Engram obs #3157, `sdd/pos-cobro-flujo-y-decimales/verify-report`; filesystem copy `verify-report.md` in this archive folder): PASS WITH WARNINGS. 27/27 tasks, 96/96 test files passing (1165/1165 tests), 0 regressions vs the true `develop` baseline. `yarn type-check` / `yarn type-check:test` clean except one pre-existing, unrelated `use-pwa-update.ts` TS6133 error (confirmed untouched by this change). `yarn lint` not available (pre-existing project gap — eslint not installed). Git history confirmed clean of inventario/producto-form contamination; diff scope limited to `src/features/ventas/**` (6 files) + `openspec/changes/pos-cobro-flujo-y-decimales/**`.
- **Spec compliance**: 12/12 scenario groups compliant across all 3 capabilities (7 backed by `pendiente-venta.test.ts` / `pago-guard.test.ts`, 5 by manual-verify/code-inspection for R1/R2/R4's non-testable visual/gating logic, matching the design's own stated Strict TDD strategy).
- **TDD compliance**: 6/6 checks passed — RED/GREEN/triangulation evidence present for both testable pure functions (`calcularPendienteVenta`, 5 cases; `evaluarPagoPendiente`, 7 cases), 0 mocks, no tautological assertions, a hard negative assertion (`not.toBe('Bs. 2.705,00')`) directly encoding the regression this change fixes.
- **Merge**: PR #94, merge commit `f49153b` on `develop`. Promoted to `main` via PR #95, merge commit `77fc433`.

---

## SDD Cycle Summary

| Phase | Status |
|-------|--------|
| Explore | Complete (`explore.md`) |
| Proposal | Complete (`proposal.md`) |
| Spec | Complete (3 new capability deltas: `pos-cobro-checkout-guards`, `pos-cobro-pendiente-exacto`, `pos-cobro-presentacion`) |
| Design | Complete (`design.md`) |
| Tasks | Complete (`tasks.md`, 27/27 sub-tasks `[x]` across 6 phases) |
| Apply | Complete (Engram `sdd/pos-cobro-flujo-y-decimales/apply-progress`, obs #3154) |
| Verify | PASS WITH WARNINGS (Engram obs #3157 / `verify-report.md`) |
| Merge | Complete — PR #94 (`f49153b`) to `develop`; PR #95 (`77fc433`) `develop`→`main` |
| Archive | Complete — this report |

The SDD cycle for `pos-cobro-flujo-y-decimales` is fully complete: merged to both `develop` and `main`, 1165/1165 tests green with 0 regressions, no CRITICAL findings, 2 non-functional reporting-accuracy WARNINGs recorded above as follow-up debt. All 3 capability specs were newly promoted to `openspec/specs/` (no prior main spec existed for any of them, so this was a direct copy, not a delta merge). No source code under `src/` was touched by this archive pass. Commit is left for the orchestrator/maintainer to push.
