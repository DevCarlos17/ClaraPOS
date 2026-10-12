# Cliente SAF Materializado Specification

## Purpose

New spec. `clientes.saf_disponible` is a trigger-maintained, O(1)-readable snapshot of unapplied saldo a favor (credit), replacing the full-history `SUM(SAFC)-SUM(SAF)` scan done today on every read. The UI-facing balance + pending-invoice list contract is frozen — only the data source hardens.

## Requirements

### Requirement: Saf_disponible Is Trigger-Maintained, Never A Read-Time Scan

The system MUST maintain `clientes.saf_disponible` as `MAX(0, SUM(SAFC) - SUM(SAF))` for that cliente/empresa, updated by `actualizar_saldo_cliente()` in the same pass as every relevant `movimientos_cuenta` INSERT. No hook/UI MAY recompute SAF via a `SUM()` scan at read time.

#### Scenario: SAFC increases materialized SAF
- GIVEN a SAFC movement of 30.00 is inserted for a client
- WHEN the trigger fires
- THEN `clientes.saf_disponible` increases by 30.00 in the same pass, no scan required

#### Scenario: SAF application decreases materialized SAF, floored at zero
- GIVEN `saf_disponible = 10.00`
- WHEN a SAF movement of 15.00 is applied
- THEN `saf_disponible = 0` (never negative)

#### Scenario: UI reads the column directly
- GIVEN the CxC screen needs the client's available credit
- WHEN it renders
- THEN it reads `clientes.saf_disponible` directly, not `SUM(SAFC)-SUM(SAF)` over `movimientos_cuenta`

### Requirement: Saldo_actual And Saf_disponible Are Separate, Never Netted

`saldo_actual` (net debt) and `saf_disponible` (credit balance) MUST remain two independent columns and MUST be displayed as two independent figures; no code path MAY merge them into one netted number for CxC display.

#### Scenario: Debt and credit shown side by side
- GIVEN a client has an open factura of 100.00 and `saf_disponible = 30.00`
- WHEN the CxC screen renders
- THEN it shows deuda 100.00 and SAF disponible 30.00 as two separate figures, never a netted 70.00

### Requirement: Reconciliation Invariant Holds

For every client, `saldo_actual` MUST equal `SUM(saldo_pend_usd of pending ventas for that client/empresa) - saf_disponible`, within `0.01` USD tolerance, at all times after each trigger-maintained write.

#### Scenario: Invariant check passes after a mixed write sequence
- GIVEN a client has pending invoices totaling 100.00 and `saf_disponible = 30.00`
- WHEN the invariant query runs
- THEN `saldo_actual` equals `100.00 - 30.00 = 70.00` within tolerance

### Requirement: Offline-Hybrid Optimistic-Then-Authoritative Reconciliation

The system MUST compute `saf_disponible` optimistically on the client, strip it from every PATCH via `TRIGGER_MANAGED_PATCH_COLUMNS` (`clientes: ['saldo_actual', 'saf_disponible']`), and let the server-trigger-replicated value overwrite the local optimistic one.

#### Scenario: Optimistic SAF shown offline, corrected on sync
- GIVEN a device offline applies a SAFC movement
- WHEN the UI reads `saf_disponible` immediately
- THEN it shows the locally-computed optimistic value, later overwritten by the authoritative server value on replication

### Requirement: Backfill Is Idempotent And Read-Only On The Ledger

The one-time backfill populating `saf_disponible` for existing clients MUST derive the value by reading `movimientos_cuenta` only (SELECT/JOIN), MUST NOT INSERT/UPDATE/DELETE any `movimientos_cuenta` row, and MUST be safe to re-run (no-op once values are already correct).

#### Scenario: Backfill does not touch the ledger
- GIVEN existing clients with historical SAFC/SAF movements
- WHEN the backfill runs
- THEN only `clientes.saf_disponible` is written; `movimientos_cuenta` row count and contents are unchanged

#### Scenario: Re-running backfill is a no-op
- GIVEN the backfill already ran and set correct values
- WHEN it runs again
- THEN no row is updated — the tolerance-guarded `WHERE` clause skips already-correct rows

### Requirement: Multi-Tenant Scoping

`saf_disponible` derivation MUST be scoped by `empresa_id`; cross-tenant movements MUST NOT contribute to another tenant's client balance.

#### Scenario: Tenant isolation holds
- GIVEN tenants A and B each have clients with SAF movements
- WHEN A's trigger recomputes `saf_disponible`
- THEN only A's own-tenant movements (matching `empresa_id`) are summed

### Requirement: UI Read Contract Is Frozen (Balance + Pending-Invoice List)

The CxC screens MUST continue to display the same information — client balance and the list of pending invoices — with the same visible behavior as before this change. Only the underlying data source hardens: balance reads `saldo_actual`/`saf_disponible` columns directly, and the pending-invoice list filters on `estado != 'pago'` (covering `pendiente`/`parcial`/`reversado`) instead of the dead `'REVERSADA'` string filter.

#### Scenario: Balance and pending list match pre-change output
- GIVEN a client with the same ledger history, before and after this change
- WHEN the CxC screen renders balance and pending-invoice list
- THEN the displayed balance equals the pre-change computed balance, and the pending-invoice list contains the same set of invoices as before

## Non-Goals

- Sync-rules windowing for `movimientos_cuenta` history (sibling change, `powersync-sync-scope-optimization`).
- Retiring the 17 `saldo_actual` write-sites (deferred).
