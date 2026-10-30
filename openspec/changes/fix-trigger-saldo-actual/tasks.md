# Tasks: Fix trigger `actualizar_saldo_cliente()` — `saldo_actual` deja de auto-sanarse

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-develop
400-line budget risk: Medium

Estimated changed lines: ~320-380 (new file, all additions). Single PR — trigger-fix + reconciliation must ship in one transaction (not splittable). `stacked-to-develop` = chain of 1.

**Work unit** (only one): `migrations/0119_fix_trigger_saldo_actual_y_reconciliacion.sql` — trigger fix + reconciliation + REV assertion + dry-run blocks. Base: new branch off `origin/develop`.

> **DEVIATION (state change, confirmed before apply)**: the plan below originally targeted `migrations/0118_...sql` in-place. Before apply started, the owner merged PR #285 (the OLD/incorrect `0118_reconciliar_saldo_cliente_y_assertion_rev.sql`) to `origin/develop` (commit `6ef15cbb`) AND executed it on staging. That migration only fixed `saldo_pendiente_usd` + added the REV assertion — it does NOT repair `saldo_actual` (the real bug). Because `0118` is now immutable history (never edit an applied migration), the fix becomes migration `0119`, branched from `origin/develop` @ `6ef15cbb` (not from `ece718cf`, which predates the 0118 merge), `CREATE OR REPLACE`-ing the function starting from the verified POST-0118 body (read line-by-line from `origin/develop`, not from any local draft). All task references to `0118`/`ece718cf` below are historical — the executed file is `0119`.

## Phase 0: Setup

- [x] 0.1 Branch `feat/fix-trigger-saldo-actual-0119` from `origin/develop` (`6ef15cbb`, current HEAD at apply time — includes the already-merged 0118). Confirmed `migrations/` tops at `0118`.

## Phase 1: Migration file — header

- [x] 1.1 Create `migrations/0119_fix_trigger_saldo_actual_y_reconciliacion.sql`. Header: depends on `0117`+`0118` (post-0118 body, verified against `origin/develop`); documents the 4-step repro (FAC→PAG→REV→PAG→REV), explicitly calls out the design-vs-real-code discrepancy on the `saldo_pendiente_usd` CASE (SAFV not included), refs `design.md`.

## Phase 2: Trigger fix (`CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()`)

- [x] 2.1 Copied `saf_disponible`/`saldo_pendiente_usd` `CASE` expressions byte-identical from the verified POST-0118 body on `origin/develop` (NOT from the design's paraphrase — the design incorrectly included `SAFV` in the `saldo_pendiente_usd` delta branch; the real code does not, confirmed against `0115`/`0118` source).
- [x] 2.2 Kept `NEW.saldo_nuevo` IF/ELSIF + `REV` assertion (`P0001` on mismatch) unchanged — protects the immutable audit column.
- [x] 2.3 Replaced only `saldo_actual = NEW.saldo_nuevo` with the relative-delta `CASE` (SAL keeps absolute anchor; else `saldo_actual + Δpendiente − Δsaf`, reusing the REAL deltas: Δpendiente excludes SAFV, Δsaf includes SAFV).
- [x] 2.4 Commented why unqualified columns resolve to the pre-`UPDATE` row — no new query/lock, same mechanism as 0102/0110.

## Phase 3: Reconciliation (independent of 0118, does not replace it — 0118 is immutable history)

- [x] 3.1 `DO $$ ... $$` per design Part 2: two independent drift checks — `saldo_pendiente_usd` vs `SUM(ventas.saldo_pend_usd)` (`status != 'ANULADA' AND tipo != 'SALDO_INICIAL'`); `saldo_actual` vs `pendiente_obj + SUM(SAL) − saf_disponible`. Correct only `ABS(drift) > 0.005`.
- [x] 3.2 Excluded `tipo = 'SALDO_INICIAL'` from the debt CTE (0118's reconciliation omitted this, double-counting SAL clients — bug independent of the main fix, also repaired here).
- [x] 3.3 Wrapped UPDATE with `set_config('clarapos.trigger_context','mov_cuenta',TRUE)`; never touches `movimientos_cuenta`.
- [x] 3.4 `GET DIAGNOSTICS` + `RAISE NOTICE` with corrected-row count.

## Phase 4: Assembly, ordering, dry-run blocks

- [x] 4.1 Single `BEGIN;...COMMIT;`; trigger fix (Phase 2) before reconciliation (Phase 3) in file order.
- [x] 4.2 TC4-style dry-run: simulate drift (saldo_actual only, the exact case 0118 couldn't see), run reconciliation, assert corrected, re-run, assert 0 corrected (idempotency).
- [x] 4.3 TC5-style dry-run: consistent `REV` insert succeeds, inconsistent one fails `P0001`.
- [x] 4.4 Commented 4-step repro (TC1, design §1.2): step 3 → `saldo_actual=0`, step 4 → `1`. Added SAL-anchor (TC3) and `SAFC` (TC2) outcomes as separate dry-run blocks.
- [x] 4.5 `ROLLBACK:` section: function rollback = re-apply the verified post-0118 body verbatim (reproduced in the migration header); reconciliation has no data rollback (restore from backup if needed).

## Phase 5: Docs + staging verification (owner — no Postgres test infra in repo)

- [x] 5.1 Added `0118` (historical, already-applied) and `0119` rows to `migrations/README.md` → `## Migraciones actuales`.
- [ ] 5.2 Owner runs dry-run blocks TC1-TC5 on staging; confirm every expected outcome (including cliente 6 → correct value, cliente 8 → 1 after the 4-step repro).
- [ ] 5.3 Only after 5.2 passes: apply `0119` to production via Supabase SQL Editor per `migrations/README.md`.

---

No app code changes made — PR #284's clamp stays valid, confirmed by close reading (no app files touched).

Scoped tests only: no test files touched. Verification = dry-run blocks above (TC1-TC5), same pattern as 0102/0110/0115/0118. Strict TDD is OFF for this change per owner instruction (SQL-only change, no Postgres test runner in repo).
