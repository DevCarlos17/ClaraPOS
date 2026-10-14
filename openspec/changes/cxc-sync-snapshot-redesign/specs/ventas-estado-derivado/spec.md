# Ventas Estado Derivado Specification

## Purpose

New spec. `ventas.estado` (`pendiente`/`parcial`/`pago`/`reversado`) replaces the dead-end 2-value `status` CHECK as a trigger-derived, single-sourced invoice state — never written directly by client code. Resolves the `'REVERSADA'` dead-code ghost in `use-cxc.ts`.

## Amendment Note (tolerance 0.005 → 0, interim — read first)

This spec originally mandated a `0.005` USD tolerance for the magnitude rule
below (requirements "Estado Derivation By Saldo Magnitude With Decimal
Tolerance" and "Reversado Detected Via Last-Movement Lookup"). The owner
amended this to **tolerance 0 (exact)**: a factura is `pago` only when
`saldo_pend_usd` is truly `0`, never when it merely falls within a USD
rounding band — because ClaraPOS's bimonetary model can leave real Bs owed
uncollected under a USD tolerance (e.g. `$0.005` at tasa `500` = `Bs 2.5`
never actually collected but marked `'pago'`). Shipped via migration
`migrations/0108_ventas_estado_tolerancia_cero.sql` (Postgres triggers) and
`src/features/cxc/lib/estado-venta.ts` (`TOLERANCIA_ESTADO_VENTA = '0'`, TS
mirror). **This is explicitly INTERIM, not the final production answer**:
rounding residuals from complex payment cascades on `NUMERIC(20,8)` columns
will later be routed through the existing diferencial-cambiario-to-gasto
flow (a FUTURE separate change, not implemented here). All `0.005` figures
below are superseded by `0` wherever they describe the estado magnitude
rule; requirement text and scenarios have been updated in place to reflect
tolerance 0 rather than kept as stale `0.005` text with a note bolted on.

## Requirements

### Requirement: Estado Is Trigger-Derived, Never Application-Written

The system MUST derive `ventas.estado` exclusively inside Postgres triggers on the `ventas` table — a `BEFORE INSERT` trigger (magnitude-only, for the row's birth state) and the `BEFORE UPDATE OR DELETE` trigger `prevent_venta_mutation()` (full state machine including `reversado`, whenever `saldo_pend_usd` changes). No application code path MAY set `estado` on the authoritative (server) row by any means other than these two triggers; a client that sends its own `estado` value in an INSERT or UPDATE payload MUST have that value superseded by the corresponding trigger, never persisted as sent.

#### Scenario: Server estado always comes from a trigger, on INSERT
- GIVEN a new sale is created (INSERT), either CONTADO (paid at creation) or CREDITO (unpaid at creation)
- WHEN the row is inserted into Postgres
- THEN `estado` is computed by the `BEFORE INSERT` trigger from `saldo_pend_usd`/`total_usd` alone, regardless of any `estado` value present in the client's insert payload

#### Scenario: Server estado always comes from a trigger, on UPDATE
- GIVEN a payment reduces `saldo_pend_usd` on an existing sale
- WHEN the row replicates to Postgres as an UPDATE
- THEN `estado` is computed by `prevent_venta_mutation()` from `saldo_pend_usd`/`total_usd` (+ last-movement lookup), never from a client-sent value

### Requirement: Estado Derivation By Saldo Magnitude With Exact (Zero-Tolerance) Comparison

The system MUST derive `estado` using a `0` USD tolerance (exact comparison) over `NUMERIC(20,8)` columns: `pendiente` when `saldo_pend_usd >= total_usd`; `pago` when `saldo_pend_usd <= 0` (i.e. exactly `0`, since `saldo_pend_usd` is never negative); `parcial` otherwise — subject to the `reversado` override below. At INSERT time only `pago`/`pendiente` are reachable (a brand-new invoice cannot yet be `parcial` or `reversado` — see the two creation scenarios below); the full 4-value range becomes reachable once UPDATEs (payments, reversals) begin.

#### Scenario: CONTADO sale fully paid at creation
- GIVEN a CONTADO sale is inserted with `saldo_pend_usd = 0`
- WHEN the `BEFORE INSERT` trigger derives estado
- THEN `estado = 'pago'` — immediately, at creation, not after any later UPDATE

#### Scenario: CREDITO sale unpaid at creation
- GIVEN a CREDITO sale is inserted with `saldo_pend_usd = total_usd`
- WHEN the `BEFORE INSERT` trigger derives estado
- THEN `estado = 'pendiente'` — immediately, at creation

#### Scenario: Partial payment
- GIVEN `0 < saldo_pend_usd < total_usd`
- WHEN a PAG/NCR/SAF movement reduces `saldo_pend_usd` into that range
- THEN `estado = 'parcial'`

#### Scenario: Residual balance of 0.004 is NOT pago (tolerance 0 is exact)
- GIVEN `saldo_pend_usd = 0.004` (a non-zero rounding residual)
- WHEN the trigger derives estado
- THEN `estado = 'parcial'`, never `'pago'` — under tolerance 0 only an
  exact `0` balance qualifies as `pago`

#### Scenario: NC fully covers a CONTADO invoice already paid
- GIVEN a CONTADO sale already `estado = 'pago'`
- WHEN a NCR further reduces `saldo_pend_usd` (never below 0, never raising it)
- THEN `estado` remains `'pago'` — NC reduces monto exigible, it is never counted as reopening toward `parcial`/`pendiente`

### Requirement: Reversado Detected Via Last-Movement Lookup

The system MUST set `estado = 'reversado'` only when the most recent `movimientos_cuenta` row for that `venta_id` (ordered `fecha DESC, created_at DESC, id DESC`) has `tipo = 'REV'` AND the resulting `saldo_pend_usd > 0` (exact, tolerance 0). Once a later PAG/NCR/SAF/REV movement changes the last-movement lookup away from `REV`, `estado` MUST re-derive to `pendiente`/`parcial`/`pago` by the magnitude rule — it MUST NOT stay stuck at `reversado`.

#### Scenario: Reverso reopens a paid invoice
- GIVEN a `pago` invoice receives a REV movement raising `saldo_pend_usd` above `0`
- WHEN the trigger re-derives estado
- THEN `estado = 'reversado'`

#### Scenario: REV guard at exactly 0 stays pago, not reversado
- GIVEN the most recent `movimientos_cuenta` row for an invoice has `tipo = 'REV'`
- WHEN the resulting `saldo_pend_usd` is exactly `0` (not `> 0`)
- THEN `estado = 'pago'`, NOT `'reversado'` — the REV override only applies
  when it actually reopens a nonzero balance

#### Scenario: New payment after a reversal clears reversado
- GIVEN an invoice is currently `reversado`
- WHEN a subsequent PAG movement reduces `saldo_pend_usd` to `0`
- THEN `estado = 'pago'`, not `reversado`, because the last-movement lookup no longer returns `REV`

### Requirement: Offline-Hybrid Optimistic-Then-Authoritative Reconciliation

The system MUST compute `estado` optimistically on the client (local TS mirror of the trigger logic) for both creation (INSERT) and payment/reversal (UPDATE) write-sites, for instant UI feedback; MUST strip `estado` from every local-to-server `ventas` PATCH via `TRIGGER_MANAGED_PATCH_COLUMNS`; and MUST let the authoritative server-trigger value overwrite the local optimistic value once the row replicates back down. For INSERT, no client-side strip is required or present — the server's `BEFORE INSERT` trigger unconditionally overwrites the incoming row's `estado` before it is stored, regardless of what the client's PUT payload contained.

#### Scenario: Optimistic local estado shown before sync, on creation
- GIVEN a device is offline and creates a new sale (CONTADO or CREDITO)
- WHEN the UI reads the just-created local row immediately
- THEN it shows the client-computed optimistic `estado` (`'pago'` or `'pendiente'`), not `NULL` and not stuck at a stale value

#### Scenario: Optimistic local estado shown before sync, on payment
- GIVEN a device is offline and records a payment
- WHEN the UI reads the local row immediately
- THEN it shows the client-computed optimistic `estado`

#### Scenario: Server reconciliation on replication, on creation
- GIVEN the device reconnects and the `ventas` PUT uploads with the client's optimistic `estado` still present (no strip applied to PUT)
- WHEN the server's `BEFORE INSERT` trigger derives `estado` from the incoming row's `saldo_pend_usd`/`total_usd`
- THEN the stored `estado` is the trigger's derived value, never the client's uploaded value, even though it was not stripped from the payload

#### Scenario: Server reconciliation on replication, on payment
- GIVEN the device reconnects and the `ventas` PATCH uploads with `estado` stripped
- WHEN the server trigger recomputes `estado` and the row replicates back down
- THEN the local `estado` is overwritten by the authoritative server value, resolving any drift

### Requirement: Multi-Tenant Scoping

`estado` derivation and every read of it MUST be scoped to the invoice's `empresa_id`; no cross-tenant row MAY influence or be influenced by another tenant's derivation.

#### Scenario: Tenant isolation holds
- GIVEN tenants A and B each have invoices
- WHEN A's trigger derives estado
- THEN only A's own `movimientos_cuenta` rows (matching `empresa_id`) are considered

### Requirement: Estado/Saf Ordering Correctness Validated Before Release

The derivation logic (magnitude rule + last-movement lookup) MUST be validated against the reconciliation invariant and the full module×movement matrix before this capability ships to production.

#### Scenario: Pre-release validation gate
- GIVEN the trigger and backfill are implemented
- WHEN release is considered
- THEN the invariant query and matrix scenarios above MUST all pass against real/backfilled data first

## Non-Goals

- Consolidating the 17 `saldo_actual` write-sites (separate design/tasks concern).
- Sync-rules windowing or role-based sync (sibling change, `powersync-sync-scope-optimization`).
