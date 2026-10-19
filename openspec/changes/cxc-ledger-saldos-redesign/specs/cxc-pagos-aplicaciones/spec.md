# cxc-pagos-aplicaciones Specification

## Purpose

Add `pagos_aplicaciones`, a per-invoice application audit trail for `pagos`,
mirroring the shape and immutability of `saf_creditos_aplicaciones`
(migration 0105). Closes the gap where multi-invoice FIFO abonos
(`registrarAbonoGlobal`) write N `pagos` rows but only one aggregate
`movimientos_cuenta` PAG row, with no formal before/after audit per invoice.

## Requirements

### Requirement: Append-only auxiliary table

`pagos_aplicaciones` MUST exist with `empresa_id`, `pago_id`, `venta_id`,
`monto_aplicado_usd NUMERIC(20,8)`, `saldo_venta_antes_usd NUMERIC(20,8)`,
`saldo_venta_despues_usd NUMERIC(20,8)`, `fecha`, `created_by`. The table
MUST be append-only: no UPDATE, no DELETE permitted (same RLS/policy shape as
`saf_creditos_aplicaciones` — SELECT/INSERT only).

#### Scenario: UPDATE is rejected

- GIVEN an existing `pagos_aplicaciones` row
- WHEN an UPDATE is attempted against any column
- THEN the operation is rejected (no UPDATE policy/trigger permits it)

#### Scenario: DELETE is rejected

- GIVEN an existing `pagos_aplicaciones` row
- WHEN a DELETE is attempted
- THEN the operation is rejected

### Requirement: One row per (pago, venta) application

Every time a `pago` is applied to a venta's `saldo_pend_usd` — whether via
single-invoice `registrarPagoFactura`/`aplicarPagoFacturaEnTx` or via the
FIFO loop inside `registrarAbonoGlobal` — the system MUST write exactly one
`pagos_aplicaciones` row per invoice touched, with a snapshot of that
venta's `saldo_pend_usd` immediately before and after the application.

#### Scenario: Single-invoice payment writes exactly one row

- GIVEN a venta with `saldo_pend_usd = 100`
- WHEN a `$100` payment is applied via `registrarPagoFactura`
- THEN exactly 1 `pagos_aplicaciones` row is written with
  `saldo_venta_antes_usd = 100`, `saldo_venta_despues_usd = 0`

#### Scenario: Partial payment captures a non-zero after-balance

- GIVEN a venta with `saldo_pend_usd = 100`
- WHEN a `$40` payment is applied
- THEN the row has `monto_aplicado_usd = 40`, `saldo_venta_despues_usd = 60`

#### Scenario: Multi-invoice FIFO abono writes one row per invoice

- GIVEN a client with pending ventas A (`$30`) and B (`$70`)
- WHEN a `$100` global abono is FIFO-distributed
- THEN 2 `pagos_aplicaciones` rows are written (one for A, one for B), and
  `SUM(monto_aplicado_usd)` for that `pago_id` equals `$100`

#### Scenario: Overpayment excedente is excluded

- GIVEN a client with a single pending venta of `$20`
- WHEN a `$50` abono is applied (excess promoted to SAF credit via
  `saf_creditos_lotes`)
- THEN exactly 1 `pagos_aplicaciones` row exists for the `$20` applied to the
  venta; the `$30` excedente produces NO `pagos_aplicaciones` row (it is
  tracked exclusively by `saf_creditos_lotes`/`saf_creditos_aplicaciones`)

### Requirement: Coexistence with SAF auxiliary tables

`pagos_aplicaciones` MUST NOT collide with `saf_creditos_lotes`/
`saf_creditos_aplicaciones` (distinct tables, distinct PK space, no shared
FK). Both MUST coexist for the same `pago`/venta without one overwriting the
other's rows.

#### Scenario: A pago with both a direct application and a SAF excedente

- GIVEN a `$130` abono where `$100` is FIFO-applied to invoices and `$30`
  overflows to SAF
- WHEN the transaction completes
- THEN `pagos_aplicaciones` rows account for the `$100` and `saf_creditos_lotes`
  accounts for the `$30`, with no overlap or double-count between them

### Requirement: PowerSync schema registration

`pagos_aplicaciones` MUST be declared in `schema.ts` as `insertOnly: true`
(mirrors `saf_creditos_aplicaciones`) with indexes on `pago_id`, `venta_id`,
`empresa_id`.

#### Scenario: Index supports reversal-basis lookup

- GIVEN a `pago_id`
- WHEN querying `pagos_aplicaciones WHERE pago_id = ?`
- THEN the query uses the `pago_id` index, returning all ventas/amounts that
  payment affected (read basis for `cxc-reversa-pago-saf`)

### Requirement: Multitenant isolation

Every read and write MUST filter by `empresa_id`.

#### Scenario: Other empresa's applications are invisible

- GIVEN `pagos_aplicaciones` rows belonging to empresa A and empresa B
- WHEN empresa A queries by `pago_id`
- THEN only empresa A's rows are returned, filtered by `empresa_id`

## Design-Dependent Notes

- Whether historical `pagos` (already applied before this change ships) are
  backfilled into `pagos_aplicaciones`, or the table starts empty (0105
  precedent), is **design-dependent** (proposal Open Question 1).
