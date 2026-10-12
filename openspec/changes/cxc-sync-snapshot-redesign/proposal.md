# Proposal: CxC Data-Model Foundation — Derived `estado` + Materialized SAF

> Change: `cxc-sync-snapshot-redesign` | Phase: propose | Project: clarapos

## Intent

CxC balance and pending-invoice reads today require full unindexed scans of `movimientos_cuenta` (all-time) to compute SAF and infer invoice state, and `clientes.saldo_actual` is maintained by **17 independent client write-sites** plus one Postgres trigger — two writers that can silently diverge. This change hardens the **data model only**: make invoice state and SAF snapshot O(1)-readable and single-sourced, before any sync-layer optimization is attempted. Sequencing: data-model first (this change); `powersync-sync-scope-optimization` (currently PAUSED) handles sync-rules changes afterward, isolating blast radius one layer at a time.

## Scope

### In Scope
1. `ventas.estado` (pendiente/parcial/pago/reversado) — trigger-derived, never hand-written; add to `prevent_venta_mutation()` whitelist in the same migration.
2. `clientes.saf_disponible` — materialized SAF snapshot, trigger-maintained.
3. Extend `actualizar_saldo_cliente()` to be the single authority for `saldo_actual` + `estado` + `saf_disponible` from `movimientos_cuenta`. State the consolidation direction only; sequencing of the 17 write-site retirements is a design/tasks concern.
4. Read-only backfill deriving `estado`/`saf_disponible` for existing rows — never mutates `movimientos_cuenta`.
5. `reversado` implemented as a real `estado` value (resolves the `REVERSADA` dead-code ghost in `use-cxc.ts:151`).

### Out of Scope
- `backend/powersync-sync-rules.yaml` (bucket/stream windowing, role filtering) — sibling change, sequenced after.
- `libro_contable` no-sync, device-count limiting, sesiones de caja sync changes.
- UI hooks beyond reading the new columns — balance/pending-invoice display contract is frozen.

## Capabilities

### New Capabilities
- `ventas-estado-derivado`: Trigger-derived invoice state machine (`pendiente`/`parcial`/`pago`/`reversado`) replacing the dead-end 2-value `status` CHECK and the `use-cxc.ts` client-side `'REVERSADA'` filter.
- `cliente-saf-materializado`: Materialized `clientes.saf_disponible` column, O(1) SAF read, trigger-maintained in lockstep with `saldo_actual`.

### Modified Capabilities
None — UI-facing read contract (balance + pending-invoice list) is frozen per scope; no existing spec's requirements change at the behavior level, only the underlying data source hardens.

## Approach

Extend the existing `actualizar_saldo_cliente()` Postgres trigger (already authoritative for `saldo_actual` since migration 0061) to also derive `estado` per invoice from the 8-value `movimientos_cuenta.tipo` alphabet, and `saf_disponible` from `SUM(SAFC)-SUM(SAF)`, in the same INSERT-time pass. Update `prevent_venta_mutation()` in the same migration to whitelist `estado` (lesson from migration 0097: an un-whitelisted column silently rejects legitimate UPDATEs via a FATAL Postgres error the PowerSync connector swallows). Run a read-only backfill function against existing history to populate both columns once, before the trigger goes live for new writes.

