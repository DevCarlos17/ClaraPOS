# Design: CxC Data-Model Foundation — Derived `estado` + Materialized SAF

> Change: `cxc-sync-snapshot-redesign` | Phase: design | Project: clarapos

## Architecture Overview

Two new trigger-derived columns, two trigger functions extended (not replaced), one additive-only migration chain, one read-only backfill. No sync-rules change (sibling scope). The hardest problem — offline correctness with no local triggers — is solved by reusing a **mechanism already live in production** for `clientes.saldo_actual`: `connector.ts`'s `TRIGGER_MANAGED_PATCH_COLUMNS` strip-before-upload list, not a new concept.

## 1. Offline-Hybrid Trigger Reconciliation (THE core decision)

**Chosen: Option (a) local-optimistic + server-authoritative, via the existing strip-on-upload mechanism — not a new pattern.**

Verified in `src/core/db/powersync/connector.ts:76-80`: `TRIGGER_MANAGED_PATCH_COLUMNS = { clientes: ['saldo_actual'] }` already strips `saldo_actual` from every `PATCH` before it reaches Supabase — the column is written locally (instant UI feedback) but **never uploaded**; the authoritative value comes back down only via the normal replication/download stream once the server trigger computes it. This is the exact "optimistic local write, authoritative server reconciliation" pattern D1/D2 require, already proven for `saldo_actual` since migration 0061.

