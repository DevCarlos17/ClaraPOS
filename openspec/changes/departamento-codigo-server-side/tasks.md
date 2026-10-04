# Tasks: Asignación server-side de `departamentos.codigo`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 (migration ~65 new, use-departamentos.ts ~20, departamento-form.tsx ~15, departamento-schema.ts ~8, use-departamentos.test.ts ~20, new departamento-schema.test.ts ~22) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All tasks below (migration + TS changes + tests) | PR 1 | Well under 400-line budget; still ask per `ask-always` before apply. |

## Phase 1: Database Foundation (apply BEFORE frontend — deployment order constraint)

- [x] 1.1 Create `migrations/0100_departamento_codigo_server_side.sql` with the exact SQL from `design.md` lines 41-73: `CREATE OR REPLACE FUNCTION assign_codigo_departamento()` (gap-fill via `pg_advisory_xact_lock(hashtext(empresa_id::text || ':departamento'))` + `generate_series`/`LEFT JOIN`, filter `codigo ~ '^\d+$'`) + idempotent `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER trg_assign_codigo_departamento BEFORE INSERT ON departamentos`. `codigo` stays `NOT NULL` — no `DROP NOT NULL`, no new column.
- [ ] 1.2 **Blocking operational step — do NOT skip:** apply `0100_...sql` manually via the Supabase SQL Editor on the real project **before** any frontend task below is deployed. Per design.md §Deployment Order: if frontend ships first and sends `codigo=''` without the trigger, Postgres rejects the INSERT with `23514` (CHECK violation) and PowerSync silently discards it — the exact failure mode this change removes.

## Phase 2: Schema Validation (TDD — RED then GREEN)

- [x] 2.1 RED: create `src/features/inventario/schemas/__tests__/departamento-schema.test.ts` — failing test asserting `departamentoSchema.safeParse({ nombre: 'VIVERES', is_active: true })` (no `codigo` key) succeeds, and a second case with `codigo: ''` also succeeds. Run `yarn test:run` to confirm it fails against current schema (required + regex).
- [x] 2.2 GREEN: in `src/features/inventario/schemas/departamento-schema.ts`, change `codigo` from `.min(1).regex(/^[1-9]\d*$/)` to `z.string().optional().default('')` (server is sole source of truth; client-side numeric regex no longer meaningful). Verify: `yarn test:run` passes, `yarn type-check` clean.

## Phase 3: Data Hook (TDD — RED then GREEN)

- [x] 3.1 RED: in `src/features/inventario/hooks/__tests__/use-departamentos.test.ts`, add a test asserting `mockedKysely.values.mock.calls[0][0].codigo === ''` after calling `crearDepartamento('viveres', 'empresa-1')`. Confirm it fails (current code computes a real number via `getSiguienteCodigoDepartamento`).
- [x] 3.2 GREEN: in `src/features/inventario/hooks/use-departamentos.ts`, remove `getSiguienteCodigoDepartamento` entirely (sole consumer is `departamento-form.tsx`, removed in Phase 4) and change `crearDepartamento` to insert `codigo: ''` directly instead of awaiting the removed helper. Verify: `yarn test:run` passes, `yarn type-check` clean.

## Phase 4: Form UI (manual check — not independently unit-testable)

- [x] 4.1 `src/features/inventario/components/departamentos/departamento-form.tsx`: remove the `getSiguienteCodigoDepartamento` import and the `.then/.catch` block inside the "Nuevo Departamento" `useEffect` (lines ~36-40); the branch keeps only `setCodigo('')`.
- [x] 4.2 Same file: update the helper text under the código input from `"El codigo se asigna automaticamente"` to `"PENDIENTE (asignado por el servidor)"` — copy identical to the precedent in `producto-form.tsx:2065` for cross-form consistency. Verify: `yarn type-check`; manual check of "Nuevo Departamento" dialog shows the pending copy and a disabled empty input.

## Phase 5: Manual Verification (no automated harness — trigger is not unit-testable)

Postgres triggers cannot run against local SQLite/Vitest. These are **manual, staging/Supabase SQL Editor only** — do not report them as covered by automated tests.

- [ ] 5.1 SC-1/SC-2/SC-4/SC-5: insert departamentos manually (no codes, with gaps, two empresas, alongside legacy `FAC`/`COR`/`CAP` codes) and confirm gap-fill + multi-tenant isolation + legacy exclusion.
- [ ] 5.2 SC-3 (concurrency): two near-simultaneous INSERTs same `empresa_id` in separate SQL Editor tabs — confirm distinct consecutive codes, no `uq_departamentos_empresa_codigo` violation.
- [ ] 5.3 SC-6/SC-7/SC-8: offline create persists `codigo=''` locally and is immediately usable; after PowerSync upload, confirm no `23505`/`23514` and the final server code replaces the sentinel via download.
- [ ] 5.4 SC-10/SC-11: confirm the new `BEFORE INSERT` trigger does not fire `validate_departamento_update()`, and an `UPDATE ... SET codigo = ?` on an assigned row still raises the existing immutability exception (regression check on business rule #5).
- [ ] 5.5 **Operational, not a code task (SC-12):** after `0100` is live, instruct the user to manually recreate the orphaned departamento `7cac7b70-590f-4255-91d6-d91aedb1022e` and its associated product — no repair script/migration is built for this, per proposal Decisión 3.

## Spec Coverage

SC-1, SC-2, SC-4, SC-5 → task 5.1. SC-3 → 5.2. SC-6, SC-7, SC-8 → 3.2 (client) + 5.3 (server/sync, manual). SC-9 → 4.1/4.2. SC-10, SC-11 → 5.4 (manual regression). SC-12 → 5.5 (operational).
