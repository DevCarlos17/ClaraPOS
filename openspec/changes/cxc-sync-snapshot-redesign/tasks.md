# Tasks: Ventas Estado Derivado (CxC Foundation — estado-only)

> AMENDED — trimmed from the original two-piece bundle. `saf_disponible`
> already shipped under `saf-snapshot-y-trazabilidad`; only `ventas.estado`
> remains. See `design.md`'s Amendment Note for full context. Migration
> numbers renumbered `0100`-`0103` → `0106`-`0107` (0100-0103 are now occupied
> by unrelated, already-shipped SQL).

> AMENDED AGAIN (CRITICAL-1 fix) — adversarial verify found `ventas.estado`
> is never set for CONTADO sales (the INSERT path was never covered; only
> the UPDATE trigger existed). See `design.md` Amendment Note 2 / §3b/§3c.
> Tasks 1.1-1.8 below are the already-completed Phase 1 work and are
> UNCHANGED. New tasks **1.9-1.14** are additive corrections: a 2nd trigger
> function (folded into the still-unapplied `0106`, not a new migration) +
> 2 client-side INSERT write-sites + their TDD tests.

## Review Workload Forecast (recomputed — estado-only scope + CRITICAL-1 fix)

| Field | Value |
|-------|-------|
| Estimated changed lines | ~420-500 (prod ~190-220 / tests ~230-280) |
| 400-line budget risk | **Medium — now above the 400-line soft budget** |
| Chained PRs recommended | Optional — see seam below; default is still single-PR (ask-on-risk) unless reviewer requests the split |
| Delivery strategy | ask-on-risk; offer the PR1/PR2 seam proactively since the estimate now exceeds 400 |

```text
Decision needed before apply: No
Chained PRs recommended: Optional (offer seam, don't force)
400-line budget risk: Medium (was Low; +~140-160 lines from CRITICAL-1 fix)
```

Size breakdown (original estate-only estimate ~280-340, **+ this amendment's
addition ~140-160**): migration `0106` (~70 lines original column/index/
UPDATE-trigger **+ ~25-35 new lines for `derive_venta_estado_insert()` +
`trg_venta_estado_insert`, §3b**) + migration `0107` backfill (~30 lines,
unchanged) + `schema.ts` diff (~3 lines) + `connector.ts` diff (~3 lines) +
`estado-venta.ts` new file (~30 lines, unchanged — no new logic needed) +
`estado-venta.test.ts` (~80-100 lines, unchanged) + `use-cxc.ts` read-path
diff (~20 lines) + connector PATCH-stripping test (~40-50 lines) +
**`use-ventas.ts` INSERT diff (~8-12 lines, task 1.10)** + **`use-importar-cxc.ts`
INSERT diff (~8-12 lines, task 1.11)** + **`use-ventas.test.ts` new/updated
assertions (~40-60 lines, task 1.12-1.13: new CONTADO/CREDITO-at-creation
estado assertions + updates to the 6+ existing exact-column-list assertions
that break once `estado` is added)** + **`use-importar-cxc.ts` test updates
(~20-30 lines, task 1.13)** + `migrations/README.md` entry (~2 lines).

