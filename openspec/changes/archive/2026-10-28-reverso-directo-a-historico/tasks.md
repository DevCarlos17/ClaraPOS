# Tasks: Reverso de abono directo aterriza en Histórico, no en Pendientes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60-90 (prod ~4-6, 2 test files ~25-40 each) |
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
| 1 | Reverso de abono directo nace `validado=1` en Histórico (tests + fix) | PR 1 (single) | Base branch `origin/develop`. Tests and the 1-3 line prod fix ship together — TDD RED→GREEN steps below, one commit/PR. |

## Phase 1: Setup

- [x] 1.1 Branch off `origin/develop` (NOT the current local branch, which predates this epic). DEVIATION: branch name is `feat/tesoreria-reverso-directo-a-historico` (owner-mandated in the apply prompt), not the `fix/reverso-validado-historico` suggested here — created via `git fetch origin && git checkout -b feat/tesoreria-reverso-directo-a-historico origin/develop`, verified off `origin/develop` (confirmed `dd59577 chore(sdd): archive producto-precio-venta-bs-editable-bidireccional` as HEAD).

## Phase 2: Tests (owner override: Strict TDD OFF for this change — tests and prod code implemented together, not RED-first)

- [x] 2.1 In `src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts`, scenario `escenario simple ($100, 1 factura, sin SAF)`: asserted the `movimientos_bancarios` egreso INSERT params include `validado=1`, `validado_por='user-1'`, `validado_at` populated (not null) via a new `parseInsertEgreso()` helper that maps SQL column names to positional params (robust to column-order drift).
- [x] 2.2 Applied the same `validado`/`validado_por`/`validado_at` assertions to scenarios `abono global 2 facturas` and `abono global 3 facturas` in the same file.
- [x] 2.3 In `src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx`, added describe block `ConciliacionTesoreria — reverso de abono directo aterriza en Historico como Validado` with 2 scenarios: (a) Pendientes tab stays empty ("No hay movimientos pendientes", no Rechazar/Conciliar) while Historico shows the row with badge "Validado" and ONLY "Desconciliar" (no Reversar/Rechazar/Conciliar); (b) clicking "Desconciliar" calls `desconciliarMovBancario` with the reverso row's id. Confirmed passing with zero gate-code changes in `movimientos-table.tsx`, as predicted.

## Phase 3: Implementation — GREEN

- [x] 3.1 In `src/features/tesoreria/hooks/use-reverso-abono-directo.ts`, inside `reversarAbonoDirectoDesdeTesoreria`'s `db.writeTransaction`, in the `INSERT INTO movimientos_bancarios` statement: added `validado_por, validado_at` to the column list, added 2 `?` placeholders, flipped the `validado` param from `0` to `1`, and passed `userId` for `validado_por` and the existing `now` local for `validado_at`. Also updated the orchestrator JSDoc (step ii) to document the new Validado-on-insert behavior.
- [x] 3.2 Ran `yarn test:run src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx` (owner-mandated scoped command) — all 15 tests GREEN (10 hook + 5 component).

## Phase 4: Verification

- [ ] 4.1 SKIPPED PER OWNER OVERRIDE: "Do NOT run the full test suite. Run ONLY the two touched test files." Full tesoreria suite was not run in this apply batch — left to the orchestrator/verify phase if broader regression coverage is desired.
- [x] 4.2 Ran `yarn type-check` — the production file `use-reverso-abono-directo.ts` has ZERO type errors from the new INSERT columns/params. NOTE: `yarn type-check` reports pre-existing, repo-wide errors (`Cannot find name 'vi'/'describe'/'it'/'expect'`) across dozens of UNRELATED test files (e.g. `cxp.test.tsx`, `cuentas-por-cobrar.test.tsx`, `use-conciliacion-tesoreria.test.ts`) — this is a baseline tsconfig issue (vitest globals not visible to the `type-check` script's tsconfig) that predates this change and also appears in the 2 touched test files for the SAME pre-existing reason, not from the new assertions added here.
