# Proposal: Fix Trigger Side-Effect After Insert (Saldo Inflation on Sync Retry)

## Intent

CONFIRMED LIVE in staging (txid instrumentation, obs #6079): a SINGLE INSERT of a $1
credit invoice (one `movimientos_cuenta` row, same `mov_id`) fired the trigger
`actualizar_saldo_cliente()` THREE times across THREE distinct Postgres txids
(6231, 6232, 6242; ~1.9s apart, retry-backoff pattern), leaving
`saldo_pendiente_usd = $3` instead of $1. N fires = $N.

Root cause: `movimientos_cuenta` (immutable ledger) is uploaded by PowerSync via
`upsert(ignoreDuplicates: true)` = `INSERT ... ON CONFLICT(id) DO NOTHING`
(`connector.ts:604-606`). PowerSync re-sends the same operation across separate
upload retries — this is documented, intentional PowerSync behavior ("operations
are idempotent, backend may receive the same op more than once"), not an edge
case. Postgres fires `BEFORE INSERT` ROW triggers for EVERY candidate row BEFORE
evaluating `ON CONFLICT` — so the trigger's side-effect `UPDATE clientes SET
saldo...` runs on every re-send, even though the duplicate ledger row itself is
correctly discarded. The ledger stays correct (one row); the client's saldo does
not.

This is NOT specific to reversals and NOT a transaction-size issue — ANY re-sent
`movimientos_cuenta` INSERT inflates saldo. A simple $1 credit invoice is enough
to trigger it; reversals (more ops per transaction) just made it more visible.

**Twin bug (same shape, confirmed via live `pg_get_functiondef`)**:
`consumir_saf_lote()` (`BEFORE INSERT` on `saf_creditos_aplicaciones`,
`migrations/0105_saf_creditos_aplicaciones.sql:142`) has the identical defective
pattern: it mutates `NEW.lote_saldo_antes_usd`/`NEW.lote_saldo_despues_usd` AND
does a side-effect `UPDATE saf_creditos_lotes SET saldo_disponible_usd...` in the
same `BEFORE` trigger. Latent double-consumption of SAF lote balance on retry.
Must be fixed in the same change — fixing only one leaves the other as a time
bomb with the exact same root cause.

## Scope

### In Scope
- Split `actualizar_saldo_cliente()` (`migrations/0120`) into a `BEFORE INSERT`
  trigger (keeps ONLY `NEW.saldo_nuevo` computation + consistency assertions) and
  a NEW `AFTER INSERT` trigger that performs `UPDATE clientes SET saldo_actual,
  saldo_pendiente_usd, saf_disponible`.
- Split `consumir_saf_lote()` (`migrations/0105`) the same way: `BEFORE INSERT`
  keeps ONLY `NEW.lote_saldo_antes_usd`/`NEW.lote_saldo_despues_usd`; a NEW
  `AFTER INSERT` trigger does `UPDATE saf_creditos_lotes SET
  saldo_disponible_usd...`.
- New append-only migration `migrations/0121_mover_side_effect_a_after_insert.sql`
  with documented ROLLBACK block.
- Byte-diff verification: the formulas/CASE logic inside each `BEFORE` body must
  be byte-identical to the current live function (0120 / 0105) minus the removed
  `UPDATE` statement — no formula changes.
- Staging-only data cleanup script for clients corrupted by the confirmed 3x
  repro (precedent: `cleanup_test_clients_saldo.sql`).
- Live staging re-run of the exact 3-fire repro scenario — must show ONE net
  saldo delta after the fix (not 3x).

### Out of Scope
- Changing the saldo/SAF formulas or CASE branches (byte-identical, timing-only
  change: `BEFORE`→`AFTER` for the side-effect statement).
- Touching PowerSync connector's `ignoreDuplicates`/retry behavior
  (`connector.ts`) — it is correct and documented; the trigger must tolerate it,
  not the other way around.
- The simple-venta/SAF bridge work just shipped (unrelated, already merged).
- Idempotency-guard-inside-trigger approach (Option B) and
  smaller-transaction mitigation (Option C) — evaluated and rejected, see
  Approach.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `cxc-ledger-saldos-redesign` (or closest existing CxC/saldo capability, to be
  confirmed against `openspec/specs/` naming at spec phase): requirement changes
  from "saldo is updated synchronously within the same BEFORE INSERT firing that
  validates the ledger row" to "saldo is updated in a separate AFTER INSERT
  firing, guaranteed to run at most once per durably-inserted ledger row."
- No existing `openspec/specs/` entry exists yet for SAF lote consumption as a
  named capability — sdd-spec phase to confirm whether this needs a new spec
  domain or folds into the CxC delta.

## Approach

**Chosen: Option A — split BEFORE/AFTER by responsibility.**

- `BEFORE INSERT`: ONLY logic that mutates `NEW` (required — `AFTER` triggers
  cannot modify `NEW`). For `actualizar_saldo_cliente`: `NEW.saldo_nuevo` +
  assertions. For `consumir_saf_lote`: `NEW.lote_saldo_antes_usd` /
  `NEW.lote_saldo_despues_usd`.
- `AFTER INSERT` (new trigger, new function): the side-effect `UPDATE` on the
  OTHER table (`clientes` / `saf_creditos_lotes`). Postgres does NOT fire `AFTER
  ROW` triggers for rows discarded by `ON CONFLICT DO NOTHING` — this closes the
  root cause at the mechanism level: a re-sent duplicate INSERT that gets
  discarded never re-triggers the `AFTER` side-effect.
- **Design verification required**: the current `BEFORE` UPDATE reads live
  `saldo_actual`/`saldo_pendiente_usd`/`saf_disponible` off `clientes` (0119's
  self-healing relative-delta formula) at firing time. Moving to `AFTER` changes
  WHEN that read happens (after the row physically exists) but not WHICH row —
  the UPDATE targets `clientes`, not the just-inserted `movimientos_cuenta` row,
  so the read values should be identical. Must be confirmed with a byte-diff +
  dry-run before merging, not assumed.
- `set_config('clarapos.trigger_context', ...)` bypass must be re-verified to
  authorize the UPDATE from the NEW `AFTER` trigger context too.

**Rejected alternatives**:
- Option B (idempotency guard inside trigger): more invasive, adds new bug
  surface (transaction-scoped config leakage risk), doesn't match Postgres's
  native guarantee as cleanly.
- Option C (smaller transactions per invoice): doesn't fix the root cause — ANY
  transaction with a retried `movimientos_cuenta` INSERT still inflates saldo;
  also conflicts with business rule #9 (atomic financial operations).
- Keeping only `ignoreDuplicates`: confirmed insufficient — this is what's live
  today and still bugged.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `migrations/0121_mover_side_effect_a_after_insert.sql` | New | Splits both trigger functions BEFORE/AFTER |
| `actualizar_saldo_cliente()` (0119/0120 lineage) | Modified | Removes `UPDATE clientes` from BEFORE body |
| NEW `actualizar_saldo_cliente_after()` + `trg_..._after` | New | AFTER INSERT trigger on `movimientos_cuenta`, does the `UPDATE clientes` |
| `consumir_saf_lote()` (`migrations/0105`) | Modified | Removes `UPDATE saf_creditos_lotes` from BEFORE body |
| NEW `consumir_saf_lote_after()` + `trg_..._after` | New | AFTER INSERT trigger on `saf_creditos_aplicaciones` |
| `migrations/cleanup_test_clients_saldo.sql` (new variant) | New | Staging-only reset for clients corrupted by the confirmed repro (e.g. CLIENTE TEST 14) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| AFTER trigger reads stale/different `clientes` values than BEFORE did | Low | Byte-diff the read expressions; dry-run BEGIN/ROLLBACK repro in staging before merge |
| `set_config` bypass context doesn't carry to the new AFTER trigger, blocking the UPDATE via `validate_cliente_update` | Med | Explicit test: insert via simulated sync path, confirm UPDATE succeeds, not just BEFORE path |
| Regression across all `movimientos_cuenta` tipos (FAC/PAG/REV/SAF/SAFV/SAFC/SAFR/SAL/NDB/NCR) | Med | Full-tipo smoke matrix in staging dry-run, not just the repro case |
| No Postgres test runner exists — verification relies on manual byte-diff + staging repro | Med | Document exact verification steps in tasks.md; live 3-fire repro must become 1x net effect before sign-off |
| Review size exceeds 400-line budget (2 trigger functions + 2 new AFTER triggers + migration + cleanup script) | Med | Likely needs chaining: Unit 1 = `actualizar_saldo_cliente` split; Unit 2 = `consumir_saf_lote` split; Unit 3 = cleanup script. See Next Step. |

## Rollback Plan

Migration 0121 includes a documented `ROLLBACK` block: `CREATE OR REPLACE
FUNCTION` restoring both trigger functions to their current (0120 / 0105) bodies
byte-for-byte, and `DROP TRIGGER`/`DROP FUNCTION` for the two new `AFTER`
triggers. No data migration is destructive — the split is purely a timing change
to existing logic, so rollback is a straight function/trigger swap, no backfill
needed. The staging cleanup script is additive and separate from the
rollback path (never run in production).

## Dependencies

- PR #287 (`limpiar-trigger-debug-saldo-cliente`, migration 0120) must be merged
  first — this change builds on 0120's clean function body, not the one with
  debug instrumentation.
- No other open SDD change touches `actualizar_saldo_cliente()` or
  `consumir_saf_lote()` concurrently (checked: `fix-trigger-saldo-actual` and
  `fix-saldo-cliente-doble-reverso` in `openspec/changes/` are prior, unrelated
  symptom-level fixes — confirm not still active before starting apply).

## Success Criteria

- [ ] Live staging repro of the confirmed 3-fire scenario (same mov_id, forced
      multi-retry) produces exactly ONE net saldo delta, not 3x.
- [ ] Byte-diff confirms BEFORE-trigger formulas are unchanged (only the
      `UPDATE` statement moved out).
- [ ] Full `movimientos_cuenta` tipo matrix (FAC/PAG/REV/SAF/SAFV/SAFC/SAFR/SAL/NDB/NCR)
      smoke-tested in staging with no regression vs. current behavior under
      normal (non-retried) inserts.
- [ ] `consumir_saf_lote` split verified the same way (SAF lote consumption
      does not double-apply on retry).
- [ ] Corrupted staging test clients reset via cleanup script; empresa/tenant
      isolation of the cleanup confirmed (staging only, scoped `empresa_id`).
- [ ] Rollback block dry-run tested (`BEGIN; <rollback>; ROLLBACK;`) before merge.