If the reviewer wants a smaller diff, the natural seam is now 3 slices:
**PR1** = migration 0106 (column + index + BOTH triggers) + schema.ts +
connector.ts + estado-venta.ts + its test (~270-300 lines, the atomic
trigger-derivation unit, both INSERT and UPDATE paths together since they
ship in one migration) → **PR2** = the 2 client-side INSERT write-sites +
their tests (~90-120 lines, this amendment's core fix) → **PR3** = backfill
0107 + use-cxc.ts read-path swap + its tests (~90 lines, unchanged from
before). PR1+PR2 could also merge into one ~360-420-line PR if the reviewer
prefers only 2 slices total.

## Phase 0: Verification Spike — CLOSED by precedent (not re-executed)

- [x] 0.1 Instrument `src/core/db/powersync/connector.ts` `uploadData()` with
  a temporary `debugLog`. Done under this change (see
  `rollout/phase0-spike-runbook.md`). The instrumentation was later removed
  by a **different** change (`saf-snapshot-y-trazabilidad`, task 3.2,
  confirmed absent via `grep -r "SPIKE" src/` → 0 matches, connector.ts clean
  in `git status`).
- [x] 0.2-0.5 (manual offline/reconnect test + SQL PASS/FAIL check) — **never
  executed under this change's own banner**, and will NOT be executed
  retroactively. Closed instead via documented precedent: see `design.md`
  §1. `saf-snapshot-y-trazabilidad` asserted and shipped a strictly harder
  4-table ordering chain (`movimientos_cuenta → saf_creditos_lotes →
  saf_creditos_aplicaciones → ventas`) on the identical upload-order
  assumption, verified PASS in production with zero ordering-related bugs
  reported. This change's 2-table chain is a subset of that already-proven
  chain.
- [x] 0.6 Debug instrumentation already removed (see 0.1). No action needed.

> `rollout/phase0-spike-runbook.md` is kept as historical reference /
> runbook template, annotated at its top with this closed-by-precedent
> status — not deleted, in case a future change needs the same manual-test
> procedure for a genuinely novel ordering question.

## Phase 1: Migration (column + index + trigger, atomic — see design §8)

- [x] 1.1 Create `migrations/0106_ventas_estado_column.sql`:
  - `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pago','reversado'))`
  - `CREATE INDEX IF NOT EXISTS idx_mov_cuenta_venta ON movimientos_cuenta(venta_id, fecha DESC, created_at DESC)`
  - `CREATE OR REPLACE FUNCTION prevent_venta_mutation()` per design §3 (all
    existing guards byte-identical to `0097`; add the `estado` CASE
    derivation when `saldo_pend_usd` changes)
  - Header + rollback script per project convention (see `0097`): drop
    column, drop index, paste back the 0097 function body verbatim.
- [ ] 1.2 Verify via `BEGIN; <migration>; <run design §6 validation query +
  matrix scenarios: FAC-only, PAG-partial, PAG-full, NCR-covers-CONTADO-
  already-pago, REV-reopen, REV-then-PAG-clears>; ROLLBACK;` — all rows
  `PASS`. **AMENDED (CRITICAL-1): also smoke-test the §3b INSERT trigger
  directly** — `INSERT INTO ventas (..., saldo_pend_usd, total_usd, ...)
  VALUES (..., 0, 100, ...)` → assert `estado = 'pago'`; a second INSERT with
  `saldo_pend_usd = total_usd` → assert `estado = 'pendiente'`. **MANUAL —
  owner must run against real Supabase SQL editor; not executed by apply.**
- [x] 1.3 `src/core/db/powersync/schema.ts`: add `estado: column.text` to the
  `ventas` table (next to `status`, ~line 773); add `{ indexes: { by_venta:
  ['venta_id'] } }` to the `movimientos_cuenta` table (currently `{ indexes:
  {} }` at line 657).
- [x] 1.4 `src/core/db/powersync/connector.ts`: extend
  `TRIGGER_MANAGED_PATCH_COLUMNS` (line 124-135) → add `ventas: ['estado']`.
  Update the comment block to reference `migrations/0106`.
- [x] 1.5 Create `src/features/cxc/lib/estado-venta.ts`: pure function
  `calcularEstadoVenta(saldoPendUsd, totalUsd, ultimoMovimientoTipo)`
  mirroring design §3/§4 CASE logic (0.005 tolerance), same style/JSDoc as
  `saldo-cliente.ts`. Cross-reference comment: "mirrors
  `prevent_venta_mutation()` in `migrations/0106`, keep in sync."
- [x] 1.6 Write `src/features/cxc/lib/__tests__/estado-venta.test.ts`: cover
  every matrix scenario from design §4 as fixture data (CONTADO pago-at-
  creation, CREDITO pendiente, partial, NC-fully-covers-already-pago stays
  pago, REV reopens, REV-then-PAG clears to pago) — RED first, then
  implement 1.5 GREEN. This fixture table doubles as the parity reference
  from design §9.
- [x] 1.7 Extend `src/core/db/__tests__/connector-upload-retry.test.ts` (or
  new file) with a PATCH-stripping test: mock a `transaction.crud` PATCH op
  on `ventas` with `opData: { estado: 'pago', saldo_pend_usd: '0' }`, assert
  the Supabase `update()` payload omits `estado` but keeps `saldo_pend_usd`
  (model on the existing `clientes.saldo_actual`/`saf_disponible` strip test
  if present).
- [x] 1.8 Local write path: in `use-cxc.ts`'s payment/NC/reversal mutations,
  call `calcularEstadoVenta()` right after computing the new local
  `saldo_pend_usd`, writing the result to the local `estado` field in the
  same `writeTransaction` (optimistic local write, per design §1).

### Phase 1 additions — CRITICAL-1 fix (INSERT path, this amendment)

- [x] 1.9 **RED first**: add a failing test to
  `migrations/__tests__/` equivalent (or, since no DB-test infra exists in
  this codebase, document the expected behavior as a comment block in
  `estado-venta.test.ts` cross-referencing design §3b — same accepted-risk
  pattern as §9) asserting the §3b CASE: `saldo_pend_usd <= 0.005 → 'pago'`,
  else `→ 'pendiente'`. Then edit `migrations/0106_ventas_estado_column.sql`
  **in place** (folded, per design §8 — do NOT create a new migration file)
  to add `CREATE OR REPLACE FUNCTION derive_venta_estado_insert()` +
  `CREATE TRIGGER trg_venta_estado_insert BEFORE INSERT ON ventas` exactly
  per design §3b. **Do NOT touch `prevent_venta_mutation()` or its trigger**
  — hard constraint, see §3b. Update the migration's header comment block
  (parity matrix, rollback script) to include the new function/trigger's
  drop statements.
  - DONE: no DB-test infra exists (confirmed, same as prior Phase 1 note) —
    the §3b CASE is instead cross-referenced via the NEW "MATRIZ DE PARIDAD
    — TRIGGER DE INSERT" comment block added to `migrations/0106`'s header,
    and via the two new RED→GREEN client-side tests (1.10) which exercise
    `calcularEstadoVenta(saldo, total, null)` — the exact TS mirror of this
    SQL CASE — for both reachable INSERT-time magnitudes (0 and total_usd).
    `derive_venta_estado_insert()` + `trg_venta_estado_insert` added to
    `migrations/0106_ventas_estado_column.sql` in place (folded, no new
    migration file). `prevent_venta_mutation()` and its trigger are
    BYTE-IDENTICAL to before this amendment (confirmed by diff review) —
    hard constraint respected.
- [x] 1.10 **RED first**: add a failing test in
  `src/features/ventas/hooks/__tests__/use-ventas.test.ts` asserting the
  `INSERT INTO ventas` column list from `crearVenta()` includes `estado`,
  and that its value equals `calcularEstadoVenta(saldoPendFinal, totalUsd,
  null)` for both a CONTADO fixture (`saldoPendFinal = 0` → expect `'pago'`)
  and a CREDITO fixture (`saldoPendFinal = totalUsd` → expect `'pendiente'`).
  Then edit `src/features/ventas/hooks/use-ventas.ts` (~line 540-567, inside
  `crearVenta()`) to add `estado` to the INSERT column list and bind value,
  per design §3c.
  - DONE: RED confirmed by temporarily reverting the production change
    (`git stash` on `use-ventas.ts` only) and re-running the 2 new tests —
    both failed for the expected reason (missing `estado` in SQL / wrong
    param value), 23 pre-existing tests unaffected. GREEN confirmed after
    restoring the change: 25/25 passing.
- [x] 1.11 **RED first**: add a failing test in
  `src/features/cxc/hooks/__tests__/use-importar-cxc.test.ts` asserting the
  SAL-import `INSERT INTO ventas` column list includes `estado` with value
  `calcularEstadoVenta(montoUsd, montoUsd, null)` (always `'pendiente'` for
  this import path, matching `DEFAULT`). Then edit
  `src/features/cxc/hooks/use-importar-cxc.ts` (~line 168-199) to add
  `estado` to the INSERT column list and bind value, per design §3c.
  - DONE: this test file did NOT previously exist (confirmed via glob) — a
    NEW test file was created, mocking `db.writeTransaction`/`execute` the
    same pattern as `use-ventas.test.ts`. RED confirmed by running the file
    before the production edit (failed on `.sql.toContain('estado')`);
    GREEN after the edit. A 2nd triangulation test (different `monto_usd`)
    added to prove the value is recomputed from the real magnitude, not
    hardcoded.
- [x] 1.12 Update the existing exact-column-list assertions in
  `use-ventas.test.ts` (lines ~561-562, 799-800, 826-827, 853-854, 883, 985
  per the verify-report's citation) that currently do NOT expect an `estado`
  column — add it to each expected column list/bound-params array so these
  assertions stay accurate after 1.10's change, rather than becoming stale
  passes that no longer reflect the real INSERT shape.
  - DONE differently than literally specified, intentionally: `estado` was
    inserted into the column list immediately after `tipo` (new param index
    16), i.e. AFTER both `saldo_pend_usd` (index 14) and `tipo` (index 15) —
    not before/between them. This means every cited pre-existing assertion
    (`params[14]`, `params[15]`) is BYTE-IDENTICAL to before this change;
    none needed updating, because none became stale — they still assert the
    exact same columns at the exact same indices they always did. Verified
    exhaustively: grepped every `ventaInsert!.params[N]` in the file (13
    hits, all at index 14 or 15) — zero index-drift occurred. This is a
    stricter outcome than the task's literal instruction (update N
    assertions), achieved by choosing insertion position deliberately; no
    assertion was weakened, and 2 NEW assertions (checking index 16 =
    `estado`) were added per CONTADO/CREDITO scenario instead.
- [x] 1.13 Run `yarn test:run` targeted on
  `src/features/ventas/hooks/__tests__/use-ventas.test.ts` and
  `src/features/cxc/hooks/__tests__/use-importar-cxc.test.ts` — confirm
  1.10-1.12's new/updated assertions are GREEN and no other test in those
  files regressed.
  - DONE: `use-ventas.test.ts` 25/25 passing (23 pre-existing + 2 new).
    `use-importar-cxc.test.ts` (new file) 2/2 passing. See apply-progress
    for full regression run across `src/features/ventas/`, `src/features/cxc/`,
    `src/core/db/`.
- [x] 1.14 Update migration `0106`'s header comment (already references the
  parity matrix per design §3b/§9) to note the INSERT-path addition was made
  in this amendment pass, so a future reader of the migration file sees both
  triggers documented together, not just the UPDATE one.
  - DONE: header's "QUE HACE ESTA MIGRACION" numbered list now has point 4
    (the AMENDMENT/CRITICAL-1 INSERT trigger, with the hard-constraint
    rationale inline) alongside point 3 (the pre-existing UPDATE trigger,
    now annotated "NUNCA fire en INSERT, ver punto 4"). A second parity
    matrix table ("MATRIZ DE PARIDAD — TRIGGER DE INSERT") was added right
    after the existing UPDATE-path matrix, and the rollback section's steps
    were renumbered 1-5 to include dropping the new trigger + function.

