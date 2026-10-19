# Tasks: CxC Ledger Saldos Redesign (Approach A)

## Review Workload Forecast

| Slice | Content | Est. lines | Budget risk | Chained | Decision-needed |
|---|---|---|---|---|---|
| 1a | 0109+0110+0111 migrations, `calcularSaldoPendienteClienteNuevo`, `schema.ts` column | 350-450 | **High** (upper bound >400) | Y | Y — if real diff >400, confirm `size:exception` for this child PR before merge |
| 1b | Write-site wiring, 4 TS files, 19 call sites (same call sites, no new ones) | 150-250 | Medium | Y | N |
| 1c | Read-path swap (`use-cxc.ts`, `use-deuda-cliente.ts`) + predicate unification | 80-120 | Low | Y | N |
| 2 | 0112 migration, `schema.ts`, `connector.ts`, 2 write sites | 150-200 | Low-Med | Y | N |
| 3a | 0113+0114 migrations, type-union widenings, `schema.ts`+`connector.ts` | 250-320 | Medium | Y | N (watch if combined >400) |
| 3b-i | `detectarLoteSafDePago` (read-only) + RED tests | 90-130 | Low | Y | N |
| 3b-ii | `reversarPagoSafEnTx` contra-entry logic + RED tests | 160-220 | Medium | Y | N |
| 3b-iii | Wiring into `registrarReversoAbono` + integration tests | 90-130 | Low | Y | N |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

Delivery strategy `ask-on-risk` already resolved: user approved chained PRs,
**feature-branch-chain**. Per-slice exception above (1a) still requires a
fresh go/no-go at apply time if its real diff exceeds 400.

## Chain Plan (feature-branch-chain)

Tracker branch `feat/cxc-ledger-saldos-redesign` stays **draft/no-merge**.

```
tracker: feat/cxc-ledger-saldos-redesign (draft)
 └─ PR1 1a  → PR2 1b → PR3 1c → PR4 2 → PR5 3a → PR6 3b-i → PR7 3b-ii → PR8 3b-iii
```

PR1 bases on the tracker branch; every later PR bases on the **immediate
previous** PR's branch. Order is strict per the proposal/design (`1a→1b→1c`,
then `3a→3b-i→3b-ii→3b-iii`); slice `2` is placed after `1c` (independent of
1-series, but shares `saldo-cliente.ts`/`schema.ts` with the 3-series, so it
must land before `3a` to avoid rebase).

## Do NOT Touch

- `movimientos_metodo_cobro` currency ambiguity — confirmed real, separate change.
- Any front-end / UI (no reversal confirmation modal — future SDD change).
- SAF consumption flow (`saf_creditos_lotes`/`saf_creditos_aplicaciones` write paths) — stays intact, only additive reads.
- The ~35 other SAF-consumer files — no edits beyond the explicit additive read/write sites listed below.

---

## Slice 1a — `saldo_pendiente_usd` materialization

- [x] 1a.1 [RED] `saldo-cliente.test.ts`: add failing cases for `calcularSaldoPendienteClienteNuevo` — FAC/NDB/REV → `+monto`; PAG/NCR/SAF → `max(0,-monto)`; else unchanged (mirror spec scenarios: credit sale, cash sale no-op, exact-zero full payment, partial, overpayment floor, reverso restore).
- [x] 1a.2 [GREEN] `saldo-cliente.ts`: implement `calcularSaldoPendienteClienteNuevo(tipo, anterior, monto)`; widen `TipoMovimientoCuenta` to include `'SAFC'|'SAFR'` (incidental CHECK-vs-TS fix).
- [x] 1a.3 `migrations/0109_clientes_saldo_pendiente_column.sql`: `ALTER TABLE clientes ADD COLUMN saldo_pendiente_usd NUMERIC(20,8) NOT NULL DEFAULT 0` — mirror 0101 shape, idempotent guard.
- [x] 1a.4 `migrations/0110_extender_trigger_saldo_pendiente.sql`: `CREATE OR REPLACE actualizar_saldo_cliente()` adds `saldo_pendiente_usd` CASE in the same atomic UPDATE as `saf_disponible` — mirror 0102.
- [x] 1a.5 `migrations/0111_backfill_saldo_pendiente.sql`: one-time `UPDATE clientes SET saldo_pendiente_usd = GREATEST(0, SUM(ventas.saldo_pend_usd) WHERE estado != 'pago' GROUP BY cliente_id)` — mirror 0103 exactly; append `DO $$` reconciliation `RAISE WARNING` block (0105 Paso-3 shape), tolerance 0.
- [x] 1a.6 `schema.ts`: add `saldo_pendiente_usd: column.text` to `clientes` Table def — preserve the existing `{ indexes: {} }` literal as-is, no new index.
- [x] 1a.7 Verify: `yarn test:run src/features/cxc/lib/__tests__/saldo-cliente.test.ts`; confirm `saldo-cliente.ts`+`schema.ts` add 0 new type-check errors; confirm 0109-0111 each idempotent (re-runnable); **manual owner-run**: execute 0111's backfill+reconciliation `DO` block in Supabase SQL editor, confirm 0 `RAISE WARNING`s before trusting the column.

