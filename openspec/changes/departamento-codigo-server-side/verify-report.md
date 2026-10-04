## Verification Report

**Change**: departamento-codigo-server-side
**Version**: N/A
**Mode**: Standard (no Strict TDD config detected; design.md explicitly documents the trigger as not unit-testable, same precedent as 0099)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 13 (1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1–5.5) |
| Tasks complete (code-verifiable) | 7 (1.1, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2) — implementation confirmed by reading the actual diffs, but checkboxes in `tasks.md` are still `[ ]` |
| Tasks incomplete | 6 — 1.2 (manual apply to Supabase, blocking, operational, not done from this environment) + 5.1–5.5 (manual staging verification, explicitly out of automated scope per design.md §Testing Strategy) |

### Build & Tests Execution

**Build**: ➖ Not run (no code change requires a full build; type-check used instead, see below)

**Tests**: ✅ 7 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
$ yarn test:run src/features/inventario/hooks/__tests__/use-departamentos.test.ts src/features/inventario/schemas/__tests__/departamento-schema.test.ts

 ✓ src/features/inventario/schemas/__tests__/departamento-schema.test.ts (3 tests) 7ms
 ✓ src/features/inventario/hooks/__tests__/use-departamentos.test.ts (4 tests) 129ms

 Test Files  2 passed (2)
      Tests  7 passed (7)
