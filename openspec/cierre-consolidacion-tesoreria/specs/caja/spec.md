# Delta for Caja

_Change: cierre-consolidacion-tesoreria | Modifies: `openspec/specs/caja/spec.md` (no prior cierre requirement — new behavior) and the un-archived `openspec/pos-tesoreria-integration/spec-caja-delta.md` deposit-reminder requirement._

---

## ADDED Requirements

### Requirement: cerrarSesionCaja triggers Tesorería consolidation atomically

`cerrarSesionCaja` MUST, inside its existing `writeTransaction` and after populating `sesiones_caja_detalle`, invoke the `tesoreria-consolidacion-cierre` capability for every used method. Consolidation MUST use the same transaction handle (no nested `writeTransaction`) so any consolidation failure rolls back the ENTIRE cierre atomically, including the `sesiones_caja.status` update. The existing `status='ABIERTA'` guard MUST continue to provide idempotency — a session cannot be closed (and consolidated) twice.

#### Scenario: Successful cierre also consolidates to Tesorería

- GIVEN an open session with mixed-method activity
- WHEN the cashier confirms cierre
- THEN `sesiones_caja.status` becomes `CERRADA` AND the corresponding pending Tesorería transfers exist, all committed in the same transaction

#### Scenario: Consolidation failure blocks the whole cierre

- GIVEN a method lacking a valid destination or a missing commission account
- WHEN cierre is attempted
- THEN the transaction throws, `sesiones_caja.status` stays `ABIERTA`, and no `sesiones_caja_detalle` row from this attempt persists either

---

## MODIFIED Requirements

### Requirement: Mensaje informativo de depósito a Tesorería al cerrar sesión

(Previously: `pos-tesoreria-integration` added a post-close informational toast reminding the cashier to manually deposit reported cash to Tesorería (`sesion-caja-form.tsx`). That delta was never archived into `openspec/specs/caja/spec.md`, but the toast is live in code.)

Since cierre now deposits automatically via `tesoreria-consolidacion-cierre`, the system MUST NOT show any manual-deposit reminder toast after a successful cierre. The cashier is no longer responsible for manually depositing reported cash.

#### Scenario: Successful cierre shows no deposit reminder

- GIVEN a cashier completes cierre successfully
- WHEN the success toast appears
- THEN no additional "recuerda depositar" informational toast is shown afterward

#### Scenario: Failed cierre still shows no reminder (unchanged)

- GIVEN cierre fails
- WHEN the error toast appears
- THEN no deposit-reminder toast appears — same as before this change
