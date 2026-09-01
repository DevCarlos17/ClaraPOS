# Tasks: Depósito Único Forzado como Principal

## Review Workload Forecast

| File | Action | Est. lines |
|------|--------|-----------|
| `src/features/inventario/lib/deposito-principal.ts` | Modify | +20 |
| `src/features/inventario/lib/__tests__/deposito-principal.test.ts` | Modify | +45 |
| `src/features/inventario/hooks/use-depositos.ts` | Modify | +25 |
| `src/features/inventario/hooks/__tests__/use-depositos.test.ts` | Modify | +65 |
| `src/features/inventario/components/depositos/deposito-form.tsx` | Modify | +20 |
| `src/features/inventario/components/depositos/__tests__/deposito-form.test.tsx` | Create | +100 |
| `src/features/inventario/components/depositos/deposito-list.tsx` | Modify | +3 |
| `migrations/0086_deposito_unico_principal.sql` | Create | +40 |
| **Total** | | **~318** |

Small closing slice: one pure helper, its two callers, one component prop, one migration. Estimate sits ~80 lines under the 400 budget with realistic margin — no chaining needed.

| Field | Value |
|-------|-------|
| Estimated changed lines | ~318 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (all phases) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full slice: helper + hook guard + UI wiring + migration | PR 1 | Single PR, no base-branch decision needed |

## Phase 1: Pure Helper (Foundation)

- [x] 1.1 RED — `deposito-principal.test.ts`: add `describe('debeForzarPrincipalUnico')` covering blocks-when (otrosActivosCount=0 AND quedaraActivo AND esPrincipalFalse) and permits-when each of the 3 conditions is negated.
- [x] 1.2 GREEN — `deposito-principal.ts`: implement `debeForzarPrincipalUnico(params)` per `design.md` interface/contract, JSDoc mirrors `debeBloquearQuitarUltimoPrincipal` style.

## Phase 2: Hook Write-Path Guard

- [x] 2.1 RED — `use-depositos.test.ts`: add `crearDeposito` cases — throws before `writeTransaction` when count=0 and `es_principal=false`; writes normally when `es_principal=true` or count>0.
- [x] 2.2 RED — `use-depositos.test.ts`: extend the existing `podriaQuitarPrincipal` describe block — throws when `otrosActivosCount=0` and the update would leave `es_principal=false` on the sole active depósito (reuses existing `otrosRows` mock, no new mocks).
- [x] 2.3 GREEN — `use-depositos.ts`: `crearDeposito` — pre-read active count, call `debeForzarPrincipalUnico`, throw `Error('El único depósito activo de la empresa debe ser principal.')` before `writeTransaction`. `actualizarDeposito` — extend existing pre-check block to also call `debeForzarPrincipalUnico` reusing the already-fetched `otrosRows` count.

## Phase 3: UI Wiring

- [x] 3.1 RED — new `deposito-form.test.tsx`: checkbox disabled+checked at `activeDepositosCount=0` (create) and `=1` (edit, `is_active=1`); enabled/free at 2+; Spanish hint text renders when locked.
- [x] 3.2 GREEN — `deposito-form.tsx`: add `activeDepositosCount: number` prop, compute `soloUno` (create: count===0; edit: count===1 && deposito.is_active===1), force `esPrincipal=true` in effect when `soloUno`, `disabled` on checkbox, hint text "Es el único depósito activo — debe ser el principal."
- [x] 3.3 `deposito-list.tsx`: pass `depositos.filter(d => d.is_active === 1).length` as `activeDepositosCount` to `<DepositoForm>` (no new query).

## Phase 4: DB Trigger (Not Vitest-Testable)

- [x] 4.1 Create `migrations/0086_deposito_unico_principal.sql` — `CREATE OR REPLACE FUNCTION validate_deposito_principal_unico()` + `DROP TRIGGER IF EXISTS`/`CREATE TRIGGER` for INSERT and UPDATE on `depositos`, mirroring `validate_venta_insert`/`validate_venta_update` convention. Covered by spec scenarios + manual SQL verification (documented in migration header), NOT a Vitest RED/GREEN pair.

## Phase 5: Verification

- [x] 5.1 Run `yarn test:run` — all new + existing `deposito-principal.test.ts`, `use-depositos.test.ts`, `deposito-form.test.tsx` pass. Final: 681/681 across 64 files (includes the WARNING-fix regression test added post-verify).
- [x] 5.2 Run `yarn type-check:test` — no type errors in modified/new test files. Clean.
- [x] 5.3 Manual SQL: apply migration 0086 to a Supabase dev branch; confirm trigger rejects a raw INSERT/UPDATE that would leave the sole active depósito with `es_principal=0` (spec scenario "Escritura cruda"). DONE by maintainer on a real Supabase dev branch: both reject-cases (INSERT first non-principal, UPDATE unsetting `es_principal` on the sole active) correctly failed with `P0001`; both legitimate cases (2nd depósito, deactivate non-principal, mark principal) passed. Evidence: engram `sdd/deposito-unico-principal/manual-sql-verify` (obs #2212).