```

**Type-check**: ✅ No NEW errors in touched files
```text
$ yarn type-check:test
src/features/inventario/components/productos/__tests__/producto-form-aviso-borrador.test.tsx(105,3): error TS2322 ...
src/features/inventario/components/productos/__tests__/producto-form-edit-open-mask.test.tsx(75,3): error TS2322 ...
src/hooks/use-pwa-update.ts(8,20): error TS6133: 'swUrl' is declared but its value is never read.
```
All 3 errors are in files untouched by this change (producto-form test fixtures missing `costo_factura_usd`, and an unrelated unused-variable in a PWA hook). None reference `departamento-schema.ts`, `use-departamentos.ts`, `departamento-form.tsx`, or either new/modified test file.

**Coverage**: ➖ Not available (no coverage threshold configured for this repo)

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Asignación Server-Side por Gap-Fill | SC-1 Sin códigos previos | (none — Postgres trigger, Vitest/SQLite cannot execute `pg_advisory_xact_lock`) | ⚠️ UNTESTED (correctly deferred, task 5.1, design.md §Testing Strategy explicit) |
| Asignación Server-Side por Gap-Fill | SC-2 Huecos existentes | (none, same reason) | ⚠️ UNTESTED (deferred, task 5.1) |
| Asignación Server-Side por Gap-Fill | SC-3 Concurrencia | (none, requires real Postgres) | ⚠️ UNTESTED (deferred, task 5.2 — correctly marked *Manual* in spec.md itself) |
| Asignación Server-Side por Gap-Fill | SC-4 Aislamiento multi-tenant | (none, same reason) | ⚠️ UNTESTED (deferred, task 5.1) |
| Exclusión de Códigos Legacy | SC-5 Convivencia con FAC/COR/CAP | (none, same reason) | ⚠️ UNTESTED (deferred, task 5.1) |
| No Colisión con Constraint Único | SC-6 Upload exitoso vía PowerSync | (none, requires real Postgres + PowerSync) | ⚠️ UNTESTED (deferred, task 5.3, correctly marked *Manual*) |
| Cliente No Calcula el Código | SC-7 Creación offline-first | `use-departamentos.test.ts > crearDepartamento — codigo asignado server-side` | ✅ COMPLIANT (asserts `values.codigo === ''` on the local INSERT payload) |
| Cliente No Calcula el Código | SC-8 Sync completa la asignación | (none, requires real PowerSync download path) | ⚠️ UNTESTED (deferred, task 5.3, correctly marked *Manual* in spec.md) |
| Estado Pendiente en el Formulario | SC-9 Apertura de formulario nuevo departamento | (none — no RTL/component test for this form exists before or after this change) | ⚠️ UNTESTED (static code read confirms input is `readOnly disabled` with the correct copy; no regression, no new test added, consistent with the fact `departamento-form.tsx` had zero component tests before this change) |
| Inmutabilidad de Código Preservada | SC-10 Asignación inicial no es un UPDATE | (none, Postgres-only) | ⚠️ UNTESTED (deferred, task 5.4, correctly marked *Manual*) |
| Inmutabilidad de Código Preservada | SC-11 Intento de editar código asignado | (none, Postgres-only — `trg_validate_departamento_update` pre-exists and is untouched by this change) | ⚠️ UNTESTED (deferred, task 5.4; static read confirms the new trigger is `BEFORE INSERT` and cannot fire `validate_departamento_update()`, which is `BEFORE UPDATE`) |
| Remediación de Huérfanos es Operativa | SC-12 Recreación manual post-deploy | N/A — explicitly operational, no code artifact expected | ✅ COMPLIANT (no automated repair tooling was added, matching the requirement) |

**Compliance summary**: 2/12 scenarios have an automated passing test (SC-7, and SC-12 by absence-of-tooling). The remaining 10 are genuinely Postgres-trigger-only behavior correctly and explicitly declared as manual-verification-only in both `spec.md` (scenarios literally tagged *Manual*) and `design.md` §Testing Strategy. This is not a testing gap being hidden — the design document states up front "no hay cobertura automatizada de este trigger en el repo, igual que 0099 no la tiene," which matches reality and matches the precedent already in production.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Gap-fill SQL (`generate_series` + `LEFT JOIN` + `WHERE NULL` + `LIMIT 1`) | ✅ Implemented | Identical pattern to proven `assign_codigo_producto` (0099); logic is sound: finds the smallest `n` in `[1, MAX+1]` with no matching row. |
| Numeric-only filter `codigo ~ '^\d+$'` | ✅ Implemented | Correctly excludes `FAC`/`COR`/`CAP` from both the `MAX()` subquery and the gap scan. |
| Advisory lock namespace `hashtext(empresa_id::text \|\| ':departamento')` | ✅ Implemented | Confirmed distinct from productos' `hashtext(empresa_id::text)` (0099) — no cross-namespace contention. |
| Idempotency | ✅ Implemented | `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`, matching `migrations/README.md` idempotency requirement (0099 itself is the documented exception, not the pattern to follow — correctly not repeated here). |
| `v_gap IS NULL` guard | ✅ Implemented | Explicit `RAISE EXCEPTION` before any assignment; defense-in-depth as designed. |
| `NEW.codigo` rewrite before CHECK/NOT NULL evaluation | ✅ Implemented | Confirmed via Postgres trigger-timing semantics (`BEFORE INSERT` fires before constraint evaluation on the final row) — same reasoning already validated in production for 0099/0040. |
| Non-interference with `validate_departamento_update()` | ✅ Implemented | Confirmed by reading `migrations/0004_inventario.sql:35-47`: that trigger is `BEFORE UPDATE`; the new trigger is `BEFORE INSERT` on a row that does not yet exist — cannot fire an `UPDATE` trigger. No code change to `validate_departamento_update()`. |
| CHECK constraint compatibility | ✅ Implemented | Confirmed `departamentos.codigo` CHECK is `'^[A-Z0-9-]+$'` (`0004_inventario.sql:13`) — matches design.md's claim exactly. |
| Client no longer computes `codigo` | ✅ Implemented | `getSiguienteCodigoDepartamento` fully removed from `use-departamentos.ts`; `crearDepartamento` now inserts `codigo: ''` directly. `grep` confirms zero remaining references to `getSiguienteCodigoDepartamento` anywhere in `src/` (only in openspec docs, which is expected/historical). |
| `empresa_id` filtering preserved (Rule #11) | ✅ Implemented | `crearDepartamento(nombre, empresaId)` still receives and inserts `empresa_id: empresaId`; call site (`departamento-form.tsx:71`) still passes `user!.empresa_id!`. No regression. |
| No `any` / unjustified `as` introduced | ✅ Implemented | Diff introduces no new `any`/`as` casts. |
| Named exports preserved | ✅ Implemented | `crearDepartamento`, `departamentoSchema`, `DepartamentoForm` all remain named exports. |
| Schema regression risk (`departamentoSchema` reuse) | ✅ No regression | `grep` confirms the only consumers of `departamentoSchema` are `departamento-form.tsx` (create path, which no longer needs `codigo`) and its own new test file. `actualizarDepartamento` does not accept/touch `codigo` at all — confirmed by reading `use-departamentos.ts:72-85`. Removing the numeric regex has no other call site that depended on it. |
| Test honesty | ✅ Honest | Both new/modified tests assert exactly what they claim (payload `codigo === ''`, schema accepting empty/omitted `codigo`) and make no claim about trigger coverage. `design.md` explicitly states the trigger has zero automated coverage — this is stated, not hidden. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| No `codigo_status` column | ✅ Yes | Confirmed: migration adds no column; `schema.ts:272-289` untouched per design claim (spot-checked, table reference present, no new column added). |
| Advisory lock namespace separate from productos | ✅ Yes | Confirmed by direct comparison of 0099 vs 0100 SQL. |
| Idempotent trigger creation | ✅ Yes | `DROP TRIGGER IF EXISTS` present (0099 lacks this; design explicitly calls out 0099 as the exception, correctly not copied). |
| Explicit `v_gap IS NULL` guard | ✅ Yes | Present, matches rationale in design's decision table. |
| Deployment order (migration before frontend) | ✅ Documented, ⚠️ Not independently verifiable from this environment | `design.md` §Deployment Order and `tasks.md` task 1.2 both state this clearly and correctly identify the exact failure mode (`23514`) if violated. Whether the migration was actually applied to the live Supabase project before/at merge time cannot be confirmed by static/test review — this is a release-process risk, not a code defect. |
| Manual-only trigger test strategy, explicitly declared | ✅ Yes | `design.md` §Testing Strategy states this is not TDD-covered, matching 0099's precedent; no false test claims found. |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. `tasks.md` checkboxes are all still `[ ]` despite 7 of 13 tasks (1.1, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2) being code-complete and verified by this report. This is a bookkeeping gap, not a code defect — fix before archiving the change so the task ledger reflects reality. *(File: `openspec/changes/departamento-codigo-server-side/tasks.md`)*
2. Deployment-order hazard is correctly documented but is a genuine release risk that this review cannot clear: if `migrations/0100_departamento_codigo_server_side.sql` is not applied to the live Supabase project strictly before the frontend deploy that ships `codigo: ''`, every department creation will hit `23514` (CHECK violation) and PowerSync will silently discard it — the exact bug this change exists to fix, now triggered by a different constraint. Whoever merges/deploys this PR must apply task 1.2 manually and confirm it in Supabase before or atomically with the frontend release. *(File: `migrations/0100_departamento_codigo_server_side.sql`; `design.md` lines 107-112)*

**SUGGESTION**:
1. `useDepartamentos`/`useDepartamentosActivos` order by `CAST(codigo AS INTEGER) ASC`. A newly created, not-yet-synced department has local `codigo=''`, and SQLite's `CAST('' AS INTEGER)` evaluates to `0`, so the pending row will transiently sort to the top of the list until the PowerSync round-trip replaces it with the real server-assigned code. This is cosmetic, pre-existing behavior inherited from the same pattern already shipped for `productos` (0099), and is not a regression introduced by this change — but it was not explicitly called out in `spec.md`/`design.md` for departamentos, so it's worth a one-line mention in release notes if users are expected to notice momentary list reordering. *(File: `src/features/inventario/hooks/use-departamentos.ts:27-48`)*
2. No component-level test exists for `departamento-form.tsx` (SC-9: read-only input + "PENDIENTE (asignado por el servidor)" copy). This was also true before the change (zero component tests on this file previously), so it's not a regression, but a lightweight RTL test here would close the one client-visible scenario currently relying purely on static code reading.

### Verdict
PASS WITH WARNINGS — implementation is correct, faithful to the proven 0099 pattern, and honestly tested where testable; the two WARNINGs are process/bookkeeping (stale task checkboxes) and release-sequencing risk (migration-before-frontend), not code defects. Safe to commit as a single PR as planned (~127 changed lines, well under the 400-line budget), contingent on task 1.2 (apply `0100` to Supabase) being executed before or atomically with the frontend deploy.
