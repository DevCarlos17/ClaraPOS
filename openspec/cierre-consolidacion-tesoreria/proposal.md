# Proposal: cierre-consolidacion-tesoreria

_Date: 2026-07-22 | Model: anthropic/claude-sonnet-5_

---

## Intent

Today `cerrarSesionCaja` computes per-method totals into `sesiones_caja_detalle` but never routes the money to Tesorería — cash and POS/tarjeta totals stay parked in `metodos_cobro.saldo_actual`, and the only nudge is a UI toast telling the cashier to deposit manually. This change automates that: on cierre, each method's total is consolidated as a PENDING (`validado=0`) transfer to its correct destination (bank or caja fuerte), atomically, in the same transaction that closes the session.

This also fixes a **confirmed pre-existing production bug**: `traspasos_tesoreria_cuenta_origen_tipo_check`/`_destino_tipo_check` (migration 0035) only allow `('BANCO','CAJA_FUERTE')`, but the existing `crearTraspasoSesionATesoreria`/`crearTraspasoTesoreriaASesion` (from `pos-tesoreria-integration`) already insert `'SESION_CAJA'` — verified live against Supabase. Those flows silently fail to sync to Postgres today (23514), working only in local SQLite. This change's migration fixes that for both old and new flows.

---

## Scope

### In Scope

