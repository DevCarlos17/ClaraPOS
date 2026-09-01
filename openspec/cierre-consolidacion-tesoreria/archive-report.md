# Archive Report: cierre-consolidacion-tesoreria

_Archived: 2026-07-24 | Branch: `feat/decimal-p5-final` | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, verified, live-QA PASSED

## Executive Summary

Automated the routing of a closed cash session's per-method totals to Tesorería (bank or caja fuerte) as PENDING transfers, fixed two confirmed pre-existing Supabase CHECK-constraint sync bugs (`23514`) blocking treasury sync, and fixed a trigger-ordering bug (`P0001`) that caused consolidated rows to reach Postgres and then be silently discarded during the same sync batch. The user confirmed via live QA against Supabase that consolidation now persists correctly in Tesorería after session close.

---

## Final Scope Delivered

- **`consolidarMetodoATesoreriaEnTx` + `insertarGastoComisionEnTx` foundation** (PR1, commit `bba3b2d`): tx-scoped helpers generalizing the existing `crearTraspasoSesionATesoreria` pattern to support a BANCO destination (not just CAJA_FUERTE), plus a purpose-built commission-gasto insert (Option A2) that avoids double-draining `metodos_cobro.saldo_actual`. Added migration `0077`, `COMISION_BANCARIA` config clave, and origen label dictionaries. No behavior change to `cerrarSesionCaja` in this PR — helpers added but unused.
- **Wiring into `cerrarSesionCaja`** (PR2, commit `4f65cb5`): activated the new steps 8-9 inside the existing single `writeTransaction` — batch-loads method config, routes each used method's `totalSistemaD` to caja fuerte (EFECTIVO) or bank (other tipos), hard-fails in Spanish naming the method on missing destino/currency mismatch/missing commission account, and removed the redundant "recuerda depositar" toast.
- **`mc.moneda` JOIN fix** (commit `808c714`): fixed a pre-existing (2026-05-07, unrelated to this change) bug in `cuadre-page.tsx`'s `ResumenSesionCerradaModal` query that selected a non-existent `metodos_cobro.moneda` column — replaced with a `JOIN monedas` so the moneda-aware diferencia display (W2 fix) actually works at runtime.
- **Migration 0078** (commit `b10741d`): `movimientos_metodo_cobro.origen` CHECK was missing `INGRESO_TESORERIA`/`EGRESO_TESORERIA` — second confirmed sync-blocking gap, fixed alongside 0077.
- **FINAL blocker fix — "Opción 1" reorder** (commit `1d179cb`): moved the `UPDATE sesiones_caja SET status='CERRADA'` to be the LAST write of `cerrarSesionCaja`'s transaction (new step 10), after the consolidation loop (steps 8-9), instead of its original early position (old step 5). Root cause: PostgreSQL trigger `fn_validate_sesion_abierta` (migration 0041) rejects `movimientos_metodo_cobro`/`pagos` inserts once the session is no longer `ABIERTA`; PowerSync's `uploadData()` uploads local writes to Supabase **sequentially, in original write order**, and on a FATAL response code (`P0001` is one) calls `transaction.complete()`, which **discards the entire remaining batch** — not just the failing op. With the old order, the early `UPDATE` reached Postgres first, flipped the session to `CERRADA` server-side, and the next op (`movimientos_metodo_cobro` INSERT) was then rejected by the trigger, discarding everything after it — producing exactly the user's reported symptom ("llega a tesorería pero se borra"): session shows `CERRADA` in Postgres with zero consolidation rows. With the reorder, every consolidation insert reaches Postgres while the session is still `ABIERTA` there, and the status flip — which has no trigger dependency of its own — runs last.

---

## Commits (branch `feat/decimal-p5-final`, pushed to origin)

| Commit | Message |
|---|---|
| `bba3b2d` | feat(tesoreria): fundacion consolidacion cierre a tesoreria (PR1) |
| `4f65cb5` | feat(caja): activar consolidacion de cierre hacia tesoreria (PR2) |
| `808c714` | fix(cuadre): resolver moneda via JOIN monedas en resumen de sesion cerrada |
| `b10741d` | fix(migrations): 0078 agrega INGRESO/EGRESO_TESORERIA al CHECK de movimientos_metodo_cobro |
| `1d179cb` | fix(caja): reordenar flip a CERRADA al final del cierre para no bloquear consolidacion |

