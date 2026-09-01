# Saldo Cliente Trigger Specification

## Purpose

Defines the Postgres BEFORE INSERT trigger `actualizar_saldo_cliente()` on `movimientos_cuenta`, maintaining `clientes.saldo_actual`, and the data-repair invariant. First formal spec for this domain.

## Requirements

### Requirement: SAF branch trusts application-provided saldo_nuevo
For `movimientos_cuenta` rows with `tipo = 'SAF'`, the trigger MUST NOT recompute `saldo_nuevo`. It MUST accept the value provided by `NEW`, as already done for `tipo IN ('REV', 'SAL')`. `monto` is always positive; SAF rows cover both debt-reduction (`saldo_anterior - monto`) and credit-consumption (`saldo_anterior + monto`) — one fixed formula always corrupts one direction.

#### Scenario: Create credit (excess payment becomes saldo a favor)
- GIVEN tasa Bs 500, cliente `saldo_actual = $0`
- WHEN an invoice for Bs 650 is paid with Bs 1000 (no target invoice for the Bs 350 excess)
- THEN a `movimientos_cuenta` row records the excedente
- AND `clientes.saldo_actual` = -$0.70 (Bs 350 / 500)

#### Scenario: Consume credit (core regression — must not double)
- GIVEN cliente already holds `saldo_actual = -$0.70`
- WHEN a Bs 650 invoice is paid by applying the credit plus cash for the difference, inserting `tipo='SAF'` with `saldo_anterior=-0.70`, `saldo_nuevo=0`
- THEN `clientes.saldo_actual` = $0 (NOT -$1.40)
- AND available credit returns to $1000 (NOT $1001.40)

#### Scenario: Consume partial credit against debt (working direction unchanged)
- GIVEN a SAF row reducing positive debt (`saldo_anterior - monto` computed by the application)
- WHEN inserted
- THEN `clientes.saldo_actual` matches the provided `saldo_nuevo` exactly, same as current behavior

### Requirement: movimientos_cuenta immutability preserved
The fix MUST NOT introduce any new UPDATE/DELETE path against `movimientos_cuenta`. The ledger stays insert-only.

#### Scenario: No new mutation path
- GIVEN the corrected trigger function
- WHEN inspected for UPDATE/DELETE statements
- THEN none exist beyond pre-existing protections

### Requirement: Data repair restores correct saldo_actual
The repair migration MUST recompute `clientes.saldo_actual` for every client whose stored balance disagrees with the balance derivable from `movimientos_cuenta` history, scoped by `empresa_id`. It MUST be idempotent, threshold-guarded (matching `0061`/`0062`).

#### Scenario: Repair corrects a corrupted client
- GIVEN a client whose `saldo_actual` was doubled by the SAF sign bug (e.g. -$1.40 instead of -$0.70)
- WHEN the repair migration runs
- THEN `saldo_actual` equals the balance derived from `movimientos_cuenta` history

#### Scenario: Repair is idempotent and multi-tenant scoped
- GIVEN the repair has already run once, and clients span multiple `empresa_id` values
- WHEN it runs again
- THEN no already-correct client changes, and each recomputation used only that client's own `empresa_id` rows

### Requirement: Cierre de caja / cuadre totals unaffected
Cierre and cuadre reporting MUST continue deriving exclusively from `monto` sums, never from `saldo_actual`/`saldo_nuevo`. The trigger fix MUST NOT change cierre/cuadre output.

#### Scenario: Cuadre totals identical before and after
- GIVEN a caja session with SAF creation and consumption activity
- WHEN cuadre de caja is generated before and after the fix
- THEN all totals are identical

### Requirement: Trigger-level test verification
SAF regression coverage MUST exercise the real Postgres trigger (or equivalent non-mocked execution), not a fully-mocked transaction. `src/features/cxc` has zero test files today; this change requires new trigger-level tests.

#### Scenario: Mocked test is insufficient
- GIVEN a test mocking `db.writeTransaction`/`db.execute`, asserting only the JS-computed value
- WHEN evaluated as regression coverage
- THEN it MUST NOT be accepted alone — it cannot observe trigger-computed `saldo_nuevo`

### Requirement: Historical saldo_nuevo display recompute (CONDITIONAL)
OPTIONAL, pending a design decision (Layer 3, deferred by the proposal). The system MAY recompute a running balance on-the-fly for `estado de cuenta` (`useMovimientosCxcPeriodo`) instead of reading the historically wrong per-row `saldo_nuevo`, since rows are immutable. If implemented, it MUST NOT mutate `movimientos_cuenta`.

#### Scenario: Historical row still shows pre-fix value (acceptable baseline)
- GIVEN a pre-fix `movimientos_cuenta` row with a corrupted `saldo_nuevo`
- WHEN `estado de cuenta` is viewed without Layer 3 implemented
- THEN the stored value displays as-is — NOT a regression of this change