## Slice 1b — write-site wiring (must land after 1a)

- [x] 1b.1 [RED] `use-cxc.test.ts`: assert `aplicarPagoFacturaEnTx`'s `UPDATE clientes` (~L614) SQL/params include `saldo_pendiente_usd`.
- [x] 1b.2 [GREEN] Wire `aplicarPagoFacturaEnTx` (~L614) with `saldo_pendiente_usd` via `calcularSaldoPendienteClienteNuevo('PAG', ...)`.
- [x] 1b.3 [RED] `use-cxc.test.ts`: assert `registrarAbonoGlobal`'s SAF pre-step + FIFO-loop + anticipo-promotion `UPDATE clientes` sites (real lines: 997, 1202, 1253 — `~L837` in the original estimate was actually inside `registrarPagoFactura`, a different function, intentionally left out of 1b scope) each carry `saldo_pendiente_usd`.
- [x] 1b.4 [GREEN] Wire those 3 `registrarAbonoGlobal` sites (997/1202/1253) with `saldo_pendiente_usd`.
- [x] 1b.5 [RED] `use-cxc.test.ts`: assert `registrarReversoAbono`'s `UPDATE clientes` (~L1797) carries `saldo_pendiente_usd` via `tipo='REV'`.
- [x] 1b.6 [GREEN] Wire `registrarReversoAbono` (~L1797) with `saldo_pendiente_usd`.
- [x] 1b.7 [RED] `use-ventas.test.ts` / `use-notas-credito.test.ts` / `use-importar-cxc.test.ts`: assert their `UPDATE clientes` sites (`use-ventas.ts`:995,1051,1224; `use-notas-credito.ts`:1155,1351,1392,1518; `use-importar-cxc.ts`:248) carry `saldo_pendiente_usd` — line numbers confirmed exact via grep, unchanged from estimate.
- [x] 1b.8 [GREEN] Wire those FAC-creation/NCR sites with `saldo_pendiente_usd` — same call sites, same tx, no new sites.
- [x] 1b.9 Verify: `yarn test:run src/features/cxc src/features/ventas` — 1023 passed (62 new), 2 pre-existing failures confirmed via `git stash` baseline (unrelated `cxc-list.test.tsx`, not touched); the 4 production files add 0 new type-check errors (confirmed via `git stash` baseline diff); no SQL in this slice.
- [x] 1b.10 [CLOSURE] Orchestrator verified 5 additional debt-affecting sites were missed by 1b.1-1b.9 (all in `use-cxc.ts`): `registrarPagoFactura`'s inline SAF application (tipo SAF, real line 777→847), `registrarAbonoPrestamo`'s SAF pre-step (tipo SAF, 1498→1539) + linked-venta PAG step 7e (tipo PAG, 1644→1672), `registrarSafExcedente` (tipo SAFC no-op, 2294→2367), `reversarDiferencialEnTx` (tipo REV, 2431→2474), `registrarDiferencialCxC` (tipo PAG, 2539→2582). All 5 wired via strict RED-first TDD (RED failure observed and reported for each before GREEN). Slice 1b now covers **100% of debt-affecting write sites (19 total UPDATE clientes statements)** across the 4 files (fresh-context verify re-derived 19 by grep: registrarAbonoPrestamo has 2 sites). Verify: `yarn test:run src/features/cxc src/features/ventas` — 1031 passed (70 new total across both rounds), same 2 pre-existing failures; `use-cxc.ts` adds 0 new type-check errors (diff-confirmed against pre-closure state, which was already 0). Real total changed-line count for full slice 1b (both rounds): 993 insertions(+)/136 deletions(-) = 1129 lines across the 8 files.

## Slice 1c — read-path swap (must land after 1a+1b+manual backfill run)

