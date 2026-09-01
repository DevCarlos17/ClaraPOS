# Archive Report: guarda-deposito-inactivo

_Change: guarda-deposito-inactivo | Archived: 2026-08-22 | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, PASS (both slices, no open blockers)

## Executive Summary

Closed the gap where `depositos.is_active` was decorative: nothing in the write-path (venta, desactivación de depósito, notas de crédito) verified that the depósito destino/origen was still active. Delivered as 2 stacked slices mirroring PR #57's (`deposito-unico-principal`) 2-layer philosophy — app-level fail-fast guards + Postgres reject-only trigger, plus proactive UX to prevent the invalid state from being reachable at all.

**Verification result**: PASS on both slices. Slice A (engram #2234): 702/702 tests, `type-check:test` clean, 6/6 in-scope scenarios compliant. Slice B (engram #2237): 711/711 tests, `type-check:test` clean, 6/6 in-scope scenarios compliant. Combined: 711/711 tests green, zero regressions, zero CRITICAL/WARNING findings across both adversarial verify passes. The maintainer independently ran migration 0087's manual SQL verification against a real Supabase branch — PASS (documented below).

---

## Final Scope Delivered

### Slice A (PR #58, merged) — deactivation guard + reassignment UX + transparency
- **Pure helpers** (`deposito-inactivo.ts`): `agruparCajasPorDeposito`, `resolveBloqueoDesactivacion` — decide whether deactivation is blocked (open session vs. caja-without-session vs. no cajas referencing it).
- **Hook guard** (`use-depositos.ts`): `actualizarDeposito` fail-fasts before `writeTransaction` when the depósito is referenced by any caja.
- **Proactive UX** (`reasignar-caja-dialog.tsx` new, `deposito-list.tsx`): toggling a depósito off checks the already-loaded cajas-per-depósito map — open session → blocking toast; caja without session → reassignment dialog (reassign all affected cajas, then deactivate); no cajas → direct call. Depósitos list gained a transparency column showing which cajas use each depósito and their session state.

### Slice B (PR #59, merged) — sale hard-block + NCR fallback + DB trigger
- **Pure helper addition** (`deposito-inactivo.ts`): `resolveDepositoReingresoNcr(origenId, origenActivo, principalId)` — origin if still active, else principal, else `null`.
- **Sale guard** (`use-ventas.ts`): `crearVenta` hard-throws in Spanish (no fallback, per product decision #2) if the caja's resolved egress depósito is inactive — first operation inside `writeTransaction`, before any stock/kardex write.
- **Read-hook cosmetic fallback** (`use-deposito-activo.ts`): `useDepositoActivoVenta` treats an inactive caja depósito as `null` for stock display purposes only; `crearVenta` independently re-validates and blocks on write.
- **NCR POS-express fallback** (`use-notas-credito.ts`): `crearNotaCredito` resolves `venta.deposito_id`'s active state and applies `resolveDepositoReingresoNcr` before any kardex INSERT — automatic, no prompt to the cajero, per product decision #3.
- **DB trigger** (`migrations/0087_deposito_inactivo_guard.sql`): extends (not duplicates) the existing `validate_movimiento_inventario_insert()` with a reject-only `is_active` check — defense-in-depth mirroring `0086`. Guaranteed to never false-reject the NCR fallback because the app always resolves an active depósito before constructing the INSERT.

---

## Verification Evidence

- **Slice A verify** (engram #2234, fresh context, branch `feat/guarda-deposito-inactivo-slice-a`): PASS. 702/702 tests (67 files), `type-check:test` clean. 3 adversarial foci (deactivation-guard correctness, transparency query N+1/tenant-scope, reassignment-dialog structural impossibility of reassigning into an inactive depósito) all re-derived as correct. 0 CRITICAL, 0 WARNING, 1 informational SUGGESTION (non-blocking accessibility-pattern note).
- **Slice B verify** (engram #2237, fresh context, branch `feat/guarda-deposito-inactivo-slice-b`): PASS. 711/711 tests (68 files, +9 new, 0 regressions), `type-check:test` clean. 3 adversarial foci (sale hard-block ordering, NCR fallback resolution ordering, trigger-vs-fallback ordering) all re-derived as correct. 0 CRITICAL, 0 WARNING, 1 informational SUGGESTION (Slice B's two new UUID-PK lookups lack an explicit `empresa_id` filter — confirmed consistent with the pre-existing repo-wide convention documented in CLAUDE.md, not a regression).
- **Manual SQL verification of migration 0087** (maintainer, real Supabase dev branch, referenced in obs #2233/#2237): PASS. Raw INSERT to an inactive depósito → REJECTED (`P0001`). INSERT to an active depósito → passed. NCR-fallback-resolved INSERT to the active principal → passed (trigger never false-rejects a legitimate fallback). Pre-existing negative-stock/consistency checks → still reject. DELETE on `movimientos_inventario` → still blocked (kardex immutability intact). Migration 0087 is confirmed applied to Supabase by the maintainer.
- **Full suite (post-merge, both slices combined)**: 711/711 tests passing (68 files), `yarn type-check:test` clean.
- **Scope creep checks** (both slice verify passes): `git diff --stat` confirmed each slice touched only its declared files; Slice B confirmed `abrirSesionCaja`/`use-cajas.ts` and Slice A UI files genuinely untouched.
- **tasks.md**: all 18 checkboxes (Phases 1–5) were `[x]` before this archive pass — no remediation needed, unlike the prior `deposito-unico-principal` archive which had to close 2 stale-checkbox warnings.

---

## Product Decisions Applied (engram #2228)

1. **Desactivación**: block while any caja references the depósito (open session or not); UI proactively offers reassignment before deactivating — attacks the root cause so the "caja points to inactive depósito" state is nearly unreachable.
2. **Venta**: hard-block, no fallback, if the caja's resolved depósito is inactive.
3. **NCR — two paths**: POS-express (implemented here) reingresa automatically to origin, falling back to principal if origin is inactive, with zero cajero choice. The administrative NCR module (explicit destino choice, total/partial return) does **not exist yet** — explicitly out of scope, noted as future work.
4. **DB guard**: yes, reject-only trigger, same 2-layer philosophy as PR #57.
5. **Out of scope**: Finding 1 (checkbox UX for `es_principal` with 2+ depósitos) — separate direct fix.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/deposito-inactivo-guard/spec.md` | **Created** (new domain, no prior main spec existed) | 6 Requirements, 14 scenarios, copied verbatim from the delta spec (no corrections needed — spec text matched shipped behavior exactly). |

---

## Residual Notes (non-blocking, carried forward as SUGGESTIONs / backlog)

1. **`abrirSesionCaja` guard deferred** (tasks.md 5.2, design decision #6, backlog #2231): no guard added when opening a caja session against an inactive-depósito caja. Design rationale: the deactivation-reassignment flow (decision #1) already makes this state nearly unreachable, and the sale guard (requirement 3) is the real enforcement point at time of use. If a future audit finds a caja pointing to an inactive depósito with an open session reaching this path, revisit.
2. **NCR administrative module**: not built. When it ships, it will need its own explicit destino-depósito choice UX and spec — the POS-express automatic fallback implemented in this change does not cover it.
3. **Finding 1 (checkbox `es_principal` UX with 2+ active depósitos)**: explicitly out of scope for this change; still pending as a separate direct fix (no SDD cycle needed, per proposal.md).
4. **Multi-tenant SUGGESTION from Slice B verify**: the two new UUID-PK lookups added in this slice don't filter by `empresa_id` — confirmed as consistent with the pre-existing repo-wide convention (RLS does not filter by `empresa_id`; isolation is frontend-query-level; IDs are non-guessable UUIDs scoped upstream). Informational only, not a gap introduced by this change.

---

## SDD Cycle Summary

| Phase | Status |
|-------|--------|
| Proposal | Complete (engram #2226 / `proposal.md`) |
| Product decisions | Complete (engram #2228, `architecture/deposito-inactivo-y-notas-credito`) |
| Spec | Complete (engram #2229 / `specs/deposito-inactivo-guard/spec.md`) |
| Design | Complete (engram #2230 / `design.md`) |
| Tasks | Complete (engram #2232 / `tasks.md`, 18/18 items `[x]`) |
| Apply — Slice A | Complete, merged PR #58 |
| Apply — Slice B | Complete, merged PR #59 (engram apply-progress #2233, covers both slices) |
| Verify — Slice A | PASS (engram #2234 / `verify-report-slice-a.md`) |
| Verify — Slice B | PASS (engram #2237 / `verify-report-slice-b.md`, filesystem copy created during this archive pass) |
| Manual SQL (migration 0087) | PASS by maintainer on real Supabase branch; migration applied |
| Archive | Complete — this report |

The SDD cycle for `guarda-deposito-inactivo` is fully complete: both slices merged to `develop`, 711/711 tests green, `yarn type-check:test` clean, no CRITICAL/WARNING issues, no open blockers. No commit/push performed by this archive pass — the working-tree file moves below are ready for the orchestrator/maintainer to commit.