## Phase 2: Backfill (after Phase 1 live in prod)

- [ ] 2.1 Create `migrations/0107_backfill_ventas_estado.sql` per design §7:
  read-only `SELECT/JOIN` on `movimientos_cuenta`; `UPDATE ventas` only;
  `IS DISTINCT FROM`-guarded `WHERE` for idempotency.
- [ ] 2.2 Run as `BEGIN; <backfill>; <design §6 validation query>; ROLLBACK;`
  in Supabase SQL editor — inspect 100% `PASS`, zero `movimientos_cuenta`
  row-count change (`SELECT COUNT(*) FROM movimientos_cuenta` before/after
  must match).
- [ ] 2.3 Only after 2.2 passes, re-run replacing `ROLLBACK` with `COMMIT`.
- [ ] 2.4 Re-run the full script once more post-commit to confirm no-op (0
  rows updated).

## Phase 3: UI Read-Path Swap (frozen-contract parity)

- [x] 3.1 `src/features/cxc/hooks/use-cxc.ts`: replace the dead-code filter
  at line 154 (`status IS NULL OR status NOT IN ('ANULADA', 'REVERSADA')`)
  with `estado != 'pago'` for the pending-list branch, keeping the
  `status != 'ANULADA'` guard separately (`status` and `estado` are distinct
  columns — `status` means invoice validity, `estado` means collection
  state).
  - DONE, with a scope clarification found by reading the real code (not the
    stale line-154 pointer): `useFacturasPendientes()` has TWO branches, not
    one. The dead `'REVERSADA'` string lives in the `incluirPagadas=true`
    branch (history view — intentionally includes `pago` invoices so the
    user can reverse old payments); applying `estado != 'pago'` THERE would
    have been a regression (it would have hidden paid invoices from the
    "ver pagadas" toggle). The REAL pending-invoices list — the one
    exploration.md fact #2 names as "the pending-invoices list" — is the
    OTHER (default, `incluirPagadas=false`) branch, which used
    `CAST(saldo_pend_usd AS REAL) > 0.001`. Applied the swap there instead:
    `status != 'ANULADA' AND estado != 'pago'`. The `incluirPagadas=true`
    branch only had its dead `'REVERSADA'` token removed (`status NOT IN
    ('ANULADA','REVERSADA')` → `status != 'ANULADA'`), no estado filtering
    added, preserving its "show paid too" contract.
  - **Flagged divergence (per orchestrator's STOP-and-report instruction)
    — SUPERSEDED, see Phase 5**: at the time this task ran, the old
    magnitude filter used a `0.001` tolerance and `estado='pago'` used
    `0.005` (migrations/0106), so the ambiguous band was `(0.001, 0.005]`.
    Phase 5 (task 5.1) later lowered `estado`'s tolerance to `0` exact
    (migration `0108`), which COLLAPSES that `(0.001, 0.005]` band — it no
    longer exists. The band that remains, at tolerance 0, is `(0, 0.001]`:
    the OLD magnitude filter (`saldo_pend_usd > 0.001`) treats a balance in
    that range as NOT pending (ignores it), while `estado` (tolerance 0)
    treats ANY `saldo_pend_usd > 0` as not-`'pago'` — i.e. `estado` is now
    STRICTER than the old filter in that narrow band, aligned with the
    owner's "collect everything, don't round away real debt" intent (same
    rationale as Phase 5). Task 5.3 (this corrective batch) closes the
    matching inconsistency on the client-debt aggregates
    (`use-cxc.ts`/`use-deuda-cliente.ts`), which still used `0.001` until
    then.
