# Design: Move Trigger Side-Effects from BEFORE to AFTER INSERT

> Covers capabilities `saldo-cliente-trigger-idempotencia` and
> `saf-lote-trigger-idempotencia`. Note on size: this design exceeds the
> skill's 800-word soft budget intentionally — the orchestrator explicitly
> required byte-exact SQL for both splits plus the BEFORE→AFTER correctness
> proof. Prose stays terse; the length is the SQL/verification blocks.

## Technical Approach

Split each defective trigger function into two: a `BEFORE INSERT` function
that ONLY mutates `NEW` (required — `AFTER` cannot write `NEW`), and a new
`AFTER INSERT` function that performs the side-effect `UPDATE` on the other
table. Postgres does not fire `AFTER ROW` triggers for rows discarded by
`ON CONFLICT DO NOTHING` — this is the exact mechanism that closes the
confirmed root cause (obs #6079: 1 INSERT, 3 retried txids, 3 side-effect
UPDATEs). The `BEFORE` function keeps running on every retry (harmless — it
only touches `NEW`, which is thrown away if the row conflicts); the `AFTER`
function now runs **at most once per durably-inserted row**.

Two independent trigger pairs, same pattern, same migration:

1. `actualizar_saldo_cliente()` / `movimientos_cuenta` → `clientes`
2. `consumir_saf_lote()` / `saf_creditos_aplicaciones` → `saf_creditos_lotes`

## Architecture Decisions

| # | Decision | Choice | Alternatives considered | Rationale |
|---|----------|--------|--------------------------|-----------|
| 1 | Split boundary | `BEFORE`: NEW-mutation + assertions only. `AFTER`: side-effect UPDATE only. | Idempotency guard inside trigger (dedup flag); smaller transactions. | Matches Postgres's native guarantee (AFTER skipped on discarded conflict rows) instead of inventing app-level dedup logic. Rejected alternatives analyzed and discarded in proposal. |
| 2 | `set_config` placement | Move the `PERFORM set_config(...)` call into the `AFTER` function, immediately before its `UPDATE`. | Call `set_config` in `BEFORE` and hope it survives to `AFTER`. | `set_config(..., TRUE)` is transaction-scoped (`is_local=true`), not statement-scoped — but keeping the call adjacent to its consumer in the same function avoids depending on that subtlety and matches the existing code shape 1:1. |
| 3 | `consumir_saf_lote` value propagation | `AFTER` reads `NEW.lote_saldo_despues_usd` (already computed + clamped by `BEFORE`), does NOT re-`SELECT`. | Re-run `SELECT ... FOR UPDATE` + recompute `v_saldo_despues` inside `AFTER`. | DRY: avoids duplicating the clamp/overdraft logic in two places (drift risk). The `FOR UPDATE` lock from `BEFORE` is still held (same transaction) so no concurrent writer could have changed the lote between `BEFORE` and `AFTER` — re-reading would return the identical value anyway, just wastefully. |
| 4 | Migration mechanics | Append-only `0121`, `CREATE OR REPLACE FUNCTION` for both slimmed `BEFORE`s, `CREATE OR REPLACE FUNCTION` for both new `AFTER`s, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` for all 4 trigger declarations. | `ALTER TRIGGER` | Postgres cannot `ALTER TRIGGER` to change firing timing (`BEFORE`→`AFTER`) — only renaming/deferrability. Must drop+recreate. |
| 5 | Delivery shape | Chain into 3 PR units: (1) `actualizar_saldo_cliente` split, (2) `consumir_saf_lote` split, (3) staging cleanup script. | Single PR with everything. | See Review Budget below — a single PR exceeds the 400-line guard once header documentation (this codebase's convention, see 0119/0120) and dry-run blocks are included for both functions. |

## Correctness Proof: BEFORE→AFTER Read Equivalence

**Claim**: moving `UPDATE clientes SET saldo_actual = saldo_actual + ...`
(and the `saf_creditos_lotes` equivalent) from `BEFORE` to `AFTER` does not
change the values it reads or writes.

**Proof**:
- The `UPDATE` targets `clientes` / `saf_creditos_lotes` — a table **different**
  from the one receiving the triggering `INSERT` (`movimientos_cuenta` /
  `saf_creditos_aplicaciones`). Inserting a row into table A does not mutate
  any row of table B. So whether the `UPDATE` on B runs microseconds before
  or microseconds after the physical `INSERT` into A completes, the **pre-image**
  of the B row it reads (`saldo_actual`, `saldo_pendiente_usd`, `saf_disponible`,
  `saldo_disponible_usd`) is identical in both cases, because nothing else in
  this statement writes to B before that point.
- Both firings happen inside the **same transaction** and, for a single-row
  `INSERT`, the same statement execution — there is no intervening `COMMIT`
  between `BEFORE` and `AFTER` firing, so no other session's write can become
  visible in between (no snapshot advance within one statement under any
  isolation level Postgres supports).
- The only writer of `clientes.saldo_actual`/`saf_disponible`/`saldo_pendiente_usd`
  is this very trigger (enforced by `validate_cliente_update()`); the only
  writer of `saf_creditos_lotes.saldo_disponible_usd`/`status` is
  `consumir_saf_lote()` (enforced by `validate_saf_lote_update()`). Nothing
  else races it between `BEFORE` and `AFTER`.
- `NEW.saldo_nuevo` / `NEW.monto` / `NEW.tipo` / `NEW.lote_saldo_despues_usd`
  are all readable (not writable) in `AFTER` — Postgres explicitly allows
  reading `NEW` in `AFTER ROW` triggers, it only forbids writing it.

**Caveat (lock timing, not a correctness bug)**: the row lock on the target
`clientes`/`saf_creditos_lotes` row is now acquired slightly later (at
`AFTER` firing instead of `BEFORE`). For `saf_creditos_lotes` this is masked
because the `FOR UPDATE` lock is **already** acquired in `BEFORE` (via the
explicit `SELECT ... FOR UPDATE`, kept there) and held through `AFTER` — see
Decision #3. For `clientes`, the lock is a normal `UPDATE`-implicit row lock
acquired at `UPDATE` time wherever that lives; moving it a few microseconds
later within the same statement/transaction has no observable effect because
no other statement can interleave inside that window.

**Conclusion**: the relocation is a pure timing change with zero effect on
computed values. Confirmed by design review; MUST still be re-confirmed by
the byte-diff gate and staging dry-run in Testing Strategy before merge.

## Data Flow

```
Happy path (single upload, no retry):
  App writeTransaction → INSERT movimientos_cuenta
    │
    ├─ BEFORE: actualizar_saldo_cliente()        [mutates NEW.saldo_nuevo]
    ├─ (row physically inserted, no conflict)
    └─ AFTER:  actualizar_saldo_cliente_after()  [UPDATE clientes once]

