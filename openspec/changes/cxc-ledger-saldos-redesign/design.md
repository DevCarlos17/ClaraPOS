# Design: CxC Ledger Saldos Redesign (Approach A)

## Technical Approach

Three independent, additive capabilities, each mirroring an already-shipped,
production-verified pattern — no new mechanics invented:

1. `cxc-saldo-pendiente-materializado` → mirrors `saf_disponible` (0101/0102):
   atomic CASE-UPDATE on `clientes`, same transaction as the `movimientos_cuenta`
   INSERT, no read-before-write.
2. `cxc-pagos-aplicaciones` → mirrors `saf_creditos_aplicaciones` (0105) minus
   its trigger (no parent "lote" balance to protect — pure app-trusted audit
   log, simpler than SAF).
3. `cxc-reversa-pago-saf` → mirrors the lote/aplicacion *pair* pattern (0104+0105)
   one more time, in reverse: a new append-only `saf_creditos_reversas` table
   drives the lote-voiding trigger; invoice reopening reuses the **existing**
   `REV` tipo (no new venta-side mechanics); only `saf_disponible`'s
   credit-destruction needs one new `movimientos_cuenta` tipo (`SAFR`),
   widening the CHECK exactly as 0090 did for `SAFC`.

## Open Questions — Resolved

### Q1 — `saldo_pendiente_usd` backfill

| Option | Tradeoff |
|---|---|
| Ship `DEFAULT 0`, self-correct on next write | Existing clients with real debt read `0` (false "no debt") until their *next* payment/credit-sale touches that specific venta — silently **wrong in the dangerous direction** for a column whose explicit purpose is to be trusted enough to eventually trim sync. Unacceptable. |
| **One-time read-only backfill (RECOMMENDED)** | Formula is a deterministic aggregate grouped by `cliente_id` — same shape as 0103's SAF backfill (not 0107's ledger-replay, which existed because 0106's `DEFAULT 'pendiente'` was *actively wrong*; here the risk is *staleness*, and the aggregate is trivial to recompute once). |

**Decision**: backfill, mirroring **0103** exactly: `UPDATE clientes SET saldo_pendiente_usd = GREATEST(0, SUM(ventas.saldo_pend_usd) WHERE estado != 'pago' GROUP BY cliente_id)`, no `BEGIN/ROLLBACK` gate needed (purely additive new column, zero cascading side effects, unlike 0107's `estado` rewrite) — followed by a `DO $$` reconciliation `RAISE WARNING` block, same discipline as 0103.

### Q2 — `pagos_aplicaciones` backfill

| Option | Tradeoff |
|---|---|
| Reconstruct from historical `pagos` | Requires **ledger replay** (same risk class the proposal explicitly scoped OUT as Approach B): `saldo_venta_antes/despues_usd` is a point-in-time snapshot that can only be trusted if replayed in exact chronological order per venta, including already-reversed `pagos` (`is_reversed=1`) — ambiguous whether to backfill a reversed-and-original pair. No existing precedent in this codebase for this kind of replay. |
| **Start empty — 0105 precedent (RECOMMENDED)** | Exactly what 0105's header states for `saf_creditos_lotes`: "arranca vacio, ningun lote historico se reconstruye". Historical abonos keep their current audit (aggregate `movimientos_cuenta` PAG + per-invoice `pagos` rows) — a visible but **documented and bounded** gap, not a correctness risk. |

**Decision**: ship empty, document explicitly (same trailer comment style as 0104/0105).

### Q3 — Reconciliation check

| Option | Tradeoff |
|---|---|
| On-write assertion (RAISE on mismatch) | Turns every `FAC`/`PAG`/`REV` insert into a 2-table scan — defeats the entire point of an O(1) materialized column and risks false-positive `P0001` blocking real transactions. Rejected. |
| Cron/CI job | No `pg_cron` or CI-against-Postgres precedent anywhere in this repo (confirmed by migration grep); would be net-new infra, scope creep for Approach A's "minimal" mandate. |
| **Read-only diagnostic query, ad-hoc (RECOMMENDED)** | Exact precedent: 0105's "Paso 3" trailer — a standing `SELECT ... HAVING ABS(...) > tolerance` runnable any time, zero schema object. Satisfies the user's "trust the materialized value" goal without new infra. |

**Decision**: document a standing reconciliation query in `0111`'s trailer (same shape as 0103's `DO` block + 0105 Paso 3), callable manually in Supabase SQL editor whenever trust needs re-verifying before any future PowerSync sync-trimming work.

