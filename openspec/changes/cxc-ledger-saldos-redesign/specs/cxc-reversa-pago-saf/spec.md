# cxc-reversa-pago-saf Specification

## Purpose

Compensation-based reversal capability (DATA+LOGIC only, no UI) for a `pago`
that generated a SAF credit lote which may have since been partially or
fully consumed. Today `registrarReversoAbono` restores `saldo_pend_usd`/
`saldo_actual` but has no cascade for an already-consumed lote. This
capability detects the consumption state via the existing
`saf_creditos_lotes.origen_tipo='PAGO' + origen_id` link and produces
compensating entries without mutating immutable lote/aplicaciones rows.

## Requirements

### Requirement: Lote detection and consumption report

Given a `pago_id`, the system MUST provide a read function/hook that
reports: whether that pago generated a SAF lote
(`saf_creditos_lotes.origen_tipo = 'PAGO' AND origen_id = pago_id`); if so,
`monto_original_usd`, `saldo_disponible_usd`, consumed amount
(`monto_original_usd - saldo_disponible_usd`); and the list of affected
ventas + `monto_aplicado_usd` from `saf_creditos_aplicaciones WHERE lote_id
= <lote.id>`. This function MUST be read-only (no mutation).

#### Scenario: Pago generated no SAF lote

- GIVEN a `pago_id` with no matching `saf_creditos_lotes` row
- WHEN the detection function runs
- THEN it reports `generated_lote = false` and no affected ventas

#### Scenario: Lote untouched (zero consumption)

- GIVEN a pago that generated a lote with `saldo_disponible_usd ==
  monto_original_usd` and zero `saf_creditos_aplicaciones` rows
- WHEN the detection function runs
- THEN it reports `generated_lote = true`, consumed amount `= 0`, affected
  ventas `= []`

#### Scenario: Lote partially consumed

- GIVEN a lote with `monto_original_usd = 100` and `saldo_disponible_usd =
  40` (consumed `$60` across 1 venta)
- WHEN the detection function runs
- THEN it reports consumed amount `= 60` and exactly 1 affected venta with
  `monto_aplicado_usd = 60`

#### Scenario: Lote fully consumed across multiple ventas

- GIVEN a lote with `monto_original_usd = 100`, `saldo_disponible_usd = 0`,
  `status = 'AGOTADO'`, consumed via 2 `saf_creditos_aplicaciones` rows
  (`$60` and `$40`) against 2 different ventas
- WHEN the detection function runs
- THEN it reports consumed amount `= 100` and exactly 2 affected ventas with
  their respective `monto_aplicado_usd`

### Requirement: Compensation without row mutation

Reversing a pago whose generated lote has non-zero consumption MUST produce
compensating (contra) entries that neutralize the net financial effect of
that consumption, WITHOUT any UPDATE or DELETE on `saf_creditos_lotes` or
`saf_creditos_aplicaciones` rows. The exact shape of the contra-entry
(mechanism, table, trigger path) is **design-dependent** — not specified
here; only the observable invariants below are required.

#### Scenario: No mutation of historical SAF rows

- GIVEN a lote with 1 consuming `saf_creditos_aplicaciones` row
- WHEN the pago that generated that lote is reversed
- THEN the original `saf_creditos_lotes` row and the original
  `saf_creditos_aplicaciones` row remain byte-identical after the reversal
  (both the original consumption AND the reversal are visible in history)

#### Scenario: Net financial effect is neutralized

- GIVEN a lote fully consumed (`$100`) against 1 venta
- WHEN the pago that generated that lote is reversed
- THEN the client's `saldo_pendiente_usd` and `saf_disponible` end at the
  values they would have had if the original pago had never been applied
  (net effect zero), achieved via compensating entries, never row mutation

### Requirement: Affected invoices return to pending

Every venta that consumed credit from a reversed lote (per the detection
report) MUST return to pending state: `saldo_pend_usd` increases by the
reversed consumed amount for that venta, and `estado` is recomputed via the
existing derivation (not hand-set).

#### Scenario: Single affected invoice reopens

- GIVEN a venta with `estado = 'pago'` after consuming `$60` of SAF credit
- WHEN the originating pago is reversed
- THEN that venta's `saldo_pend_usd` increases by `60` and `estado`
  recomputes to `'parcial'` or `'pendiente'` per the existing CASE logic
  (migration 0108), never set directly by the reversal code

#### Scenario: Multiple affected invoices reopen in one transaction

- GIVEN a lote consumed across 2 ventas (`$60` and `$40`)
- WHEN the originating pago is reversed
- THEN both ventas return to pending in the same transaction, each by its
  own consumed amount

### Requirement: No UI surface

This capability MUST ship as data/logic only (query function/hook +
compensation write path). It MUST NOT include a confirmation modal or any
UI surface — that is explicitly out of scope, reserved for a future SDD
change that will consume this capability's read function.

#### Scenario: Read function is consumable without UI

- GIVEN the detection function described above
- WHEN called directly (unit test or future modal's data layer)
- THEN it returns a plain data structure (generated-lote?, consumed amount,
  affected invoices + amounts) with no rendering or dialog dependency

### Requirement: Multitenant isolation

Detection and compensation MUST filter by `empresa_id` throughout.

#### Scenario: Cross-empresa lote is never detected or touched

- GIVEN a `pago_id` belonging to empresa A
- WHEN the detection function runs scoped to empresa A
- THEN it never returns or mutates a lote/aplicacion belonging to empresa B,
  even if IDs were guessable

## Design-Dependent Notes

- The exact contra-entry mechanism (new movimientos_cuenta type, a
  compensating `saf_creditos_lotes` row, or another construct) is
  **design-dependent** — Requirement "Compensation without row mutation"
  only fixes the observable invariants, not the implementation.
- Reconciliation of this cascade with `pagos_aplicaciones` (capability
  `cxc-pagos-aplicaciones`) reversal-basis data is **design-dependent**.