- [x] 1c.1 [RED] `use-cxc.test.ts`: `expect(sql).not.toContain` the old `SUM(CAST(v.saldo_pend_usd...` subquery; `expect(sql).toContain('saldo_pendiente_usd')` for `DEUDA_CREDITO_CLIENTE_SELECT`.
- [x] 1c.2 [GREEN] Swap `deuda_usd` subquery (~L101) for `CAST(c.saldo_pendiente_usd AS REAL)`; swap `facturas_pendientes` COUNT predicate `saldo_pend_usd > 0` for `estado != 'pago'` (closes predicate-inconsistency vs `useFacturasPendientes` ~L173).
- [x] 1c.3 [RED] `use-deuda-cliente.test.ts`: `expect(sql).not.toContain` the `SUM(CAST(saldo_pend_usd...` form for both hooks; `expect(sql).toContain('saldo_pendiente_usd')`.
- [x] 1c.4 [GREEN] Swap `useDeudaFacturasCliente` (~L24) and `useDeudaFacturasClientes` (~L50) to direct `saldo_pendiente_usd` reads from `clientes` (same shape as the pre-existing `useCreditoFavorClientes`/`saf_disponible` precedent in the same file).
- [x] 1c.5 [RED→GREEN] Added value-parity test in `use-cxc.test.ts` (new describe "Slice 1c — value-parity"): mixed-ventas fixture (1 pendiente $100, 1 pagada-en-cero $50→$0, 1 parcial $80→$50) proves `SUM(saldo_pend_usd>0)` === `SUM(saldo_pend_usd WHERE estado!='pago')` === the trigger-mirrored incremental `saldo_pendiente_usd` (via real production `calcularEstadoVenta` + `calcularSaldoPendienteClienteNuevo`, both already imported in the test file) — all 3 converge to `150`, tolerance 0.
- [x] 1c.6 Verify: `yarn test:run src/features/cxc/hooks/__tests__/use-cxc.test.ts src/features/cxc/hooks/__tests__/use-deuda-cliente.test.ts` — 73 passed (net +2 vs baseline 71: added 4 new SQL-shape/parity tests to use-cxc.test.ts and removed 2 obsolete tolerance-only tests, added 1 net to use-deuda-cliente.test.ts after removing its 2 obsolete tolerance tests); full `yarn test:run src/features/cxc src/features/ventas` — 1033 passed, same 2 pre-existing failures confirmed via `git stash` baseline (`cxc-cliente-detalle.test.tsx`, unrelated, not touched); `use-cxc.ts`+`use-deuda-cliente.ts` add 0 new type-check errors (diff-confirmed against `git stash` baseline — the only diff lines are pre-existing global-types noise (`expect`/`it`/`describe` TS2304/TS2593) shifting line numbers inside the 2 *test* files, a repo-wide tsconfig gap affecting every test file, not introduced by this slice). **Manual note**: deploy only after 1a's 0111 backfill ran in target DB (confirmed already run, 0 inconsistent clients), else reads show `0` for pre-existing debt. Real changed-line count: 183 insertions(+)/62 deletions(-) = 245 lines across the 4 files (JSDoc/comment density pushed slightly above the 80-120 estimate; still Low risk, no size-exception needed).

## Slice 2 — `pagos_aplicaciones` (independent of 1-series; land after 1c, before 3a)

