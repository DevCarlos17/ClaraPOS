# Verification Report

**Change**: deposito-unico-principal
**Version**: N/A
**Mode**: Strict TDD

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 15 (Phases 1-5) |
| Tasks complete (checked) | 12 |
| Tasks incomplete (checked) | 3 (5.1, 5.2, 5.3) |

Note: 5.1 (`yarn test:run`) and 5.2 (`yarn type-check:test`) are unchecked in `tasks.md` but I independently re-ran both — both pass (see below). This is a documentation gap only, not a functional gap: WARNING, not CRITICAL. 5.3 (manual SQL verification of migration 0086 against a live Supabase dev branch) is genuinely unexecuted — no DB access available to any agent in this pipeline; it requires the maintainer. Flagged as WARNING (open item), not CRITICAL, because it is DB-trigger-only defense-in-depth unreachable via the app under normal operation (UI+hook already prevent the violation in all reachable paths — see Focus A/B analysis).

## Build & Tests Execution

**Tests**: ✅ 680 passed / 0 failed / 0 skipped, 64 files
```text
$ yarn test:run
 Test Files  64 passed (64)
      Tests  680 passed (680)
   Duration  28.16s
```
Matches the expected count from apply-progress (obs #2204: "680/680 across 64 files").

**Type-check (test files)**: ✅ Clean
```text
$ yarn type-check:test
$ tsc --noEmit --project tsconfig.test.json
Done in 27.29s.
```

**Type-check (app, `tsconfig.json`)**: ⚠️ Errors present, but 100% confined to `*.test.ts`/`*.test.tsx` files across the WHOLE repo (missing vitest globals in `tsconfig.json` — pre-existing, documented as expected noise by the orchestrator, confirmed by grep: every hit is `Cannot find name 'describe'/'it'/'expect'/'vi'` inside `__tests__/*.test.ts(x)`). Zero errors in any of the 4 non-test source files changed by this slice (`deposito-principal.ts`, `use-depositos.ts`, `deposito-form.tsx`, `deposito-list.tsx`). No regression.

## Spec Compliance Matrix

| # | Scenario | Enforced in | Test | Result |
|---|----------|-------------|------|--------|
| 1 | Primer depósito de la empresa | UI (form) + Hook (`crearDeposito`) + Trigger (INSERT) | `deposito-form.test.tsx` (count=0 disabled+checked+hint) `use-depositos.test.ts` (`es_principal=false, cnt=0 → throws`, `es_principal=true → no query, writes`) | ✅ COMPLIANT (UI+hook); ⚠️ trigger UNTESTED (manual-only, task 5.3 pending) |
| 2 | Segundo depósito de la empresa | Hook + UI (checkbox free) | `use-depositos.test.ts` (`cnt=1 → permite`) `deposito-form.test.tsx` (count=2 → libre, sin hint) | ✅ COMPLIANT |
| 3 | Desactivar depósitos hasta quedar 1 activo | Hook (pre-existing at-least-one guard) + Trigger (independent confirm) | Pre-existing `use-depositos.test.ts` at-least-one describe block (unchanged, still green) | ✅ COMPLIANT (hook); ⚠️ trigger side UNTESTED (manual-only) |
| 4 | Intento de desmarcar es_principal en el único activo | Hook (`debeBloquearQuitarUltimoPrincipal`, pre-existing) + Trigger (UPDATE) | `use-depositos.test.ts` "unset del UNICO principal activo... BLOQUEA" | ✅ COMPLIANT (hook); ⚠️ trigger UNTESTED (manual-only) |
| 5 | Escritura cruda "ni vía consola" | Trigger only (INSERT+UPDATE) | None (Vitest cannot execute a real Postgres trigger) — manual SQL block documented in migration file header, NOT yet run against a live DB per apply-progress (task 5.3 open) | ⚠️ **UNTESTED at runtime** — static evidence only (source inspection + independent re-derivation, see Focus B below). This is the correct/expected state for a DB-trigger-only scenario per design.md's own Testing Strategy table, but it remains an open task, not a closed one. |
| 6 | Formulario con un único depósito activo | UI (`deposito-form.tsx`) | `deposito-form.test.tsx` (count=0 create, count=1 edit-active) | ✅ COMPLIANT |
| 7 | Formulario con 2+ depósitos activos | UI | `deposito-form.test.tsx` (count=2 → libre) | ✅ COMPLIANT |
| 8 | Marcar otro depósito como principal no rompe el invariante | `buildUnsetOtrosPrincipalesQuery` (pre-existing, untouched) | Pre-existing tests in `deposito-principal.test.ts` / `use-depositos.test.ts` (still green) | ✅ COMPLIANT |
| 9 | At-least-one y nuevo invariante coinciden en el caso límite | Mathematical equivalence between `debeBloquearQuitarUltimoPrincipal` and `debeForzarPrincipalUnico` inside the `esPrincipalActivoActual && seEstaQuitando` branch (dead-code claim) | No dedicated test (this is a source-level architectural guarantee) — independently re-derived by hand, see Focus A | ✅ COMPLIANT (verified via independent proof, not a runtime test — appropriate since it's a "no code executes" claim) |

**Compliance summary**: 6/9 scenarios have a passing runtime test; 3/9 (all trigger-only, scenario 5 fully, scenarios 1/3/4 partially on their trigger half) rely on documented-but-unexecuted manual SQL verification. This is the SAME limitation the design.md explicitly accepted upfront (Vitest cannot run real Postgres), not a surprise regression.

## Focus A — Hook's new `podriaDejarActivoSinPrincipal` branch (independently re-derived)

**Dead-code claim**: TRUE, confirmed by direct derivation, not by trusting the report.

Inside the `if (esPrincipalActivoActual && seEstaQuitando)` branch, both existing checks reduce to the exact same boolean over the exact same `otrosRows` query (`COUNT(*) WHERE empresa_id=? AND es_principal=1 AND is_active=1 AND id != ?`):
- `debeBloquearQuitarUltimoPrincipal` reduces to `!existeOtroPrincipalActivo` ⟺ `cnt === 0`.
- Had `debeForzarPrincipalUnico` been called there with `otrosActivosCount = cnt`, it would reduce to `cnt === 0 && quedaraActivo && esPrincipalFalse`. In the `data.es_principal===false` sub-case, `quedaraActivo=true` and `esPrincipalFalse=true` are always true, collapsing the expression to `cnt === 0` — identical to the existing check. In the `is_active→false` sub-case, `quedaraActivo=false`, so the (hypothetical) call would always be `false` — also correctly a no-op.

So placing the new check inside that branch would indeed be provably dead code. The apply agent's claim holds.

**False-reject check**: walked all 9 spec scenarios plus the "second depósito", "reactivate a previously-deactivated sole-eligible depósito", and "unrelated field edit on a non-principal active sibling" cases against the new branch. No reachable false reject found, **conditional on the pre-existing invariant "if ≥1 active depósito exists, exactly one is principal" holding continuously** — which is exactly what the combination of the 3 guards is designed to maintain, and which the at-least-one/at-most-one guards already enforce on every other write path. Concretely: `deposito-list.tsx`'s `handleToggleActivo` never sends `es_principal`, so toggling active/inactive on a non-principal sibling never enters this branch at all; every edit-form submission always sends an explicit `es_principal` boolean (confirmed in `deposito-form.tsx` `handleSubmit`), so the branch fires on every save of a non-principal, still-active depósito — and in every state reachable via the app (given the invariant holds), the query correctly returns a nonzero count whenever a legitimate active principal sibling exists.

**False-accept check**: none found — the branch's precondition (`actual.is_active === 1`) is evaluated against the CURRENT row state, not the post-write state, which means a reactivate-with-`es_principal=false` call on a currently-inactive depósito is NOT checked by this branch. I traced whether this is an exploitable gap and found it is not: to reach the precondition "this depósito is about to become the sole active depósito of the empresa," some *other* previously-active depósito must first be deactivated — and deactivating the empresa's last active principal is already blocked by the pre-existing at-least-one guard (`debeBloquearQuitarUltimoPrincipal`) on that OTHER write, independent of this new branch. So the omission is real (the branch's `actual.is_active===1` check does not cover the reactivation path) but not reachable given the other guards. This should be called out as a **SUGGESTION** for future maintainers (see Issues below) — not a CRITICAL, because no exploit path exists today.

**Consistency check**: the branch is mutually exclusive with the first `if` (proven: `podriaDejarActivoSinPrincipal` requires `data.es_principal===false`, which — combined with `actual.es_principal===1` — would already force `esPrincipalActivoActual && seEstaQuitando` to be true and take the FIRST branch; so the `else if` is only reachable when `actual.es_principal===0`, i.e., never overlapping the first branch's precondition). No contradiction found between the three guards.

**One design smell worth flagging (WARNING)**: the query reused for the new branch's `otrosActivosCount` is filtered by `es_principal = 1 AND is_active = 1` (the at-least-one guard's query), not simply `is_active = 1` (the semantics documented in the pure helper's own JSDoc and in `crearDeposito`'s equivalent check, which correctly uses an unfiltered `is_active = 1` count). The two queries are only guaranteed to agree on the `=== 0` boolean outcome because of the inductive invariant above — if that invariant is ever broken by an out-of-band write (e.g., a future migration bug, or manual DB surgery), this specific reused query would under-count and could FALSE-BLOCK (fail-safe direction, not fail-open) an otherwise-legitimate edit on an already-inconsistent row. This is safe-direction and low-risk, but the variable/query semantics silently diverge from what the JSDoc promises. Recommend either renaming the local variable to make the "principal-filtered" semantics explicit, or (better) querying plain `is_active = 1` here too for true semantic parity with `crearDeposito` and the trigger (which DOES use unfiltered `is_active = 1` — see Focus B).

## Focus B — Trigger COUNT logic (independently re-derived)

**INSERT**:
- Postgres applies column `DEFAULT` values (including `uuid_generate_v4()` for `id`) before a `BEFORE INSERT` trigger's function runs — this is standard Postgres trigger semantics, confirmed correct. `NEW.id` is already the final UUID when the function executes, and the row does not yet exist in the table, so `id != NEW.id` excludes nothing real.
- 1st depósito, `es_principal=FALSE`: `otros_activos = COUNT(is_active=TRUE, empresa scoped) = 0` → **rejects**. ✅ Correct.
- 2nd depósito, `es_principal=FALSE`, with 1 existing active depósito: `otros_activos = 1` → **permits**. ✅ Correct.

**UPDATE**:
- `id` never changes across an UPDATE, so `id != NEW.id` correctly excludes the row's own current version, leaving only true "other" active depósitos — same criterion as `existeOtroPrincipalActivo`/`otrosActivosCount` in the hook.
- (a) Deactivating a non-principal while a principal remains: `NEW.is_active=FALSE` → outer `IF` (`NEW.is_active = TRUE AND ...`) is false → trigger body never runs → **permits**, unconditionally. ✅ Correct, no false reject.
- (b) The row being deactivated itself: same as (a) — `NEW.is_active=FALSE` always short-circuits the whole check regardless of `es_principal`. ✅ Correct.
- (c) Marking `es_principal=TRUE`: `NEW.es_principal=FALSE` is required by the outer `IF`; setting it `TRUE` short-circuits → **permits**. ✅ Correct.
- Unsetting `es_principal` on the sole active depósito: `NEW.is_active=TRUE AND NEW.es_principal=FALSE` → enters the check → `otros_activos` (unfiltered by `es_principal`, unlike the hook's reused query — this is the MORE robust version) `= 0` → **rejects**. ✅ Correct.
- Crucially, the trigger's own COUNT is **not** filtered by `es_principal` (`WHERE empresa_id = NEW.empresa_id AND is_active = TRUE AND id != NEW.id`) — this is the semantically precise version of "otrosActivosCount" that the hook's reused query only approximates via the inductive argument above. The trigger, being the true source of truth, does not share the hook's WARNING-level fragility.

**Reject-only / no mutation of NEW**: confirmed — the function body only ever `RAISE EXCEPTION` or falls through to `RETURN NEW` unmodified; no assignment to `NEW.es_principal` or `NEW.is_active` anywhere. ✅

**Idempotency**: `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER` for both `trg_deposito_principal_unico_insert` and `trg_deposito_principal_unico_update`. ✅ Re-runnable migration, matches the `0060` precedent.

**BOOLEAN semantics / empresa_id scoping**: verified directly against `migrations/0004_inventario.sql:116-128` — `depositos.es_principal BOOLEAN NOT NULL DEFAULT FALSE`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`. The trigger correctly uses Postgres `TRUE`/`FALSE` literals (not the PowerSync client-side SQLite 0/1 integer mapping, which only applies to the local SQLite copy). `WHERE empresa_id = NEW.empresa_id` correctly scopes the COUNT per tenant — no cross-tenant leakage. ✅

**Conclusion on Focus B**: the COUNT logic is correct for both INSERT and UPDATE, matches the header's own documented reasoning exactly, and is in fact MORE robust than the hook's equivalent check (unfiltered by `es_principal`). No false-reject or false-accept path found. The only open item is that this logic has not yet been executed against a live Postgres instance (task 5.3) — static/manual verification only.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `debeForzarPrincipalUnico` pure helper | ✅ Implemented | Matches design.md interface verbatim; 4/4 boolean-combination unit tests pass |
| Hook `crearDeposito` fail-fast | ✅ Implemented | Pre-reads count, throws before `writeTransaction`, no write occurs on block |
| Hook `actualizarDeposito` fail-fast (new branch) | ✅ Implemented, see Focus A | Reuses existing `otrosRows` query per design; functionally correct given the maintained invariant, WARNING on naming/semantic drift |
| UI checkbox lock | ✅ Implemented | `deposito-form.tsx` computes `soloUno`, forces state in effect, disables input, renders hint |
| `deposito-list.tsx` prop wiring | ✅ Implemented | `activeDepositosCount` computed via `useMemo` from existing `useDepositos()` data, no new query |
| DB trigger (INSERT+UPDATE) | ✅ Implemented, see Focus B | Correct COUNT logic for both events; reject-only; idempotent; empresa-scoped |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Third pure function mirroring at-most-one/at-least-one pattern | ✅ Yes | `debeForzarPrincipalUnico` matches interface exactly |
| No new sync-rollback UX (reuse generic `uploadFailed` toast) | ✅ Yes (by omission) | No new rollback code added, consistent with design's "zero new code" decision — not independently re-verified against `connector.ts`/`__root.tsx` in this pass (out of the requested Focus A/B scope, and unchanged by this diff) |
| Both INSERT and UPDATE triggers (not just INSERT) | ✅ Yes | Both present, single shared function |
| Reuse `otrosRows` query in `actualizarDeposito` rather than a fresh unfiltered query | ✅ Yes, exactly as designed | This is a design decision, not an apply deviation — see Focus A WARNING for the tradeoff analysis |
| Migration number 0086 is next free slot | ✅ Yes | Confirmed via `ls migrations/` — 0085 was last (`0085_traspaso_plantillas.sql`) |

## Scope Check

```
git diff --stat HEAD
 .atl/.skill-registry.cache.json                    |  2 +-   (environment cache, not app scope)
 .atl/skill-registry.md                             |  3 +-   (environment cache, not app scope)
 deposito-form.tsx                                  | 51 +++++++++++-----
 deposito-list.tsx                                  |  6 ++
 use-depositos.test.ts                              | 71 ++++++++++++++++++++++
 use-depositos.ts                                   | 50 +++++++++++++++
 deposito-principal.test.ts                         | 50 +++++++++++++++
 deposito-principal.ts                              | 32 ++++++++++
 + untracked: migrations/0086_..., openspec/changes/deposito-unico-principal/**, components/depositos/__tests__/
```
✅ Exactly the 6 intended source/test files + the new migration + new test directory + openspec artifacts. No scope creep.

## Multi-Tenant Check

Every new/modified query is `empresa_id`-scoped:
- `crearDeposito`'s active-count pre-check: `WHERE empresa_id = ?` ✅
- `actualizarDeposito`'s reused `otrosRows` query: `WHERE empresa_id = ?` (using the row's own `empresa_id`, pre-read) ✅
- Trigger's `otros_activos` COUNT: `WHERE empresa_id = NEW.empresa_id` ✅

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. `tasks.md` items 5.1/5.2 are unchecked despite both commands passing when independently re-run in this verification pass (680/680 tests, clean test type-check). Recommend the orchestrator mark them `[x]` now that this report provides the real evidence.
2. Task 5.3 (manual SQL verification of migration 0086 against a live Supabase dev branch) remains genuinely open — no agent in this pipeline has DB access. This is the only scenario (#5, "Escritura cruda") without any runtime-executed proof. Recommend the maintainer run the 4-case manual SQL block (documented in the migration file footer) against a dev branch before merging to `develop`, or accept the risk given the trigger is defense-in-depth-only (unreachable via the app under normal operation).
3. `actualizarDeposito`'s new `podriaDejarActivoSinPrincipal` branch reuses a query filtered by `es_principal = 1 AND is_active = 1` for what the pure helper's own JSDoc calls "depósitos activos de OTRAS filas" (i.e., should conceptually be unfiltered `is_active = 1`, as `crearDeposito` and the DB trigger both correctly do). The two only agree because of an inductive invariant maintained by the other guards, not because the query directly matches the helper's contract. Functionally safe (fails toward over-blocking, never under-blocking) but a maintenance trap if the invariant is ever broken by out-of-band data. Recommend a code comment cross-referencing this reasoning, or switching to an unfiltered count for true parity with the trigger.

**SUGGESTION**:
1. The `podriaDejarActivoSinPrincipal` branch checks `actual.is_active === 1` (current state) rather than the resulting state, so a reactivate-with-`es_principal=false` call on a currently-inactive depósito is not checked by this specific branch. No exploit path exists today (reaching that precondition requires deactivating the empresa's last active principal first, which the pre-existing at-least-one guard already blocks), but it's worth a one-line comment noting why this is safe, so a future refactor doesn't silently rely on tribal knowledge.
2. Design's Decision "Sync-rollback UX for trigger rejection" (reuse of the generic `uploadFailed` toast, `P0001` in `FATAL_RESPONSE_CODES`) was not re-verified in this pass since it required no code changes and is out of the requested Focus A/B scope — low risk, but worth a spot-check if this change is ever revisited.

## Verdict

**PASS WITH WARNINGS**

680/680 tests green, test-type-check clean, zero regressions in app source, scope tightly matches the 6-file plan plus the migration, and both adversarial foci (hook branch dead-code claim, trigger COUNT logic) independently re-derive as correct with no reachable false-reject or false-accept. The only gaps are: (1) two verification checkboxes not ticked despite passing evidence (cosmetic), (2) the DB-trigger scenario genuinely awaiting manual execution against a live Supabase branch (inherent to DB-only changes, not a regression), and (3) one maintainability smell in the hook's reused query that is currently safe but fragile under future data drift. None of these block merge; the maintainer should run task 5.3 before/shortly after merging to close the loop on the DB layer.
