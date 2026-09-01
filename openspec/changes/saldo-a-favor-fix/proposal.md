# Proposal: Fix saldo-a-favor (SAF) trigger sign error on credit consumption

## Intent

`actualizar_saldo_cliente()` (Postgres trigger, `migrations/0061_restore_trigger_context.sql:47-50`) applies one fixed formula (`saldo_anterior - monto`) to every `tipo='SAF'` row. That formula is correct only for debt-reduction SAF, not for **credit consumption** (client already holds negative `saldo_actual` and spends it). Every real consumption call site computes the correct value in JS (`saldo_anterior + monto`) but the trigger overwrites it, doubling the credit (e.g. -0.70 becomes -1.40 instead of 0). This is a recurrence of a defect diagnosed and "fixed" on 2026-06-04 (Engram #134) — that fix covered debt-reduction but not consumption, so it survived. It is also a **blocker for the upcoming `notas-credito` change**, which will generate SAF credits that must be consumable correctly.

## Scope

### In Scope
1. **Trigger fix**: SAF branch stops recomputing `saldo_nuevo`; trusts app-provided `NEW.saldo_nuevo`, matching the existing REV/SAL treatment (both computed correctly in JS already).
2. **Data-repair migration**: recompute `clientes.saldo_actual` for clients corrupted by doubled-credit, following the 0061/0062 repair pattern (`set_config` bypass, idempotent, threshold-guarded).
3. **Adjacent fix**: `aplicarPagoFacturaEnTx` PAG path clamps `saldoNuevo` with `Decimal.max(0, ...)`, silently discarding negative (credit) results when a client pays an invoice while already holding SAF credit. Same money-correctness family, same change.

### Out of Scope (Non-Goals)
- Layer 3 — historical `saldo_nuevo` display in estado de cuenta (`use-cxc-reportes.ts:192`) shows immutable wrong historical rows. **Open design decision**, not committed scope: recompute on-the-fly running balance vs. leave as-is. Defer to `sdd-design`.
- No remodel of the single-aggregate FIFO saldo-a-favor model — it is correct and stays.
- No migration away from single-aggregate credit tracking.
- **Cierre de caja / cuadre**: untouched by design. `use-sesiones-caja.ts` and `use-cuadre.ts` sum `monto` only, never `saldo_actual`/`saldo_nuevo` — zero cash-close numbers change.

## Capabilities

### New Capabilities
- None (no existing `openspec/specs/` — first formal spec for this behavior will be created as part of this change)

### Modified Capabilities
- `saldo-cliente-trigger`: `actualizar_saldo_cliente()` SAF branch behavior for credit-consumption vs debt-reduction
- `cxc-pago-factura`: `aplicarPagoFacturaEnTx` must preserve negative (credit) `saldoNuevo`, not clamp to 0

## Approach

Surgical fix, not a rebuild — all JS/TS SAF math is already correct. One migration changes the trigger's SAF branch; one migration repairs corrupted data; one TS change removes the clamp. Spec MUST include the credit-**consumption** scenario as a regression test (the exact case that survived the 2026-06-04 fix).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `migrations/0088_*.sql` (new) | New | Trigger SAF branch: trust `NEW.saldo_nuevo`, no recompute |
| `migrations/0089_*.sql` (new) | New | Data repair for `clientes.saldo_actual` (SAF-corrupted clients) |
| `src/features/cxc/hooks/use-cxc.ts` | Modified | `aplicarPagoFacturaEnTx` — remove `Decimal.max(0,...)` clamp |
| `src/features/ventas/hooks/use-ventas.ts:1329-1389` | No code change | SAF-as-payment path; already correct, gets fixed by trigger fix |
| `src/features/cxc/hooks/use-cxc.ts` (`registrarPagoFactura` 624-646, `registrarAbonoGlobal` 717-735, `registrarAbonoPrestamo` 1144-1165) | No code change | SAF-consumption branches; already correct in JS |
| `src/features/cxc/hooks/use-cxc.ts` (`registrarSafExcedente` 1872-1913) | No code change | SAF creation; already correct |
| `src/core/hooks/use-saldo-a-favor.ts`, CxC deuda queries | Auto-fixed | Read `clientes.saldo_actual` directly; no code change needed once trigger+data are correct |

## Impact

- **Corrupted clients**: any client that consumed SAF credit via POS toggle, pago-factura, abono global, or abono préstamo since the trigger existed — `saldo_actual` doubled in magnitude (e.g. -0.70 → -1.40).
- **Visible symptoms fixed automatically**: CxC "deuda" list, credit-limit "disponible" widget (cobro-modal, pago-factura-modal, abono-global-modal), POS client lookup — all read `clientes.saldo_actual`, none need code changes.
- **Untouched**: cierre de caja / cuadre (confirmed sums `monto`, never `saldo_actual`).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Recurrence — this exact defect was "fixed" before (2026-06-04) and returned because the fix only covered debt-reduction | Medium | Spec MUST assert the credit-consumption scenario explicitly; regression test required in `sdd-spec`/`sdd-tasks` |
| `movimientos_cuenta` historical rows stay wrong forever (immutable ledger, no UPDATE/DELETE) | High (by design) | Repair only the derived `saldo_actual`; document Layer 3 (report display) as deferred design decision |
| Zero test coverage today: `use-ventas.test.ts` mocks `db.writeTransaction`/`db.execute` (wouldn't catch a Postgres-trigger bug); `src/features/cxc` has zero test files (2172 untested lines) | High | `strict_tdd=true` for this change; new tests must exercise the trigger via real Postgres/pg-mem or equivalent, not full mocks |
| Data-repair migration miscalculates repaired `saldo_actual` for edge-case clients (partial consumption, mixed FAC+SAF history) | Low-Med | Follow 0061/0062 idempotent, threshold-guarded (`> $0.005`) repair pattern; dry-run query before applying |

## Rollback Plan

- Trigger migration: revert via a follow-up migration restoring the prior `CREATE OR REPLACE FUNCTION` body (trigger changes are forward-only per project convention — no destructive DDL).
- Data-repair migration: not reversible by nature (recomputes derived state) — mitigated by idempotency and narrow `WHERE` threshold; re-running after a bad repair with corrected logic self-heals since it recomputes from `movimientos_cuenta`/`ventas` (source of truth), not from the previous repair's output.
- TS clamp removal: single-file revert (`use-cxc.ts`), no migration dependency.

## Dependencies

- Verify current highest migration number on disk immediately before applying (`0087` as of this proposal) to avoid numbering collisions with concurrent work.
- Blocks: `notas-credito` change (SAF credit generation) — this fix must land first.

## Success Criteria

- [ ] SAF credit consumption (e.g. -0.70 balance, 0.70 spent) produces `saldo_nuevo = 0`, not -1.40, verified against real Postgres trigger execution.
- [ ] SAF debt-reduction path (existing correct case) unchanged.
- [ ] `aplicarPagoFacturaEnTx` preserves negative `saldoNuevo` when paying an invoice with pre-existing SAF credit.
- [ ] Data-repair migration corrects all identifiably-corrupted `clientes.saldo_actual` rows, idempotently.
- [ ] Cierre de caja / cuadre totals unchanged before/after (regression check on `monto`-based sums).
- [ ] Regression test explicitly covers the credit-consumption scenario that caused this defect to recur.