- [x] 3.2 Update `src/features/cxc/hooks/__tests__/use-cxc.test.ts`: assert
  identical output (pending-invoice set) for a fixed ledger fixture,
  before/after the query-shape change — frozen UI-contract parity scenario
  from the `ventas-estado-derivado` spec.
  - DONE: 3 new tests added (`useFacturasPendientes — Fase 3` describe
    block). (1) SQL-shape test for the default branch (`estado != 'pago'`,
    `status != 'ANULADA'`, no more `saldo_pend_usd` scan). (2) SQL-shape +
    behavioral test for `incluirPagadas=true` (no `'REVERSADA'` token,
    `status != 'ANULADA'` kept, still returns a `saldo_pend_usd='0'` paid
    invoice — proves no regression on that branch). (3) Pure-logic parity
    test: a 7-row ledger fixture (FAC CREDITO/CONTADO, PAG partial/full, NC
    full-cover, REV reopen, REV-then-clear) asserts `calcularEstadoVenta(...)
    !== 'pago'` matches `saldo_pend_usd > 0.001` for every row — real
    production-code assertion, not a trivial one.
  - RED→GREEN verified by `git stash` on `use-cxc.ts` only: both SQL-shape
    tests failed for the expected reason (old SQL string) against the
    pre-change code, the parity test passed (pure logic, no SQL
    dependency), and the 47 pre-existing tests in the file were unaffected.
    After `git stash pop`, all 49/49 passed.
