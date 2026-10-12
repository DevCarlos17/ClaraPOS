# Phase 0 Spike Runbook — PowerSync Upload Order Verification

> Change: `cxc-sync-snapshot-redesign` | Phase: 0 (BLOCKING verification spike)
>
> Goal: confirm PowerSync preserves upload ORDER across tables within one local
> `writeTransaction`, specifically that the `movimientos_cuenta` INSERT reaches
> Supabase BEFORE the `ventas` PATCH that depends on it (same transaction,
> triggered by `aplicarPagoFacturaEnTx` in `use-cxc.ts`). If order is not
> preserved, the derived-`estado` trigger in Phase 2 would read stale/missing
> last-movement data. This spike is a hard gate — do not start Phase 2 until
> every cycle below is PASS.

Instrumentation is already in place (read-only, zero logic change) in
`src/core/db/powersync/connector.ts`, inside `uploadData()`, marked with:

```
// ===== TEMP SPIKE INSTRUMENTATION — cxc-sync-snapshot-redesign Phase 0 — REMOVE AFTER SPIKE =====
```

It logs `[SPIKE-UPLOAD-ORDER] { table, op, id }` for every CRUD op, in the exact
order PowerSync processes `transaction.crud`.

## Prerequisites

- Dev server running: `yarn dev`
- Browser DevTools open, Console tab visible
- A test client with at least one CREDITO invoice with a pending balance
  (or create one first, while online, before starting the test)
- Supabase SQL Editor open in a separate tab (for the PASS/FAIL query)

## Cycle 1 — Clean offline → reconnect

1. In the app, go **offline**: DevTools → Network tab → throttling dropdown →
   "Offline" (or OS airplane mode if testing on a real device/PWA).
2. Register **one payment** against a CREDITO invoice with pending balance
   (CxC screen → apply payment to a specific factura). This calls
   `aplicarPagoFacturaEnTx` in `use-cxc.ts`, which in a single local
   `writeTransaction` does: INSERT `movimientos_cuenta` (tipo PAG) + PATCH
   `ventas.saldo_pend_usd` (and now, post Phase 2, `estado`).
3. Confirm the UI updated locally (offline-first — balance should reflect the
   payment immediately even with no network).
4. Reconnect: DevTools → Network → "No throttling" (or disable airplane mode).
5. Watch the Console for `[SPIKE-UPLOAD-ORDER]` lines as PowerSync drains the
   upload queue. Copy the exact sequence of lines for this transaction —
   look for the `ventas` id you just paid.
6. Note the **relative order**: does `movimientos_cuenta` (op: PUT, table:
   movimientos_cuenta) appear in the log BEFORE `ventas` (op: PATCH, table:
   ventas) for that same invoice?

## Cycle 2 — Forced mid-upload disconnect

1. Repeat steps 1–3 above with a **different** CREDITO invoice (new payment).
2. Reconnect (Network → "No throttling").
3. **Immediately** (within ~1 second, while the console is still printing
   `[SPIKE-UPLOAD-ORDER]` lines for the upload queue) force the network back
   **offline** again, then **online** once more a second or two later. The
   goal is to interrupt the upload mid-flight and force PowerSync to retry/
   resume the queue.
4. Watch the Console again for the full `[SPIKE-UPLOAD-ORDER]` sequence
   across both the interrupted attempt and the resumed attempt. Copy all
   lines referencing this invoice's `ventas` id and the related
   `movimientos_cuenta` id.

## PASS/FAIL SQL check (run after EACH cycle)

Run in the Supabase SQL Editor, replacing `<test-venta-id>` with the actual
`ventas.id` used in that cycle:

```sql
SELECT v.id AS venta_id, v.updated_at AS venta_updated_at,
       mc.created_at AS mov_cuenta_created_at,
       CASE WHEN mc.created_at <= v.updated_at THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM ventas v JOIN movimientos_cuenta mc ON mc.venta_id = v.id
WHERE v.id = '<test-venta-id>' ORDER BY mc.created_at DESC LIMIT 1;
```

This MUST return a `SELECT` result row with a `resultado` column —
**not** a `RAISE NOTICE` / message in the Postgres log. If you only see
notices and no rows, re-check you ran the `SELECT` statement (not a
`DO $$ ... $$` block).

### PASS criteria

- `mov_cuenta_created_at <= venta_updated_at` → `resultado = 'PASS'` on
  **every** cycle tested, including Cycle 2 (forced mid-upload disconnect).

### FAIL criteria

- Any cycle where `resultado = 'FAIL'` (the `ventas` PATCH timestamp is
  earlier than the `movimientos_cuenta` INSERT timestamp) — this means
  out-of-order arrival occurred at least once.
- **On FAIL**: STOP. Do not proceed to Phase 2. The design's ordering
  guarantee must be revised (e.g. splitting into two sequential local
  transactions) before the derived-`estado` trigger can be trusted.

## What to report back

For each cycle (1 and 2), report:

1. The full ordered list of `[SPIKE-UPLOAD-ORDER]` console lines captured
   for that invoice's transaction (copy/paste from DevTools console).
2. The SQL PASS/FAIL query result (the `resultado` value and the two
   timestamps) for that cycle's `venta_id`.

## Reverting the instrumentation

Once the spike is complete (PASS or FAIL determined), remove the temporary
block from `src/core/db/powersync/connector.ts`. It is delimited by:

```
// ===== TEMP SPIKE INSTRUMENTATION — cxc-sync-snapshot-redesign Phase 0 — REMOVE AFTER SPIKE =====
...
// ===== END TEMP SPIKE INSTRUMENTATION =====
```

Delete everything between (and including) those two marker comments. No
other part of `uploadData()` was touched — removing the block restores the
file to its exact pre-spike state.
