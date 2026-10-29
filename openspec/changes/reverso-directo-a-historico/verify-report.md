# Verification Report

**Change**: `reverso-directo-a-historico`
**Version**: N/A (no formal version tag; spec delta at `openspec/changes/reverso-directo-a-historico/specs/tesoreria-reverso-abono-directo/spec.md`)
**Mode**: Standard (adversarial fresh-context review; Strict TDD explicitly OFF per owner override)
**Branch**: `feat/tesoreria-reverso-directo-a-historico` (HEAD `dd59577`, confirmed `== git merge-base HEAD origin/develop` — no commits yet, all changes are uncommitted working-tree diffs vs `origin/develop`)

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 6 |
| Tasks complete | 5 |
| Tasks incomplete | 1 (4.1 — explicitly SKIPPED PER OWNER OVERRIDE: "Do NOT run the full test suite") |

Task 4.1 skip is a **legitimate owner-approved skip**, not a gap — the owner's verify-phase instructions in this same session repeat the same restriction ("Run ONLY the two touched test files"). Not counted against the verdict.

## Build & Tests Execution

**Tests**: ✅ 2 files passed / 15 tests passed / 0 failed
```text
$ yarn test:run src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx

✓ src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts (10 tests) 125ms
✓ src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx (5 tests) 1438ms

Test Files  2 passed (2)
     Tests  15 passed (15)
  Duration  12.95s
```
Full suite intentionally NOT run (owner override, both in apply and in verify launch prompt). Scoped-command compliance confirmed.

**Coverage**: Not available (no coverage run requested/performed, consistent with scoped-test mandate).

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Reverso simple (1 factura, sin SAF) | Ingreso de $100 que paga 1 factura completa — egreso con `validado=1`, `validado_por`, `validado_at` poblados | `use-reverso-abono-directo.test.ts > escenario simple ($100, 1 factura, sin SAF)` (line ~150-157) | ✅ COMPLIANT |
| Reverso simple (1 factura, sin SAF) | El egreso-reverso aterriza directo en Histórico como Validado, solo con Desconciliar | `conciliacion-tesoreria.test.tsx > reverso de abono directo aterriza en Historico como Validado > la fila del reverso aparece en Historico...` | ✅ COMPLIANT |
| Reverso de abono global (N facturas, sin SAF) | Ingreso `38201beb` reversa 2 facturas con 1 solo egreso, `validado=1` | `use-reverso-abono-directo.test.ts > abono global 2 facturas ($2 total, $1+$1)` (line ~393-396) | ✅ COMPLIANT |
| Reverso de abono global (N facturas, sin SAF) | N=3 facturas, 1 solo egreso, `validado=1` | `use-reverso-abono-directo.test.ts > abono global 3 facturas ($3 total)` (line ~448-451) | ✅ COMPLIANT |
| Reverso simple | Desconciliar click wires to `desconciliarMovBancario`, not ReversoModal | `conciliacion-tesoreria.test.tsx > click en "Desconciliar"...` | ✅ COMPLIANT |

**Compliance summary**: 5/5 scenarios compliant (every MODIFIED requirement in the spec delta has a passing covering test).

## Correctness (Static Evidence, file:line)

### 1. Insert correctness — ✅ VERIFIED, exact column/param alignment confirmed

