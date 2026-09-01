# Tasks: saldo-a-favor-fix

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350–420 (migrations ~120, pure fn ~100, test file ~180, hook edit ~15) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR — migration+repair pair, fn+tests pair, and the scoped hook edit are each atomic |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pure balance function + tests (TDD) | PR 1 | tests first per strict_tdd; no I/O |
| 2 | Trigger fix + repair migrations (0088+0089) | PR 1 | kept together (0061→0062 precedent); not auto-applied |
| 3 | Hook refactor (`use-cxc.ts`) | PR 1 | depends on Unit 1's export |
| 4 | Manual verification checklist | PR 1 (doc) | consumed by `sdd-verify`, not runnable by Vitest |

Re-evaluate if measured diff exceeds 400 at apply time.

## Phase 1: Foundation — Pure Balance Function (TDD, tests first)

- [x] 1.1 RED: failing tests in `src/features/cxc/lib/__tests__/saldo-cliente.test.ts` for `calcularSaldoNuevoMovimientoCuenta`: FAC/NDB (+monto), PAG/NCR (-monto), SAF-create (0→-0.70), **SAF-consume (-0.70→0, core regression)**, SAF-debt-reduction, REV/SAL (trusts `saldoNuevoProvisto`), missing `saldoNuevoProvisto` throws.
- [x] 1.2 RED: tests for `esSaldoSafConsistente` — accepts ±0.005 tolerance either direction, rejects doubled `-1.40` (reproduces bug as failing assertion).
- [x] 1.3 GREEN: implement `calcularSaldoNuevoMovimientoCuenta(tipo, saldoAnterior, monto, saldoNuevoProvisto?)` in `src/features/cxc/lib/saldo-cliente.ts`, mirroring the fixed trigger 1:1.
- [x] 1.4 GREEN: implement `esSaldoSafConsistente(saldoAnterior, monto, saldoNuevo)` in same file.
- [x] 1.5 Run `yarn test:run` + `yarn type-check:test` — confirm 1.1/1.2 pass, zero regressions.

## Phase 2: Postgres Trigger Fix + Data Repair

- [ ] 2.1 Create `migrations/0088_fix_saf_trigger_sign.sql` — `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()`; SAF branch trusts `NEW.saldo_nuevo`, raises `P0001` if inconsistent. FAC/NDB/PAG/NCR/REV/SAL branches unchanged.
- [ ] 2.2 Create `migrations/0089_repair_saldo_actual_saf.sql` — idempotent `DO $$`: loop `DISTINCT (empresa_id, cliente_id)`, replay `movimientos_cuenta` chronologically, re-derive SAF direction from running balance's sign, REV/SAL as trusted checkpoints, `UPDATE clientes` only where drift > 0.005.
- [ ] 2.3 Add header comments (root cause / consequence chain / fix) matching 0061/0062 style. Do not execute against Supabase — manual step owned by `sdd-verify`.

## Phase 3: Wire Hook to Shared Function

- [ ] 3.1 In `src/features/cxc/hooks/use-cxc.ts`, import `calcularSaldoNuevoMovimientoCuenta` from `../lib/saldo-cliente`.
- [ ] 3.2 Replace line ~435 `Decimal.max(new Decimal(0), saldoActual.minus(montoUsd))` with `calcularSaldoNuevoMovimientoCuenta('PAG', saldoActual, montoUsd)`. Leave line ~424 (`ventas.saldo_pend_usd` floor) untouched.
- [ ] 3.3 Run `yarn type-check` to confirm the hook compiles.

## Phase 4: Verification Handoff

- [ ] 4.1 Draft manual checklist (Test 1: create credit via Bs excess; Test 2: consume credit against a new invoice, saldo lands at $0 not -$1.40; adjacent-bug: pay invoice while holding SAF credit, negative saldo preserved) for `sdd-verify` against real Supabase.

**Dependencies**: Phase 3 needs Phase 1. Phase 2 ships same PR, independent stack (SQL vs TS). Phase 4 needs Phase 2 + Phase 3 done.