- Add consolidation steps to `cerrarSesionCaja`'s existing `db.writeTransaction` (after `sesiones_caja_detalle` is populated): for each used method with `totalSistemaD > 0`, INSERT a PENDING (`validado=0`) transfer to its destination + a `traspasos_tesoreria` row tagged `sesion_caja_id`.
- Routing: efectivo Bs → the tenant's unique Bs caja fuerte; efectivo $ → the unique USD caja fuerte; other methods (e.g. tarjeta/POS) with `banco_empresa_id` → that bank, as INGRESO. Never mix USD/Bs sums — each method routes in its own `moneda_id`.
- Generalize/extend `crearTraspasoSesionATesoreria` (`use-traspasos.ts`) to also support a BANCO destination, refactored to accept a `tx` handle (PowerSync `writeTransaction` cannot nest — it must be callable from inside `cerrarSesionCaja`'s existing transaction, not open its own).
- **Migration `0077`**: idempotent `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` on both `traspasos_tesoreria` CHECK columns to include `'SESION_CAJA'` (pattern from 0073/0027). Required prerequisite, not optional — also the sync-bug fix above.
- **Commission handling (Option A2, confirmed)**: for methods with `comision_pct > 0`, deposit the gross total to the bank as INGRESO, AND create a real `gastos` row against the tenant's "comisiones bancarias" account — with Bs currency, tasa, and USD equivalent like any other gasto.
- **Hard-fail validation**: a used method with no valid destination (no bank/caja fuerte configured) MUST abort the whole cierre with a clear Spanish error naming the method. No silent skip.
- Remove the "recuerda depositar" toast in `sesion-caja-form.tsx` — redundant once deposits are automatic.

### Out of Scope

- POS batch/lote number entry in cuadre (auxiliary lote-amount table) — deferred to a future change.
- Histórico de lotes UI in the bancos module — deferred.
- Reopening a closed session (doesn't exist today; not introduced here).
- Fixing the pre-existing `caja_fuerte.saldo_actual` read-then-write race on concurrent closes (noted as risk only).
- Test infrastructure (none exists in this project).

---

## Capabilities

> Existing specs: `openspec/specs/caja/spec.md` (SAF), `openspec/specs/prestamos/spec.md`. No `tesoreria` spec exists yet.

### New Capabilities

- `tesoreria-consolidacion-cierre`: automatic, atomic routing of a closed session's per-method totals to Tesorería as pending bank/caja-fuerte transfers, including commission-as-gasto handling and hard-fail validation.

### Modified Capabilities

- `caja`: `cerrarSesionCaja` gains consolidation as new steps inside its existing transaction; the manual-deposit reminder toast is removed.

---

## Approach

Extend `cerrarSesionCaja` (Option 1 from exploration — same transaction, not a separate post-cierre call) so atomicity and idempotency come for free from the existing `status='ABIERTA'` guard. Reuse the already-computed `sesiones_caja_detalle` per-method totals (step 6 of cierre) as the single source of truth — never recompute via React read-hooks, which cannot run inside a `writeTransaction`. Loop over `metodosUsadosResult`, skip `metodo_cobro_id IS NULL` (SAF) rows and non-positive totals, resolve each method's destination, and insert the PENDING transfer + `traspasos_tesoreria` row. For commission methods, additionally insert a `gastos` row (Option A2) in the same transaction.

---

## Locked Decisions (do not re-litigate downstream)

1. **Commission = Option A2**: gross deposit to bank + real `gastos` entry against "comisiones bancarias" account (Bs + tasa + USD equivalent).
2. **`origen` values**: caja fuerte side reuses reserved-but-unused `'DEPOSITO_CIERRE'` (migration 0035, no migration needed). Bank side: reuse `'DEPOSITO_CAJA'` or add `'CIERRE_CONSOLIDACION'` — pick at design time (UI label dictionaries only).
3. **Hard-fail on misconfiguration**: a used method with no valid bank/caja-fuerte destination MUST fail the whole cierre with a Spanish error naming the method — never silent skip. Whole cierre rolls back atomically.
4. **Remove "recuerda depositar" toast** in `sesion-caja-form.tsx`.
5. **`deposito_directo` semantics**: to be clarified in design by reading current usage; not a blocker.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modified | `cerrarSesionCaja` (~line 653) gains consolidation steps 7-9 in its existing `writeTransaction` |
| `src/features/tesoreria/hooks/use-traspasos.ts` | Modified | `crearTraspasoSesionATesoreria` generalized for BANCO destination + refactored to accept a `tx` handle (no nested transaction) |
| `migrations/0077_*.sql` (new) | New | Fix `traspasos_tesoreria` CHECK constraints (both columns) to allow `'SESION_CAJA'`; possibly new `movimientos_bancarios` origen value |
| `src/core/db/kysely/types.ts` | Modified | Update `origen` comments if new values added |
| `src/features/caja/components/sesion-caja-form.tsx` | Modified | Remove "recuerda depositar" toast |
| `src/features/tesoreria/components/movimientos-table.tsx`, `reverso-modal.tsx`, `src/features/bancos/components/conciliacion-bancaria.tsx` | Modified | Local origen→label dictionaries — add label(s) if new origen value introduced |
| `src/features/tesoreria/utils/export-tesoreria.ts` | None | Origen-agnostic (`validado=0 AND reversado=0`) — new rows appear automatically |
| `gastos` domain (feature TBD in design) | New usage | Machine-generated commission expense per commission-bearing cierre |

---

## Open Design Details (not blockers)

- Exact bank-side `origen` value (`DEPOSITO_CAJA` vs new `CIERRE_CONSOLIDACION`).
- How the "comisiones bancarias" `cuentas_config`/account is resolved per tenant, and whether `gasto_pagos`/tax fields are required for a machine-generated gasto.
- `deposito_directo` flag semantics relative to this flow.
- Pre-existing `caja_fuerte.saldo_actual` read-then-write race on concurrent session closes — out of scope to fix, flag only.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|--------------|
| CHECK constraint gap silently broke prior Tesorería sync in production | Confirmed (live-verified) | Migration 0077 in this change's critical path |
| Method with commission/activity but no bank/caja-fuerte configured | Medium | Hard-fail validation aborts whole cierre atomically (Decision 3) |
| Auto-generated `gastos` row hits missing tenant config (no "comisiones bancarias" account) | Medium | Design phase must define resolution + fallback/error path |
| Larger `writeTransaction` per cierre (more inserts) | Low | Incremental vs existing 2 SELECT+UPDATE+N-insert cierre; no new order of magnitude |
| Concurrent session closes racing on same caja fuerte `saldo_actual` | Low (pre-existing) | Not fixed here; documented for future hardening |

---

## Rollback Plan

- **Migration 0077** is additive/idempotent (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`) — revertible by re-running the DROP without the new value, no data loss since no rows depend on it being absent.
- **Frontend**: consolidation logic is confined to `cerrarSesionCaja` and `use-traspasos.ts` — revert via `git revert` of the affected commits; no other module depends on the new behavior.
- **Commission gasto rows**: standard `gastos` inserts, reversible like any other gasto entry (no special immutability constraint beyond the project's general append-only rules).

---

## Dependencies

- Migration 0077 must land before or with the code change (hard prerequisite — the transfer inserts fail without it).
- PRs for this change target branch `feat/decimal-p5-final` (project convention), not `main`.

---

## Success Criteria

- [ ] Closing a session with efectivo activity creates PENDING `mov_caja_fuerte` rows in the correct-currency caja fuerte.
- [ ] Closing a session with a bank-linked method creates a PENDING `movimientos_bancarios` INGRESO in that bank, tagged via `traspasos_tesoreria` with `sesion_caja_id`.
- [ ] A commission-bearing method also produces a real `gastos` row against "comisiones bancarias" with correct Bs/USD/tasa.
- [ ] A used method with no destination configured aborts the entire cierre with a clear Spanish error — no partial writes.
- [ ] Migration 0077 applies cleanly and re-run is a no-op; `'SESION_CAJA'` traspasos now sync to Supabase without 23514 errors.
- [ ] The "recuerda depositar" toast no longer appears.
- [ ] `yarn type-check` and `yarn lint` pass.

---

## Estimated Effort / Review Size

**M-L (Medium-Large)** — This touches a core financial transaction (`cerrarSesionCaja`), so review must be careful even though the diff isn't huge: ~1 modified hook (consolidation logic + generalized traspaso helper), 1 new migration, 1 new gasto-insertion path, 1-2 UI label/dictionary tweaks, 1 toast removal. Realistic estimate is close to or slightly over the 400-line review budget once the commission-gasto path and hard-fail validation are included — flag for the tasks phase to consider a chained PR split (e.g., migration + BANCO-destination traspaso helper as PR #1, cierre consolidation + commission gasto as PR #2).
