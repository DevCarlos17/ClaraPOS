# Archive Report: producto-precio-venta-bs-editable-bidireccional

**Archived**: 2026-10-27
**Status**: SHIPPED — fully implemented, verified, and merged to `develop` (HEAD `3b66064`)

## What Shipped

In the "Tasa Paralela" sandbox of `producto-form.tsx`, mode `modoRecalculo === 'manual'` ("Editar manual todo"):

- New **"Precio Venta Bs"** column in the preview table (manual mode only).
- **Precio Venta $** and **Precio Venta Bs** became editable per price level (Detal/Mayor/Especial), alongside the already-editable **Margen %**.
- Editing any one of the 3 fields recalculates the other two via Decimal.js, reusing existing primitives (`calcularPrecioPreservandoMargenD`, `calcularMargenPreservandoPvp`, `usdToBs`/`bsToUsd`) composed into 3 new pure functions — zero new business formulas.
- Full precision-mask contract (ref full-precision + `*Completo` setter + focus/blur reveal-remask) applied to the 2 new fields, matching the existing real-field contract.
- "Confirmar cambios" is disabled, with a visible message, if any level's margin goes negative after editing.
- `handleSetModoRecalculo('manual')` pre-fill extended to seed all 3 fields (Margen/PVP$/PVP Bs) consistently from the real form state.
- Persistence contract unchanged: only the 4 USD fields at 8-decimal precision are persisted; Margen % and Precio Bs remain derived/display-only.

## Delivery: 4 PRs (2 SDD + 2 direct fast-follows)

