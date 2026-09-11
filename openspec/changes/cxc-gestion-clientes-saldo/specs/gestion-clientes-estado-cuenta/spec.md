# Gestion Clientes — Estado de Cuenta Specification

## Purpose

Read-only client statement in Gestion Clientes: chronological `movimientos_cuenta` ledger per client, reconciled running balance and `saldo_actual`, consistent with CxC, no recomputation.

## Requirements

### Requirement: Renders all fetched movements
The system MUST render one row per `movimientos_cuenta` record from the active query (`empresa_id` + `cliente_id` + date range), ordered chronologically (most recent first), showing tipo, referencia, monto, posterior balance. Rendered row count MUST equal the header count.

#### Scenario: Header count matches rendered rows
- GIVEN a client has N movimientos in scope (N >= 1)
- WHEN the header reads "N movimiento(s)"
- THEN the table renders exactly N rows, chronologically ordered
- AND MUST NOT show "Sin movimientos" while header count > 0

### Requirement: Empty state reflects zero movements only
The system MUST show "Sin movimientos" if and only if the active-scope query returns zero rows.

#### Scenario: True empty state
- GIVEN zero movimientos in the selected range
- WHEN the estado de cuenta loads
- THEN "Sin movimientos" shows and no table renders

### Requirement: Default and custom date ranges
The system MUST default to the current calendar month when Desde/Hasta are unset, and MUST let the user override with an inclusive Desde/Hasta range, chronologically ordered.

#### Scenario: Opens with empty filters
- GIVEN the user opens client detail without Desde/Hasta
- WHEN the estado de cuenta loads
- THEN it shows movimientos with `fecha` in the current month

#### Scenario: Custom range
- GIVEN Desde = 2026-08-01, Hasta = 2026-08-31
- WHEN the query runs
- THEN only movimientos with `fecha` in that inclusive range return, chronologically ordered

### Requirement: Saldo actual reconciles with ledger and CxC, three-state styling
Saldo Actual MUST equal `cliente.saldo_actual` read directly (never summed client-side), equal to the most recent row's `saldo_nuevo`, and equal to the client's net CxC position (deuda − SAF). Each row's posterior balance MUST be that row's own `saldo_nuevo` — never derived by summing across rows. Styling MUST use a three-state model keyed on the sign of `saldo_actual`: positive => deuda (red), negative => saldo a favor/credit (green), exactly zero => neutral (gray) — a settled $0.00 balance is neither debt nor credit and MUST NOT render as deuda. The sign check MUST use decimal.js `comparedTo(0)`, never `isPositive()` (which returns `true` for zero and would misclassify a settled account as deuda). This logic MUST live in a single shared helper, `src/features/clientes/lib/saldo-estado.ts`, imported identically by the client list row and the client detail panel so both surfaces always agree on state for the same saldo.

#### Scenario: Saldo matches last row's running balance
- GIVEN the latest movimiento has `saldo_nuevo = "150.00000000"`
- WHEN the estado de cuenta loads
- THEN Saldo Actual shows 150.00 in deuda (red) styling, read from `cliente.saldo_actual`

#### Scenario: Saldo a favor shown as credit
- GIVEN `cliente.saldo_actual` is negative
- WHEN loaded, in either the client list row or the detail panel
- THEN Saldo Actual renders in green/credit (favor) styling

#### Scenario: Zero saldo shown as neutral, not deuda
- GIVEN `cliente.saldo_actual` is exactly `"0.00000000"`
- WHEN loaded, in either the client list row or the detail panel
- THEN Saldo Actual renders in neutral/gray styling — never red (deuda) and never green (favor), because both surfaces compute state via the same `saldoEstado()` helper

### Requirement: Deuda and SAF are two correct simultaneous views
Net running balance (estado de cuenta) and CxC's separate deuda/SAF totals are two valid, simultaneous lenses over the same ledger. This divergence MUST NOT be treated as a bug or "corrected".

#### Scenario: Deuda and SAF coexist without contradiction
- GIVEN an open factura of 100.00 and unapplied SAF of 30.00
- WHEN estado de cuenta shows net 70.00 and CxC shows deuda 100.00 + SAF 30.00
- THEN both are correct; no logic collapses one into the other

### Requirement: Read-only, tenant-scoped, precision-safe
The view MUST NOT write (no payment application, reversal, or mutation of `saldo_actual`/`movimientos_cuenta`). Every backing query MUST filter by the current user's `empresa_id`. Amounts/balances are `NUMERIC(20,8)`-backed text; display uses `precision_view=2` via decimal-safe formatting, and values reused for computation MUST NOT be read via `parseFloat`.

#### Scenario: Viewing produces no side effects
- GIVEN a user views, filters, or prints the statement
- WHEN any of those actions occur
- THEN no INSERT/UPDATE/DELETE is issued against `movimientos_cuenta`, `clientes.saldo_actual`, or any CxC table

#### Scenario: Saldo query is tenant-scoped
- GIVEN a user from empresa A views a client
- WHEN the saldo query runs
- THEN it filters `WHERE empresa_id = ? AND id = ?`, never returning another tenant's row

#### Scenario: Balance formatting preserves precision
- GIVEN `saldo_nuevo = "150.00000000"`
- WHEN displayed
- THEN it renders "150.00" without precision loss in any reused raw value

## Non-Goals

- Drill-down (factura/NC/abono/SAF trace) — follow-up change.
- CxC query/perf optimization.
- `errores_contabilidad` RLS sync error.
