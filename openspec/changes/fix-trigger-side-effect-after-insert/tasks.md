# Tasks: Move Trigger Side-Effects from BEFORE to AFTER INSERT

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Unit 1: ~180-220 · Unit 2: ~130-160 · Unit 3: ~60-90 · Total: ~370-470 |
| 400-line budget risk | High (combined) / Low (per unit) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (`actualizar_saldo_cliente` split) → PR 2 (`consumir_saf_lote` split) → PR 3 (cleanup script) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — ask owner: stacked-to-main vs feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Split `actualizar_saldo_cliente()` BEFORE/AFTER (`movimientos_cuenta`→`clientes`) | PR 1 | Base: main (or tracker, per chosen strategy). Depends on PR #287 (0120) merged. Self-contained: migration + byte-diff + dry-run + README row. |
| 2 | Split `consumir_saf_lote()` BEFORE/AFTER (`saf_creditos_aplicaciones`→`saf_creditos_lotes`) | PR 2 | Base: PR 1's branch (same migration file 0121, appended section) or main if squashed first. Independent correctness proof, no shared code with Unit 1. |
| 3 | Staging cleanup script for corrupted test clients | PR 3 | Base: PR 2's branch or main. BLOCKED on owner providing real UUIDs — do not invent placeholders. |

**Owner decision needed before apply**: chain strategy (stacked-to-main vs feature-branch-chain) AND whether Unit 2 should fold in the twin-bug #3 (`anular_saf_lote_reversa()`, migration 0113) fix or stay strictly out of scope as a follow-up change.

---

## Phase 0: Pre-flight

