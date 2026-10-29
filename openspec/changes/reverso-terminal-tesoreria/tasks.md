# Tasks: Reverso de Abono Terminal (sin acciones)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~20-40 |
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
| 1 | Branch setup + 2-line gate fix + test rewrites/adds + scoped verify | PR 1 | Base: `origin/develop` @ `0795382b`. Single reviewable unit — root fix and its tests ship together. |

## Phase 1: Setup

- [x] 1.1 Create branch from `origin/develop` (`0795382b`): `git checkout -b feat/reverso-terminal-tesoreria origin/develop`. (Branch name adjusted from `fix/` to `feat/` per owner instruction; same base commit.)

## Phase 2: Gate Fix (root + defense-in-depth)

- [x] 2.1 `src/features/tesoreria/components/movimientos-table.tsx` ~L394 (`HistoricoRow`, Desconciliar gate): add `&& mov.origen !== 'REVERSO'` to `{isValidado && !isReversado && mov.onDesconciliar && (`.
- [x] 2.2 `src/features/tesoreria/components/movimientos-table.tsx` ~L261 (`PendienteRow`, Rechazar gate): add `&& mov.origen !== 'REVERSO'` to `{!isReversado && mov.onReversar && (`.
- [x] 2.3 Do NOT modify the Conciliar gate (~L251) — stays origin-agnostic for the legacy `reversarMovBancario` mechanism (GASTO/PAGO_PROVEEDOR/MANUAL/TRASPASO). (Verified: line 251 untouched.)

## Phase 3: Test Rewrites and Additions

- [x] 3.1 `src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx` L255-319: rewrote doc comment + the 2 `it` blocks in "reverso de abono directo aterriza en Historico como Validado" (renamed to "...como terminal (sin acciones)") — now asserts the reverso row renders ZERO action buttons (no Desconciliar, no Reversar, no Rechazar, no Conciliar) and that `desconciliarMovBancario` is never called.
- [x] 3.2 `src/features/tesoreria/components/__tests__/movimientos-table.test.tsx`: added negative case in "Historico — boton Desconciliar" block — row with `origen='REVERSO', validado=1, reversado=0` does NOT render Desconciliar.
- [x] 3.3 `src/features/tesoreria/components/__tests__/movimientos-table.test.tsx`: added negative case in "Pendientes — boton Rechazar" block — rows with `origen='REVERSO'` (validado=0 and validado=1) do NOT render Rechazar.
- [x] 3.4 `src/features/tesoreria/components/__tests__/movimientos-table.test.tsx`: added REGRESSION GUARD case (new describe block "Pendientes — boton Conciliar (regresion: mecanismo legado reversarMovBancario)") — row with `origen='REVERSO', validado=0, reversado=0` STILL renders Conciliar.

## Phase 4: Scoped Verification

- [x] 4.1 Ran `yarn test:run src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx src/features/tesoreria/components/__tests__/movimientos-table.test.tsx` — 2 files, 21/21 tests passed.
- [ ] 4.2 Manual check (post-deploy note, not blocking): confirm no stray `origen='REVERSO', validado=0` rows are left stuck in Pendientes from the 2026-10-23→10-28 window; if found, re-Conciliar once (self-healing, no SQL needed). (Deferred — not an apply-phase task, requires production DB access.)
