# Verification Report

**Change**: guarda-deposito-inactivo
**Slice**: A (Phases 1+2 of tasks.md — deactivation guard + reasignación + transparency UI)
**Version**: N/A
**Mode**: Strict TDD
**Branch**: feat/guarda-deposito-inactivo-slice-a

## Completeness

| Metric | Value |
|--------|-------|
| Slice A tasks total | 5 (2.1–2.5) + 2 (1.1–1.2 lib) = 7 |
| Slice A tasks complete | 7/7 |
| Slice A tasks incomplete | 0 |
| Slice B tasks (out of scope, correctly untouched) | 3.1–3.2, 4.1–4.5, 5.1–5.3 partially deferred |

## Build & Tests Execution

**Tests**: ✅ 702 passed / 0 failed (67 test files)
```text
yarn test:run
Test Files  67 passed (67)
     Tests  702 passed (702)
```

**Type-check (test files)**: ✅ Clean
```text
yarn type-check:test
tsc --noEmit --project tsconfig.test.json
Done in 28.88s. (no errors)
```

**Type-check (app, production tsconfig)**: ⚠️ Errors present, but ALL in pre-existing unrelated files (`src/lib/__tests__/utils.test.ts`, `src/lib/__tests__/vencimientos.test.ts`, `src/routes/_app/inventario/__tests__/traspasos.test.tsx`) — confirmed as known baseline noise (missing vitest globals under the production tsconfig), not touching any Slice A file. Not a regression.

## Spec Compliance Matrix (Slice A scope only)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Bloqueo y Reasignación al Desactivar un Depósito | Bloqueada por sesión abierta | `deposito-inactivo.test.ts`, `use-depositos.test.ts`, `deposito-list.test.tsx` | ✅ COMPLIANT |
| Bloqueo y Reasignación al Desactivar un Depósito | Bloqueada por caja sin sesión abierta | `deposito-inactivo.test.ts`, `use-depositos.test.ts`, `deposito-list.test.tsx`, `reasignar-caja-dialog.test.tsx` | ✅ COMPLIANT |
| Bloqueo y Reasignación al Desactivar un Depósito | Permitida sin cajas referenciándolo | `deposito-inactivo.test.ts`, `use-depositos.test.ts`, `deposito-list.test.tsx` | ✅ COMPLIANT |
| Transparencia de Uso en el Listado de Depósitos | Depósito en uso con sesión abierta | `deposito-list.test.tsx` | ✅ COMPLIANT |
| Transparencia de Uso en el Listado de Depósitos | Depósito sin cajas asociadas | `deposito-list.test.tsx` | ✅ COMPLIANT |
| Aislamiento Multi-tenant | Validaciones scoped a la empresa (Slice A guard) | `use-depositos.test.ts` (dedicated empresa_id-scoping test) | ✅ COMPLIANT |
| Guardia `is_active` en Venta | — | — | ➖ Slice B, out of scope |
| Reingreso Automático NCR | — | — | ➖ Slice B, out of scope |
| Guardia DB (trigger) | — | — | ➖ Slice B, out of scope |

**Compliance summary**: 6/6 Slice A scenarios compliant.

## Adversarial Focus Findings

### Focus A — Deactivation guard correctness
`resolveBloqueoDesactivacion` blocks whenever `cajas.length > 0` (SESION_ABIERTA if any open session exists among the referencing cajas, else CAJA_SIN_SESION), and permits only when zero cajas reference the depósito. Re-derived against product decision #1 (obs #2228): matches exactly — no legitimate deactivation is wrongly blocked (0 cajas → always allowed), and no path exists where a depósito referenced by an open-session caja can be deactivated (guard runs unconditionally in `actualizarDeposito` whenever `data.is_active === false`, before `writeTransaction`). Both the hook query (`c.deposito_id = ? AND c.empresa_id = ?`) and the UI transparency query (`c.empresa_id = ?`) are empresa_id-scoped — no cross-tenant leak found. **Verdict: correct, no false-reject, no false-accept.**

### Focus B — Transparency query (N+1 / correctness / tenant scope)
Single grouped query in `deposito-list.tsx` (no N+1) — one `useQuery` call joining `cajas` with a correlated `EXISTS` against `sesiones_caja.status='ABIERTA'`, grouped client-side via `agruparCajasPorDeposito` + `useMemo` (same established pattern as pre-existing `conteosMap`). The `status='ABIERTA'` string matches the exact convention used throughout `use-sesiones-caja.ts`. Query filters `c.empresa_id = ?`. **Verdict: correct, empresa_id-scoped, no N+1.**

### Focus C — Reassignment dialog
`useDepositosVentaActivos()` filters `is_active=1 AND permite_venta=1`; the component additionally excludes `deposito?.id` (the depósito being deactivated) from the options list. Structurally impossible to reassign a caja to an inactive depósito. Confirm handler reassigns all cajas first (`actualizarCaja` × N, verified via `invocationCallOrder` in test) and only then deactivates (`actualizarDeposito`) — no window where an active caja points to an already-inactive depósito. Accessibility: native `<dialog>` + `showModal()` + `label htmlFor`/`id` pairs — identical pattern to the pre-existing `deposito-form.tsx` (no aria-* deviation, no regression vs. established convention). **Verdict: correct; no route to reassign into an inactive depósito.**

## Scope Creep Check

`git diff` confirms only Slice A files touched:
- Modified: `deposito-list.tsx`, `use-depositos.ts`, `use-depositos.test.ts`
- New: `deposito-inactivo.ts`, `deposito-inactivo.test.ts`, `reasignar-caja-dialog.tsx`, `reasignar-caja-dialog.test.tsx`, `deposito-list.test.tsx`

Confirmed untouched (targeted `git diff`, empty output): `use-ventas.ts`, `use-notas-credito.ts`, `use-deposito-activo.ts`, `migrations/`, `use-cajas.ts`, `use-sesiones-caja.ts` (no `abrirSesionCaja` guard added, matches design decision #6 / tasks 5.2 deferral).

## Assertion Quality Audit

Scanned `deposito-inactivo.test.ts`, the 4 new cases in `use-depositos.test.ts`, `deposito-list.test.tsx`, `reasignar-caja-dialog.test.tsx`. No tautologies, no ghost loops over possibly-empty collections, no mock-heavy ratio issues. Each scenario asserts a distinct expected value (different `motivo`, different toast/dialog/direct-call branch, `invocationCallOrder` for the reassign-then-deactivate ordering). **Assertion quality: ✅ All assertions verify real behavior.**

## Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
- None blocking. The `ReasignarCajaDialog` accessibility pattern is a straight match of the pre-existing `deposito-form.tsx` convention (no gap introduced), noted for completeness per the adversarial focus brief but not an issue.

## Verdict

**PASS**

Slice A fully matches spec/design/tasks scope, all 6 in-scope spec scenarios have passing covering tests, 702/702 tests pass, type-check:test is clean, and zero scope creep into Slice B files or the deferred `abrirSesionCaja` guard was found.