### Q4 — Contra-entry mechanism (the hard one)

**Rejected options**: (a) negative `monto_aplicado_usd` into `saf_creditos_aplicaciones` — breaks its `CHECK > 0` and its "consumption-only" invariant; a void-the-remainder row also has no real `venta_id` to attach to (column is `NOT NULL`). (c) is the same shape, rejected for the same reason.

**Chosen shape (b)**: one **new** append-only table, `saf_creditos_reversas`, that voids a lote's *unconsumed remainder* (its own trigger), plus reuse of the **existing** `REV` tipo to reopen each *consumed* invoice (no new venta-side mechanics needed).

**Why this nets to zero** (worked example: lote `$100`, `$60` consumed against venta X, `$40` unconsumed):
- Before reversal, net `saf_disponible` effect of this lote's life = `+100 (SAFC) − 60 (SAF) = +40`.
- Reversal voids exactly the **remaining `$40`** (`saf_creditos_reversas.saldo_disponible_anulado_usd`) → net effect becomes `0`. The already-consumed `$60` needs no further `saf_disponible` adjustment.
- Venta X reopens by `$60` via a new `REV` `movimientos_cuenta` row (`venta_id = X`, `doc_origen_tipo='PAGO'`, `doc_origen_id=<pago_id>`) — `prevent_venta_mutation()` re-derives `estado` from `last_mov_tipo='REV'` exactly as it already does for plain pago reversal. No hand-set `estado`.

**Column lists**:

```sql
-- 0112_pagos_aplicaciones.sql (no trigger — pure app-trusted audit,
-- app already holds before/after at the exact right moment, same as
-- movimientos_cuenta's legacy FAC/PAG trust)
CREATE TABLE pagos_aplicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cliente_id UUID NOT NULL REFERENCES clientes(id),   -- denormalizado, mismo patron saf_creditos_aplicaciones
  pago_id    UUID NOT NULL REFERENCES pagos(id),
  venta_id   UUID NOT NULL REFERENCES ventas(id),
  monto_aplicado_usd      NUMERIC(20,8) NOT NULL CHECK (monto_aplicado_usd > 0),
  saldo_venta_antes_usd   NUMERIC(20,8) NOT NULL,
  saldo_venta_despues_usd NUMERIC(20,8) NOT NULL,
  fecha TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);
-- idx: pago_id, venta_id, empresa_id, cliente_id. RLS: SELECT/INSERT own
-- empresa only, NO UPDATE/DELETE policy (append-only, mirrors 0105's RLS
-- shape exactly). connector.ts IMMUTABLE_TABLES += 'pagos_aplicaciones'.

-- 0113_saf_creditos_reversas.sql (trigger mirrors consumir_saf_lote, 0105)
CREATE TABLE saf_creditos_reversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  lote_id    UUID NOT NULL UNIQUE REFERENCES saf_creditos_lotes(id), -- 1 reversal/lote, DB-enforced
  pago_id    UUID NOT NULL REFERENCES pagos(id),
  movimiento_cuenta_id UUID NOT NULL UNIQUE REFERENCES movimientos_cuenta(id), -- ancla SAFR
  saldo_disponible_anulado_usd NUMERIC(20,8) NOT NULL CHECK (saldo_disponible_anulado_usd > 0),
  lote_saldo_antes_usd   NUMERIC(20,8) NOT NULL,  -- trigger-computed
  lote_saldo_despues_usd NUMERIC(20,8) NOT NULL,  -- trigger-computed, siempre 0
  fecha TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);
-- Trigger anular_saf_lote_reversa() BEFORE INSERT: FOR UPDATE lock lote,
-- assert saldo_disponible_usd matches param (0.005 tol), force
-- saldo_disponible_usd=0/status='AGOTADO' via
-- set_config('clarapos.trigger_context','saf_aplicacion',TRUE) — REUSES
-- 0104's existing guard string, no new context value.
-- Only inserted when the lote's remainder > 0 at reversal time; a fully
-- consumed lote (remainder already 0) skips this row entirely.

-- 0114_add_safr_tipo_movimientos_cuenta.sql
ALTER TABLE movimientos_cuenta DROP CONSTRAINT movimientos_cuenta_tipo_check;
ALTER TABLE movimientos_cuenta ADD CONSTRAINT movimientos_cuenta_tipo_check
  CHECK (tipo IN ('FAC','PAG','NCR','NDB','REV','SAL','SAF','SAFC','SAFR'));
-- CREATE OR REPLACE actualizar_saldo_cliente(): saf_disponible CASE adds
--   WHEN NEW.tipo IN ('SAF','SAFR') THEN GREATEST(0, saf_disponible - NEW.monto)
-- (SAFR = same consumption formula as SAF; difference is ORIGIN, not math).
-- saldo_pendiente_usd CASE (from 0110) is copied verbatim — SAFR falls to
-- its ELSE (unchanged), since voiding never-consumed credit touches no venta.
```