**Flagged for Design, not solved here**: PostgreSQL triggers do not run on local SQLite — the offline-hybrid reconciliation strategy (how local optimistic writes keep `estado`/`saf_disponible` consistent before server-trigger replication) is the #1 open risk and must be resolved in `design.md`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/NNNN_ventas_estado.sql` (new) | New | Adds `ventas.estado`, updates `prevent_venta_mutation()` whitelist |
| `migrations/NNNN_saf_disponible.sql` (new) | New | Adds `clientes.saf_disponible` |
| `migrations/NNNN_extend_actualizar_saldo_cliente.sql` (new) | Modified | Extends trigger to derive `estado` + `saf_disponible` |
| `migrations/NNNN_backfill_estado_saf.sql` (new) | New | One-time read-only backfill, no ledger writes |
| `src/core/db/powersync/schema.ts` | Modified | Add `estado`, `saf_disponible` columns (text/numeric per PowerSync mapping) |
| `src/features/cxc/hooks/use-cxc.ts` | Modified (read-only) | Read `estado`/`saf_disponible` instead of re-deriving; remove dead `'REVERSADA'` filter |
| `src/features/ventas/hooks/use-ventas.ts`, `use-notas-credito.ts`, `use-importar-cxc.ts` | Flagged (not touched here) | 17 write-sites are consolidation targets for a later slice/design decision |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Offline-hybrid trigger correctness gap — no local SQLite triggers, optimistic-vs-authoritative drift | High | Must be resolved in Design before implementation; not solved by this proposal |
| `prevent_venta_mutation()` silently rejects the new column (same bug class as pre-0097) | Medium | Whitelist update MUST ship in the same migration as the column, verified via BEGIN/ROLLBACK spike |
| Backfill accidentally mutates `movimientos_cuenta` | Low | Backfill is read-only against the ledger; only `UPDATE ventas`/`UPDATE clientes` writes allowed |
| Reconciliation invariant breaks (`saldo_actual` != pending − SAF net) | Medium | Add invariant check as part of backfill validation and design-phase test plan |
| Scope creep into the 17 write-sites in this change | Medium | Explicitly deferred to design/tasks; this proposal only states trigger-as-authority direction |

## Rollback Plan

Additive-only change: backfill populates new columns without touching `movimientos_cuenta`. Rollback = drop `ventas.estado` and `clientes.saf_disponible` columns, revert `prevent_venta_mutation()` and `actualizar_saldo_cliente()` to pre-change versions via down-migration. No data loss since the ledger (`movimientos_cuenta`) is never rewritten. Each migration file must ship with a tested rollback script, verified via `BEGIN; ...; ROLLBACK;` against prod (alpha stage, owner's own verification method, no staging exists).

## Dependencies

- Sequenced BEFORE `powersync-sync-scope-optimization` (PAUSED) — that change resumes against the hardened schema, likely replacing its legacy-bucket windowing mechanism per the sibling's own D3b note; not re-decided here.
- Migration 0097 (`prevent_venta_mutation()` whitelist precedent) and migration 0090 (`movimientos_cuenta.tipo` 8-value CHECK) are the direct technical foundations this trigger extension builds on.

## Effort Forecast

### Review Workload Forecast
- **Estimated changed lines**: ~350-500 (4-5 new migration files ~40-80 lines each + schema.ts diff ~20 lines + use-cxc.ts read-path diff ~30-50 lines + backfill validation script).
- **Chained PRs recommended**: Yes — natural slices: (1) schema + `estado` column + whitelist fix, (2) `saf_disponible` column, (3) trigger extension, (4) backfill, (5) UI read-adaptation.
- **400-line budget risk**: Medium — likely to exceed as a single PR; comfortably under budget per slice if chained.
- **Decision needed before apply**: Yes — confirm chained-PR slicing order with owner before `sdd-tasks` locks the sequence (trigger extension must ship with whitelist fix atomically; backfill must run after trigger exists but derive from pre-trigger data).

## Success Criteria

- [ ] `ventas.estado` and `clientes.saf_disponible` exist, trigger-derived, never hand-written from the client.
- [ ] Backfill populates both columns for all existing rows without any `movimientos_cuenta` mutation (verified by checksum/row-count diff before/after).
- [ ] Reconciliation invariant holds for 100% of clients: `saldo_actual == SUM(pending saldo_pend_usd) - (SUM(SAFC)-SUM(SAF))`.
- [ ] `prevent_venta_mutation()` accepts `estado` UPDATEs from the trigger without rejecting (no FATAL errors in PowerSync connector logs).
- [ ] CxC UI (balance + pending-invoice list) renders identically to pre-change behavior — no visual/behavioral regression.
- [ ] `REVERSADA` dead-code filter removed from `use-cxc.ts`, replaced by real `estado = 'reversado'` filtering.
