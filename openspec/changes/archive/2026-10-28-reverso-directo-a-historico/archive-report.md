# Archive Report: Reverso de abono directo aterriza en Histórico, no en Pendientes

**Change**: `reverso-directo-a-historico`
**Epic**: `reverso-abono-tesoreria`
**Archived**: 2026-10-28
**Branch**: `feat/tesoreria-reverso-directo-a-historico` (off `origin/develop`)
**Shipped commit**: `251a32a` — `feat(tesoreria): reverso de abono directo entra validado a historico`
**Verify verdict**: **PASS** (engram `sdd/reverso-abono-tesoreria/verify-report-directo-historico`, obs #5934)

## What Shipped

The egreso-contraparte created by `reversarAbonoDirectoDesdeTesoreria` (in
`src/features/tesoreria/hooks/use-reverso-abono-directo.ts`) now inserts with:

- `validado=1` (was `0`)
- `validado_por` = the user id who confirmed the reverso (was `NULL`)
- `validado_at` = the reverso timestamp (was `NULL`)

Effect: the reverso row lands directly in "Histórico" with badge "Validado" and
only the "Desconciliar" action available. It never appears in "Pendientes" and
can never be routed through "Conciliar"/"Rechazar"/"Reversar" — a reverso is a
deliberate act, not something that needs manual conciliation or that could be
rejected.

No changes were needed in `movimientos-table.tsx` — the UI gates were already
origin/validado-agnostic from a prior change (PR #265 / `split-desconciliar-reversar-historico`),
so they picked up the corrected `validado=1` value without any code change,
confirmed by an explicit regression test and an empty `git diff` on that file.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Option B: set both `validado_por` and `validado_at` on insert (not just `validado=1`) | Full audit trail, consistent with the system's immutable-audit principle (CLAUDE.md rule #2); mirrors the `validado_por`/`validado_at` sourcing pattern already used by `validarMovBancario` |
| Strict TDD OFF for this change | Owner override — tests and the 1-3 line prod fix implemented together, not RED-first |
| Scoped test command only (`use-reverso-abono-directo.test.ts` + `conciliacion-tesoreria.test.tsx`) | Owner override — explicitly forbade running the full suite in both apply and verify phases |
| Branch cut from `origin/develop`, not the local branch in use at proposal time | The local branch predates the `reverso-abono-tesoreria` epic and lacks the code this change modifies |
| No migration/trigger change | `prevent_mov_bancario_mutation` doesn't restrict `validado` or fire on INSERT — pure application-layer fix |

## Verify Verdict Summary

**PASS** — 5/5 spec scenarios compliant with real, non-vacuous passing tests.

- Insert correctness: verified exact column/param alignment (15 columns ↔ 15 params), `validado_por`/`validado_at` are real bind params sourced from `useCurrentUser()`, not hardcoded/null.
- Balance invariant: byte-identical balance math pre/post change, confirmed via diff — no double/skipped decrement.
- Gate regression: new describe block in `conciliacion-tesoreria.test.tsx` asserts Histórico shows "Validado" + only "Desconciliar", Pendientes stays empty, zero diff in `movimientos-table.tsx`.
- Scope: exactly 3 tracked files modified (1 prod, 2 test), no migrations/SAF/cuadre-de-caja/consulta-de-factura touched.
- Multi-factura fan-in (N=2, N=3): single egreso per reverso regardless of N, each carrying `validado=1`.
- Test integrity: `parseInsertEgreso()` helper derives assertions from the actual SQL column list (not hardcoded indices) — a reverted `validado` param or a reordered column list would both be caught.

Test run: `yarn test:run src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx` → 2 files passed, 15/15 tests passed.

Task 4.1 (full suite run) was left unchecked — explicit, repeated owner-approved skip, not a gap.

## Files Changed (production)

| File | Change |
|------|--------|
| `src/features/tesoreria/hooks/use-reverso-abono-directo.ts` | `INSERT INTO movimientos_bancarios`: added `validado_por, validado_at` columns + 2 placeholders, flipped `validado` param `0→1`, passed `userId`/`now`. Updated orchestrator JSDoc (step ii). |
| `src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts` | Added `parseInsertEgreso()` helper; asserted `validado=1`/`validado_por`/`validado_at` on simple + 2 global-abono scenarios. |
| `src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx` | New describe block: reverso row renders in Histórico as "Validado" with only "Desconciliar"; Pendientes stays empty; "Desconciliar" click wiring. |

## Spec Sync

`openspec/changes/reverso-directo-a-historico/specs/tesoreria-reverso-abono-directo/spec.md`
(MODIFIED requirements only) merged into the canonical
`openspec/specs/tesoreria-reverso-abono-directo/spec.md`:

- **Requirement: Reverso simple (1 factura, sin SAF)** — insert effects line now includes `validado=1`, `validado_por`, `validado_at`; added scenario "El egreso-reverso aterriza directo en Histórico como Validado, solo con Desconciliar".
- **Requirement: Reverso de abono global (N facturas, sin SAF)** — single-egreso effect now includes `validado=1`, `validado_por`, `validado_at`.
- All other requirements in the canonical spec (SAF block, double-reverso rejection, permission/PIN, atomicity, multi-tenant isolation) are untouched — this change did not modify them.

## Carried Forward (same `reverso-abono-tesoreria` epic batch, NOT part of this change)

| Change | Status |
|--------|--------|
| `reverso-desde-consulta-factura` | Not archived here — separate change in the same epic, out of scope for this proposal |
| `cuadre-de-caja-reverso` | Not archived here — separate change in the same epic, out of scope for this proposal |

## Housekeeping Note (non-blocking)

The repo root carries unrelated untracked scratch files (`todo.md`, `schema_prod.sql`,
`*.diff`/`*.txt`, an `.xlsx`, a `.zip`, several unrelated `openspec/changes/*` folders from
other in-flight work) predating this change. None were touched by this archive operation;
`git add` was scoped explicitly to this change's spec/archive paths, never `-A`.