| PR | Branch | Merged | Scope | Lines | Verify Verdict |
|----|--------|--------|-------|-------|-----------------|
| [#270](https://github.com/DevCarlos17/ClaraPOS/pull/270) | `feat/producto-precio-bs-bidireccional-pr1` | 2026-10-26 | SDD PR 1/2 — 3 pure cascade functions (`cascadaDesdeMargenManual`, `cascadaDesdePvpUsdManual`, `cascadaDesdePvpBsManual`) in `producto-precio-gating.ts` + 16 new unit tests + 5 tests for previously-uncovered `calcularMargenPreservandoPvp` | 176 (2 files) | **PASS** — 100% line/branch coverage on changed file, zero float/parseFloat in financial math, all div0/tasa=0 guards verified |
| [#271](https://github.com/DevCarlos17/ClaraPOS/pull/271) | `feat/producto-precio-bs-bidireccional-pr2` | 2026-10-27 | SDD PR 2/2 — `producto-form.tsx` wiring: 6 useState+6 useRef, 6 `*Completo` setters, 9 handlers, bifurcated `calcularPreviewNivel` manual branch, extended pre-fill, new Bs column + inputs + negative-margin messages + "Confirmar" gating | 451 (3 files) | **PASS WITH WARNINGS** — accepted as `size:exception` (451/400 budget, +12.75%, justified: no cleaner split point existed without increasing reviewer cognitive load) |
| [#272](https://github.com/DevCarlos17/ClaraPOS/pull/272) | `feat/producto-inputs-select-on-focus` | 2026-10-27 | Direct (non-SDD) fast-follow — select-all-on-focus for price/cost inputs in `producto-form.tsx` | — | n/a (not an SDD change) |
| [#273](https://github.com/DevCarlos17/ClaraPOS/pull/273) | `fix/producto-manual-prefill-coherente` | 2026-10-27 | Direct (non-SDD) fast-follow — fixed manual-mode pre-fill to keep the existing margin and recompute PVP from it (previously could pre-fill inconsistent values) | — | n/a (not an SDD change) |

Only #270 and #271 are part of this SDD change's lifecycle and are archived here. #272 and #273 are mentioned for traceability since they touch the same sandbox and shipped immediately after, but they were never proposed/spec'd/tasked under this change — they have no SDD artifacts to archive.

## Final State

- `develop` HEAD: `3b66064` (merge of #273).
- All 18 tasks across Phase 1-4 in `tasks.md` are now marked complete (tasks.md was updated during archive to reflect actual implementation status recorded in apply-progress #5835 — Phase 2/3/4 checkboxes were left unchecked after apply but the work was in fact done and verified across both PRs).
- Full test suite: 2462/2465 passing after PR2 (3 pre-existing, unrelated PowerSync/jsdom `Worker is not defined` failures in files this change never touches — confirmed unchanged baseline since before PR1).
- `yarn type-check`: zero new errors in changed files.
- `yarn lint`: not run — eslint is not installed in this repo (documented tooling gap, not a deviation).

## Spec Sync

New capability `producto-tasa-paralela-manual-bidireccional` had no prior main spec. The delta spec was copied directly (no merge needed) to:

```
openspec/specs/producto-tasa-paralela-manual-bidireccional/spec.md
```

9 requirements, 15 scenarios — all verified compliant against the implementation in both PR1 and PR2 verify reports (#5837, #5841).

## Deferred Fast-Follows (not blockers, not fixed in this change)

1. **Inert revert/reset state-clear gap** (flagged in PR2 verify, WARNING-level): `handleRevertirSandbox`, `resetSandboxTasaParalela`, and `handleConfirmarQuitarTasaParalela` reset the 3 `sbManualMargen*` states but NOT the 6 new `sbManualPvpUsd*`/`sbManualPvpBs*` states/refs. Functionally harmless today — `handleSetModoRecalculo('manual')` unconditionally re-pre-fills all 6 on every entry into manual mode, and the stale values are never read while `modoRecalculo !== 'manual'` (both `calcularPreviewNivel` and `hayMargenNegativoManual` are mode-guarded). Recommended as a hygiene follow-up, not a correctness bug.
2. **Missing seeding regression test for #273's fix**: PR #273 fixed a pre-fill coherence bug (keep margin, recompute PVP) but shipped as a direct PR without an accompanying unit/component test asserting the corrected pre-fill behavior. Since #273 is outside this SDD change's scope, no test gap is tracked here as a task — flagging for whoever picks up the next sandbox-related change to add regression coverage for the pre-fill path.

Neither item blocks this change from being considered DONE — both are pre-existing-pattern gaps (the first existed before this change too, for `sbManualMargen*`; the second belongs to a different, non-SDD PR) surfaced during this change's adversarial verification.

## Traceability — Engram Observations

| Artifact | Topic Key | Observation ID |
|----------|-----------|-----------------|
| Exploration | `sdd/producto-precio-venta-bs-editable-bidireccional/exploration` | #5829 |
| Proposal | `sdd/producto-precio-venta-bs-editable-bidireccional/proposal` | #5830 |
| Spec | `sdd/producto-precio-venta-bs-editable-bidireccional/spec` | #5831 |
| Design | `sdd/producto-precio-venta-bs-editable-bidireccional/design` | #5833 |
| Tasks | `sdd/producto-precio-venta-bs-editable-bidireccional/tasks` | #5834 |
| Apply progress | `sdd/producto-precio-venta-bs-editable-bidireccional/apply-progress` | #5835 |
| Verify report (PR1) | `sdd/producto-precio-venta-bs-editable-bidireccional/verify-report` | #5837 |
| Verify report (PR2) | `sdd/producto-precio-venta-bs-editable-bidireccional/verify-report-pr2` | #5841 |
| Archive report (this doc) | `sdd/producto-precio-venta-bs-editable-bidireccional/archive-report` | (saved below) |

## Filesystem Changes Made During Archive

- Created `openspec/specs/producto-tasa-paralela-manual-bidireccional/spec.md` (new capability, direct copy — no prior main spec existed for this domain).
- Updated `tasks.md` Phase 2/3/4 checkboxes from `[ ]` to `[x]` (actual status, per apply-progress #5835) and appended a "Delivery Record" section documenting the 2 merged PRs and 2 fast-follows.
- Moved the entire change folder:
  `openspec/changes/producto-precio-venta-bs-editable-bidireccional/` → `openspec/changes/archive/2026-10-27-producto-precio-venta-bs-editable-bidireccional/`

All moved/created paths were untracked in git before this archive (the change folder was never `git add`ed during propose/spec/design/tasks/apply/verify). **Nothing has been committed.** The orchestrator should confirm with the user before staging/committing, per the git hygiene instructions for this session (working tree has many unrelated untracked files; do not `git add .`/`git add -A`).

### Recommended commit (pending confirmation)

```bash
git add openspec/specs/producto-tasa-paralela-manual-bidireccional/spec.md
git add openspec/changes/archive/2026-10-27-producto-precio-venta-bs-editable-bidireccional/
git commit -m "chore(sdd): archive producto-precio-venta-bs-editable-bidireccional"
```
