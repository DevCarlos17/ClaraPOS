# Archive Report: comisiones-consolidacion-cierre

_Archived: 2026-08-03 | Branch: `feat/gastos-qol-pos-metodos-dinamicos` | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, verified (PASS), QA CONFIRMED

## Executive Summary

Migrated the cierre-de-caja commission step from reading the deprecated single `metodos_cobro.comision_pct` (silently ignored once `banco-form.tsx` started hardcoding it to `'0'`) to looping over the N-generic `metodo_cobro_deducciones` table per método, posting one `gastos` row per active deducción against its own `cuenta_gasto_id`. Also fixed a `nro_gasto` `COUNT(*)`-based numbering bug (multi-device collision pattern already fixed once elsewhere) by switching to UUID-slice numbering. The tester confirmed in QA that the originally reported bug is fixed: deducciones now reach Tesorería at cierre ("Consolidación de cierre de caja" ingreso/egreso rows visible in the tesorería screen).

This is **Cambio B, Pieza 1 only**. The sale-time "depósito directo con comisión" path and its double-booking exclusion are explicitly DEFERRED to a future Cambio C (see below).

---

## Final Scope Delivered

- **Slice 1 — pure lib + tests** (commit `0e82514`): new `src/features/caja/lib/deducciones-cierre.ts` — `resolverDeduccionesCierre()` (native-currency amount calc per active deducción, no USD conversion, W5 EFECTIVO/caja-fuerte warn+skip, never-orphan hard-fail on missing `cuenta_gasto_id`, zero-pct silent skip) and `construirNroGastoDeduccion()` (UUID-slice `nro_gasto`, collision-free across lotes of the same método). 9 Vitest unit tests, TDD RED→GREEN, dead code until Slice 2 wired it.
- **Slice 2 — hook wiring** (commit `a3800d6`): `aplicarComisionSiCorresponde` (`use-sesiones-caja.ts`) now queries `metodo_cobro_deducciones WHERE is_active=1 AND empresa_id=? ORDER BY orden` and loops, calling the renamed `insertarGastoDeduccionEnTx` (`use-gastos.ts`, was `insertarGastoComisionEnTx`) once per active row — direct `cuenta_gasto_id` FK, no `cuentas_config['COMISION_BANCARIA']` indirection. Applies unchanged across all 3 cierre modes (plain `totalSistemaD`, por lotes, lotes acumulados). `generarAsientosGasto` → `libro_contable` posting is PRESERVED (obs #976 corrected the original QoL-only assumption — Diferencial Cambiario reads these entries) but isolated to a best-effort try/catch: an accounting-entry failure now degrades to `console.warn` instead of aborting the whole cierre. All of this runs inside the existing `cerrarSesionCaja` `writeTransaction` — no new transaction, no new UI trigger.

## Commits (branch `feat/gastos-qol-pos-metodos-dinamicos`, pushed to origin)

| Commit | Message |
|---|---|
| `0e82514` | feat(caja): lib pura de deducciones de cierre con calculo por concepto y nro_gasto unico |
| `a3800d6` | feat(caja): migrar comisiones del cierre a N deducciones por metodo |

Both commits confirmed present via `git log` on the working branch (see verification below). No PR to `main` — user's explicit choice, change stays on `feat/gastos-qol-pos-metodos-dinamicos`.

---

## Verification Evidence (from sdd-verify, obs #990 — Verdict: PASS)

- **Tests**: 118 passed / 10 failed (128 total, `yarn test:run`) — the 10 failures are PREEXISTING/unrelated (9× `currency.test.ts` Decimal-vs-primitive `toBe()` strict-equality trap, 1× `identity.test.ts` RIF check-digit edge case), identical to baseline, zero new regressions. `deducciones-cierre.test.ts` isolated: 9/9 passed.
- **Type-check**: `yarn type-check` clean on all 3 touched app files (`use-gastos.ts`, `use-sesiones-caja.ts`, `deducciones-cierre.ts`); remaining errors confined to `*.test.ts` files (preexisting, missing vitest globals in tsconfig).
- **TDD compliance**: 5/5 checks passed (RED confirmed, GREEN confirmed, triangulation adequate, safety-net full-suite re-run clean, assertion quality — no tautologies/ghost loops).
- **Spec compliance**: 9/9 scenarios in `spec.md`'s Compliance Matrix trace to real passing tests or unambiguous unchanged-by-design evidence (7 direct, 2 correctly unchanged-by-design: single-cierre guard, N-`anularGasto` reversal).
- **Adversarial correctness checks**: libro_contable decision (obs #976) honored; try/catch scope correct (wraps ONLY the accounting posting, not the primary gasto/tesorería writes); atomicity preserved (no new `writeTransaction`); multi-tenant `empresa_id` filter present on the new SELECT; zero orphan `insertarGastoComisionEnTx` call-sites remaining in `src/`; Decimal precision used throughout (no float math); native-currency base confirmed (no hidden USD conversion in the percentage calc).
- **Design coherence**: all 6 design decisions (obs #977) followed exactly, including Open Question 1 resolution (non-`PUNTO` bank methods fall through the existing `totalSistemaD` branch unchanged — no new attribute needed).

## Live QA Result: **CONFIRMED**

The tester confirmed the originally reported bug is fixed: deducciones configured on a método (comisión + ISLR + otro, each with its own `cuenta_gasto_id`) now reach Tesorería at cierre — "Consolidación de cierre de caja" ingreso/egreso rows are visible in the tesorería screen, where previously the deduction step was silently skipped because it read the deprecated `comision_pct` column.

---

## Deferred to Cambio C (NOT part of this archived change)

| Item | Disposition |
|---|---|
| Sale-time "depósito directo con comisión" egreso posting (`deposito_directo=1` métodos posting their deducción at sale registration, `use-ventas.ts` step 8) | New feature work, not present today — deferred to a future change. Scoped out per user decision (2026-08-03) to keep Pieza 1 a targeted bugfix, not enlarge it with new sale-flow feature work. |
| Cierre-loop double-booking exclusion (`deposito_directo=1` métodos excluded from `metodosParaConsolidar` ingreso loop) | Pairs with the sale-time path above; must be built together with it, not split. Currently latent/harmless because comisiones were silently skipped before this change and deposito_directo deposits already happen independently — this change's N-deducciones migration does not add new ingreso booking, so it does not worsen the latent risk. |
| Canonical spec now documents both deferred items explicitly (`openspec/specs/tesoreria-consolidacion-cierre/spec.md` Out of Scope section) so a future Cambio C proposal has a clear pointer. | Done as part of this archive (see Source of Truth Updated below). |

## Other Follow-Up Items Surfaced (NOT part of this change, not fixed)

| Item | Disposition |
|---|---|
| `currency.ts` returns `Decimal` instead of a plain `number` in some paths, causing 9 preexisting failing tests in `currency.test.ts` (`toBe()` strict-equality trap against a `Decimal` instance) | Latent bug, unrelated to this change, confirmed present in baseline before Slice 1/2. Not fixed here — flagged for a future hardening pass. |
| The best-effort accounting try/catch (`generarAsientosGasto` around the deducción gasto) only `console.warn`s on failure — no UI-visible warning trail exists yet | Acceptable for Pieza 1 (mirrors the existing `crearGasto` pattern per design.md); toast/banner surfacing of accounting-posting failures is a future enhancement, not blocking. |

---

## Artifacts (traceability)

### Filesystem (`openspec/comisiones-consolidacion-cierre/`)

| Artifact | Path |
|---|---|
| Proposal | `openspec/comisiones-consolidacion-cierre/proposal.md` |
| Delta spec | `openspec/comisiones-consolidacion-cierre/spec.md` |
| Design | `openspec/comisiones-consolidacion-cierre/design.md` |
| Tasks | `openspec/comisiones-consolidacion-cierre/tasks.md` (all phases now marked `[x]`) |
| This archive report | `openspec/comisiones-consolidacion-cierre/archive-report.md` |

### Engram (project: `clarapos`)

| Topic key | Observation ID |
|---|---|
| `sdd/comisiones-consolidacion-cierre/explore` | #901 |
| `sdd/comisiones-consolidacion-cierre/explore-libro-contable` | #974 |
| `sdd/comisiones-consolidacion-cierre/proposal` | #965 |
| `sdd/comisiones-consolidacion-cierre/spec` | #970 |
| `sdd/comisiones-consolidacion-cierre/design` | #977 |
| `sdd/comisiones-consolidacion-cierre/tasks` | #981 |
| `sdd/comisiones-consolidacion-cierre/apply-progress` | #986 |
| `sdd/comisiones-consolidacion-cierre/verify-report` | #990 |
| Decision: libro_contable posting stays (corrects original QoL-only assumption) | #976 |
| `sdd/comisiones-consolidacion-cierre/archive-report` | (this report — saved by this phase) |

### Source of Truth Updated

- `openspec/specs/tesoreria-consolidacion-cierre/spec.md` — **MODIFIED** the "Commission booked as a real gasto (Option A2)" requirement: single `comision_pct`/one-gasto-per-método → N-`metodo_cobro_deducciones`/one-gasto-per-deducción-per-método, native-currency base, UUID-slice `nro_gasto`, `libro_contable` posting preserved as best-effort. Replaced its 2 old scenarios with 9 new scenarios matching the delta spec. Header `Last updated by change` updated. Appended 3 items to the `Out of Scope` section documenting what's deferred to Cambio C plus the confirmed-kept `libro_contable` posting and the unconfirmed cross-método grouping question.
- All other requirements in that spec (routing per payment method, hard-fail on missing destination, pending records visible, migrations, status-flip-ordering) are UNCHANGED and preserved verbatim.

### Archive Convention Note

This project's `openspec/` layout keeps change folders in place at `openspec/{change-name}/` after archiving (confirmed precedent: `cierre-consolidacion-tesoreria`, `pos-tesoreria-integration` remain top-level after being folded into main specs) rather than moving them under `openspec/changes/archive/YYYY-MM-DD-{name}/`. Followed that precedent here: the `comisiones-consolidacion-cierre/` folder was left in place; only the canonical spec was synced and this archive report was added.

---

## SDD Cycle Complete

The change has been explored, proposed, designed, specced, implemented (2 chained commits: pure lib + tests, then hook wiring), verified (PASS, 9/9 spec scenarios compliant, zero new regressions), and now archived with tester-confirmed QA. Cambio C (sale-time depósito directo path + cierre-loop exclusion) is open for a future change when prioritized.