**Decision**: extend the same list — `clientes: ['saldo_actual', 'saf_disponible']` and add `ventas: ['estado']`. Local writes compute `estado`/`saf_disponible` optimistically in TS (new helper mirroring the trigger, same pattern already used by `src/features/cxc/lib/saldo-cliente.ts` for SAF sign logic per migration 0088's own comment — dual-implementation-with-manual-verification is an **accepted, precedented** risk category in this codebase, not a new one). Server trigger recomputes authoritatively on replication; the stripped columns mean the client's guess can never fight the server's answer over the wire.

**PowerSync verification — resolved from docs, not a spike**: Context7 (`/powersync-ja/powersync-docs`, "Custom Conflict Resolution") confirms the backend→client path: *"Source database updates (direct writes or changes from other clients) → PowerSync Service detects changes through replication stream → Clients download updates → Local SQLite updates."* Replication reads the Postgres WAL, which captures trigger-caused writes identically to application writes — this is not an assumption, it is the literal mechanism `saldo_actual` has used correctly since 0061. **No spike needed for propagation.**

**Verification Spike Required (narrower, real risk)**: exact PowerSync upload-queue semantics when a local crud *transaction* spans multiple tables (e.g. `movimientos_cuenta` INSERT then `ventas` PATCH from the same `writeTransaction()`) and the device goes offline mid-upload or reconnects after a long gap. `connector.ts:408-423` shows `getNextCrudTransaction()` processes one transaction's ops sequentially via **separate Supabase REST calls, each its own Postgres transaction** (not a single wrapped DB transaction). Order-preservation across ops within one `transaction.crud` array is assumed from current code structure but not independently confirmed against PowerSync's retry-after-partial-failure behavior. Flag before implementing Trigger Design item below that depends on this order.

## 2. Conflict/Ordering (saldo_pend_usd dependency — residual, pre-existing risk)

`estado` is a **pure function of `ventas.saldo_pend_usd`/`total_usd`** (never of raw ledger replay) — this sidesteps re-deriving the SAF-replay complexity from migration 0089. Consequence: `estado`'s correctness is bounded by `saldo_pend_usd`'s correctness, and `saldo_pend_usd` is maintained by client-computed-delta PATCHes (last-arrival-wins per row), **not recomputed server-side from the ledger** — this is a **pre-existing** concurrency limitation (same category as the 0097 bug history), not introduced or fixed by this change, and explicitly out of scope (17-write-site consolidation is deferred). The reconciliation invariant query (§6) is the detection mechanism for drift, not a cure.

## 3. Trigger Design

**`actualizar_saldo_cliente()` (BEFORE INSERT ON `movimientos_cuenta`) — extend, FAC/NDB/PAG/NCR/SAF branches byte-identical to migration 0088:**

```sql
-- ...existing saldo_nuevo branches unchanged...
IF NEW.saldo_nuevo IS NOT NULL OR NEW.tipo IN ('SAFC','SAF') THEN
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
  UPDATE clientes
  SET saldo_actual   = COALESCE(NEW.saldo_nuevo, saldo_actual),
      saf_disponible = saf_disponible
        + CASE WHEN NEW.tipo = 'SAFC' THEN NEW.monto
               WHEN NEW.tipo = 'SAF'  THEN -NEW.monto
               ELSE 0 END,
      updated_at = NOW()
  WHERE id = NEW.cliente_id;
END IF;
```
One UPDATE, both columns, no double-trigger-fire on `validate_cliente_update`.

**`prevent_venta_mutation()` (BEFORE UPDATE OR DELETE ON `ventas`) — extend, all existing guards byte-identical to migration 0097:**

```sql
DECLARE last_mov_tipo TEXT;
BEGIN
  -- ...existing DELETE guard, frozen-columns guard, status-transition guard,
  --    saldo_pend_usd<=total_usd guard (0097) — UNCHANGED...

  IF NEW.saldo_pend_usd IS DISTINCT FROM OLD.saldo_pend_usd THEN
    SELECT tipo INTO last_mov_tipo FROM movimientos_cuenta
    WHERE venta_id = NEW.id
    ORDER BY fecha DESC, created_at DESC, id DESC LIMIT 1;

    NEW.estado := CASE
      WHEN last_mov_tipo = 'REV' AND NEW.saldo_pend_usd > 0.005 THEN 'reversado'
      WHEN NEW.saldo_pend_usd <= 0.005 THEN 'pago'
      WHEN NEW.saldo_pend_usd >= NEW.total_usd - 0.005 THEN 'pendiente'
      ELSE 'parcial'
    END;
  END IF;
  RETURN NEW;
END;
```

**Correctness note on ordering**: this lookup only works if the `movimientos_cuenta` row lands in Postgres *before* the `ventas` PATCH. Verified against current write-sites (`use-cxc.ts`: ledger INSERT always precedes the balance-column UPDATE within the same local transaction) — consistent with the Verification Spike in §1.

**Whitelist correction to the proposal**: the "frozen columns" `OR`-chain in `prevent_venta_mutation()` lists explicit column names (`nro_factura`, `total_usd`, `tasa`, …); `estado` is **not** in that list, so structurally **no code change is required there** for `estado` to be writable — the proposal's "add to whitelist" framing was imprecise. We still document `estado` explicitly as an allowed-to-mutate column in the function's comment block, specifically to stop a future maintainer from reflexively adding it to the frozen list (the real 0097-class risk is a *future* regression, not a *current* gap).

## 4. `estado` State Machine + Module × Movement Matrix

| `movimientos_cuenta.tipo` | Touches `ventas.saldo_pend_usd`? | Effect on `estado` |
|---|---|---|
| FAC | Sets initial debt | Column `DEFAULT 'pendiente'` at INSERT (no UPDATE trigger fires) |
| PAG, NCR, SAF | Yes (reduces) | Recomputed by magnitude: 0→`pago`, 0<x<total→`parcial`, else unreachable (never increases) |
| NDB | No (separate `notas_debito` entity, not tied to a `ventas.id`) | No effect |
| REV | Yes (reopens, capped at `total_usd` per 0097) | `reversado` if resulting saldo>0 (distinguishes "never collected" from "collected-then-reversed"); if a later PAG/NCR/SAF reduces it again, `last_mov_tipo` is no longer `REV` and estado flips to `parcial`/`pago` normally |
| SAL | Yes (opening-balance import, 0043) | Magnitude rule, same as PAG |
| SAFC | No (credit creation, not invoice-specific) | No effect |

CONTADO+NC fully covering the invoice → `saldo_pend_usd=0` → `pago` (not stuck `parcial`), matching proposal's explicit example.

## 5. `saf_disponible` Materialization + Indexes

`clientes.saf_disponible NUMERIC(20,8) NOT NULL DEFAULT 0`, maintained as an O(1) running delta in `actualizar_saldo_cliente()` (§3) — never a full `SUM()` scan at read time. Replaces `use-cxc.ts`'s `SUM(SAFC)-SUM(SAF)` subqueries (lines 88-89, 713-714, 1705-1706) with a direct column read.

New Postgres indexes (server-side; current indexes are only `empresa_id`/`cliente_id`/`fecha`, confirmed via `0006_ventas.sql:114-116`, no `venta_id` index exists):
- `idx_mov_cuenta_venta ON movimientos_cuenta(venta_id, fecha DESC, created_at DESC)` — critical path for the trigger's "last movement" lookup (§3).
- `idx_mov_cuenta_cliente_tipo ON movimientos_cuenta(cliente_id, tipo)` — backfill + invariant-check aggregates.

New PowerSync client-side index (`schema.ts`, currently `{ indexes: {} }`): `{ indexes: { by_venta: ['venta_id'] } }` on `movimientos_cuenta` — supports the local TS optimistic lookup mirroring §3's query.

## 6. Reconciliation Invariant Query (verification, no mutation)

```sql
SELECT c.id, c.empresa_id,
  c.saldo_actual, c.saf_disponible,
  COALESCE(p.total_pend, 0) AS pend_calc,
  COALESCE(s.disp, 0)        AS saf_calc,
  CASE WHEN ABS(c.saldo_actual - (COALESCE(p.total_pend,0) - COALESCE(s.disp,0))) <= 0.01
        AND ABS(c.saf_disponible - COALESCE(s.disp,0)) <= 0.01
       THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM clientes c
LEFT JOIN (SELECT cliente_id, empresa_id, SUM(saldo_pend_usd) total_pend
           FROM ventas WHERE saldo_pend_usd > 0.005 GROUP BY 1,2) p
  ON p.cliente_id=c.id AND p.empresa_id=c.empresa_id
LEFT JOIN (SELECT cliente_id, empresa_id,
             SUM(CASE WHEN tipo='SAFC' THEN monto WHEN tipo='SAF' THEN -monto ELSE 0 END) disp
           FROM movimientos_cuenta WHERE tipo IN ('SAFC','SAF') GROUP BY 1,2) s
  ON s.cliente_id=c.id AND s.empresa_id=c.empresa_id
ORDER BY resultado DESC;
```

## 7. Backfill Design (`0103`)

```sql
BEGIN;
PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);

UPDATE ventas v SET estado = sub.estado_calc
FROM (
  SELECT v2.id,
    CASE WHEN last.tipo = 'REV' AND v2.saldo_pend_usd > 0.005 THEN 'reversado'
         WHEN v2.saldo_pend_usd <= 0.005 THEN 'pago'
         WHEN v2.saldo_pend_usd >= v2.total_usd - 0.005 THEN 'pendiente'
         ELSE 'parcial' END AS estado_calc
  FROM ventas v2
  LEFT JOIN LATERAL (
    SELECT tipo FROM movimientos_cuenta mc WHERE mc.venta_id = v2.id
    ORDER BY mc.fecha DESC, mc.created_at DESC, mc.id DESC LIMIT 1
  ) last ON true
) sub
WHERE v.id = sub.id AND v.estado IS DISTINCT FROM sub.estado_calc;

UPDATE clientes c SET saf_disponible = sub.disp
FROM (SELECT cliente_id, empresa_id,
        SUM(CASE WHEN tipo='SAFC' THEN monto WHEN tipo='SAF' THEN -monto ELSE 0 END) disp
      FROM movimientos_cuenta WHERE tipo IN ('SAFC','SAF') GROUP BY 1,2) sub
WHERE c.id=sub.cliente_id AND c.empresa_id=sub.empresa_id
  AND ABS(c.saf_disponible - sub.disp) > 0.005;

-- Verification: run §6 invariant query here, inspect PASS/FAIL, THEN replace ROLLBACK with COMMIT.
ROLLBACK;
```
Read-only against `movimientos_cuenta` (SELECT/JOIN only); only `ventas`/`clientes` are written. Idempotent via `IS DISTINCT FROM` / tolerance guards (re-running after COMMIT is a no-op).

## 8. Migration Plan (next sequential: latest existing is `0099`)

| # | File | Content |
|---|---|---|
| 0100 | `ventas_estado_column.sql` | `ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pago','reversado'))` |
| 0101 | `clientes_saf_disponible_column.sql` | `ADD COLUMN saf_disponible NUMERIC(20,8) NOT NULL DEFAULT 0` + the two indexes from §5 |
| 0102 | `extend_trigger_estado_saf.sql` | `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` + `prevent_venta_mutation()`, atomically (per proposal's explicit sequencing requirement) |
| 0103 | `backfill_estado_saf_disponible.sql` | §7, BEGIN/ROLLBACK-verified by owner before flipping to COMMIT |

Companion code changes (not migrations): `schema.ts` (+`estado`, `+saf_disponible`, `+by_venta` index), `connector.ts` `TRIGGER_MANAGED_PATCH_COLUMNS` (+`ventas:['estado']`, extend `clientes` entry), new `src/features/cxc/lib/estado-venta.ts` (TS mirror of §3's CASE logic), `use-cxc.ts` read-path swap (read columns, drop dead `'REVERSADA'` filter at line 151).

## 9. Rollback

Per migration, exact inverse:
- `0103`: not reversible as data (same non-reversible-repair precedent as 0089); re-run is safe (idempotent), no down-script needed.
- `0102`: `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` pasted back from 0088 verbatim; `prevent_venta_mutation()` pasted back from 0097 verbatim.
- `0101`: `ALTER TABLE clientes DROP COLUMN saf_disponible; DROP INDEX idx_mov_cuenta_venta; DROP INDEX idx_mov_cuenta_cliente_tipo;`
- `0100`: `ALTER TABLE ventas DROP COLUMN estado;`
No `movimientos_cuenta` row is ever touched by any rollback — ledger immutability preserved throughout.

## Open Risks Remaining

| Risk | Needs spike? |
|---|---|
| Upload-queue order-preservation across tables within one local transaction, under partial-failure/reconnect | **Yes — Verification Spike Required** before `0102` ships (§1) |
| `saldo_pend_usd` last-write-wins drift under multi-device concurrency (pre-existing, not fixed here) | No spike — documented residual risk, monitored via §6 invariant |
| Local TS mirror of §3's CASE logic drifting from the SQL trigger over time | No spike — same accepted dual-implementation risk as `saldo-cliente.ts` (0088 precedent); mitigate with a shared constants file / comment cross-reference, no automated DB test infra exists to enforce parity |
