# Design: Fix saldo-a-favor (SAF) trigger sign error

## Technical Approach

Three surgical changes, no rebuild: (1) stop the Postgres trigger from recomputing `saldo_nuevo` for `tipo='SAF'`, trusting the app-provided value like it already does for REV/SAL, with an added consistency assertion; (2) a one-time ledger-replay data repair for `clientes.saldo_actual`; (3) remove the improper zero-clamp in `aplicarPagoFacturaEnTx`. Everything else (6 call sites, single-aggregate FIFO model) is confirmed already correct and untouched.

## Decision 1 — Trigger fix: trust + assert, not blind trust

**Before** (`migrations/0061...sql:47-50`):
```sql
ELSIF NEW.tipo = 'SAF' THEN
  NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
```

**After**:
```sql
ELSIF NEW.tipo = 'SAF' THEN
  -- SAF covers two directions the trigger cannot distinguish from monto alone
  -- (monto is always positive, CHECK constraint): debt-reduction
  -- (saldo_anterior - monto) or credit-consumption (saldo_anterior + monto).
  -- Trust the app-computed value (same treatment as REV/SAL below), but assert
  -- internal consistency so a caller bug (e.g. omitted saldo_nuevo) fails loudly
  -- instead of silently corrupting the ledger a third time.
  IF NEW.saldo_nuevo IS NULL
     OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
    RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
      NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
  END IF;
END IF;
-- REV, SAL: unchanged (implicit fallthrough, no branch — untouched)
```
**Alternative considered**: pure trust, no assertion (exact REV/SAL mirror, zero extra logic). **Rejected**: this exact bug family already recurred twice (2026-06-04, then again here) — a $0.005-tolerance direction-agnostic invariant check is nearly free and catches a 3rd recurrence at INSERT time instead of production. FAC/NDB/PAG/NCR branches: unchanged.

## Decision 2 — Migration split: confirm proposal's two-file plan

Highest on disk: `0087_deposito_inactivo_guard.sql` → next: `0088`, `0089`. Confirming (not reopening) the proposal's committed split: `0088_fix_saf_trigger_sign.sql` (trigger only) + `0089_repair_saldo_actual_saf.sql` (data repair). Rationale: decouples a revertible code change (trigger) from a non-reversible data mutation (repair), consistent with 0061→0062 precedent of separating fix-vs-repair concerns; lets `sdd-verify` test/apply independently.

## Decision 3 — Data repair: full ledger replay, not trust stored `saldo_nuevo`

Historical SAF rows' stored `saldo_nuevo` is itself corrupted for consumption cases — cannot be trusted. `saldo_anterior` on a given row also cascades corruption forward (each op reads the live, possibly-already-wrong `clientes.saldo_actual`). **Only correct approach: full chronological replay from 0 per client**, re-deriving direction from the running balance's own sign at each step (mirrors the fixed trigger logic), not from any stored value except REV/SAL checkpoints (already-trusted resets, including `SAL` opening-balance imports — confirmed these DO get a ledger row, migration `0043`).

```sql
DO $$
DECLARE cli RECORD; mov RECORD; running NUMERIC(12,2);
BEGIN
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
  FOR cli IN SELECT DISTINCT empresa_id, cliente_id FROM movimientos_cuenta LOOP
    running := 0;
    FOR mov IN SELECT tipo, monto, saldo_nuevo FROM movimientos_cuenta
      WHERE empresa_id = cli.empresa_id AND cliente_id = cli.cliente_id
      ORDER BY fecha ASC, created_at ASC, id ASC
    LOOP
      IF mov.tipo IN ('FAC','NDB') THEN running := running + mov.monto;
      ELSIF mov.tipo IN ('PAG','NCR') THEN running := running - mov.monto;
      ELSIF mov.tipo = 'SAF' THEN
        running := CASE WHEN running >= 0 THEN running - mov.monto ELSE running + mov.monto END;
      ELSIF mov.tipo IN ('REV','SAL') THEN running := mov.saldo_nuevo;
      END IF;
    END LOOP;
    UPDATE clientes SET saldo_actual = running, updated_at = NOW()
    WHERE id = cli.cliente_id AND empresa_id = cli.empresa_id
      AND ABS(saldo_actual - running) > 0.005;
  END LOOP;
END; $$;
```
Idempotent (re-run yields the same `running`, `UPDATE` only fires on drift), `empresa_id`-scoped, covers ALL clients with ledger history (not just SAF ones — self-verifying, no need to pre-guess "who's affected"). **Known edge case**: same-`fecha`/`created_at` ties fall back to `id` ordering (not causally guaranteed) — acceptable, documented, not blocking.

