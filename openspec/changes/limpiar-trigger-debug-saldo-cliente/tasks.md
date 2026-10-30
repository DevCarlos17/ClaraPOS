# Tasks: Limpiar debug temporal del trigger actualizar_saldo_cliente()

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-350 (0120 migration ~250-300, cleanup script ~30-40, README +1) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR, 3 work-unit commits (migration, cleanup script, README) |
| Delivery strategy | single-pr-default |
| Chain strategy | stacked-to-develop (chain of 1) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-develop
400-line budget risk: Medium

Already decided in session config (chain of 1, single-pr-default) — no owner decision needed before apply. If actual diff exceeds 400 lines during apply, request `size:exception` rather than splitting (mechanical function redefinition must stay atomic in one file).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `migrations/0120_limpiar_trigger_debug_saldo_cliente.sql` (function + dry-run) | PR 1 | Base `origin/develop`. Byte-diff vs 0119 is the verification. |
| 2 | `migrations/cleanup_test_clients_saldo.sql` (non-numbered) | PR 1 | Same PR, separate commit — no DDL, data-only. |
| 3 | `migrations/README.md` row for 0120 | PR 1 | Same PR, docs-with-change commit. |

## Phase 1: Branch Setup

- [x] 1.1 `git fetch origin develop` then create `fix/limpiar-trigger-debug-saldo-cliente` off `origin/develop` (0119 already merged there, PR #286 — confirmed base is current).

## Phase 2: Migration 0120 (function redefinition)

- [x] 2.1 Create `migrations/0120_limpiar_trigger_debug_saldo_cliente.sql`: header comment stating intent (remove `[TRIGGER-FIRE]` debug `RAISE WARNING` + its `-- [TEMPORAL]` comment, zero behavior change), `Depends: 0119`.
- [x] 2.2 `BEGIN;` + `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` with body copied **verbatim** from `migrations/0119_fix_trigger_saldo_actual_y_reconciliacion.sql` lines 191-327 (0119's body has no debug line already — reproduce it byte-identical, do not touch any CASE/formula/assertion). `COMMIT;`.
- [x] 2.3 Append commented `BEGIN;...ROLLBACK;` dry-run block: single `INSERT INTO movimientos_cuenta` (tipo `FAC`, placeholder test IDs) + `SELECT saldo_actual, saldo_pendiente_usd FROM clientes` proving the trigger fires exactly once with the correct delta (same pattern as 0119's TC1-TC6 trailer).

## Phase 3: Test Client Cleanup Script

- [x] 3.1 Create `migrations/cleanup_test_clients_saldo.sql` (non-numbered, precedent: `cleanup_operacional.sql`): `SELECT set_config('clarapos.trigger_context','mov_cuenta',TRUE);` then single `UPDATE clientes SET saldo_actual=0, saldo_pendiente_usd=0, updated_at=NOW() WHERE id IN ('c5bad9f2-a1ff-4cfb-af72-b83e3b37243e','b32a93e6-449d-43cf-8da1-3eda9b77a94e') AND empresa_id='54a918bd-2f11-442b-b6aa-47f0b4a96048';`. Never touch `movimientos_cuenta`.

## Phase 4: Docs & Verification

- [x] 4.1 Add `0120` row to `migrations/README.md` table, describing the debug-line removal and pointing to the 0119 byte-diff.
- [x] 4.2 Run `diff` of 0120's function body (lines between `CREATE OR REPLACE FUNCTION` and `$$ LANGUAGE plpgsql;`) against 0119's — must be byte-identical; flag and halt if not. **Result: 0 differences, 137 lines each, confirmed byte-identical.**
- [ ] 4.3 Note for owner (staging, manual): apply 0120 via SQL Editor, confirm `pg_get_functiondef('actualizar_saldo_cliente'::regproc)` has no `[TRIGGER-FIRE]`/`RAISE WARNING`; run cleanup script; confirm CLIENTE TEST 9/11 at saldo_actual=0, saldo_pendiente_usd=0.

## Verification Note (no SQL runner in-repo)

`strict_tdd` does not apply — SQL-only change, no Postgres test harness exists in this repo. Verification = (a) the commented `BEGIN;...ROLLBACK;` dry-run block in 0120 (owner runs manually in staging) and (b) the byte-diff check in task 4.2, not Vitest/unit tests. `sdd-verify` should expect these two artifacts, not a test suite.