- [ ] 3.3 Manual smoke test: CxC screen for one real client — pending list
  renders identically to pre-change values.
  - NOT run — explicitly owner-manual (no real Supabase/PowerSync
    connection available to this agent), same category as tasks 1.2/2.2-2.4.

## Phase 4: Cleanup

- [x] 4.1 Add `0106`-`0107` rows to `migrations/README.md` table, matching
  existing entry style (purpose + what it fixes).
  - DONE for `0106` (file exists, documented in full: column, index, both
    triggers, CRITICAL-1 fix, dead-filter replacement).
  - **BLOCKED/FLAGGED for `0107`**: `migrations/0107_backfill_ventas_estado.sql`
    does NOT exist on disk (confirmed via glob + `git status`), even though
    a prior apply-progress (Engram `#4840`, topic
    `sdd/cxc-sync-snapshot-redesign/apply-progress`) claims task 2.1 already
    authored it. This is a real discrepancy between recorded progress and
    the actual filesystem state — not something this Phase 3/4 batch is
    scoped to fix (that's Phase 2 work). Added the README row anyway,
    describing the file per design.md §7 (same content the prior
    apply-progress describes), with an explicit "Pendiente de re-creacion"
    note so the table isn't silently wrong, and flagged this prominently in
    the apply return summary for the orchestrator to resolve (either restore
    the file from whatever session produced it, or re-run task 2.1).
  - **RESOLVED in a later batch**: `0107_backfill_ventas_estado.sql` was
    recreated (dated 2026-10-13, confirmed on disk) using tolerance `0`
    exact — in parity with migration `0108` (Phase 5), not the original
    `0.005` formula. `migrations/README.md`'s `0107` row has been corrected
    accordingly (see Phase 5, task 5.4): no 0107-vs-0108 formula mismatch
    remains.
- [x] 4.2 Run `yarn test:run` targeted on `src/features/cxc/`,
  `src/core/db/` — confirm no regressions beyond pre-existing known failures
  (see engram `#962`, separate issue).
  -     DONE: `src/features/cxc/` → 150 passed, 2 failed (both pre-existing,
    confirmed unrelated to this change: `cxc-list.test.tsx` dialog assertion
    fails even in isolation and does not reference `useFacturasPendientes`/
    `estado`/`saldo_pend_usd`; `cxc-cliente-detalle.test.tsx`'s "Worker is
    not defined" is cross-file PowerSync flakiness — re-ran that file alone,
    8/8 passed). `src/core/db/` → 34/34 passed, 0 regressions.
    `yarn type-check:test` → 3 pre-existing errors, none touching
    `use-cxc.ts` or the new test block (producto-form tests + an unrelated
    unused-var in `use-pwa-update.ts`).

## Phase 5: Corrective — Tolerance 0 (interim decision, migrations/0108)

> Not part of the original phase plan above — added retroactively to track
> owner-directed corrective work that happened after Phase 4 shipped. See
> `design.md`'s spec pointer and `specs/ventas-estado-derivado/spec.md`'s own
> "Amendment Note (tolerance 0.005 → 0, interim)" for the full rationale
> (ClaraPOS's bimonetary model can leave real Bs owed uncollected under a USD
> tolerance). Tolerance 0 is explicitly INTERIM, pending a FUTURE
> diferencial-cambiario-to-gasto change for `NUMERIC(20,8)` rounding dust —
> see `src/features/cxc/lib/estado-venta.ts`.

- [x] 5.1 Lower `ventas.estado` derivation tolerance from `0.005` USD to `0`
  exact, in both the TS mirror and the Postgres triggers: `estado-venta.ts`
  (`TOLERANCIA_ESTADO_VENTA`), `estado-venta.test.ts` (rewrote 2
  tolerance-boundary tests + added 3 new triangulation tests, 13/13
  passing), and new migration `migrations/0108_ventas_estado_tolerancia_cero.sql`
  (`CREATE OR REPLACE FUNCTION` on `prevent_venta_mutation()` +
  `derive_venta_estado_insert()`, all other guards byte-identical to
  `0106`). Full regression at the time: `src/features/cxc/` 153/155 (2
  pre-existing, same as always).
- [x] 5.2 Recreate `migrations/0107_backfill_ventas_estado.sql` (flagged
  missing-from-disk in task 4.1 above) using tolerance `0` exact — in
  parity with `0108`, not the original `0.005` formula. Confirmed on disk,
  dated 2026-10-13.
- [x] 5.3 **(this batch)** Lower the client-debt AGGREGATE filters to
  tolerance 0, closing the residual `(0, 0.001]` "ghost debt" inconsistency
  against the tolerance-0 pending list (Fase 3/task 3.1's superseded note
  above): a pending invoice's balance now actually counts toward
  `deuda_usd`/`facturas_pendientes`, matching `estado != 'pago'`.
  - `src/features/cxc/hooks/use-cxc.ts`: `DEUDA_CREDITO_CLIENTE_SELECT`
    (`facturas_pendientes` COUNT + `deuda_usd` SUM, both
    `CAST(saldo_pend_usd AS REAL) > 0.001` → `> 0`) and the outer
    `WHERE deuda_usd > 0.001 ... ` → `WHERE deuda_usd > 0 ...` in both
    `useClientesConDeuda` and `useBuscarClientesDeuda`. 4 new/extended
    RED→GREEN tests (SQL-shape assertions) across
    `use-cxc.test.ts`/`use-deuda-cliente.test.ts`.
  - `src/features/cxc/hooks/use-deuda-cliente.ts`: `useDeudaFacturasCliente`
    + `useDeudaFacturasClientes`, same `> 0.001` → `> 0` change (pure
    debt-sum filters, no SAF involved).
  - **Intentionally left at `0.001`** (NOT a debt filter — SAF/credit
    availability gates, different concern): `credito_disponible_usd >
    0.001` (both outer WHEREs in `use-cxc.ts`), and the SAF-credit
    existence checks `creditoSafDisponible.lte('0.001')` /
    `safDisponibleAntes.lte('0.001')` (×3 call sites in
    `registrarPagoFactura`/`registrarAbonoGlobal`/`consumirSafLotesEnTx`).
  - Full regression: `src/features/cxc/` 157/159 (2 pre-existing, same as
    always — `cxc-list.test.tsx` dialog, `cxc-cliente-detalle.test.tsx`
    PowerSync "Worker is not defined"). `yarn type-check:test`: same 3
    pre-existing unrelated errors (producto-form tests, `use-pwa-update.ts`
    unused var).
- [x] 5.4 **(this batch)** Fix stale docs found by verify:
  - `specs/ventas-estado-derivado/spec.md`: requirement "Estado Derivation
    By Saldo Magnitude..." and "Reversado Detected..." + their scenarios
    updated from `0.005` to `0` exact; added a new "Amendment Note
    (tolerance 0.005 → 0, interim)" section; added 2 new boundary scenarios
    (residual `0.004` is NOT pago; REV guard at exactly `0` stays `pago`).
  - `migrations/README.md`: corrected the `0107` row — it previously
    (falsely, post-5.2) claimed `0107` "uses tolerancia 0.005" and warned of
    a 0107-vs-0108 formula mismatch. Both are now tolerance `0`, in parity;
    no mismatch.
  - `tasks.md` (this file): task 3.1's "Flagged divergence" note updated
    from the stale `(0.001, 0.005]` band framing to the real `(0, 0.001]`
    band description (superseded by 5.1's tolerance-0 switch); task 4.1
    annotated with a pointer noting `0107` was later resolved; this Phase 5
    section added to track all of the above.
