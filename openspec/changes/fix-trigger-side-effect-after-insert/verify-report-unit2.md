## Verification Report

**Change**: fix-trigger-side-effect-after-insert (Unit 2 of 3 — `consumir_saf_lote()` BEFORE/AFTER split)
**Branch**: `fix/trigger-side-effect-after-insert-saf-lote` @ `fcb85929`, off `origin/develop` `830d60ad` (fast-forward base confirmed via `git merge-base`; Unit 1 / migration 0121 already merged via PR #288)
**Mode**: Standard (no Postgres test runner exists in this codebase; verification = independent byte-diff + static reasoning about Postgres BEFORE/AFTER/`ON CONFLICT`/`FOR UPDATE` semantics)
**Scope**: UNIT 2 ONLY. Unit 1 (merged) and Unit 3 (not started) are out of scope.

### Completeness (Phase 2 tasks)
| Metric | Value |
|---|---|
| Phase 2 tasks total | 10 (2.1–2.10) |
| Checked `[x]` | 9 |
| Deferred `[ ]` (by design) | 1 — task 2.9, live-staging double-send repro, same deferral pattern as Unit 1's task 1.10 |

All 9 checked tasks independently confirmed against actual file content (not trusted from the self-report) — see Correctness table below.

### Diff Reality
```
git diff origin/develop...fix/trigger-side-effect-after-insert-saf-lote --stat
 migrations/0122_mover_consumir_saf_lote_a_after_insert.sql       | 411 +++++++++++
 migrations/README.md                                             |   1 +
 openspec/changes/fix-trigger-side-effect-after-insert/tasks.md    |  20 +-
 3 files changed, 422 insertions(+), 10 deletions(-)
```
- `git status --porcelain` on this branch: clean (no stray `.atl/` or untracked files).
- `git diff --stat` targeted at `migrations/0113_saf_creditos_reversas.sql`, `src/core/db/powersync/connector.ts`, `migrations/0121_...sql`: **empty** for all three — confirmed untouched.
- `grep -n "CREATE OR REPLACE FUNCTION public.consumir_saf_lote"` across all of `migrations/`: only two hits, 0105 (original) and 0122 (new) — no other migration silently redefines the function in between.
- `grep -n "ON public.saf_creditos_aplicaciones"`: no triggers other than the pair being split exist on this table — no trigger-ordering interference to reason about.

### Byte-Diff of Relocated Logic — Independent Result (THE critical gate)
Ran my **own** `awk`/`diff`/`md5sum` commands (not copy-pasting the apply's claimed output):

1. **Retained BEFORE block** (0105 lines 113–128: `SELECT...FOR UPDATE` through the `NEW.lote_saldo_despues_usd` assignment) vs 0122's slimmed BEFORE (lines 127–142):
   ```
   diff /tmp/0105_before_block.txt /tmp/0122_before_block.txt  → exit 0 (empty)
   md5sum: 72bea7f0c491296bfe9aafa0505be0eb  (both sides, identical)
   ```
   ✅ Byte-identical. Matches apply-progress's claimed md5.

2. **Relocated UPDATE block**: substituted `v_saldo_despues` → `NEW.lote_saldo_despues_usd` on 0105's PERFORM+UPDATE block (lines 130–135), diffed against 0122's AFTER real statements (lines 167, 190–194):
   ```
   diff /tmp/0105_update_substituted.txt /tmp/0122_after_real_lines_raw.txt  → exit 0 (empty)
   md5sum identical on both sides (my own extraction methodology; differs from apply's
   reported hash because of a different awk/grep extraction boundary, but MY diff
   independently confirms zero textual difference between the two sides)
   ```
   ✅ Confirmed: the **only** change in the relocated block is the one documented variable substitution. Status/clamp CASE (`AGOTADO`/`ACTIVO` at `<= 0.005`), column list, and `WHERE id = NEW.lote_id` are byte-identical otherwise.

3. **Substitution semantic equivalence**: In the BEFORE function, `NEW.lote_saldo_despues_usd := v_saldo_despues;` (line 142) assigns the exact clamped value to the NEW row **before** `RETURN NEW`. The AFTER function then reads `NEW.lote_saldo_despues_usd` from the row that was actually persisted by the INSERT. Since the NEW record passed into the AFTER trigger reflects the final column values of the inserted row, `NEW.lote_saldo_despues_usd` in AFTER == `v_saldo_despues` computed in BEFORE. Substitution is semantically exact, not an approximation.

4. **Rollback block fidelity**: diffed the commented rollback function body (0122 lines 373–405) against 0105's live function (lines 103–139) with comment-lines and whitespace stripped (`grep -v '^\s*--'` + leading/trailing whitespace trim + blank-line removal):
   ```
   diff (normalized) → exit 0 (empty)
   ```
   Trigger declaration diff showed only a line-wrap difference (`CREATE TRIGGER ... BEFORE INSERT ...` split across 2 lines vs 1) — same SQL statement, confirmed by token-level inspection. ✅ Rollback restores the exact 0105 behavior.

**Verdict on byte-diff gate**: PASS. Independently re-executed, zero formula/threshold/column drift found.

### Split Correctness (Postgres Semantics)

**a. BEFORE/AFTER division of labor** — confirmed by reading the function bodies directly:
- BEFORE (`consumir_saf_lote`, lines 113–146): `SELECT...FOR UPDATE`, lote-not-found + overdraft `RAISE EXCEPTION`s, `NEW.lote_saldo_antes_usd`/`NEW.lote_saldo_despues_usd` assignment, `RETURN NEW`. **No UPDATE statement present.**
- AFTER (`consumir_saf_lote_after`, lines 158–198): `set_config(...)` + the relocated `UPDATE saf_creditos_lotes`, read-only access to `NEW` (no mutation — mutation of `NEW` in an `AFTER` trigger is a no-op in Postgres anyway, and none is attempted), `RETURN NULL`.
✅ Confirmed as designed.

**b. FOR UPDATE lock-lifetime reasoning (explicit)**:
Per Postgres documentation and the `supabase-postgres-best-practices` skill (`lock-short-transactions.md`): explicit row locks (`FOR UPDATE`) are held **until the transaction ends** (`COMMIT`/`ROLLBACK`), not until the statement ends. For a single `INSERT` statement with both a `BEFORE ROW` and an `AFTER ROW` trigger on the same table, Postgres executes: evaluate BEFORE trigger for the row → (if not discarded by `ON CONFLICT`) physically insert the row → fire AFTER ROW trigger — all as part of **one statement, inside one transaction**, with no intervening `COMMIT` between BEFORE and AFTER. Therefore the `FOR UPDATE` lock acquired in BEFORE is **unconditionally still held** when AFTER runs microseconds later. There is **no window** in which a concurrent consumer of the same `lote_id` could observe a stale balance between BEFORE and AFTER: any concurrent `SELECT ... FOR UPDATE` (or the BEFORE of a concurrent `saf_creditos_aplicaciones` INSERT targeting the same lote) blocks until this transaction commits or rolls back, by which time the AFTER's `UPDATE` has already applied (or been skipped, in the ROLLBACK case). This reasoning is identical in kind to Unit 1's verified lock-lifetime claim for `actualizar_saldo_cliente`, applied here to an *explicit* `FOR UPDATE` instead of an implicit single-row `UPDATE`.
✅ Confirmed, no correctness gap.

**c. `set_config('clarapos.trigger_context','saf_aplicacion',TRUE)` placement**: Confirmed present in AFTER (line 167), immediately before the `UPDATE`. Confirmed via reading `validate_saf_lote_update()` (migrations/0104, lines 126–144, **unchanged** by this migration) that it is exactly this context value the guard checks: `current_setting('clarapos.trigger_context', TRUE) IS DISTINCT FROM 'saf_aplicacion'` gates any attempt to change `saldo_disponible_usd`/`status` on `saf_creditos_lotes` outside this trigger. `set_config(..., TRUE)` uses `is_local=true` (transaction-scoped, not statement-scoped), so setting it in AFTER — moments after BEFORE ran in the same transaction — authorizes the UPDATE correctly. Same pattern already verified for Unit 1.
✅ Confirmed.

**d. Trigger declarations**: `DROP TRIGGER IF EXISTS trg_consumir_saf_lote` + new `BEFORE INSERT ... FOR EACH ROW`, and `DROP TRIGGER IF EXISTS trg_consumir_saf_lote_after` + new `AFTER INSERT ... FOR EACH ROW`, both on `public.saf_creditos_aplicaciones`, both idempotent (`IF EXISTS`). Postgres does not support `ALTER TRIGGER ... BEFORE→AFTER`, so `DROP`+`CREATE` is the only mechanism — correctly used.
✅ Confirmed.

### The Fix Actually Fixes It — TC-SAF-LOTE-RETRY-SIMULADO Reasoning

Traced manually against **both** the OLD (single-BEFORE, 0105) and NEW (split, 0122) function bodies for the exact scenario in the dry-run block (lote starts at $20; same `aplicacion` id INSERTed twice via `ON CONFLICT(id) DO NOTHING` inside one `DO $$...$$` block):

- **Attempt 1** (both old and new): BEFORE computes `lote_saldo_antes=20`, `lote_saldo_despues=15`; row inserts without conflict; AFTER (new) or inline UPDATE (old) applies `saldo_disponible_usd=15`.
- **Attempt 2, same `id`, OLD code**: Postgres evaluates `BEFORE ROW` for **every candidate row, including ones later discarded by `ON CONFLICT DO NOTHING`** — this is documented Postgres behavior and is the exact mechanism confirmed live in obs #6079 for the twin bug. BEFORE re-runs `SELECT...FOR UPDATE`, reads `saldo_disponible_usd=15` (from attempt 1), computes `v_saldo_despues=10`, and — critically — in the OLD single-BEFORE function, the `UPDATE saf_creditos_lotes SET saldo_disponible_usd=10` executes **unconditionally inside BEFORE**, before Postgres evaluates the `ON CONFLICT` clause. The side-effect UPDATE is **not** undone just because the INSERT itself is later discarded — only the row insertion is skipped. Result: `saldo_disponible_usd=10` (double-decremented, **test would FAIL**, asserting `v_saldo <> 15`).
- **Attempt 2, same `id`, NEW (split) code**: BEFORE still fires identically (can't be avoided — same Postgres semantics) and computes a now-discarded `NEW.lote_saldo_despues_usd=10` for the row that never gets inserted, but performs **no UPDATE**. Since the row is discarded by `ON CONFLICT DO NOTHING`, the `AFTER ROW` trigger — which Postgres does **not** fire for discarded candidate rows — never runs for attempt 2. Result: `saldo_disponible_usd` stays at `15` (test **passes**).

This is a genuine, correct proof that the split closes the gap, and that the test discriminates old-vs-new behavior exactly as claimed.

**Dry-run faithfulness**: The dry-run simulates the retry within a **single Postgres transaction** (one outer `BEGIN;`/`ROLLBACK;` wrapping one `DO $$...$$` block), whereas the real production bug (obs #6079) involved **three separate transactions / txids** from PowerSync's actual retry behavior. I judge this a **faithful approximation**, not a weaker test, because:
- The mechanism under test — "`BEFORE ROW` fires for every candidate row including ones discarded by `ON CONFLICT`, independent of transaction boundaries" — is a per-statement Postgres semantic that does not change whether the two INSERT attempts are in the same or different transactions.
- The only way transaction-boundary could matter is via locking/visibility across transactions; since `FOR UPDATE` locks are held until commit, two separate transactions attempting the same lote would simply serialize (2nd blocks until 1st commits) — producing the **same end state** as the sequential same-transaction simulation. There's no cross-transaction interaction that the single-transaction dry run masks.
- This is the **same level of approximation** already accepted for Unit 1's `TC-RETRY-SIMULADO` (per obs #6087, reasoned identically there).

Flagged for owner anyway per instructions (task 2.9, left unchecked): a **real** live-staging repro (force an actual double-send through the PowerSync connector, confirm `saldo_disponible_usd` nets correctly across two genuinely separate Postgres transactions/txids, mirroring obs #6079's methodology) is the only way to rule out any PowerSync-connector-specific interaction not visible from SQL alone (e.g., upload batching, retry backoff timing, `complete()` ack races). This is NOT something sdd-apply/sdd-verify can execute (no DB credentials, no live PowerSync connector in this session).

### Idempotency of the Migration
`CREATE OR REPLACE FUNCTION` (both functions) + `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` (both pairs) — re-running 0122 a second time: function bodies replaced with identical bodies (no-op), triggers dropped and recreated identically. No error paths, final state unchanged.
✅ Confirmed safe to re-run.

### Line-Count / Review-Burden Assessment
411 lines vs the design's own Unit 2 forecast of ~130–160 lines (obs #6082, finding #5) — a ~2.6x overrun, consistent with Unit 1's own overrun pattern (568 vs 180-220, already accepted and merged via PR #288). Breakdown:
- Header/rationale comments (lines 1–101): ~100 lines — this codebase's established convention since 0104/0105/0119/0121.
- Actual executable SQL (2 functions + 2 trigger pairs, lines 103–214): ~86 lines — close to a reasonable estimate for the real logic alone.
- Dry-run scaffolding (`TC-SAF-LOTE-SINGLE-FIRE` + `TC-SAF-LOTE-RETRY-SIMULADO`, commented, lines 216–359): ~120 lines — includes full disposable fixture construction (SAFC+SAF `movimientos_cuenta` rows + lote, via `gen_random_uuid()`) since no SQL test runner exists in this codebase, mirroring 0121's own precedent.
- Rollback block (lines 361–411): ~45 lines, necessarily restates the full original function body for exact restoration.

**Verdict**: Acceptable as a single PR. The overrun is structural (same rigor-over-brevity convention already validated and merged for Unit 1), not scope creep — no unrelated logic was added. Combined with README (+1 line) and tasks.md (+20/-10), total diff is 422 insertions / 10 deletions across 3 files, all directly attributable to this fix. Trimming would mean cutting self-asserting dry-run blocks or the byte-diff-gate documentation comment, which would reduce — not improve — review confidence given the absence of any automated SQL test runner.

### Spec Compliance Matrix
| Spec requirement (`saf-lote-trigger-idempotencia`) | Scenario | Evidence | Result |
|---|---|---|---|
| Idempotencia del consumo de lote SAF ante reenvío | Reenvío de la misma aplicación SAF no duplica el consumo | `TC-SAF-LOTE-RETRY-SIMULADO` dry-run, traced manually above | ✅ COMPLIANT (static proof; live confirmation deferred, task 2.9) |
| Comportamiento idéntico para INSERT único (sin regresión) | Consumo único de lote SAF | `TC-SAF-LOTE-SINGLE-FIRE` dry-run + byte-diff gate (BEFORE block unchanged) | ✅ COMPLIANT |
| Disparo único por fila durable, auditoría de lote preservada | Auditoría se calcula sin efecto secundario / fila descartada no dispara consumo | Structural: BEFORE has no UPDATE, AFTER reads but doesn't mutate NEW; `ON CONFLICT`+`AFTER ROW` semantics reasoned explicitly above | ✅ COMPLIANT |

### Issues Found

**CRITICAL**: None.

**WARNING**: None. (Task 2.9 — real cross-transaction live-staging repro — is explicitly deferred by design, not a gap in this branch's own completeness; same pattern already accepted for Unit 1.)

**SUGGESTION**:
1. Line count (411 lines) is high relative to forecast but judged acceptable given this codebase's established convention (see Line-Count Assessment above) — no action required, flagging only for owner awareness when reviewing the PR diff size.
2. When Unit 3 (staging cleanup script) and the eventual twin-bug-#3 follow-up (`anular_saf_lote_reversa()` / `migrations/0113_saf_creditos_reversas.sql`) are tackled, the same BEFORE/AFTER split pattern and byte-diff-gate discipline established in 0121/0122 should be reused — already flagged out-of-scope correctly here, not a defect, just a forward note.

### What Was Verified Statically (by me, this session) vs What Requires Owner Live-Staging Run

**Verified statically by me (this session, independent of the apply's self-report)**:
- Branch base, diff stat, scope guards (0113/connector.ts/0121 untouched), clean working tree.
- Byte-diff of the retained BEFORE block (own `awk`+`diff`+`md5sum`, matches claimed md5 `72bea7f0...`).
- Byte-diff of the relocated UPDATE block modulo the one documented substitution (own `awk`+`sed`+`diff`).
- Semantic equivalence of the `v_saldo_despues` → `NEW.lote_saldo_despues_usd` substitution (NEW column reflects the BEFORE-computed value).
- Rollback block normalized-diff against live 0105 (comment/whitespace-stripped).
- `FOR UPDATE` lock-lifetime reasoning (transaction-scoped, not statement-scoped) via Postgres semantics + `supabase-postgres-best-practices` skill's `lock-short-transactions.md`.
- `set_config` context-guard placement reasoning against `validate_saf_lote_update()`'s actual check (migrations/0104, unchanged).
- Trigger declaration correctness (BEFORE/AFTER pair, idempotent DROP+CREATE, no other triggers on the table to interfere).
- Manual trace of `TC-SAF-LOTE-RETRY-SIMULADO` against both OLD and NEW function bodies, confirming the test discriminates correctly and the dry-run's single-transaction simulation is a faithful (not weaker) approximation of the real multi-transaction retry mechanism.
- Migration idempotency (safe to re-run) by code reading.

**Requires owner live-staging run (NOT executable in this session — no DB credentials, no live PowerSync connector)**:
- Actually executing the commented `DO $$...$$` dry-run blocks (`TC-SAF-LOTE-SINGLE-FIRE`, `TC-SAF-LOTE-RETRY-SIMULADO`) inside real `BEGIN;...ROLLBACK;` against a real Postgres instance, to confirm no syntax/runtime error and that the `RAISE EXCEPTION` assertions actually pass.
- The real cross-transaction re-send repro (task 2.9): force an actual PowerSync retry/double-send of the same `saf_creditos_aplicaciones` row through the real connector (kill the upload ack before `complete()` once, as done for obs #6079's FAC repro) and confirm `saf_creditos_lotes.saldo_disponible_usd` nets to the single-application value across genuinely separate transactions/txids.
- Applying 0122 itself against a real staging database to confirm `CREATE OR REPLACE FUNCTION`/`DROP TRIGGER`/`CREATE TRIGGER` all execute without error in this schema's actual current state.

### Final Verdict

**PASS WITH WARNINGS** → downgraded to **PASS** (no CRITICAL or blocking WARNING found; only forward-looking SUGGESTIONs). **PR-ready: YES**, with the explicit caveat (already correctly flagged in tasks.md 2.9) that the owner must run the live-staging dry-run blocks and the real retry repro before/shortly after merge, same as was done for Unit 1.
