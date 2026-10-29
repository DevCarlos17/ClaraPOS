# Tasks: Fix doble-conteo de saldo_actual en reversos CxC repetidos

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~240-330 (Unit A) + ~180-260 (Unit B, new file) = ~420-590 total |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (app clamp + tests) → PR 2 (migration 0118) |
| Delivery strategy | ask-on-risk (default, not overridden) |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | App clamp fix + TC1-TC5 tests | PR 1 | Base `origin/develop`. Deploy-order independent of Unit 2 (design D5). |
| 2 | Migration 0118 (reconciliation + REV assertion) | PR 2 | Base `origin/develop` (independent, per design). Single SQL file. |

Both units close the same bug class; design recommends same release but each is independently revertable/deployable — safe to stack.

## Phase 0: Setup

- [x] 0.1 Branch `fix/saldo-cliente-doble-reverso` off `origin/develop`. (Actual branch name: `feat/fix-saldo-cliente-clamp`, same base `origin/develop` @ `2b80e471`.)

## Phase 1: App-level clamp (`src/features/cxc/hooks/use-cxc.ts`, `reversarPagoEnTx`)

- [x] 1.1 Step 3 (~L1980): capture `ventaDeltaReal = nuevoSaldoFactura.minus(saldoPendActual)` in outer scope.
- [x] 1.2 Step 4 else-branch (~L2013): guard `if (ventaDeltaReal.lte(0))` → skip clientes UPDATE + movimientos_cuenta INSERT entirely; `pagos.is_reversed` write stays untouched.
- [x] 1.3 Replace `montoUsd` with `ventaDeltaReal` for `saldoNuevo` (~L2023) and `calcularSaldoPendienteClienteNuevo('REV', ..., ...)` (~L2028).
- [x] 1.4 Replace `montoUsd` with `ventaDeltaReal` in `movimientos_cuenta` INSERT `monto` (~L2060).
- [x] 1.5 Confirm SAF branch (`generatedLote=true`, L2004-2011) untouched by new variable.

## Phase 2: Tests (`src/features/cxc/hooks/__tests__/reversar-pago-en-tx.test.ts`)

- [x] 2.1 TC1: saldo_pend_usd already $1, pago monto=$1 → delta=0 → no INSERT, cliente unchanged.
- [x] 2.2 TC2: abono$1→reverso→abono$1→reverso → factura AND cliente both end at $1.
- [x] 2.3 TC3: simple direct reverse, no drift (delta=monto) → unchanged behavior.
- [x] 2.4 TC4: fan-in, 2 facturas (delta=0, delta=30) → cliente increment=30, never 70.
- [x] 2.5 TC5: `generatedLote=true` → delegates 100% to `reversarPagoSafEnTx`, new branch never runs. (Covered by pre-existing "triangulacion..." test — mutually exclusive branch, `ventaDeltaReal` never computed/used there.)
- [x] 2.6 Run `yarn test:run src/features/cxc/hooks/__tests__/reversar-pago-en-tx.test.ts` (scoped only). Result: 6/6 passed. Sanity check: reverted prod fix temporarily, confirmed TC1 and TC4 fail against pre-fix code (reproduced exact bug: $2 instead of $1, $70 instead of $30), then restored fix — all 6 green again.

## Phase 3: Migration `migrations/0118_reconciliar_saldo_cliente_y_assertion_rev.sql`

- [ ] 3.1 Create file (next free after 0117); header comment per house convention (template: 0115).
- [ ] 3.2 Reconciliation query FIRST: CTE `real` = `SUM(ventas.saldo_pend_usd)` WHERE `status != 'ANULADA'` grouped by cliente_id/empresa_id; CTE `drift` where `ABS(deuda_real - saldo_pendiente_usd) > 0.005`; `UPDATE clientes` applying the SAME delta to `saldo_pendiente_usd` AND `saldo_actual`; wrap in `set_config('clarapos.trigger_context','mov_cuenta',TRUE)`; `GET DIAGNOSTICS` + `RAISE NOTICE` row count.
- [ ] 3.3 AFTER reconciliation, `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` adding `ELSIF NEW.tipo = 'REV'` asserting `ABS((NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) <= 0.005`, else `RAISE EXCEPTION ... ERRCODE = 'P0001'`. Ordering is deliberate: reconcile drift before the new assertion can reject it.
- [ ] 3.4 Copy FAC/NDB/PAG/NCR/SAF/SAFV/SAFC/SAFR/SAL branches verbatim from 0115 — only the REV `ELSIF` is new.
- [ ] 3.5 Manual `BEGIN;...ROLLBACK;` blocks (pattern: 0110/0115): TC6 idempotency (seed drift → corrects N rows → rerun corrects 0); TC7 assertion (bad `saldo_nuevo` → P0001; good → success).
- [ ] 3.6 Rollback note: re-apply 0115 verbatim (no constraint change in 0118).

## Phase 4: Verification

- [x] 4.1 `yarn type-check` on `use-cxc.ts`. (Full repo `yarn type-check` has pre-existing, unrelated noise: vitest globals — `expect`/`it`/`describe`/`vi` — missing from root `tsconfig` `types[]`, affecting every `*.test.ts(x)` file project-wide, confirmed on `origin/develop` baseline, not introduced by this change. No error references any line touched by this fix.)
- [x] 4.2 Re-run scoped test file (2.6); confirm pre-existing `reversarPagoEnTx` tests unaffected. (Both original tests still pass unchanged.)
- [ ] 4.3 Manually trace migration 0118 against design's D5 no-false-positive proof (direct / fan-in / SAF paths). — Unit B, not started.
