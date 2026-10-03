# Tasks: CxC Data-Model Foundation — Derived `estado` + Materialized SAF

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600-700 (prod ~470 / tests ~200) |
| 400-line budget risk | High (whole change) / Medium (largest slice S1) |
| Chained PRs recommended | Yes |
| Suggested split | S1 (schema+trigger+connector) → S2 (backfill) → S3 (UI read-path) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — owner must choose stacked-to-main vs feature-branch-chain |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Est. lines | Notes |
|------|------|-----------|-------|
| S1 | 0100+0101+0102 migrations, `schema.ts`, `connector.ts`, `estado-venta.ts` + tests | ~480 | Atomic trio (0102+connector+schema) per design; 0100/0101 are trivial precursors with no independent value — bundle. Gate: Phase 0 spike. If reviewer wants smaller diffs, split 0100+0101 (DDL-only, ~50 lines) from 0102+code (~430 lines). |
| S2 | 0103 backfill + §6 invariant verification + `migrations/README.md` entry | ~90 | Depends on S1 live & verified in prod. |
| S3 | `use-cxc.ts` / `use-deuda-cliente.ts` read-path swap + parity tests | ~110 | Depends on S1 (columns must exist) — not S2. |

## Phase 0: Verification Spike (BLOCKING — gates Phase 2)

- [x] 0.1 Instrument `src/core/db/powersync/connector.ts` `uploadData()` with a temporary `debugLog` printing `op.table, op.op, op.id` in processing order per `transaction.crud`. Done — see `rollout/phase0-spike-runbook.md` for manual test steps (0.2-0.5, owner-run).
- [ ] 0.2 Manual test: go offline (devtools/airplane mode), register one payment (`aplicarPagoFacturaEnTx` in `use-cxc.ts`, which INSERTs `movimientos_cuenta` then PATCHes `ventas.saldo_pend_usd` in one `writeTransaction`), reconnect.
- [ ] 0.3 Inspect Supabase REST call order/timestamps (network tab or Supabase Logs Explorer) for that transaction.
- [ ] 0.4 Run objective PASS/FAIL check in Supabase SQL editor:
  ```sql
  SELECT v.id AS venta_id, v.updated_at AS venta_updated_at,
         mc.created_at AS mov_cuenta_created_at,
         CASE WHEN mc.created_at <= v.updated_at THEN 'PASS' ELSE 'FAIL' END AS resultado
  FROM ventas v JOIN movimientos_cuenta mc ON mc.venta_id = v.id
  WHERE v.id = '<test-venta-id>' ORDER BY mc.created_at DESC LIMIT 1;
  ```
- [ ] 0.5 PASS = `movimientos_cuenta` row timestamp ≤ `ventas` PATCH timestamp on every reconnect cycle tested (incl. one forced mid-upload disconnect). FAIL = any out-of-order arrival. On FAIL, STOP — do not proceed to Phase 2 until design revises ordering guarantee (e.g. split into two sequential local transactions).
- [ ] 0.6 Remove temporary debugLog once spike completes; record result in `migrations/README.md` or a spike note.

## Phase 1: Foundation Migrations (additive-only, idempotent)

- [ ] 1.1 Create `migrations/0100_ventas_estado_column.sql`: `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pago','reversado'))`. Include header + rollback (`DROP COLUMN estado`) per project convention (see `0097`).
- [ ] 1.2 Create `migrations/0101_clientes_saf_disponible_column.sql`: `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saf_disponible NUMERIC(20,8) NOT NULL DEFAULT 0` + `CREATE INDEX IF NOT EXISTS idx_mov_cuenta_venta ON movimientos_cuenta(venta_id, fecha DESC, created_at DESC)` + `CREATE INDEX IF NOT EXISTS idx_mov_cuenta_cliente_tipo ON movimientos_cuenta(cliente_id, tipo)`. Rollback: drop column + both indexes.
- [ ] 1.3 Verify both via `BEGIN; <migration>; SELECT column_name FROM information_schema.columns WHERE table_name IN ('ventas','clientes') AND column_name IN ('estado','saf_disponible'); ROLLBACK;` — expect 2 rows.

## Phase 2: Atomic Trigger + Connector + Schema Bundle (ships together — see design §1/§3)

