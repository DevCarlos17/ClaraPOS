## Verification Report

**Change**: limpiar-trigger-debug-saldo-cliente (epic: reverso-abono-tesoreria)
**Version**: N/A (no OpenSpec capability changed — pure instrumentation removal + test-data cleanup)
**Mode**: Standard (Strict TDD does not apply — SQL-only migration, no Postgres test runner in repo, per tasks.md "Verification Note")

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 8 (6 checked, 1 intentionally unchecked, 1 is the Phase-1 branch task) |
| Tasks complete | 7/8 |
| Tasks incomplete | 1/8 (4.3 — owner-only manual staging apply; correctly left unchecked, requires DB credentials this session does not have) |

### Build & Tests Execution
No build/test runner applies (SQL-only change, declared in tasks.md "Verification Note"). Evidence substituted per the session's explicit instruction:

**Byte-diff (independently re-executed by this verify pass, not trusted from apply's claim)**:
```text
awk '/^CREATE OR REPLACE FUNCTION actualizar_saldo_cliente/,/^\$\$ LANGUAGE plpgsql;$/' \
  migrations/0119_fix_trigger_saldo_actual_y_reconciliacion.sql > f0119.txt
awk '/^CREATE OR REPLACE FUNCTION actualizar_saldo_cliente/,/^\$\$ LANGUAGE plpgsql;$/' \
  migrations/0120_limpiar_trigger_debug_saldo_cliente.sql > f0120.txt
diff f0119.txt f0120.txt   → (no output — zero differences)
wc -l  → 137 lines / 137 lines
md5sum → 035a56396eea3c772f4d588a55b253ad  (both files, identical)
```
Result: **CONFIRMED byte-identical.** No formula, CASE, or assertion drift. The `[TRIGGER-FIRE]` debug `RAISE WARNING` line and its `-- [TEMPORAL]` comment are absent from the executable function body in 0120 (confirmed by independent grep below).

**Dry-run block (static read, not executed — no DB credentials available this session)**: 0120's commented `TC-UNICO-FIRE` block (lines 210-230) zeroes a test client, inserts a single `FAC $1` row, and asserts `saldo_pendiente_usd=1, saldo_actual=1` — correctly proves single-fire/no-double-count. Entire block is wrapped `BEGIN;...ROLLBACK;`, so it has zero persistent effect if run. Logic is correct and consistent with the formula being redefined.

**Coverage**: N/A — not applicable to this change type.

### Spec Compliance Matrix
No OpenSpec capability was declared New/Modified (proposal.md confirms "None — limpieza de instrumentación interna"). No spec scenarios to map. N/A.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| 0120 function body byte-identical to 0119 | ✅ Verified | Independent diff + md5sum, 137/137 lines, zero differences |
| `[TRIGGER-FIRE]` / `RAISE WARNING` absent from executable SQL | ✅ Verified | `grep` hits only inside header-comment prose (lines 10-11, 28-29, 53), never in live code |
| No write to `movimientos_cuenta` in executable SQL | ✅ Verified | Only hit for `movimientos_cuenta` + `INSERT` is inside the commented dry-run block (line 217), which is inside `BEGIN;...ROLLBACK;` |
| Cleanup script multi-tenant filter | ✅ Verified | `WHERE id IN (...) AND empresa_id = '54a918bd-...'` — both the 2 specific UUIDs AND empresa_id required |
| `set_config('clarapos.trigger_context','mov_cuenta',TRUE)` channel used | ✅ Verified | Present in cleanup script line 30, before the `UPDATE clientes` |
| Transaction safety — 0120 | ✅ Verified | `BEGIN;` (line 58) / `COMMIT;` (line 198) wraps the `CREATE OR REPLACE FUNCTION` |
| Transaction safety — cleanup script | ✅ Verified | `BEGIN;` (line 28) / `COMMIT;` (line 43) wraps the `UPDATE` |
| 0120 has commented rollback guidance | ✅ Verified | Header lines 48-55: re-apply the same `CREATE OR REPLACE FUNCTION` (functionally identical since 0120 IS 0119's body) |
| Scope — no `src/` touched | ✅ Verified | `git status --porcelain \| grep src/` → empty |
| Scope — no other migration edited | ✅ Verified | `git diff --stat -- migrations/` shows only `README.md \| 1 +` |
| Scope — README has exactly the 0120 row | ✅ Verified | `git diff migrations/README.md` → single `+` line, row for 0120, correctly placed after 0119 |
| Scope — `.atl/*` noise not staged | ✅ Verified | `git status` shows `.atl/*` as unstaged modifications ("Changes not staged for commit"); `git diff --cached --stat` is empty |
| Migration numbering — no collision | ✅ Verified | `ls migrations/` shows exactly one `0120_*` file, sequential after `0119_*` |
| Review budget (400 lines) | ✅ Within budget | 0120 (230) + cleanup script (57) + README (+1) = 288 lines of core reviewable diff |

### Coherence (Design / Task Plan)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| 0120 stays numbered/permanent (mechanical `CREATE OR REPLACE`) | ✅ Yes | Matches proposal's "Approach" rationale |
| Cleanup script stays non-numbered, staging-only | ✅ Yes | Follows precedent (`cleanup_operacional.sql` etc.), filename `migrations/cleanup_test_clients_saldo.sql` matches tasks.md exactly |
| 0120 reproduces only 0119 Parte 1 (function), not Parte 2 (one-time reconciliation DO block) | ✅ Yes | Correct — Parte 2 was a one-time data fix already executed by 0119, not part of the function's permanent definition |
| Task 4.2 byte-diff gate executed before delivery | ✅ Yes | tasks.md records "0 differences, 137 lines each" — independently reproduced identically by this verify pass |
| Task 4.3 (owner-only DB apply) left undone | ✅ Expected | No DB credentials this session; correctly unchecked, not silently skipped |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **proposal.md filenames are stale vs. what was actually built.** `proposal.md` (obs #6052, created first) names the files as `migrations/0120_limpiar_debug_trigger_saldo_cliente.sql` and `migrations/cleanup_test_clientes_saldo_doble_fire.sql`. The actual files on disk — matching `tasks.md` exactly — are `migrations/0120_limpiar_trigger_debug_saldo_cliente.sql` and `migrations/cleanup_test_clients_saldo.sql`. This is cosmetic (tasks.md and code agree, and are what ships), but `proposal.md` was never updated after the filenames were finalized in the tasks phase. Recommend a 1-line edit to proposal.md for consistency before archive.
2. **Cleanup script resets `saldo_actual`/`saldo_pendiente_usd` to 0 but never touches or verifies `saf_disponible`.** The canonical invariant established by 0119 is `saldo_actual = saldo_pendiente_usd - saf_disponible`. Setting both sides of that equation to 0 while leaving `saf_disponible` unexamined is only safe if `saf_disponible` is already 0 for both test clients (plausible given the bug context — orphan `REV` from a trigger double-fire, not a SAF/credit flow — but not verified in this session, no DB access). Recommend the owner's manual staging run (task 4.3) also check `saf_disponible` for both clients and either confirm it is 0 or extend the cleanup script to zero it, to keep the canonical identity intact after the reset.

**SUGGESTION**:
1. The cleanup script's commented verification `SELECT` (lines 50-57) only checks `saldo_actual`/`saldo_pendiente_usd`. Consider adding `saf_disponible` to that SELECT so the owner's manual confirmation step (task 4.3) also surfaces WARNING #2 above if it turns out to be non-zero.

### Verdict
**PASS WITH WARNINGS** — Byte-diff independently reproduced and confirmed identical (137/137 lines, matching MD5); debug line confirmed absent from all executable SQL; immutability, multi-tenant filter, `set_config` channel, transaction wrapping, and scope (no `src/`, no other migrations, `.atl` noise unstaged, 288 lines within the 400-line budget) all verified directly against the working tree. The two WARNINGS are non-blocking: one is a stale cross-reference in `proposal.md`, the other is an unverifiable-without-DB-access data assumption (`saf_disponible=0` for the 2 test clients) that the owner's already-scheduled manual staging step (task 4.3) should confirm.