- [x] 0.1 Confirm `migrations/0120_limpiar_trigger_debug_saldo_cliente.sql` (PR #287) is merged to the target base branch — 0121 builds on its exact body, not the debug-instrumented one. **Confirmed**: `git log` shows merge commit `0989bcb0` (PR #287) on `develop`, `0120_limpiar_trigger_debug_saldo_cliente.sql` present in `migrations/`.
- [x] 0.2 Ask the owner for the chain strategy (stacked-to-main / feature-branch-chain) and record the answer before creating PR 1. **Resolved**: `stacked-to-main` (cached session decision, provided at apply time).
- [ ] 0.3 Ask the owner: fold twin-bug #3 (`anular_saf_lote_reversa()`, migration 0113, same BEFORE+side-effect shape, flagged in design.md Open Questions) into this change, or file it as a separate follow-up SDD change. Do NOT touch migration 0113 until this is answered. **Not applicable to Unit 1** — this decision only gates Unit 2 scope; deferred to the Unit 2 apply batch.

## Phase 1: Unit 1 — `actualizar_saldo_cliente()` BEFORE/AFTER split (PR 1)

- [x] 1.1 Create `migrations/0121_mover_side_effect_a_after_insert.sql` with a header comment (same density/convention as 0119/0120) explaining the root cause (obs #6079: 1 INSERT, 3 retried txids, 3 side-effect UPDATEs) and the fix.
- [x] 1.2 In 0121, add `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` — slimmed `BEFORE INSERT` body per design.md §Interfaces/Contracts #1 (keeps only the `saldo_nuevo` IF/ELSIF mutation + SAF/REV assertions; `RETURN NEW`). Byte-match the IF/ELSIF/assertion block against 0120's current body (no formula edits). **Verified**: `diff`/`md5sum` on lines 71-110 of 0120 vs. the new function body — identical (md5 `2ca29c99...`).
- [x] 1.3 In 0121, add `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente_after()` — new `AFTER INSERT` function per design.md §Interfaces/Contracts #2: `PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE)` + the full `UPDATE clientes SET saldo_actual/saf_disponible/saldo_pendiente_usd/updated_at ... WHERE id = NEW.cliente_id` block, `RETURN NULL`.
- [x] 1.4 Byte-diff gate: extract the `UPDATE clientes` block from 0120 (lines ~115-191) and the new block in `actualizar_saldo_cliente_after()`; diff them (e.g. `awk` range extraction + `diff`/`md5sum`) and confirm textually identical. Record the diff command + result as a comment in 0121. **Executed**: `diff` produced no output, `md5sum` identical on both sides (`e110241b...`). Command + result documented inline in 0121 (BYTE-DIFF GATE comment block) and in this file's apply-progress.
- [x] 1.5 In 0121, add `DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente ON movimientos_cuenta; CREATE TRIGGER trg_actualizar_saldo_cliente BEFORE INSERT ... EXECUTE FUNCTION actualizar_saldo_cliente();` and the new `DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente_after ...; CREATE TRIGGER trg_actualizar_saldo_cliente_after AFTER INSERT ... EXECUTE FUNCTION actualizar_saldo_cliente_after();` per design.md §Interfaces/Contracts #3.
- [x] 1.6 Add dry-run block `TC-UNICO-FIRE` (regression, unchanged from 0120 shape): `BEGIN; INSERT` one row per tipo (`FAC`, `PAG`, `REV`, `SAF`, `SAFV`, `SAFC`, `SAFR`, `SAL`, `NDB`, `NCR`) against a disposable staging test client; `SELECT saldo_actual, saldo_pendiente_usd, saf_disponible`; assert exactly one delta each; `ROLLBACK`. **Implemented as** `TC-UNICO-FIRE-MATRIX`: a single `DO $$...$$` block (not manual-eyeball `SELECT` comments) with `RAISE EXCEPTION` self-assertions per tipo — stronger than the 0120 precedent since there's no test runner for SQL.
- [x] 1.7 Add dry-run block `TC-RETRY-SIMULADO` (the fix): `BEGIN;` reset a test client's saldo to 0 → run 3× `INSERT INTO movimientos_cuenta (id, ...) VALUES ($same_id, ...) ON CONFLICT (id) DO NOTHING` with the SAME `id` (mirrors the connector's exact retry pattern) → `SELECT saldo_pendiente_usd` → assert ONE net delta (not 3×) → `ROLLBACK`. **Implemented** as a `DO $$...$$` block asserting both `count(*) = 1` (row-level proof `ON CONFLICT` discarded the 2 retries) and `saldo_pendiente_usd = 1` (not 3) via `RAISE EXCEPTION`.
- [x] 1.8 Add a commented rollback block in 0121: `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` restored to the 0120 single-BEFORE body (UPDATE re-inlined) + `DROP TRIGGER trg_actualizar_saldo_cliente_after` + `DROP FUNCTION actualizar_saldo_cliente_after()`.
- [x] 1.9 Update `migrations/README.md`: add the `0121` row to the migrations table, following the existing row format/density (purpose, root cause reference, byte-diff note).
- [ ] 1.10 Live-staging repro checklist (document in PR description, do not auto-run): re-run the exact 3-fire scenario from obs #6079 (same $1 FAC, forced multi-retry via PowerSync) — confirm `saldo_pendiente_usd = $1`, not $3. **Deferred to PR description / sdd-verify** — requires a real staging PowerSync connector, not something sdd-apply can execute. Checklist text: (1) apply 0121 to staging, (2) force the same multi-retry FAC $1 scenario as obs #6079 (same mechanism: kill the upload ack before `complete()` 2-3 times), (3) confirm `clientes.saldo_pendiente_usd = 1`, not `3`, (4) confirm `movimientos_cuenta` still has exactly 1 row for that `id`.

## Phase 2: Unit 2 — `consumir_saf_lote()` BEFORE/AFTER split (PR 2)

- [ ] 2.1 In 0121 (new section, or a follow-on migration if the owner chose stacked PRs with separate files), add `CREATE OR REPLACE FUNCTION public.consumir_saf_lote()` — slimmed `BEFORE INSERT` body per design.md §Interfaces/Contracts #4: keeps `SELECT ... FOR UPDATE`, overdraft `RAISE EXCEPTION`, `NEW.lote_saldo_antes_usd`/`NEW.lote_saldo_despues_usd` assignment, `RETURN NEW`. Removes `PERFORM set_config` + `UPDATE saf_creditos_lotes`.
- [ ] 2.2 Add `CREATE OR REPLACE FUNCTION public.consumir_saf_lote_after()` — new `AFTER INSERT` function per design.md §Interfaces/Contracts #5: `PERFORM set_config('clarapos.trigger_context', 'saf_aplicacion', TRUE)` + `UPDATE public.saf_creditos_lotes SET saldo_disponible_usd = NEW.lote_saldo_despues_usd, status = CASE ... END, updated_at = NOW() WHERE id = NEW.lote_id`, `RETURN NULL`. Reads `NEW.lote_saldo_despues_usd` — do NOT re-`SELECT` (Decision #3, FOR UPDATE lock from BEFORE is held through AFTER in the same transaction).
- [ ] 2.3 Byte-diff gate: extract the `UPDATE saf_creditos_lotes` block from 0105 and the new block in `consumir_saf_lote_after()`; diff them, confirming identical modulo the `v_saldo_despues` → `NEW.lote_saldo_despues_usd` substitution (the only intentional change). Record the diff result as a comment.
- [ ] 2.4 Add `DROP TRIGGER IF EXISTS trg_consumir_saf_lote ON public.saf_creditos_aplicaciones; CREATE TRIGGER trg_consumir_saf_lote BEFORE INSERT ... EXECUTE FUNCTION public.consumir_saf_lote();` and `DROP TRIGGER IF EXISTS trg_consumir_saf_lote_after ...; CREATE TRIGGER trg_consumir_saf_lote_after AFTER INSERT ... EXECUTE FUNCTION public.consumir_saf_lote_after();` per design.md §Interfaces/Contracts #6.
- [ ] 2.5 Add dry-run block for single-fire regression on `saf_creditos_aplicaciones`/`saf_creditos_lotes`: `BEGIN;` create a disposable lote with known `saldo_disponible_usd`; single `INSERT` into `saf_creditos_aplicaciones`; `SELECT saldo_disponible_usd, status`; assert correct single decrement; `ROLLBACK`.
- [ ] 2.6 Add dry-run block for the retry fix: `BEGIN;` reset test lote → 2× `INSERT INTO saf_creditos_aplicaciones (id, ...) VALUES ($same_id, ...) ON CONFLICT (id) DO NOTHING` with the SAME `id` → `SELECT saldo_disponible_usd` → assert ONE net decrement (not 2×) → `ROLLBACK`.
- [ ] 2.7 Add a commented rollback block: `CREATE OR REPLACE FUNCTION public.consumir_saf_lote()` restored to the 0105 single-BEFORE body + `DROP TRIGGER trg_consumir_saf_lote_after` + `DROP FUNCTION public.consumir_saf_lote_after()`.
- [ ] 2.8 Update `migrations/README.md` 0121 row (or add a dedicated note) to mention both trigger pairs covered by the migration.
- [ ] 2.9 Live-staging repro checklist: construct a SAF-lote double-send scenario (mirrors obs #6079's FAC repro but on `saf_creditos_aplicaciones`) and confirm `saldo_disponible_usd` nets to the single-application value, not doubled.
- [ ] 2.10 Scope guard check: confirm NO changes were made to `anular_saf_lote_reversa()` / migration `0113_saf_creditos_reversas.sql` in this PR, unless Phase 0.3 explicitly decided to fold it in — if folded in, add a parallel sub-phase mirroring 2.1-2.7 for that trigger pair instead of silently expanding this PR's diff.

## Phase 3: Unit 3 — Staging cleanup script (PR 3)

- [ ] 3.1 BLOCKED: obtain from the owner the real staging UUIDs of corrupted test client(s) (e.g. "CLIENTE TEST 14" mentioned in context) and their `empresa_id`. Do NOT invent placeholder UUIDs.
- [ ] 3.2 Once UUIDs are provided, create `migrations/cleanup_test_clients_saldo_0121.sql` (non-numbered, staging-only) following the exact structure/warnings of `migrations/cleanup_test_clients_saldo.sql`: header disclaimer (staging-only, hardcoded IDs), `set_config('clarapos.trigger_context', 'mov_cuenta', TRUE)` authorization channel, `UPDATE clientes SET saldo_actual = 0, saldo_pendiente_usd = 0, updated_at = NOW() WHERE id IN (...) AND empresa_id = '...'`, commented verification `SELECT` block.
- [ ] 3.3 Confirm the script never touches `movimientos_cuenta` (immutable ledger) — INSERT/UPDATE/DELETE all forbidden there, same as the precedent script.
- [ ] 3.4 Note in the PR description that this script is NOT part of the mandatory migration history (non-numbered, same precedent class as `cleanup_all_data.sql`/`cleanup_operacional.sql`/`cleanup_transaccional.sql`/`cleanup_test_clients_saldo.sql`) and must never run in production.

## Phase 4: Final verification (after all units applied)

- [ ] 4.1 Re-run the full tipo matrix (`FAC`/`PAG`/`REV`/`SAF`/`SAFV`/`SAFC`/`SAFR`/`SAL`/`NDB`/`NCR`) as a staging smoke test, confirming behavior unchanged vs. pre-0121 for single (non-retried) inserts.
- [ ] 4.2 Re-run the exact confirmed-live 3-fire repro from obs #6079 end-to-end through the real PowerSync connector (not just SQL dry-run) and confirm `saldo_pendiente_usd = $1`.
- [ ] 4.3 Confirm migration 0121 rollback block (`BEGIN; <rollback>; ROLLBACK;`) dry-run restores 0120/0105 bodies byte-for-byte.
- [ ] 4.4 Confirm `src/core/db/powersync/connector.ts` `IMMUTABLE_TABLES`/`ignoreDuplicates` logic was NOT touched — this change is Postgres-trigger-only, no frontend/connector diff.

## Out of Scope (explicit reminders)

- `anular_saf_lote_reversa()` (migration `0113_saf_creditos_reversas.sql`) — confirmed identical defective shape (twin-bug #3), but is a SEPARATE future SDD change unless Phase 0.3 explicitly folds it in.
- No changes to saldo formulas, CASE branches, or rounding tolerances — this change is a pure BEFORE→AFTER timing relocation (byte-identical computation).
- No changes to `src/core/db/powersync/connector.ts` (`ignoreDuplicates`, retry/upload logic) — the fix lives entirely in Postgres trigger timing.