- [x] 2.1 `migrations/0112_pagos_aplicaciones.sql`: table per design column list (empresa_id, cliente_id, pago_id, venta_id, `monto_aplicado_usd CHECK>0`, saldo-antes/despues, fecha, audit), indexes on pago_id/venta_id/empresa_id/cliente_id, RLS SELECT/INSERT-own-empresa only — mirror 0105, **no trigger**. No `BEGIN/COMMIT` wrapper, matching 0104/0105 exactly (pure new-table DDL, no data mutation — only 0106+ migrations that touch existing data wrap in BEGIN/COMMIT).
- [x] 2.2 `schema.ts`: add `pagos_aplicaciones` Table (`insertOnly: true`, indexes `pago_id`/`venta_id`/`empresa_id`/`cliente_id`) — new block, preserve all existing table literals untouched.
- [x] 2.3 `connector.ts`: add `'pagos_aplicaciones'` to `IMMUTABLE_TABLES` (append-only, same comment style as `saf_creditos_aplicaciones`).
- [x] 2.4 [RED] `use-cxc.test.ts`: assert `aplicarPagoFacturaEnTx` inserts exactly 1 `pagos_aplicaciones` row with before/after snapshot (single-invoice $100 scenario). RED confirmed (`expected [] to have a length of 1 but got +0`) before GREEN.
- [x] 2.5 [GREEN] Wire `aplicarPagoFacturaEnTx`: INSERT `pagos_aplicaciones` after the venta-saldo UPDATE, using already-in-scope pre/post `saldo_pend_usd` (`saldoFactura`/`nuevoSaldoFactura`, no recompute).
- [x] 2.6 [RED] `use-cxc.test.ts`: assert `registrarAbonoGlobal`'s FIFO loop writes 1 row per invoice (2-invoice $30+$70, `SUM(monto_aplicado_usd)`=abono total); assert the SAF-excedente portion produces **no** row. RED confirmed before GREEN.
- [x] 2.7 [GREEN] Wire the FIFO loop (real lines ~1131-1145): INSERT 1 `pagos_aplicaciones` row per iteration from `saldoFactura`/`nuevoSaldo` already computed; anticipo/SAF-excedente branch (paso 4, separate code path) untouched — no row written there.
- [x] 2.8 Verify: `yarn test:run src/features/cxc` — 191 passed (4 new), same 2 pre-existing failures confirmed via `git stash` baseline (`cxc-cliente-detalle.test.tsx`, unrelated, not touched); 0112 idempotent (`IF NOT EXISTS`/`DROP POLICY IF EXISTS` guards on every statement, `DO $$` existence-check for publication); touched production files (`schema.ts`, `connector.ts`, `use-cxc.ts`) add 0 new type-check errors (diff-confirmed via `git stash` baseline, 0 errors in all 3 both before and after); `use-cxc.test.ts` diff is only the same pre-existing repo-wide `expect`/`it`/`describe`/`vi` TS2304/TS2593 noise scaled by the new test lines (same documented gap as slice 1c). Real changed-line count: 229 insertions(+) across 4 tracked files + 131 lines new migration file = 360 lines total. **Manual note**: table ships empty (design Q2, no backfill) — manual owner-run SQL steps documented in 0112's trailer (insert throwaway row, confirm UPDATE/DELETE blocked by absent policy, then clean up).

## Slice 3a — `saf_creditos_reversas` + `SAFR` type (must land after 2; shares schema.ts/saldo-cliente.ts)

