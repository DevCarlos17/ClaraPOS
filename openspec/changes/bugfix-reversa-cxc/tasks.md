# Tasks: Permitir reverso de abono en ventas (fix P0001 en CxC)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~90-120 (migration ~50 + test ~40-60) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR |
|------|------|-----------|
| 1 | Migration 0097 (saldo guard fix) + rollback doc | PR 1 |
| 2 | Regression test for `registrarReversoAbono` | PR 1 |

## Phase 1: Migration

- [x] 1.1 Create `migrations/0097_permitir_reverso_saldo_venta.sql`: `CREATE OR REPLACE FUNCTION prevent_venta_mutation()`, change ONLY the saldo guard to `IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN RAISE EXCEPTION ...`; other guards (DELETE, immutable fields, status ACTIVA→ANULADA) byte-identical to `migrations/0006_ventas.sql:195-230`. Header comment per `design.md` SQL.
- [x] 1.2 Add a comment documenting the `0098` rollback (paste-back of original guard from `0006_ventas.sql:195-227`). Do NOT create `0098` now — document only.

## Phase 2: Regression Test

- [x] 2.1 In `src/features/cxc/hooks/__tests__/use-cxc.test.ts`, add `describe('registrarReversoAbono — saldo acotado a total_usd', ...)` reusing `mockTx`/`beforeEach` from `registrarPagoFactura` (~line 229): mock `pagos`, `ventas` (`nro_factura, saldo_pend_usd, total_usd`), `clientes`, `monedas`, `libro_contable` (empty, skips `reversarAsientos`) SELECTs.
- [x] 2.2 Case A (partial, sum < total_usd): assert `UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?` gets `toStorageString(saldoPendActual.plus(montoUsd))`.
- [x] 2.3 Case B (saturating, sum >= total_usd): assert same UPDATE gets `toStorageString(total_usd)`, never exceeding it.

## Phase 3: Automated Verification

- [x] 3.1 Run `yarn test:run` — new tests pass, no regressions.
- [x] 3.2 Run `yarn type-check` — no TS errors expected.

## Phase 4: Manual Gate (NOT agent-executed)

- [ ] 4.1 **MANUAL — owner/tester**: apply `0097` via Supabase SQL Editor; run the 4-case `BEGIN;...ROLLBACK;` script from `design.md` (reverso hasta total_usd OK, excede falla, mutar `nro_factura` falla, `DELETE` falla). Confirm 4 `RAISE NOTICE` OK messages, clean rollback.

## Rules

- Testing commands only: `yarn test:run`, `yarn type-check`. Never `yarn lint` or `yarn format`.
- Do not create `0098` as a file unless `0097` is actually rolled back.
