# Delta for pos-cobro-checkout-guards

> Extiende "ninguna opción pre-seleccionada" al excedente y agrega el gate de Procesar para "Dar vuelto" sin distribución. No modifica guards de monto-sin-commitear ni método-sin-monto.

## MODIFIED Requirements

### Requirement: No discrepancy mode pre-selected by default on open

When the Cobro modal opens (or `pendienteBs4` crosses ≤Bs0,01→>Bs0,01, OR ≥-Bs0,01→<-Bs0,01, i.e. excedente appears) with `discrepancyMode` still `null`, the system MUST NOT auto-select `'CREDITO'`, `'VUELTO'`, `'SAF'`, `'PROPINA'`, or any mode. EXCEPTION: sub-cent `'DIFERENCIAL_FALTANTE'` auto-suggestion (faltante strictly between 0 and USD 0.01) is unchanged.
(Previously: only covered underpayment crossing; excedente crossing auto-selected `'VUELTO'`)

#### Scenario: Balance appears with no prior selection
- GIVEN `discrepancyMode` is null, no payments yet
- WHEN `pendienteBs4` becomes > Bs 0,01
- THEN `discrepancyMode` remains null; cashier chooses via button or F5/F6/F7

#### Scenario: Sub-cent faltante still auto-selects
- GIVEN outstanding USD balance is strictly between 0 and USD 0.01
- WHEN the balance crosses into that sub-cent range
- THEN `discrepancyMode` auto-selects `'DIFERENCIAL_FALTANTE'` (unchanged)

#### Scenario: Excedente appears with no prior selection
- GIVEN `discrepancyMode` is null and `pendienteBs4` is ≥ -Bs 0,01
- WHEN `pendienteBs4` crosses to < -Bs 0,01 (excedente detected)
- THEN `discrepancyMode` remains null; none of "Dar vuelto"/"Saldo a favor"/"Propina" is pre-selected

## ADDED Requirements

### Requirement: Procesar disabled until an excedente option is chosen

While an excedente exists and `discrepancyMode` is `null`, Procesar MUST be disabled. When no excedente exists, the "Dar vuelto"/"Saldo a favor"/"Propina" buttons MUST NOT render and existing gating for exact/underpayment is unaffected.

#### Scenario: Excedente with no option chosen
- GIVEN excedente detected, `discrepancyMode` is null
- WHEN cashier attempts to process
- THEN Procesar stays disabled

#### Scenario: No excedente — options hidden, unchanged behavior
- GIVEN no excedente (exact payment or pendiente por cobrar)
- WHEN the modal renders
- THEN excedente option buttons are not shown; existing gating is unaffected

### Requirement: Procesar disabled for "Dar vuelto" without a non-empty distribution

When `discrepancyMode === 'VUELTO'`, Procesar MUST stay disabled unless the combined distribution (`vueltoEntries`, summed across ALL methods, e.g. EFECTIVO $ + EFECTIVO Bs — never just `splitVuelto[0]`) is non-empty and > zero. Distribution need NOT equal the ideal excedente to enable Procesar. `'SAF'`/`'PROPINA'` gating (incl. the `safEstado==='ok'` AND-gate) is unchanged.

#### Scenario: Empty distribution blocks Procesar
- GIVEN `discrepancyMode` is `'VUELTO'`, all distribution fields are empty or zero
- WHEN cashier attempts to process
- THEN Procesar stays disabled

#### Scenario: Any non-empty distribution enables Procesar
- GIVEN at least one distribution entry is positive (equal to, less, or more than ideal excedente)
- WHEN cashier attempts to process
- THEN Procesar is enabled (subject to unrelated guards, e.g. uncommitted payment entry)

#### Scenario: Multi-method distribution counts toward non-empty check
- GIVEN distribution spans EFECTIVO $ and EFECTIVO Bs entries (`vueltoEntries`)
- WHEN summing to evaluate the gate
- THEN all entries are included; the legacy single-entry fallback is not used

### Requirement: Simple sobrante/faltante message when distribution differs from ideal

When `discrepancyMode === 'VUELTO'` and the distribution differs from the ideal excedente (compared at full precision, before 2-decimal display rounding), the UI MUST show a simple message that the delta will be booked as caja sobrante (distributed < ideal) or faltante/gasto (distributed > ideal), and MUST still allow Procesar. No message when equal.

#### Scenario: Distributed less than ideal (sobrante)
- GIVEN distributed total < ideal excedente
- WHEN the difference is evaluated
- THEN "diferencia Bs {delta} → sobrante de caja" is shown; Procesar stays enabled

#### Scenario: Distributed more than ideal (faltante)
- GIVEN distributed total > ideal excedente
- WHEN the difference is evaluated
- THEN "diferencia Bs {delta} → faltante/gasto" is shown; Procesar stays enabled

#### Scenario: Distributed equal to ideal — no message
- GIVEN distributed total equals ideal at full precision
- WHEN evaluated
- THEN no sobrante/faltante message is shown