## Decision 4 — `aplicarPagoFacturaEnTx` clamp removal

`use-cxc.ts:435`: `Decimal.max(new Decimal(0), saldoActual.minus(montoUsd))` → `saldoActual.minus(montoUsd)` (no clamp). The `use-cxc.ts:424` clamp on `ventas.saldo_pend_usd` (invoice-level floor) is a **different, independent invariant** (an invoice can never owe negative) and stays untouched — the two clamps look identical but protect unrelated fields.

## Decision 5 — Layer 3 (estado de cuenta historical display): OUT of scope

**Firm recommendation: (c) defer to a follow-up change.** The authoritative `clientes.saldo_actual` is already fixed by Decision 3 everywhere else in the app. `useMovimientosCxcPeriodo` is a historical *report* — an on-the-fly running-balance recompute needs the same replay logic client-side in wa-sqlite/PowerSync (no recursive CTE support, would require a JS-side sequential reduce per client per page load), which is meaningful new surface area deserving its own spec/tests, not bolted onto a trigger-sign fix already touching financial code. Marked per spec's CONDITIONAL requirement — acceptable baseline, not a regression.

## Decision 6 — Testing strategy: extract pure logic, don't fake a Postgres trigger

**Investigated**: PowerSync's local SQLite has zero triggers (confirmed via `connector.ts` comments — trigger-managed columns are stripped client-side precisely *because* the trigger only exists server-side in Supabase). No pg-mem/testcontainers/Docker Postgres exists in this repo today. Vitest **cannot** execute `actualizar_saldo_cliente()` under any current tooling.

**Firm recommendation**: extract the balance-direction logic into a pure, DB-free TS function that mirrors the trigger 1:1, matching the repo's existing pattern (`src/features/*/lib/*.ts` + `lib/__tests__/*.test.ts`, e.g. `consolidacion-cierre.ts`):

- `src/features/cxc/lib/saldo-cliente.ts`: `calcularSaldoNuevoMovimientoCuenta(tipo, saldoAnterior, monto, saldoNuevoProvisto?)` and `esSaldoSafConsistente(saldoAnterior, monto, saldoNuevo)` — the latter directly encodes the trigger's new assertion.
- `src/features/cxc/lib/__tests__/saldo-cliente.test.ts`: covers FAC/NDB/PAG/NCR, SAF-create (0→-0.70), **SAF-consume (-0.70→0, the exact regression)**, SAF-debt-reduction, REV/SAL trust, missing-`saldoNuevoProvisto` throws, and `esSaldoSafConsistente` rejecting the doubled -1.40 value (reproduces the bug as a failing assertion).
- `aplicarPagoFacturaEnTx` adopts `calcularSaldoNuevoMovimientoCuenta('PAG', ...)` since it's already being touched for the clamp fix (consistency, not required elsewhere).

**Honest limitation**: this does NOT prove the SQL trigger matches the TS function — a future edit to only one side goes undetected by Vitest. Mitigation (required, not optional): a documented manual verification checklist (Test 1: create credit, Test 2: consume credit — mirroring the user's original repro) run once against a real Supabase instance during `sdd-verify`, plus a code comment cross-referencing both files. **Rejected**: containerized/ephemeral Postgres (pgTAP/testcontainers) — zero existing infra, disproportionate for a single trigger branch; propose as a separate infra change if durable trigger coverage is wanted project-wide.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/0088_fix_saf_trigger_sign.sql` | Create | Trigger SAF branch: trust + assert `NEW.saldo_nuevo` |
| `migrations/0089_repair_saldo_actual_saf.sql` | Create | Full ledger-replay repair for `clientes.saldo_actual` |
| `src/features/cxc/lib/saldo-cliente.ts` | Create | Pure balance-direction function + SAF consistency check |
| `src/features/cxc/lib/__tests__/saldo-cliente.test.ts` | Create | Unit tests incl. the consumption regression scenario |
| `src/features/cxc/hooks/use-cxc.ts` | Modify | Remove clamp at ~line 435; use shared function for PAG |
| `docs`/verify checklist | Create (in `sdd-verify`) | Manual Test 1 / Test 2 against real Supabase |

## Open Questions
None blocking. Layer 3 firmly deferred (Decision 5); migration split firmly confirmed (Decision 2).