**Read function** (`detectarLoteSafDePago`, read-only, no mutation):
```ts
interface DetalleLoteSafDePago {
  generatedLote: boolean
  loteId?: string; montoOriginalUsd?: number; saldoDisponibleUsd?: number
  montoConsumidoUsd?: number
  facturasAfectadas: Array<{ ventaId: string; nroFactura: string; montoAplicadoUsd: number }>
}
```
Queries: (1) `SELECT id, monto_original_usd, saldo_disponible_usd FROM saf_creditos_lotes WHERE origen_tipo='PAGO' AND origen_id=? AND empresa_id=?`; (2) if found, `SELECT sca.venta_id, v.nro_factura, sca.monto_aplicado_usd FROM saf_creditos_aplicaciones sca JOIN ventas v ON v.id=sca.venta_id WHERE sca.lote_id=?` — these are the exact ORIGINAL immutable rows, never a new detail table (no drift risk).

**Compensation writer** (`reversarPagoSafEnTx(tx, { pagoId, empresaId, clienteId, reversedBy, now })`): wired into `registrarReversoAbono` as a new **Step 4b**, immediately after restoring `clientes.saldo_actual` (step 4) and before the pago's own `REV` row (step 5) — mutually exclusive by construction with step 3's direct-venta restore, since every lote-bearing `pago` has `venta_id = NULL`. For each affected venta: INSERT `REV` movimiento (`doc_origen_id=pagoId`) + `UPDATE ventas SET saldo_pend_usd += monto_aplicado_usd`; if remainder > 0: INSERT `saf_creditos_reversas` + paired `SAFR` movimiento.

## Also Designed

