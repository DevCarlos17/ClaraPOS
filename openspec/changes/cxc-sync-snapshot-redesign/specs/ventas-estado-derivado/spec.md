# Ventas Estado Derivado Specification

## Purpose

New spec. `ventas.estado` (`pendiente`/`parcial`/`pago`/`reversado`) replaces the dead-end 2-value `status` CHECK as a trigger-derived, single-sourced invoice state — never written directly by client code. Resolves the `'REVERSADA'` dead-code ghost in `use-cxc.ts`.

## Requirements

### Requirement: Estado Is Trigger-Derived, Never Application-Written

The system MUST derive `ventas.estado` exclusively inside the `prevent_venta_mutation()` trigger whenever `saldo_pend_usd` changes. No application code path MAY set `estado` directly on the authoritative (server) row.

#### Scenario: Server estado always comes from the trigger
- GIVEN a payment reduces `saldo_pend_usd`
- WHEN the row replicates to Postgres
- THEN `estado` is computed by the trigger from `saldo_pend_usd`/`total_usd`, never from a client-sent value

### Requirement: Estado Derivation By Saldo Magnitude With Decimal Tolerance

The system MUST derive `estado` using a `0.005` USD tolerance over `NUMERIC(20,8)` columns: `pendiente` when `saldo_pend_usd >= total_usd - 0.005`; `pago` when `saldo_pend_usd <= 0.005`; `parcial` otherwise — subject to the `reversado` override below.

#### Scenario: CONTADO sale fully paid at creation
- GIVEN a CONTADO sale with `saldo_pend_usd = 0`
- WHEN the trigger derives estado
- THEN `estado = 'pago'`

#### Scenario: CREDITO sale with no payment
- GIVEN a CREDITO sale with `saldo_pend_usd = total_usd`
- WHEN the trigger derives estado
- THEN `estado = 'pendiente'`

#### Scenario: Partial payment
- GIVEN `0 < saldo_pend_usd < total_usd - 0.005`
- WHEN a PAG/NCR/SAF movement reduces `saldo_pend_usd` into that range
- THEN `estado = 'parcial'`

#### Scenario: NC fully covers a CONTADO invoice already paid
- GIVEN a CONTADO sale already `estado = 'pago'`
- WHEN a NCR further reduces `saldo_pend_usd` (never below 0, never raising it)
- THEN `estado` remains `'pago'` — NC reduces monto exigible, it is never counted as reopening toward `parcial`/`pendiente`

### Requirement: Reversado Detected Via Last-Movement Lookup

The system MUST set `estado = 'reversado'` only when the most recent `movimientos_cuenta` row for that `venta_id` (ordered `fecha DESC, created_at DESC, id DESC`) has `tipo = 'REV'` AND the resulting `saldo_pend_usd > 0.005`. Once a later PAG/NCR/SAF/REV movement changes the last-movement lookup away from `REV`, `estado` MUST re-derive to `pendiente`/`parcial`/`pago` by the magnitude rule — it MUST NOT stay stuck at `reversado`.

#### Scenario: Reverso reopens a paid invoice
- GIVEN a `pago` invoice receives a REV movement raising `saldo_pend_usd` above `0.005`
- WHEN the trigger re-derives estado
- THEN `estado = 'reversado'`

#### Scenario: New payment after a reversal clears reversado
- GIVEN an invoice is currently `reversado`
- WHEN a subsequent PAG movement reduces `saldo_pend_usd` to `0`
- THEN `estado = 'pago'`, not `reversado`, because the last-movement lookup no longer returns `REV`

### Requirement: Offline-Hybrid Optimistic-Then-Authoritative Reconciliation

The system MUST compute `estado` optimistically on the client (local TS mirror of the trigger logic) for instant UI feedback, MUST strip `estado` from every local-to-server `ventas` PATCH via `TRIGGER_MANAGED_PATCH_COLUMNS`, and MUST let the authoritative server-trigger value overwrite the local optimistic value once the row replicates back down.

#### Scenario: Optimistic local estado shown before sync
- GIVEN a device is offline and records a payment
- WHEN the UI reads the local row immediately
- THEN it shows the client-computed optimistic `estado`

#### Scenario: Server reconciliation on replication
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