Retry path (PowerSync re-sends same op, FIXED):
  Attempt 1 → INSERT ... ON CONFLICT(id) DO NOTHING
    ├─ BEFORE fires (mutates NEW, discarded)
    ├─ row inserted (no prior conflict)
    └─ AFTER fires  → UPDATE clientes  (+$1)       ✅ saldo = $1
  Attempt 2 (retry, SAME id) → INSERT ... ON CONFLICT(id) DO NOTHING
    ├─ BEFORE fires (mutates NEW, discarded)
    ├─ conflict detected → row NOT inserted
    └─ AFTER does NOT fire                          ✅ saldo stays $1
  Attempt 3 (retry, SAME id) → same as attempt 2    ✅ saldo stays $1

Before this fix, the side-effect UPDATE lived in BEFORE and fired on EVERY
attempt (1, 2, 3) → saldo = $3 (confirmed live, obs #6079).
```

`consumir_saf_lote` / `saf_creditos_aplicaciones` → `saf_creditos_lotes`
follows the identical shape, independently — different table pair, no
cross-trigger interaction (the app inserts `movimientos_cuenta` SAF row and
`saf_creditos_aplicaciones` row as two separate sequential statements in the
same `writeTransaction`; their `BEFORE`/`AFTER` pairs never overlap or race
each other, and `set_config` values are overwritten sequentially, not
concurrently, so no cross-contamination between `'mov_cuenta'` and
`'saf_aplicacion'` contexts).

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `migrations/0121_mover_side_effect_a_after_insert.sql` | Create | Both splits (4 functions, 4 trigger decls), rollback block, dry-run verification |
| `migrations/cleanup_test_clients_saldo_0121.sql` | Create | Staging-only reset for clients corrupted by the confirmed live repro (same pattern as `cleanup_test_clients_saldo.sql`) |

## Interfaces / Contracts (exact SQL)

### 1. `actualizar_saldo_cliente()` — slimmed BEFORE

```sql
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  ELSIF NEW.tipo IN ('SAF', 'SAFV') THEN
    IF NEW.saldo_nuevo IS NULL
       OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.tipo = 'REV' THEN
    IF ABS((NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'REV saldo_nuevo (%) inconsistente: esperado saldo_anterior+monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior + NEW.monto USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- SAL, SAFC, SAFR: saldo_nuevo stays as provided in the INSERT (unchanged).
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Removed vs. 0120: the `IF NEW.saldo_nuevo IS NOT NULL THEN ... UPDATE clientes ... END IF;`
block (0120 lines 112–192) — relocated verbatim below, zero formula edits.

### 2. `actualizar_saldo_cliente_after()` — NEW AFTER

```sql
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente_after()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    UPDATE clientes
    SET
        saldo_actual = CASE
          WHEN NEW.tipo = 'SAL' THEN NEW.saldo_nuevo
          ELSE
            saldo_actual
            + (CASE
                 WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN NEW.monto
                 WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF')
                      THEN GREATEST(0, saldo_pendiente_usd - NEW.monto) - saldo_pendiente_usd
                 ELSE 0
               END)
            - (CASE
                 WHEN NEW.tipo = 'SAFC' THEN NEW.monto
                 WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV')
                      THEN GREATEST(0, saf_disponible - NEW.monto) - saf_disponible
                 ELSE 0
               END)
        END,
        saf_disponible = CASE
          WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
          WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV') THEN GREATEST(0, saf_disponible - NEW.monto)
          ELSE saf_disponible
        END,
        saldo_pendiente_usd = CASE
          WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN saldo_pendiente_usd + NEW.monto
          WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF') THEN GREATEST(0, saldo_pendiente_usd - NEW.monto)
          ELSE saldo_pendiente_usd
        END,
        updated_at = NOW()
    WHERE id = NEW.cliente_id;
  END IF;
  RETURN NULL; -- AFTER ROW return value is ignored by Postgres; NULL is the documented convention.
END;
$$ LANGUAGE plpgsql;
```

The `UPDATE` body above is **byte-identical** to 0120 lines 115–191 — only
relocated, zero CASE/formula changes. Byte-diff gate required before merge.

### 3. Trigger declarations — `movimientos_cuenta`

```sql
DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente ON movimientos_cuenta;
CREATE TRIGGER trg_actualizar_saldo_cliente
  BEFORE INSERT ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente();

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente_after ON movimientos_cuenta;
CREATE TRIGGER trg_actualizar_saldo_cliente_after
  AFTER INSERT ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente_after();
```

### 4. `consumir_saf_lote()` — slimmed BEFORE

```sql
CREATE OR REPLACE FUNCTION public.consumir_saf_lote()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo_antes   NUMERIC(20,8);
  v_saldo_despues NUMERIC(20,8);
BEGIN
  -- FOR UPDATE stays HERE (BEFORE): serializes concurrent consumers of the
  -- SAME lote, and must run before the overdraft check can abort the INSERT.
  SELECT saldo_disponible_usd INTO v_saldo_antes
  FROM public.saf_creditos_lotes WHERE id = NEW.lote_id FOR UPDATE;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION 'Lote de credito SAF % no encontrado', NEW.lote_id USING ERRCODE = 'P0001';
  END IF;

  v_saldo_despues := v_saldo_antes - NEW.monto_aplicado_usd;
  IF v_saldo_despues < -0.005 THEN
    RAISE EXCEPTION 'Aplicacion ($%) excede el saldo disponible del lote ($%)',
      NEW.monto_aplicado_usd, v_saldo_antes USING ERRCODE = 'P0001';
  END IF;
  v_saldo_despues := GREATEST(0, v_saldo_despues);

  NEW.lote_saldo_antes_usd   := v_saldo_antes;
  NEW.lote_saldo_despues_usd := v_saldo_despues;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Removed vs. 0105: `PERFORM set_config(...)` + `UPDATE saf_creditos_lotes ...`
block — relocated below. The `FOR UPDATE` lock and overdraft exception stay
in `BEFORE` (they gate whether the row may be inserted at all).

### 5. `consumir_saf_lote_after()` — NEW AFTER

```sql
CREATE OR REPLACE FUNCTION public.consumir_saf_lote_after()
RETURNS TRIGGER AS $$
BEGIN
  -- Reads NEW.lote_saldo_despues_usd (already computed + clamped in BEFORE)
  -- instead of re-SELECTing — see Decision #3. The FOR UPDATE lock taken in
  -- BEFORE is still held (same transaction), so this value cannot be stale.
  PERFORM set_config('clarapos.trigger_context', 'saf_aplicacion', TRUE);
  UPDATE public.saf_creditos_lotes
  SET saldo_disponible_usd = NEW.lote_saldo_despues_usd,
      status = CASE WHEN NEW.lote_saldo_despues_usd <= 0.005 THEN 'AGOTADO' ELSE 'ACTIVO' END,
      updated_at = NOW()
  WHERE id = NEW.lote_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### 6. Trigger declarations — `saf_creditos_aplicaciones`

```sql
DROP TRIGGER IF EXISTS trg_consumir_saf_lote ON public.saf_creditos_aplicaciones;
CREATE TRIGGER trg_consumir_saf_lote BEFORE INSERT ON public.saf_creditos_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.consumir_saf_lote();

DROP TRIGGER IF EXISTS trg_consumir_saf_lote_after ON public.saf_creditos_aplicaciones;
CREATE TRIGGER trg_consumir_saf_lote_after AFTER INSERT ON public.saf_creditos_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.consumir_saf_lote_after();
```

## Testing Strategy

No Postgres unit-test runner exists in this repo (Vitest covers TS only).
Verification is SQL dry-run + live staging repro, same precedent as
0119/0120.

| Layer | What to test | Approach |
|-------|-------------|----------|
| Byte-diff | `UPDATE` bodies unchanged | Diff the `UPDATE clientes`/`UPDATE saf_creditos_lotes` blocks in the new `AFTER` functions against the removed blocks in 0120/0105 — must be textually identical modulo the `v_saldo_despues`→`NEW.lote_saldo_despues_usd` substitution (Decision #3). |
| Dry-run: single fire (regression) | `TC-UNICO-FIRE` (unchanged from 0120) and its SAF equivalent | `BEGIN; INSERT ...; SELECT saldo_actual/saldo_disponible_usd; ROLLBACK;` — expect exactly one delta, no regression under normal (non-retried) inserts. |
| Dry-run: retry (the fix) | `TC-RETRY-SIMULADO` — simulate PowerSync's exact re-send pattern | `BEGIN;` reset test cliente/lote → 3× `INSERT ... ON CONFLICT (id) DO NOTHING` with the SAME `id` (same pattern the connector uses) → `SELECT saldo_actual` — expect ONE net delta (not 3×) → `ROLLBACK`. Repeat for `saf_creditos_aplicaciones`/`saf_creditos_lotes`. This is the test shape the 0120 `TC-UNICO-FIRE` could NOT catch (single-op, no retry) — see obs #6078 Learned #3. |
| Full tipo matrix | FAC/PAG/REV/SAF/SAFV/SAFC/SAFR/SAL/NDB/NCR | Staging smoke run, one dry-run block per tipo, confirm unchanged behavior vs. pre-0121. |
| Rollback | Migration reversibility | `BEGIN; <rollback block>; ROLLBACK;` dry-run before merge — restores 0120/0105 single-`BEFORE` bodies byte-for-byte. |
| Live repro | The confirmed 3-fire scenario (obs #6079) | Re-run the exact staging repro (same $1 FAC, forced multi-retry) — must now show `saldo_pendiente_usd = $1`, not $3. |
| Cleanup | Corrupted staging test clients | `cleanup_test_clients_saldo_0121.sql` — same `set_config('clarapos.trigger_context','mov_cuenta',TRUE)` channel as the existing cleanup script, scoped to staging `empresa_id`, never run in production. |

## Migration / Rollout

- Append-only `migrations/0121_mover_side_effect_a_after_insert.sql`.
  Idempotent: `DROP TRIGGER IF EXISTS` + `CREATE OR REPLACE FUNCTION` /
  `CREATE TRIGGER` — safe to re-run any number of times.
- **Rollback block** (documented in the migration, not auto-executed):
  `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` and
  `consumir_saf_lote()` restored to their 0120/0105 single-`BEFORE` bodies
  (UPDATE re-inlined), plus `DROP TRIGGER`/`DROP FUNCTION` for both new
  `AFTER` triggers/functions. No data migration, no backfill — the split is
  a pure timing change, so rollback is a straight function/trigger swap.
- Depends on PR #287 (migration 0120) being merged first (builds on the
  clean 0120 body, not the debug-instrumented one).

## Review Budget Estimate

Honoring the proposal's own flag (`Review size exceeds 400-line budget`):

| Unit | Rough line count (migration, incl. this codebase's heavy Spanish header/rationale comments) | Rationale |
|------|------------------------------------------------------------------------------------------------|-----------|
| 1. `actualizar_saldo_cliente` split | ~180–220 | 2 functions (~45 lines each) + 2 trigger decls (~10) + header/rollback/dry-run docs (~100–150, matching 0119/0120 density) |
| 2. `consumir_saf_lote` split | ~130–160 | 2 functions (~35+20 lines) + 2 trigger decls (~8) + header/rollback/dry-run docs (~80–100) |
| 3. Cleanup script | ~60–90 | New non-numbered staging script, same shape as `cleanup_test_clients_saldo.sql` (57 lines for 2 clients) |

**Recommendation: chained delivery (3 PRs), not a single PR.** A single PR
bundling units 1+2+3 lands in the 370–470 line range even before counting
diff noise from `DROP TRIGGER`/`CREATE TRIGGER` pairs and the required
byte-diff commentary — borderline-to-over the 400-line guard, and it forces
reviewers to hold two unrelated trigger-pair proofs (clientes-saldo and
SAF-lote) in their head simultaneously. Units 1 and 2 are structurally
identical in shape but touch unrelated tables — splitting them lets a
reviewer verify one correctness proof at a time. Unit 3 (cleanup) is
non-functional and trivially reviewable alone; bundling it with either
functional unit adds noise for zero benefit.

## Open Questions

- [ ] **Twin-bug #3 (new finding, out of scope for this change)**:
      `anular_saf_lote_reversa()` (`migrations/0113_saf_creditos_reversas.sql`,
      `BEFORE INSERT` on `saf_creditos_reversas`) has the IDENTICAL defective
      shape (`FOR UPDATE` lock + `NEW.lote_saldo_*` mutation + side-effect
      `UPDATE saf_creditos_lotes` all in `BEFORE`), and `saf_creditos_reversas`
      is also an `IMMUTABLE_TABLES` entry in `connector.ts` (same
      `ON CONFLICT DO NOTHING` upload path). Confirmed proposal scope (lines
      42–45) only covers `consumir_saf_lote()` — `anular_saf_lote_reversa()`
      is a separate latent time bomb. Recommend a follow-up SDD change
      (`fix-trigger-side-effect-after-insert-reversas` or folded into this
      one's Unit 2 if the owner prefers one SAF-wide PR instead of leaving a
      known bug live). Flagging here per design-phase duty to surface
      blocking/adjacent discoveries, not silently expanding scope.
- [ ] Confirm with the owner whether `cleanup_test_clients_saldo_0121.sql`
      targets the SAME corrupted test clients as the existing
      `cleanup_test_clients_saldo.sql` (CLIENTE TEST 9/11) or a NEW set (e.g.
      CLIENTE TEST 14, mentioned in the task context) — needs real UUIDs from
      the owner's staging repro before the script can be written; this
      design does not invent placeholder IDs for a destructive-adjacent
      script.