All 5 commits confirmed present in `git log feat/decimal-p5-final` and the branch is up to date with `origin/feat/decimal-p5-final` (verified via `git status` — no unpushed commits on this line of work).

## Migrations

| Migration | Purpose | Status |
|---|---|---|
| `0077_cierre_consolidacion_tesoreria.sql` | Idempotent CHECK fix: `traspasos_tesoreria` (`cuenta_origen_tipo`/`cuenta_destino_tipo`) allows `'SESION_CAJA'`; `movimientos_bancarios_origen_check` allows `'CIERRE_CONSOLIDACION'` | **Confirmed APPLIED in Supabase** by the user (obs #558) |
| `0078_tesoreria_origen_metodo_cobro.sql` | Idempotent CHECK fix: `movimientos_metodo_cobro.origen` allows `'INGRESO_TESORERIA'`/`'EGRESO_TESORERIA'` | **Confirmed APPLIED in Supabase** by the user (obs #558) |

---

## Verification Evidence

- **Type-check**: `yarn type-check` clean across all files touched by this change (9-11 files across both PRs plus the final reorder in `use-sesiones-caja.ts`). Baseline of 308 pre-existing errors confined entirely to `*.test.ts` files (no `@types/jest`/`@types/mocha` installed — pre-existing gap) plus 2 unrelated `.tsx` files (`factura-detalle-cxc.tsx`, `banco-form.tsx` unused import) and one FullCalendar overload issue in `calendario-citas.tsx` — none touched by this change, confirmed via `git show --stat` on each commit.
- **Lint**: not available — `eslint` not installed in `node_modules` in this environment (pre-existing gap, unrelated, reported not fixed per project convention).
- **No test runner** exists in this project (`strict_tdd: false`, per `openspec/sdd-init.md`).
- **Fresh-context adversarial review** of the final "Opción 1" reorder fix: **PASS, no CRITICALs**. Confirmed: (1) no step 6-9 code depends on `status='CERRADA'` already being set; (2) all variables closed over by the relocated UPDATE remain in scope and unmutated; (3) `movimientos_metodo_cobro` is the ONLY table among steps 6-9's writes gated by `fn_validate_sesion_abierta` (grepped across all migrations — the trigger is attached only to `movimientos_metodo_cobro` and `pagos`, and steps 6-9 only `SELECT` from `pagos`, never `INSERT`); (4) atomicity preserved — single `writeTransaction`, every failure path is a synchronous `throw`; (5) no re-entrancy risk — PowerSync/SQLite serializes `writeTransaction`s on a single write connection. The review additionally traced the actual root cause through `connector.ts:uploadData()` (sequential op upload, `transaction.complete()` discards the remaining batch on FATAL codes) rather than relying on local-transaction reasoning alone — see full trace in verify-report.md's Addendum.
- **Spec compliance**: 13/13 scenarios in the original verify-report.md's Spec Compliance Matrix have static implementing evidence (0 NOT IMPLEMENTED). All named adversarial-review fixes from the apply phase (C1 — `skipSaldoCheck`, C2 — native-currency `totalSistemaD`, W1 — `origenDestino` always derived from `destino.tipo`, W3 — method-named errors, W4 — destino currency validation, W5 — efectivo-commission warn) confirmed present with file:line evidence.

## Live QA Result: **PASSED**

The user confirmed against a real Supabase-synced environment that closing a session now correctly persists the Tesorería consolidation (bank/caja fuerte pending transfers) after sync, resolving the originally reported symptom where consolidated rows "llegaba a tesorería pero se borraba" (arrived in Tesorería then disappeared). This confirms the "Opción 1" reorder fix resolved the `P0001`/batch-discard root cause in production, not just in static review.

---

## Residual Debt Explicitly Deferred (NOT part of this archived change)

| Item | Disposition |
|---|---|
| Secondary symptom: invoice with mixed payment methods showing only cash methods in cuadre | Carried into the new change **`conciliacion-lotes-pos`**'s exploration phase — not diagnosed or fixed here. |
| Reconciliation legibility + POS batch/lote tracking | Deferred to the new change **`conciliacion-lotes-pos`** (was already out-of-scope per the original proposal.md). |
| Pre-existing `caja_fuerte.saldo_actual` / `bancos_empresa.saldo_actual` read-then-write race on concurrent session closes | Documented as a known risk (caja spec DEUDA-5); not fixed — pre-existing, out of scope per design.md's Edge Cases table. |
| PowerSync upload connector's sequential-op + discard-entire-batch-on-FATAL model | Documented as a systemic gap (caja spec DEUDA-6); strictly no worse than the bug it replaces, but worth hardening generally (e.g. a Postgres RPC for the whole cierre payload) in a future change — not attempted here. |
| `pos-tesoreria-integration` change was never formally archived | Its `caja` delta (deposit-reminder toast) was effectively superseded by this change's MODIFIED requirement, now merged into the main `caja` spec. The `pos-tesoreria-integration` change folder itself was left untouched — flagged as cleanup debt (caja spec DEUDA-7), not resolved by this archive. |

---

## Artifacts (traceability)

### Filesystem (`openspec/cierre-consolidacion-tesoreria/`)

| Artifact | Path |
|---|---|
| Exploration | `openspec/cierre-consolidacion-tesoreria/explore.md` |
| Proposal | `openspec/cierre-consolidacion-tesoreria/proposal.md` |
| Delta specs | `openspec/cierre-consolidacion-tesoreria/specs/tesoreria-consolidacion-cierre/spec.md`, `openspec/cierre-consolidacion-tesoreria/specs/caja/spec.md` |
| Design | `openspec/cierre-consolidacion-tesoreria/design.md` |
| Tasks | `openspec/cierre-consolidacion-tesoreria/tasks.md` |
| Apply progress | `openspec/cierre-consolidacion-tesoreria/apply-progress.md` |
| Verify report | `openspec/cierre-consolidacion-tesoreria/verify-report.md` (includes Addendum covering the final "Opción 1" fix) |
| This archive report | `openspec/cierre-consolidacion-tesoreria/archive-report.md` |

### Engram (project: `clarapos`)

| Topic key | Observation ID |
|---|---|
| `sdd/cierre-consolidacion-tesoreria/explore` | #530 |
| `sdd/cierre-consolidacion-tesoreria/proposal` | #533 |
| `sdd/cierre-consolidacion-tesoreria/design` | #534 |
| `sdd/cierre-consolidacion-tesoreria/spec` | #535 |
| `sdd/cierre-consolidacion-tesoreria/tasks` | #536 |
| `sdd/cierre-consolidacion-tesoreria/apply-progress` | #537 (Opción 1 reorder, final apply state) |
| `sdd/cierre-consolidacion-tesoreria/verify-report` | #541 |
| Session summary (pre-archive context) | #554 |
| Migrations 0077/0078 confirmed applied | #558 |
| `sdd/cierre-consolidacion-tesoreria/archive-report` | (this report — saved by this phase) |

### Source of Truth Updated

- `openspec/specs/caja/spec.md` — added **CAP-4: cierre-consolidacion-tesoreria** (2 requirements, 5 scenarios) + 5 new Known Open Items (DEUDA-3 through DEUDA-7) documenting residual debt.
- `openspec/specs/tesoreria-consolidacion-cierre/spec.md` — **new** domain spec (6 requirements, 12 scenarios), copied/reconciled from the change's delta spec with corrections reflecting the final implementation (commission gating on `destino.tipo === 'BANCO'`, destino-currency-mismatch hard-fail, migration 0078, and the status-flip-ordering requirement added by the final fix).

---

## SDD Cycle Complete

The change has been fully explored, proposed, designed, specced, implemented (2 chained PRs + 3 hotfixes), verified (static + fresh-context adversarial review), and now archived with live production QA confirmation. Ready for the next change (`conciliacion-lotes-pos` is already in exploration for the deferred debt items above).
