# Tasks: Fix race condition en cuentas de comision de banco (fail-fast + fail-closed)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 (40 lib + 50 test + 60 banco-form.tsx) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Lib + tests + banco-form.tsx wiring | PR 1 (only) | Under budget |

## Phase 1: Foundation — pure lookup (RED)

- [x] 1.1 Create `src/features/contabilidad/lib/grupo-por-clave-config.ts` with `EjecutorSql`/`GrupoCuenta` types (design.md L85-91), signature only.
- [x] 1.2 Create `.../lib/__tests__/grupo-por-clave-config.test.ts` (RED), mocking `EjecutorSql` per `use-bancos.test.ts:3-11`: (a) clave resuelve -> `GrupoCuenta`; (b) `rows.length === 0` -> `null`; (c) multi-tenant isolation (empresa A never gets B's row).
- [x] 1.3 `yarn test:run` (RED) — confirmed: test file created before implementation, import failed as expected.

## Phase 2: Core Implementation (GREEN)

- [x] 2.1 Implement `resolverGrupoPorClaveConfig(ejecutor, clave, empresaId)` (design.md L92-107; SQL identical to `use-plan-cuentas.ts:136-143`, `null` sentinel).
- [x] 2.2 `yarn test:run` + `yarn type-check:test` (GREEN) — 4/4 tests passed.

## Phase 3: Wire into `banco-form.tsx` (fail-fast reorder + fail-closed)

- [x] 3.1 Remove `useGrupoComisionesBancarias`/`useGrupoComisionesPasarela` imports (L27-28) + calls (L239-240); import `resolverGrupoPorClaveConfig`.
- [x] 3.2 In `crearCuentasDelBanco` (L504-632), move both grupo lookups (`resolverGrupoPorClaveConfig(db, clave, empresaId)`) to the TOP, before `if (opts.crearActivo)` (L526), when requested by `opts`. Throw `Error` on `null`, before any insert.
- [x] 3.3 Remove `comisionBancariaOmitida`/`comisionPasarelaOmitida` from return type/literals (L511-512, 518-519, 521-522).
- [x] 3.4 Replace `if (grupoComisionesBancarias) {...} else { omitida = true }` blocks (L614-627) with direct use of groups resolved in 3.2.
- [x] 3.5 Delete `avisarComisionesOmitidas` (L639-662) + its 3 call-sites (L707, L778, L825).

## Phase 4: Fail-closed propagation (3 call-sites, per maintainer decision)

- [x] 4.1 `handleCrearCuentaContable` (manual button, L664-714): existing `try/catch` surfaces the thrown `Error` via `toast.error`; no change beyond 3.5.
- [x] 4.2 `handleSubmit` EDIT branch (L751-779): unresolved commission throws BEFORE `updateBanco` — aborts edit, caught by `try/catch` (L935-938).
- [x] 4.3 `handleSubmit` CREATE branch (L794-826): same propagation, throw aborts before `createBanco`.

## Phase 5: Testing

- [ ] 5.1 **DEFERRED to sdd-verify** — Test `crearCuentasDelBanco` fail-closed via RTL, mocking `db.execute`: resolved -> leaf created; unresolved -> throws, `crearCuenta` never called (no orphan). Deviation: `crearCuentasDelBanco` is a private closure inside `BancoForm`; exercising it requires a full RTL render mocking 5 hook modules (`use-bancos`, `use-payment-methods`, `use-metodo-cobro-deducciones`, `use-plan-cuentas`, `use-current-user`) + `db` + `sonner`, which would roughly double the diff (~150 -> ~300 lines) — over the forecasted budget and inconsistent with design.md's own Testing Strategy table, which already classifies the related 3-call-site behavior as "Component/Integration (fuera de este PR, verify) — Manual QA". The fail-fast ordering (comision resolved before `opts.crearActivo`) is structurally guaranteed by code order (see diff) and is exercised end-to-end by Phase 6 manual QA (6.1/6.2).
- [x] 5.2 `yarn test:run`, `yarn type-check`, `yarn type-check:test` (all green) — 784/784 tests pass (baseline 780 + 4 new); `yarn type-check` baseline 3062 pre-existing errors (obs #963, *.test.ts globals noise) unchanged except +14 lines of the SAME pre-existing pattern for the one new test file (zero new production-code errors, confirmed via `git stash -u` diff); `yarn type-check:test` clean.

## Phase 6: Manual QA Handoff (sdd-verify)

- [ ] 6.1 Reproduce original bug: create a bank right after fresh app load, before `cuentas_config` settles — accounts now created deterministically.
- [ ] 6.2 Create bank happy path: all 3 accounts created, none NULL.
- [ ] 6.3 Edit a legacy NULL-commission bank (BANCO TEST 3 / today's 3) — self-heal or blocking `toast.error`, never silent NULL.
- [ ] 6.4 Empresa isolation: empresa A never resolves B's `GRUPO_COMISIONES_*`.
- [ ] 6.5 Principal account path (L526-576) unchanged.
- [ ] 6.6 Follow-up: confirm today's 3 NULL banks self-heal on next edit+save; missing `GRUPO_COMISIONES_*` is a separate backfill task.
- [ ] 5.1 (moved) Include the deferred RTL fail-closed test above as part of sdd-verify's evidence, if verify budget allows.