- **Read-path parity proof**: `estado != 'pago'` ⟺ `saldo_pend_usd > 0` (tolerance **0**, migration 0108) ⟺ the atomic CASE-UPDATE keeps `clientes.saldo_pendiente_usd` mathematically identical to `SUM(ventas.saldo_pend_usd WHERE estado != 'pago')` at every instant. `use-cxc.ts` `DEUDA_CREDITO_CLIENTE_SELECT` swaps its `deuda_usd` subquery for `CAST(c.saldo_pendiente_usd AS REAL)`; its `facturas_pendientes` COUNT swaps `saldo_pend_usd > 0` for `estado != 'pago'` (closes the predicate-inconsistency). `use-deuda-cliente.ts`'s 2 SUM queries (single + batch) do the same swap.
- **TS mirror** (`saldo-cliente.ts`): new pure fn `calcularSaldoPendienteClienteNuevo(tipo, anterior, monto)` — `FAC/NDB/REV → +monto`, `PAG/NCR/SAF → max(0, −monto)`, else unchanged. `TipoMovimientoCuenta` widened to include `'SAFC'|'SAFR'` (incidental fix — CHECK already has `SAFC` since 0090, the TS union didn't). `calcularSafDisponibleNuevo`'s `TipoMovimientoSaf` union widened to `'SAFR'` — zero body change, falls to the existing consumption branch. `calcularSaldoLoteDespues` reused as-is for the remainder-void (call with `montoAplicado = saldoAntes`, guaranteeing `0` by construction).
- **Write-site wiring**: every existing `UPDATE clientes SET saldo_actual = ?, ...` paired with a `movimientos_cuenta` INSERT gets one more column, `saldo_pendiente_usd = ?` — same call sites, not new ones (`aplicarPagoFacturaEnTx`, `registrarAbonoGlobal`'s SAF pre-step + FIFO loop + anticipo promotion, `registrarReversoAbono`, plus the FAC-creation/NCR sites in `use-ventas.ts`/`use-notas-credito.ts`/`use-importar-cxc.ts`).
- **PowerSync**: `clientes.saldo_pendiente_usd: column.text` (no new index). New `pagos_aplicaciones` + `saf_creditos_reversas` Tables, both `insertOnly: true`, indexed on their respective `pago_id`/`lote_id`/`venta_id`/`empresa_id`. Both added to `connector.ts` `IMMUTABLE_TABLES`.

## Migration Numbering

Highest existing: `0108`. New files: `0109_clientes_saldo_pendiente_column.sql`, `0110_extender_trigger_saldo_pendiente.sql`, `0111_backfill_saldo_pendiente.sql`, `0112_pagos_aplicaciones.sql`, `0113_saf_creditos_reversas.sql`, `0114_add_safr_tipo_movimientos_cuenta.sql`.

## Phasing (PR slices, line estimates include this repo's verbose migration-comment convention)

| Slice | Content | Est. lines | Risk |
|---|---|---|---|
| 1a | `0109`+`0110`+`0111`, `saldo-cliente.ts` fn, `schema.ts` column | ~350-450 | Low — no behavior change yet |
| 1b | Write-site wiring (4 TS files, same call sites) — **must land after 1a** | ~150-250 | Low-Med |
| 1c | Read-path swap (`use-cxc.ts`, `use-deuda-cliente.ts`) + predicate unification — **must land after 1a+1b+backfill run** | ~80-120 | Low |
| 2 | `0112`, `schema.ts`, 2 write sites (`aplicarPagoFacturaEnTx`, FIFO loop) | ~150-200 | Low |
| 3a | `0113`+`0114`, type-union widenings, `schema.ts` | ~250-320 | Medium |
| 3b | `detectarLoteSafDePago` + `reversarPagoSafEnTx` + wiring + tests | ~200-280 | **High** — multi-invoice FIFO cascade logic |

Order constraint: 1a → 1b → 1c (strict); 2 independent of 1-series; 3a → 3b (strict), 3 independent of 1/2 but shares `saldo-cliente.ts`/`schema.ts` — rebase if 1/2 land first.

## Scope-OUT Reminders

- `movimientos_metodo_cobro` currency ambiguity: confirmed real (exploration §3) but **separate change** — `use-cuadre.ts` sums directly from `pagos`, never from `movimientos_metodo_cobro.saldo_actual` for `VENTA/COBRO/PROPINA` origins, so cuadre math is not corrupted today; fixing it is unrelated to this redesign's write paths.
- No front-end: all 3 capabilities ship as data/logic only. The reversal confirmation modal that will consume `detectarLoteSafDePago` is an explicit future SDD change.

## Testing Strategy

| Layer | What | Where |
|---|---|---|
| Unit | `calcularSaldoPendienteClienteNuevo` (all tipo branches, floor-at-0), `calcularSafDisponibleNuevo` SAFR parity with SAF | `saldo-cliente.test.ts` |
| Unit (tx-mocked) | Write-site wiring assertions (saldo_pendiente_usd column tracks every scenario from the spec's 8 scenarios) | extend `use-cxc.test.ts` |
| Unit (tx-mocked) | `pagos_aplicaciones` row-per-invoice, SAF-excedente exclusion | extend `use-cxc.test.ts` |
| Unit (tx-mocked) | `detectarLoteSafDePago` (4 spec scenarios) + `reversarPagoSafEnTx` (net-zero, multi-invoice reopen, no-mutation-of-originals) | new `reversa-pago-saf.test.ts` |

No e2e — no browser test infra in this repo.
