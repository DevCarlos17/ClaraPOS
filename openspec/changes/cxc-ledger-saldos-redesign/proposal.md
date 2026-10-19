# Proposal: CxC Ledger Saldos Redesign (Approach A)

## Intent

Debt per client is recomputed on every read via a full `SUM(ventas.saldo_pend_usd)` scan, duplicated across 3 call-sites (`use-cxc.ts:100`, `use-deuda-cliente.ts:24,50`) — the "device recalculates history" problem. Meanwhile `estado` already exists (0106-0108) but a sibling predicate (`saldo_pend_usd > 0`) still competes with it in the same file (`use-cxc.ts:99` vs `:172`). Multi-invoice abonos have no per-invoice application audit (SAF has one, abonos don't — `use-cxc.ts:1049-1200`). Reversing a payment whose remainder was already promoted to a consumed SAF lote has no defined cascade today.

## Scope

### In Scope
- Materialize `clientes.saldo_pendiente_usd`, atomic CASE-UPDATE pattern mirroring `saf_disponible` (migration 0102) — no read-before-write.
- New auxiliary table `pagos_aplicaciones` (mirrors `saf_creditos_aplicaciones`): pago_id, venta_id, monto_aplicado_usd, saldo-before/after, empresa_id, audit fields.
- Unify the two "pending" predicates (`use-cxc.ts:99-100` vs `:172`) onto the already-derived `estado` column.
- Compensation-based reversal capability: a function/hook that, given a `pago`, reports whether it generated a SAF lote, whether consumed, and which invoices/amounts need to return to pending — using the existing `saf_creditos_lotes.origen_tipo='PAGO'+origen_id` link (`idx_saf_lotes_origen`). Produces inverse (contra) entries; no mutation of historical rows.

### Out of Scope
- Front-end/module rewrite of CxC/caja/cuadre/tesorería — only touched where they read the changed columns.
- Reversal confirmation UI/modal — separate later SDD change.
- Replacing or restructuring SAF v2 (`saf_creditos_lotes`/`aplicaciones`) — stays intact.
- Converting `pagos` into SAF lotes.
- `movimientos_metodo_cobro` currency-ambiguity fix (§3 of exploration) — confirmed contained, not load-bearing here; flagged as a candidate separate change.

## Capabilities

### New Capabilities
- `cxc-saldo-pendiente-materializado`: O(1) client debt column, atomic trigger maintenance.
- `cxc-pagos-aplicaciones`: per-invoice application audit trail for abonos (header `pagos` + new auxiliary).
- `cxc-reversa-pago-saf`: compensation-cascade logic for reversing a payment that consumed a SAF lote.

### Modified Capabilities
- None. Predicate unification onto `estado` is an internal fix to already-shipped behavior (0106-0108), not a new spec-level contract.

## Approach

Approach A from exploration: minimal, proven-pattern materialization (not a full ledger promotion of `movimientos_cuenta`). Each deliverable mirrors an already-shipped, tested pattern (saf_disponible atomic UPDATE; saf_creditos_aplicaciones aux-table shape) rather than inventing new mechanics.

## Non-Negotiable Constraints
- Immutability: `pagos_aplicaciones` append-only (no UPDATE/DELETE), reversal by contra-entry only.
- Every new/touched table and query filters by `empresa_id`.
- Bimonetario + `NUMERIC(20,8)` on new financial columns.
- Offline-first: local `writeTransaction()` mirrors server trigger logic optimistically.
- PowerSync: declare client-side indexes for `saldo_pendiente_usd` reads and `pagos_aplicaciones` in `schema.ts`.
- Must not regress cuadre/tesorería/caja/CxC (all currently correct per exploration §3).

## Affected Areas

| Area | Impact | Files (from exploration) |
|------|--------|---------------------------|
| Client debt reads | Modified | `use-cxc.ts:99-101`, `use-deuda-cliente.ts:24,50` |
| Pending-invoice predicate | Modified | `use-cxc.ts:99-100,163-178` |
| Abono application | New | `use-cxc.ts:1025-1141` (registrarAbonoGlobal) |
| Payment reversal | New | `use-cxc.ts:1410-1496,2092` (existing reverso flow) |
| PowerSync schema | Modified | `src/core/db/powersync/schema.ts` |
| Migrations | New | mirrors 0101/0102 (saldo) + 0104/0105 (aux table) shapes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overlap with uncommitted `powersync-sync-scope-optimization` proposal on same tables | Med | Reconcile scope boundary in design phase before migrations land |
| Backfill gap for historical abonos in `pagos_aplicaciones` | Med | Follow 0105 precedent: ship empty, document explicitly (resolve in design) |
| Reversal cascade correctness (multi-invoice FIFO) | Med | Reuse existing `origen_id` link + exhaustive test coverage per strict TDD |

## Rollback Plan

Each migration ships with a down-path: drop `saldo_pendiente_usd` column/trigger branch, drop `pagos_aplicaciones` table, remove reversal function — none touch existing `ventas`/`saf_*`/`movimientos_cuenta` data. Revert is additive-only removal; no existing row is ever mutated, so rollback cannot corrupt historical data.

## Dependencies

- Resolution of scope boundary with `powersync-sync-scope-optimization` (same tables) — recommend running before or coordinating, not independently.

## Open Questions (resolve in DESIGN phase)

1. Does `pagos_aplicaciones` start empty (0105 precedent) or backfill historical `pagos`?
2. Is the `movimientos_metodo_cobro` currency-mixing bug in-scope here, or a separate change? (Lean: separate — doesn't affect cuadre math, which reads `pagos` directly.)
3. Is a reconciliation check (materialized `saldo_pendiente_usd` vs ledger-derived) needed, and as what (cron/CI job, on-write assertion)?

## Phasing Hint

Blast radius likely spans 2+ PRs: (1) `saldo_pendiente_usd` materialization + predicate unification (small, low-risk, mirrors 0101/0102), (2) `pagos_aplicaciones` + reversal cascade logic (larger, touches `use-cxc.ts` reversal paths — flag for chained/stacked PRs in tasks phase).

## Success Criteria

- [ ] Client debt reads are O(1) column reads, zero `SUM(ventas...)` scans remain in `use-cxc.ts`/`use-deuda-cliente.ts`.
- [ ] Single `estado`-based predicate for "pending", no `saldo_pend_usd > 0` duplicate check remains.
- [ ] `pagos_aplicaciones` records every FIFO abono application with before/after snapshots.
- [ ] A reversal query function correctly reports affected invoices/amounts for a payment that consumed a SAF lote, without mutating any row.