- [ ] 2.1 Create `migrations/0102_extend_trigger_estado_saf.sql`: `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` — FAC/NDB/PAG/NCR/SAF/REV/SAL branches byte-identical to `0088`; add `saf_disponible` delta (`SAFC: +monto`, `SAF: -monto`) to the same `UPDATE clientes` (design §3).
- [ ] 2.2 Same file: `CREATE OR REPLACE FUNCTION prevent_venta_mutation()` — all guards byte-identical to `0097`; add `estado` derivation (magnitude rule + `REV` last-movement lookup via `idx_mov_cuenta_venta`) per design §3/§4 state machine, only when `saldo_pend_usd` changes. Document `estado` as explicitly-mutable in the function comment (no whitelist code change needed — confirmed no array-based whitelist exists).
- [ ] 2.3 Verify 0102 via `BEGIN; <migration>; <run design §6 invariant query + matrix scenarios: FAC-only, PAG-partial, PAG-full, NCR-covers-CONTADO-already-pago, REV-reopen, REV-then-PAG-clears>; ROLLBACK;` — all rows `PASS`.
- [ ] 2.4 `src/core/db/powersync/schema.ts`: add `estado: column.text` to `ventas` table (~line 701, next to `status`); add `saf_disponible: column.text` to `clientes` table (~line 624, next to `saldo_actual`); add `{ indexes: { by_venta: ['venta_id'] } }` to `movimientos_cuenta` table.
- [ ] 2.5 `src/core/db/powersync/connector.ts`: extend `TRIGGER_MANAGED_PATCH_COLUMNS` (~line 76-80) → `clientes: ['saldo_actual', 'saf_disponible'], ventas: ['estado']`.
- [ ] 2.6 Create `src/features/cxc/lib/estado-venta.ts`: pure function `calcularEstadoVenta(saldoPendUsd, totalUsd, ultimoMovimientoTipo)` mirroring §3/§4 CASE logic (0.005 tolerance), same style/JSDoc as `saldo-cliente.ts`. Cross-reference comment: "mirrors `prevent_venta_mutation()` in `migrations/0102`, keep in sync."
- [ ] 2.7 Write `src/features/cxc/lib/__tests__/estado-venta.test.ts`: cover every spec scenario (CONTADO pago-at-creation, CREDITO pendiente, partial, NC-fully-covers-already-pago stays pago, REV reopens, REV-then-PAG clears to pago) — RED first, then implement 2.6 GREEN.
- [ ] 2.8 Extend `src/core/db/__tests__/connector-upload-retry.test.ts` (or new file) with a PATCH-stripping test: mock a `transaction.crud` PATCH op on `ventas` with `opData: { estado: 'pago', saldo_pend_usd: '0' }`, assert the Supabase `update()` payload omits `estado` but keeps `saldo_pend_usd` (pattern from existing `clientes.saldo_actual` strip test if present, else model on `makeSuccessfulUpdateChain`).

## Phase 3: Backfill (after Phase 2 live in prod)

- [ ] 3.1 Create `migrations/0103_backfill_estado_saf_disponible.sql` per design §7: read-only `SELECT/JOIN` on `movimientos_cuenta`; `UPDATE ventas`/`UPDATE clientes` only; `IS DISTINCT FROM` / tolerance-guarded `WHERE` for idempotency.
- [ ] 3.2 Run as `BEGIN; <backfill>; <§6 invariant query>; ROLLBACK;` in Supabase SQL editor — inspect 100% `PASS`, zero `movimientos_cuenta` row-count change (`SELECT COUNT(*) FROM movimientos_cuenta` before/after must match).
- [ ] 3.3 Only after 3.2 passes, re-run replacing `ROLLBACK` with `COMMIT`.
- [ ] 3.4 Re-run the full script once more post-commit to confirm no-op (0 rows updated) — idempotency scenario from `cliente-saf-materializado` spec.

## Phase 4: UI Read-Path Swap (frozen-contract parity)

- [ ] 4.1 `src/features/cxc/hooks/use-cxc.ts`: replace `DEUDA_CREDITO_CLIENTE_SELECT`'s SAF `SUM(SAFC)-SUM(SAF)` subquery (lines ~87-90) with direct `c.saf_disponible AS credito_disponible_usd`.
- [ ] 4.2 Same file, `useFacturasPendientes` (lines ~145-160): replace `(status IS NULL OR status NOT IN ('ANULADA','REVERSADA'))` dead-code filter with `estado != 'pago'` for the pending-list branch (keep `status != 'ANULADA'` guard separately — `status` and `estado` are distinct columns).
- [ ] 4.3 `src/features/cxc/hooks/use-deuda-cliente.ts`: `useCreditoFavorClientes` (lines 80-104) — replace the SAFC/SAF aggregation query with a direct `SELECT id, saf_disponible FROM clientes WHERE ...` read.
- [ ] 4.4 Update `src/features/cxc/hooks/__tests__/use-cxc.test.ts` and `__tests__/use-deuda-cliente.test.ts`: assert identical output (balance + pending-invoice set) for a fixed ledger fixture, before/after query-shape change — this is the frozen UI-contract parity scenario from both specs.
- [ ] 4.5 Manual smoke test: CxC screen for one real client — balance and pending list render identically to pre-change screenshot/values.

## Phase 5: Cleanup

- [ ] 5.1 Add `0100`-`0103` rows to `migrations/README.md` table, matching existing entry style (purpose + what it fixes).
- [ ] 5.2 Remove Phase 0's temporary debugLog if not already removed in 0.6.
- [ ] 5.3 Run `yarn test:run` targeted on `src/features/cxc/`, `src/core/db/` — confirm no regressions beyond the pre-existing known failures (see engram `#962`, separate issue).