`src/features/tesoreria/hooks/use-reverso-abono-directo.ts:164-189`:
```sql
INSERT INTO movimientos_bancarios
   (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
    doc_origen_id, doc_origen_tipo, referencia, descripcion, validado, validado_por, validado_at,
    reversado, reverso_de, fecha, created_at, created_by)
 VALUES (?, ?, ?, 'EGRESO', 'REVERSO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
with params `[egresoId, empresaId, mov.banco_empresa_id, mov.monto, saldoAnterior, saldoNuevo, mov.doc_origen_id, mov.doc_origen_tipo, null, motivo, 1, userId, now, 0, ingresoId, todayStr(), now, userId]`.

Manually walked the 15 non-literal columns against the 15 corresponding params (post `tipo`/`origen` literals): `monto→mov.monto, saldo_anterior→saldoAnterior, saldo_nuevo→saldoNuevo, doc_origen_id→mov.doc_origen_id, doc_origen_tipo→mov.doc_origen_tipo, referencia→null, descripcion→motivo, validado→1, validado_por→userId, validado_at→now, reversado→0, reverso_de→ingresoId, fecha→todayStr(), created_at→now, created_by→userId`. **Perfect 1:1 alignment** — `validado_por` and `validado_at` are real, correctly-positioned bind params, not a flipped literal or a cosmetic no-op.

`validado_por` sourcing — confirmed identical pattern to `validarMovBancario`:
- `src/features/tesoreria/components/reverso-modal.tsx:196` → `ejecutarReversoDirecto(user.id, user.nombre, ...)` where `user` comes from `useCurrentUser()` (line 84, 16).
- `src/features/tesoreria/components/reverso-modal.tsx:154-159` → `reversarAbonoDirectoDesdeTesoreria({ ..., userId, ... })` passes that same `user.id` through.
- Compare: `src/features/tesoreria/components/conciliacion-tesoreria.tsx:307` → `validarMovBancario(id, user.id)` — the canonical gate's `validado_por` source is also `user.id` from the same `useCurrentUser()` hook.
- **No hardcoded/null/placeholder value anywhere in the call chain.** The acting user is the real authenticated user in both paths.

### 2. Balance invariant — ✅ VERIFIED, unchanged

`use-reverso-abono-directo.ts:152-160` (unchanged by this diff): `saldoAnterior`/`saldoNuevo`/`montoEgreso` computation is byte-identical to the pre-change version. The `UPDATE bancos_empresa SET saldo_actual = ?` call (line 191-194) is untouched — same single decrement, same timing (inside the same `tx`, right after the INSERT), regardless of the `validado` value. Confirmed via `git diff HEAD` — the diff touches ONLY the INSERT's column list, placeholder count, and the `validado`/`validado_por`/`validado_at` 3 params; zero lines touched in the balance-math block. No double-decrement, no skipped decrement.

Multi-factura fan-in (`use-reverso-abono-directo.test.ts:400-401` for N=2, no change needed for N=3 since balance math is pre-existing and untouched): `UPDATE bancos_empresa` params still `['498.00000000', ..., 'banco-1', 'emp-1']` for the $2 total case — one decrement by the TOTAL, not per-pago. Pre-existing assertion, re-verified passing.

### 3. Gate regression — ✅ VERIFIED, real assertions, zero gate-code diff

`conciliacion-tesoreria.test.tsx:276-293` (new describe block) asserts, with a mocked row `{ validado: 1, reversado: 0, origen: 'REVERSO' }`:
- Historico tab: `expect(screen.getByText('Validado')).toBeInTheDocument()`, `expect(screen.getByRole('button', { name: 'Desconciliar' })).toBeInTheDocument()`
- `expect(screen.queryByRole('button', { name: 'Reversar' })).not.toBeInTheDocument()`
- `expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()`
- `expect(screen.queryByRole('button', { name: 'Conciliar' })).not.toBeInTheDocument()`
- Pendientes tab stays empty: `expect(screen.getByText('No hay movimientos pendientes')).toBeInTheDocument()`

These are real, non-vacuous negative+positive assertions (not `expect(true).toBe(true)` filler) — they would genuinely fail if the gate code regressed (e.g., if `movimientos-table.tsx` started showing "Reversar" for `origen==='REVERSO'` rows, or if the Historico/Pendientes split stopped filtering by `validado`).

`git diff HEAD -- src/features/tesoreria/components/movimientos-table.tsx` → **empty** (file not in `git status --short` modified list at all). Confirmed zero gate-code changes — the test is a pure regression guard proving the PRE-EXISTING gate logic (from change `split-desconciliar-reversar-historico`, per apply-progress notes) already handles `origen='REVERSO'` rows correctly, with no new code needed.

### 4. Scope creep — ✅ NONE FOUND

`git status --short` shows exactly 3 modified tracked files, all in scope:
- `src/features/tesoreria/hooks/use-reverso-abono-directo.ts`
- `src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts`
- `src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx`

The only untracked addition relevant to this change is the whole `openspec/changes/reverso-directo-a-historico/` directory (proposal/spec/tasks/this report — expected SDD artifacts, not production code). No migration files, no trigger SQL, no SAF logic (`reversa-pago-saf.ts` untouched — only imported, not modified), no `cuadre-de-caja`, no `consulta-de-factura`, no unrelated src files touched.

### 5. Multi-factura (fan-in) — ✅ VERIFIED, N=2 and N=3 both covered

- N=2: `use-reverso-abono-directo.test.ts:358-416` — `egresoInserts` filtered from `calls`, `expect(egresoInserts).toHaveLength(1)` (pre-existing assertion, line 388) + new `validado===1/validado_por==='user-1'/validado_at` truthy checks (lines 393-396) on that SAME single insert.
- N=3: `use-reverso-abono-directo.test.ts:418-458` — same pattern, `toHaveLength(1)` (line 440) + validado checks (lines 448-451).
- Both scenarios assert `mockedReversarPagoEnTx` called exactly N times with the correct `pagoId` each — the fan-in loop and the single-egreso-validado invariant are tested together, not in isolation.

### 6. Test integrity — ✅ Real pass, genuinely guards the behavior

Ran: `yarn test:run src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx` → **2 files passed, 15 tests passed, 0 failed**, 12.95s.

Reasoning (not executed, static trace): `parseInsertEgreso()` (`use-reverso-abono-directo.test.ts` new helper, ~line 100-116) parses the column list straight from the actual SQL string and maps positional params onto it — it does NOT hardcode an index for `validado`. If someone reverted the production `validado` param from `1` back to `0`, `parseInsertEgreso(egreso).validado` would resolve to `0`, and `expect(egresoRecord.validado).toBe(1)` (×3 scenarios) would fail immediately. Same reasoning for `validado_por`/`validado_at` — reverting to `null`/removing the columns would make `expect(...).toBeTruthy()` fail. The helper's column-list-driven mapping also means the test is NOT order-dependent — it would still catch a regression even if someone reordered the INSERT's column list without updating params correctly (a real historical risk class in this codebase, per the helper's own code comment).

The `conciliacion-tesoreria.test.tsx` suite is UI-layer-only (mocked `useMovBancariosFiltrados`) — it proves the gate renders correctly GIVEN a `validado=1` row, not that production code produces that row. That correctness is covered exclusively (and sufficiently) by the hook-level test in point 1 above.

### 7. Completeness — ✅ 5/6 tasks checked, 1 legit owner-approved skip

`openspec/changes/reverso-directo-a-historico/tasks.md` — all of 1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 4.2 checked `[x]` with accurate, specific completion notes matching the actual diff. Task 4.1 (full suite run) left `[ ]` with an explicit "SKIPPED PER OWNER OVERRIDE" annotation quoting the owner's instruction verbatim. This matches the owner's repeated instruction in the verify-launch prompt itself ("Do NOT run the full suite"). Legitimate, not a process gap.

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Reuse `validarMovBancario`'s `userId`/`now` sourcing pattern, no new identity logic | ✅ Yes | Confirmed `user.id` from `useCurrentUser()` threaded identically through both call chains (see Correctness #1). |
| Zero changes to `movimientos-table.tsx` gate code (gates already origin-agnostic from a prior change) | ✅ Yes | Confirmed via empty diff + passing regression test. |
| Single egreso-contraparte per reverso regardless of N facturas (reuse existing fan-in loop, no new per-pago egreso) | ✅ Yes | Confirmed N=2/N=3 tests, `toHaveLength(1)`. |
| Strict TDD OFF, tests+prod shipped together | ✅ Yes (owner override) | Consistent with mode override instructions for this change. |

## Issues Found

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION**:
- None blocking. (Minor housekeeping note, not a code issue: the working tree also has several unrelated untracked files — `todo.md`, `schema_prod.sql`, `*.diff`/`*.txt` scratch files, an `.xlsx` and a `.zip` — sitting in the repo root from prior sessions. None of them are staged or part of this change's diff, so they don't affect this verdict, but they should be cleaned up or `.gitignore`'d before the final commit/PR for this branch to keep `git status` readable.)

## Test Result

```text
yarn test:run src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx

Test Files  2 passed (2)
     Tests  15 passed (15)
  Duration  12.95s
```
Command exactly matches the owner-mandated scope. No full-suite run performed (by design).

## Scope-Creep Check Result

PASS — exactly 3 production/test files modified, all in scope. No migrations, triggers, SAF, cuadre-de-caja, or consulta-de-factura touched.

## PR-Readiness Call

**READY for PR**, pending two non-blocking housekeeping items before opening:
1. Commit the 3 modified files (currently uncommitted working-tree changes on `feat/tesoreria-reverso-directo-a-historico`, HEAD still at the `origin/develop` merge-base).
2. Clean the unrelated untracked scratch files from the repo root (listed in SUGGESTION above) so they don't accidentally get swept into a `git add -A`.

## Verdict

**PASS**
All 5 spec scenarios compliant with real passing tests; insert correctness, balance invariant, gate regression, scope, multi-factura fan-in, and test integrity all verified with file:line evidence; the single incomplete task (4.1) is an explicit, repeated owner-approved skip, not a gap.
