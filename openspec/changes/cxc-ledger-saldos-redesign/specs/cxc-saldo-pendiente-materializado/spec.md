# cxc-saldo-pendiente-materializado Specification

## Purpose

Materialize `clientes.saldo_pendiente_usd` as an O(1) debt snapshot, maintained
atomically (no read-before-write), mirroring the proven `saf_disponible`
pattern (migration 0102). Eliminates the per-render `SUM(ventas.saldo_pend_usd)`
scan duplicated across `use-cxc.ts:100` and `use-deuda-cliente.ts:24,50`.

## Requirements

### Requirement: Materialized debt column

`clientes` MUST have a `saldo_pendiente_usd` column, `NUMERIC(20,8) NOT NULL
DEFAULT 0`, representing the sum of `ventas.saldo_pend_usd` for that client's
ventas where `estado != 'pago'`, scoped by `empresa_id`. The column MUST never
be negative.

#### Scenario: Column exists with safe default

- GIVEN a freshly migrated `clientes` row with no prior debt
- WHEN the column is read
- THEN `saldo_pendiente_usd` equals `0`, never `NULL`

### Requirement: Atomic maintenance, no read-before-write

The column MUST be updated within the same atomic step that changes a
venta's `saldo_pend_usd` (trigger-level CASE/delta expression), never via an
app-level read-then-write round trip. This MUST hold for every write path
that alters client debt: venta a credito creation, `pago`/`NCR` application,
multi-invoice FIFO abono, and `reverso`.

#### Scenario: Credit sale increases the column

- GIVEN a client with `saldo_pendiente_usd = 0`
- WHEN a venta a credito of `$100` is created (`saldo_pend_usd = 100`)
- THEN `saldo_pendiente_usd` becomes `100`

#### Scenario: Cash sale does not increase the column

- GIVEN a client with `saldo_pendiente_usd = 0`
- WHEN a venta CONTADO is created (`saldo_pend_usd = 0`, `estado = 'pago'` at birth)
- THEN `saldo_pendiente_usd` remains `0`

#### Scenario: Full payment zeroes the column exactly

- GIVEN a client whose only pending venta has `saldo_pend_usd = 50` and
  `saldo_pendiente_usd = 50`
- WHEN that venta is paid in full
- THEN `saldo_pendiente_usd` reads exactly `0` (exact-zero tolerance, matches
  `estado` tolerance-zero rule, migration 0108)

#### Scenario: Partial payment decreases by the applied amount only

- GIVEN a venta with `saldo_pend_usd = 100` and `saldo_pendiente_usd = 100`
- WHEN a `$30` payment is applied
- THEN `saldo_pendiente_usd` becomes `70`

#### Scenario: Overpayment never drives the column negative

- GIVEN a venta with `saldo_pend_usd = 20`
- WHEN a `$50` payment is applied (excess promoted to SAF credit)
- THEN `saldo_pendiente_usd` becomes `0`, never negative

#### Scenario: Reverso restores the column

- GIVEN a client with `saldo_pendiente_usd = 0` after a `$40` payment was applied
- WHEN that payment is reversed via `registrarReversoAbono`
- THEN `saldo_pendiente_usd` increases back to `40`

#### Scenario: Multi-invoice FIFO abono decreases by the total applied

- GIVEN a client with two pending ventas (`$30` and `$70`) and
  `saldo_pendiente_usd = 100`
- WHEN a `$100` global abono is FIFO-distributed across both
- THEN `saldo_pendiente_usd` becomes `0` in the same transaction, with no
  intermediate state visible to readers

### Requirement: Read-path parity

`use-cxc.ts` (`DEUDA_CREDITO_CLIENTE_SELECT`) and `use-deuda-cliente.ts`
(`useDeudaFacturasCliente`, `useDeudaFacturasClientes`) MUST read
`saldo_pendiente_usd` directly instead of computing
`SUM(ventas.saldo_pend_usd)`. The externally observable `deuda_usd` value
MUST be identical to the value the legacy SUM query would have produced for
the same client and `empresa_id`.

#### Scenario: Column value matches legacy SUM computation

- GIVEN a client with mixed paid/pending/partial ventas
- WHEN `saldo_pendiente_usd` is compared against
  `SUM(saldo_pend_usd) WHERE saldo_pend_usd > 0` for that client
- THEN both values are equal within `0` tolerance

### Requirement: Multitenant isolation

Every read and write of `saldo_pendiente_usd` MUST be scoped by `empresa_id`.

#### Scenario: Other empresa's debt is invisible

- GIVEN two clients with the same `id`-adjacent data in different `empresa_id`
- WHEN empresa A's debt changes
- THEN empresa B's `saldo_pendiente_usd` is unaffected and not returned by
  empresa A's queries

## Design-Dependent Notes

- Whether a one-time read-only backfill populates `saldo_pendiente_usd` for
  existing clients (mirrors 0107's precedent) is **design-dependent** — not
  specified here.
- Whether an ongoing reconciliation check (materialized vs. ledger-derived)
  is added, and in what form, is **design-dependent** (proposal Open
  Question 3).
