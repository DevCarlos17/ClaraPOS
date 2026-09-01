# Archive Report: deposito-unico-principal

_Change: deposito-unico-principal | Archived: 2026-08-22 | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, PASS WITH WARNINGS (all warnings non-blocking or closed)

## Executive Summary

Closed the gap where an empresa's single active depósito could exist without `es_principal=1`,
leaving the kardex resolvers (`resolveDepositoIngreso`/`resolveDepositoEgresoVenta`, `LIMIT 1` sin
`ORDER BY`) without a deterministic target. Implemented as a third pure invariant
(`debeForzarPrincipalUnico`) enforced in 3 defense-in-depth layers — UI checkbox lock, hook
fail-fast, Postgres reject-only trigger — mirroring the existing at-most-one/at-least-one pattern.

**Verification result**: PASS WITH WARNINGS (engram #2210). 681/681 tests green (up from 680 after
a post-verify regression test), `yarn type-check:test` clean, zero regressions in app source. Both
adversarial foci (hook's new branch dead-code claim, trigger COUNT logic) independently re-derived
as correct with no reachable false-reject or false-accept. All 3 WARNINGs from that pass are now
closed or explicitly accepted as low-risk (see below).

---

## Final Scope Delivered

- **Pure helper** (`debeForzarPrincipalUnico`, `deposito-principal.ts`): third invariant, sibling
  of `buildUnsetOtrosPrincipalesQuery`/`debeBloquearQuitarUltimoPrincipal`.
- **Hook write-path guard** (`use-depositos.ts`): `crearDeposito` fail-fasts before
  `writeTransaction` when the empresa would have 0 other active depósitos and `es_principal=false`;
  `actualizarDeposito` gets a new `podriaDejarActivoSinPrincipal` branch covering the same case on
  update, reusing the already-fetched active-count query.
- **UI wiring** (`deposito-form.tsx` + `deposito-list.tsx`): `es_principal` checkbox is
  disabled+forced-checked when exactly 1 active depósito exists (create: count=0; edit: count=1 on
  an active row), with a Spanish hint. `deposito-list.tsx` passes the count as a prop — no new
  query.
- **DB trigger** (`migrations/0086_deposito_unico_principal.sql`): `BEFORE INSERT`/`UPDATE`
  reject-only trigger pair on `depositos`, mirroring the `validate_venta_*` convention. Source of
  truth for the invariant; never mutates `NEW`.

---

## Verification Evidence

- **First verify pass** (engram #2210, fresh context): PASS WITH WARNINGS. 680/680 tests, clean
  test type-check, zero source regressions, scope tightly matched the planned 6 files + migration.
  Both adversarial foci (Focus A: hook branch dead-code/false-reject/false-accept analysis; Focus B:
  trigger COUNT logic for INSERT/UPDATE) independently re-derived as correct.
- **WARNING #1/#2 (tasks.md 5.1/5.2 unchecked despite passing)**: closed in this archive pass — both
  re-confirmed passing and checkboxes updated in `tasks.md` to reflect the real, already-verified
  state.
- **WARNING #3 (hook query semantic drift)**: the `actualizarDeposito` `podriaDejarActivoSinPrincipal`
  branch originally reused a query filtered `es_principal = 1 AND is_active = 1` (borrowed from the
  at-least-one guard) instead of the unfiltered `is_active = 1` that the pure helper's own JSDoc and
  `crearDeposito`'s equivalent check use. **Remediated**: confirmed by direct source inspection during
  this archive pass (`use-depositos.ts:219`) that the query is now unfiltered
  (`WHERE empresa_id = ? AND is_active = 1 AND id != ?`), achieving true semantic parity with both
  `crearDeposito` and the Postgres trigger (Focus B). This closes the maintainability-trap risk the
  WARNING flagged — the code no longer depends on the inductive invariant to stay correct.
- **Task 5.3 (manual SQL verification, blocked on DB access)**: completed by the maintainer against
  a real Supabase dev branch (engram `sdd/deposito-unico-principal/manual-sql-verify`, obs #2212).
  Reject-cases (INSERT first depósito with `es_principal=FALSE`; UPDATE unsetting `es_principal` on
  the sole active depósito) both correctly failed with `P0001`. Legitimate cases (2nd depósito,
  deactivating a non-principal, marking a depósito principal) all passed. Notable process gotcha
  captured in that observation: the migration file is inert until manually applied in the SQL
  Editor — the first dry-run pass (pre-apply) produced a false PASS.
- **Full suite**: 681/681 tests passing (64 files, up from 680 — includes the WARNING-fix regression
  test added post-verify), `yarn type-check:test` clean.

### Discrepancy note (documentation-only, not a functional gap)

Engram observation #2210 ("fresh adversarial verify") still describes the query-semantic-drift
issue as an open WARNING and reports 680/680 tests — it was not updated after the remediation
landed in source. The remediation itself is real and confirmed directly against the current
working tree in this archive pass (not re-derived from the stale observation text). No action
needed beyond this note; the archive report is now the accurate source of closure for this change.

---

## Residual Notes (non-blocking, carried forward as SUGGESTIONs)

1. `podriaDejarActivoSinPrincipal` checks `actual.is_active === 1` (current state, not resulting
   state), so a reactivate-with-`es_principal=false` call on a currently-inactive depósito isn't
   covered by this specific branch. No exploit path exists today — reaching that precondition
   requires first deactivating the empresa's last active principal, which the pre-existing
   at-least-one guard already blocks. Worth a one-line code comment for future maintainers.
2. The "sync-rollback UX for trigger rejection" design decision (reuse of the generic `uploadFailed`
   toast, `P0001` in `FATAL_RESPONSE_CODES`) was not re-verified in this pass since no code changed
   there — low risk, worth a spot-check if this area is revisited.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/deposito-principal-unico/spec.md` | **Created** (new domain, no prior main spec existed) | 3 Requirements, 9 scenarios, copied verbatim from the delta spec (no corrections needed). |

---

## SDD Cycle Summary

| Phase | Status |
|-------|--------|
| Explore | Complete (engram #2165 / `exploration.md`) |
| Proposal | Complete (engram #2196 / `proposal.md`) |
| Spec | Complete (engram #2197 / `specs/deposito-principal-unico/spec.md`) |
| Design | Complete (engram #2200 / `design.md`) |
| Tasks | Complete (engram #2201 / `tasks.md`, 15/15 items `[x]` after this archive pass) |
| Apply | Complete (engram apply-progress #2204) |
| Verify | PASS WITH WARNINGS (engram #2210); all warnings closed or accepted low-risk in this archive pass |
| Manual SQL (task 5.3) | PASS by maintainer (engram `sdd/deposito-unico-principal/manual-sql-verify`, obs #2212) |
| Archive | Complete — this report |

The SDD cycle for `deposito-unico-principal` is fully complete: 681/681 tests green,
`yarn type-check:test` clean, no CRITICAL issues, no open blockers. Ready for PR review (handled by
the orchestrator/maintainer, not this agent — no commit/push performed by this archive pass).
