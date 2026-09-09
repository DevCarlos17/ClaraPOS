# pos-cobro-checkout-guards Specification

## Purpose

The Cobro modal (`cobro-modal.tsx`) checkout gate (`puedeProcesar`) MUST protect the cashier from processing a sale with a discrepancy mode silently defaulted, or with a half-entered/uncommitted payment. These are additive/restrictive guards only — they never relax an existing check, and they do not change what `crearVenta(...)` receives.

## Requirements

### Requirement: No discrepancy mode pre-selected by default on open

When the Cobro modal opens (or the outstanding balance `pendienteBs4` first crosses from ≤ Bs 0,01 to > Bs 0,01) with `discrepancyMode` still `null`, the system MUST NOT auto-select `'CREDITO'` (or any other discrepancy mode) on the cashier's behalf. The cashier MUST consciously choose a mode. EXCEPTION: the sub-cent `'DIFERENCIAL_FALTANTE'` auto-suggestion (for a faltante strictly between 0 and USD 0.01) MUST remain unchanged.

#### Scenario: Balance appears with no prior selection

- GIVEN the Cobro modal is open, `discrepancyMode` is `null`, and a client is selected with no payments yet
- WHEN `pendienteBs4` becomes > Bs 0,01 (a real outstanding balance exists)
- THEN `discrepancyMode` remains `null`
- AND the cashier must click a mode button or press F5/F6/F7 to select one

#### Scenario: Sub-cent faltante still auto-selects

- GIVEN the Cobro modal is open and the outstanding balance in USD (`bsToUsd(pendienteBs4, tasaUsada)`) is strictly between 0 and USD 0.01
- WHEN the balance crosses into that sub-cent range
- THEN `discrepancyMode` auto-selects `'DIFERENCIAL_FALTANTE'` (unchanged behavior)

### Requirement: Block processing and mode switching on uncommitted payment entry

If the cashier has typed content into the amount field (`montoStr`) or the reference field (`referencia`) but has NOT committed it via the "+" button (`handleAddPago`), the system MUST block both processing the sale and switching discrepancy mode, and MUST warn the cashier.

#### Scenario: Procesar blocked with uncommitted amount

- GIVEN `montoStr` or `referencia` is non-empty and the last change was not followed by a successful `handleAddPago()`
- WHEN the cashier attempts to process (Procesar button, Enter, or F12)
- THEN processing is blocked
- AND a Spanish warning toast appears: "Tenés un abono pendiente por ingresar: agregalo con + o borralo"

#### Scenario: Mode switch blocked with uncommitted amount

- GIVEN the same uncommitted-entry condition as above
- WHEN the cashier clicks any of the 6 discrepancy-mode buttons or presses F5/F6/F7
- THEN the mode switch is blocked
- AND the same Spanish warning toast appears

#### Scenario: "+" button glows to draw attention

- GIVEN the same uncommitted-entry condition as above
- WHEN the guard blocks an action (Procesar or mode switch)
- THEN the "+" button (`handleAddPago` trigger) visually glows/highlights

#### Scenario: No uncommitted entry — guard does not fire

- GIVEN `montoStr` and `referencia` are both empty (or were just cleared by a successful `handleAddPago()`)
- WHEN the cashier attempts to process or switch mode
- THEN this guard does not block the action

### Requirement: Block processing when a payment method is selected without an amount

If `metodoId` is selected but no valid amount has been entered for that payment, the system MUST block processing and alert the cashier, distinct from the uncommitted-entry guard above.

#### Scenario: Method selected, amount empty

- GIVEN `metodoId` has a valid selected payment method and the amount field is empty or not a valid positive number
- WHEN the cashier attempts to process (Procesar button, Enter, or F12)
- THEN processing is blocked
- AND a Spanish alert appears: "Seleccionaste un método de pago pero no ingresaste ningún monto"

#### Scenario: Method and valid amount both present — guard does not fire

- GIVEN `metodoId` is selected and a valid positive amount is entered
- WHEN the cashier attempts to process
- THEN this guard does not block the action (other guards/gate conditions still apply independently)