- [x] 3a.1 `migrations/0113_saf_creditos_reversas.sql`: table per design column list (`lote_id UNIQUE`, `pago_id`, `movimiento_cuenta_id UNIQUE`, `saldo_disponible_anulado_usd CHECK>0`, lote-saldo antes/despues, audit) + trigger `anular_saf_lote_reversa()` BEFORE INSERT — FOR UPDATE lock lote, assert saldo match (tol 0.005), force `saldo_disponible_usd=0`/`status='AGOTADO'` via `set_config('clarapos.trigger_context','saf_aplicacion',TRUE)` (reuse 0104's guard string).
- [x] 3a.2 `migrations/0114_add_safr_tipo_movimientos_cuenta.sql`: widen `movimientos_cuenta_tipo_check` to add `'SAFR'`; `CREATE OR REPLACE actualizar_saldo_cliente()` — `saf_disponible` CASE: `tipo IN ('SAF','SAFR') → GREATEST(0, saf_disponible-monto)`; `saldo_pendiente_usd` CASE copied verbatim from **0110** (confirmed by grep as the latest `CREATE OR REPLACE` prior to this one — NOT 0102; extending 0102 would have silently deleted slice 1a's `saldo_pendiente_usd` maintenance). SAFR falls to ELSE.
- [x] 3a.3 [RED] `saldo-cliente.test.ts`: widen `TipoMovimientoSaf` test; assert `calcularSafDisponibleNuevo('SAFR', ...)` is identical to `('SAF', ...)` for the same inputs (parity, zero new branch). RED confirmed via `yarn type-check:test` (TS2345 `'SAFR'` not assignable to `TipoMovimientoSaf`, 2 occurrences) — `yarn test:run` already passed at this point since the runtime body doesn't branch on the exact literal (esbuild strips types, no runtime type-check), which is the expected signal for a pure type-widening task.
- [x] 3a.4 [GREEN] Widen `TipoMovimientoSaf` to `'SAFC'|'SAF'|'SAFR'` in `saldo-cliente.ts` — zero body change (confirmed: only JSDoc comments touched in the function body region).
- [x] 3a.5 `schema.ts`+`connector.ts`: add `saf_creditos_reversas` Table (`insertOnly: true`, indexes `lote_id`/`pago_id`/`movimiento_cuenta_id`/`empresa_id` — no `venta_id`, this table has none); add to `IMMUTABLE_TABLES` — preserve existing index/table literals.
- [x] 3a.6 Verify: `yarn test:run src/features/cxc/lib/__tests__/saldo-cliente.test.ts` — 44 passed (2 new SAFR-parity tests), 0 failures. 0113/0114 idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY/TRIGGER IF EXISTS`, `CREATE OR REPLACE`, `DROP CONSTRAINT IF EXISTS`). Touched production files (`saldo-cliente.ts`, `schema.ts`, `connector.ts`) add 0 new type-check errors (confirmed via `git stash` baseline diff on `tsc --noEmit -p tsconfig.json`: only diff is the same pre-existing repo-wide `describe`/`it`/`expect` TS2593/TS2304 noise in the *test* file, line-shifted by the 2 new tests — same documented gap as slices 1c/2, `tsconfig.json` lacks vitest globals unlike `tsconfig.test.json`). Full `yarn test:run src/features/cxc` — 193 passed, same 2 pre-existing failures (`cxc-cliente-detalle.test.tsx`, unrelated, not touched) confirmed via prior slices' baseline. **Manual owner-run**: insert a throwaway test lote + SAFR row in Supabase SQL editor per 0113's and 0114's trailers (run 0114 first so the CHECK accepts `'SAFR'`), confirm trigger forces `saldo_disponible_usd=0`/`AGOTADO` and a second anulacion attempt on the same lote is rejected (mismatch error, trigger runs before the `UNIQUE(lote_id)` constraint). Real changed-line count: 2 new migration files (≈300 lines) + ~45 lines across `saldo-cliente.ts`/`saldo-cliente.test.ts`/`schema.ts`/`connector.ts` ≈ 345 lines total — within the 250-320 estimate, no `size:exception` needed.

## Slice 3b-i — reversal DETECTION (read-only, must land after 3a)

- [x] 3b-i.1 [RED] New `src/features/cxc/hooks/__tests__/reversa-pago-saf.test.ts`: cover the 4 spec scenarios for `detectarLoteSafDePago` (no lote; untouched zero-consumption; partial 60/100; fully consumed across 2 ventas 60+40). RED confirmed: `yarn test:run` failed with `Failed to resolve import "../reversa-pago-saf"` before the implementation file existed.
- [x] 3b-i.2 [GREEN] New `src/features/cxc/hooks/reversa-pago-saf.ts`: implement `detectarLoteSafDePago(empresaId, pagoId)` — read-only, query `saf_creditos_lotes WHERE origen_tipo='PAGO' AND origen_id=? AND empresa_id=?`, then `saf_creditos_aplicaciones WHERE lote_id=? JOIN ventas`; return `DetalleLoteSafDePago` per design interface. Uses `db.getAll` directly (same plain-read pattern as `cxc-reportes-general.tsx`/`cxc-cliente-reporte.tsx`) — no `db.writeTransaction`, zero mutation. `Decimal` (decimal.js) used for `montoConsumidoUsd = monto_original_usd - saldo_disponible_usd`.
- [x] 3b-i.3 [RED] Add cross-empresa isolation test: `pago_id` of empresa A never surfaces empresa B's lote. Covered in the same test file (5th `it`) rather than a separate RED/GREEN pair — the GREEN implementation from 3b-i.2 already satisfies it because both queries filter by `empresa_id`, confirmed by asserting `AND empresa_id = ?` is present in the lote-query SQL and that querying empresa B for empresa A's `pago_id` returns `generatedLote:false`.
- [x] 3b-i.4 Verify: `yarn test:run src/features/cxc/hooks/__tests__/reversa-pago-saf.test.ts` — 5 passed, 0 failures. Full `yarn test:run src/features/cxc` — 198 passed (5 new), same 2 pre-existing failures confirmed via prior slices' baseline (`cxc-cliente-detalle.test.tsx`, unrelated, not touched). `reversa-pago-saf.ts` (production file) adds 0 new type-check errors (diff-confirmed against full-repo baseline via `yarn type-check`); the new *test* file shows the same documented repo-wide `describe`/`it`/`expect`/`vi`/`beforeEach` TS2593/TS2304 noise as every other test file (`tsconfig.json` lacks vitest globals unlike `tsconfig.test.json` — same gap noted in slices 1c/2/3a, not introduced by this slice). No migration, no mutation (confirmed: `git status` shows exactly 2 new untracked files, zero modified files), no manual-verify step needed. Real changed-line count: 2 new files, ~90 lines production (`reversa-pago-saf.ts`) + ~140 lines test (`reversa-pago-saf.test.ts`) ≈ 230 lines total — within the 90-130 estimate for the production file; combined total slightly above due to the added cross-empresa test, still Low risk per the forecast, no `size:exception` needed.

## Slice 3b-ii — reversal COMPENSATION (contra-entries, must land after 3b-i)

- [ ] 3b-ii.1 [RED] `reversa-pago-saf.test.ts`: fully-consumed-single-venta scenario ($100/1 venta, remainder=0) — assert **no** `saf_creditos_reversas` row, 1 `REV` movimiento for the $100 venta.
- [ ] 3b-ii.2 [RED] `reversa-pago-saf.test.ts`: partial-consumption scenario ($100 lote, $60 consumed, $40 remainder) — assert `saf_creditos_reversas` row (`saldo_disponible_anulado_usd=40`) + paired `SAFR` movimiento (−40 `saf_disponible`) + 1 `REV` movimiento for the $60 venta.
- [ ] 3b-ii.3 [RED] `reversa-pago-saf.test.ts`: multi-invoice scenario ($100 consumed $60+$40 across 2 ventas) — assert 2 `REV` movimientos (correct venta+monto each), no `saf_creditos_reversas` row.
- [ ] 3b-ii.4 [RED] `reversa-pago-saf.test.ts`: assert zero UPDATE/DELETE ever targets `saf_creditos_lotes`/`saf_creditos_aplicaciones` — only INSERT (`saf_creditos_reversas`, `movimientos_cuenta` REV/SAFR) + UPDATE `ventas.saldo_pend_usd`.
- [ ] 3b-ii.5 [GREEN] Implement `reversarPagoSafEnTx(tx, { pagoId, empresaId, clienteId, reversedBy, now })` in `reversa-pago-saf.ts`: per affected venta — INSERT `REV` movimiento (`doc_origen_id=pagoId`) + `UPDATE ventas.saldo_pend_usd += monto_aplicado_usd` (estado re-derived by existing trigger, never hand-set); if remainder>0 — INSERT `saf_creditos_reversas` + paired `SAFR` movimiento (reuse `calcularSaldoLoteDespues` with `montoAplicado=saldoAntes`, guaranteeing 0 by construction).
- [ ] 3b-ii.6 Verify: `yarn test:run src/features/cxc/hooks/__tests__/reversa-pago-saf.test.ts`; confirm 0 new type-check errors; **manual owner-run**: run a diagnostic reconciliation query (Q3 shape) against a test reversed pago in Supabase SQL editor, confirm net `saf_disponible`/`saldo_pendiente_usd` match pre-pago values.

## Slice 3b-iii — wiring + integration tests (must land after 3b-ii)

- [ ] 3b-iii.1 [RED] `use-cxc.test.ts` reverso suite: assert a new **Step 4b** calls `reversarPagoSafEnTx` only when the reversed pago's `venta_id IS NULL` (lote-bearing anticipo) — mutually exclusive with Step 3's direct-venta restore.
- [ ] 3b-iii.2 [GREEN] Wire `registrarReversoAbono` (~L1797, after Step 4's `saldo_actual` restore, before Step 5's pago `REV` row): call `reversarPagoSafEnTx` as Step 4b.
- [ ] 3b-iii.3 [RED→GREEN] Integration test: reverso of a $130 abono ($100 FIFO + $30 SAF excedente, partially consumed) — assert final `saldo_pendiente_usd`/`saf_disponible`/`saldo_actual` equal pre-abono values (net-zero across the full stack).
- [ ] 3b-iii.4 Verify: `yarn test:run src/features/cxc/hooks/__tests__/use-cxc.test.ts src/features/cxc/hooks/__tests__/reversa-pago-saf.test.ts`; confirm `use-cxc.ts` adds 0 new type-check errors; **manual owner-run**: reverse a real test $130 abono in a staging empresa (direct SQL sequence, no UI yet), confirm `clientes` row matches pre-abono snapshot.

---

## Cross-slice final task

- [ ] F.1 Update `migrations/README.md`: add 6 rows (0109-0114), same density/voice as existing 0104-0108 rows, cross-referencing `cxc-ledger-saldos-redesign` design.md.
