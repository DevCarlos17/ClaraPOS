# Delta Spec: POS Mejoras de Cobro

_Date: 2026-06-01 | Change: pos-mejoras-cobro | Model: anthropic/claude-sonnet-4-6_

---

## REQ-001: ClienteSelector Dropdown Z-Index (Mobile)

The `ClienteSelector` dropdown MUST be fully visible on viewports ≥ 320 px wide, unclipped by any parent overflow or stacking context.

**Acceptance Criteria**
1. Dropdown uses `position: fixed; z-index: 9999` with `top/left/width` computed via `useLayoutEffect + getBoundingClientRect()`
2. Position recalculates on viewport `resize` and `scroll` events; listeners removed on unmount
3. No visual clipping inside `CobroModal` or any scrollable container on a 320 px mobile viewport

#### Scenario: Dropdown visible on mobile

- GIVEN CobroModal is open on a 320 px viewport
- WHEN the user taps the `ClienteSelector` input
- THEN the suggestion dropdown appears fully visible, not obscured by any overlapping element

#### Scenario: Dropdown repositions on scroll

- GIVEN the `ClienteSelector` dropdown is open
- WHEN the user scrolls the parent container or the viewport resizes
- THEN the dropdown position recalculates to stay aligned with the input field

---

## REQ-002: Keyboard Confirmation in CobroModal (ENTER / F12)

`CobroModal` MUST call `handleProcesar()` when `F12` or `Enter` is pressed, subject to three guards.

**Acceptance Criteria**
1. Fires on `F12` or `Enter` while the modal is mounted and `puedeProcesar === true`
2. MUST NOT fire when `puedeProcesar === false`
3. MUST NOT fire when the focused element is inside an amount or reference `<input>`
4. MUST NOT fire when `SupervisorPinDialog` is currently open
5. Listener is added on mount and removed on unmount

#### Scenario: F12 confirms payment (happy path)

- GIVEN CobroModal is open, `puedeProcesar === true`, focus on modal backdrop
- AND `SupervisorPinDialog` is NOT open
- WHEN the user presses `F12`
- THEN `handleProcesar()` is called exactly once

#### Scenario: F12 blocked while SupervisorPinDialog is open

- GIVEN `puedeProcesar === true` AND `SupervisorPinDialog` is currently open
- WHEN the user presses `F12` or `Enter`
- THEN `handleProcesar()` is NOT called; the key event is consumed by the dialog

---

## REQ-003: Botones +/− en Cantidad

Each line-item row MUST display `−` and `+` buttons flanking the quantity input. Quantity MUST NOT go below 1 for integer products or 0.001 for decimal products.

**Acceptance Criteria**
1. `−` button decrements by 1 (or minimum step), clamped at 1 (integer) / 0.001 (decimal)
2. `+` button increments by 1 (or minimum step); no upper bound enforced at UI layer
3. `+` key redirects to increment when focus is on the quantity input; default key behavior suppressed
4. `−` key redirects to decrement when focus is on the quantity input; default key behavior suppressed
5. Quantity MUST NOT reach 0 via the `−` button or the `−` key
6. `Enter` key behavior on the quantity input is unchanged (focuses `ProductoBuscador`)

#### Scenario: Minimum quantity enforced (button and keyboard)

- GIVEN an integer product with `cantidad = 1`
- WHEN the user clicks `−` or presses the `−` key with focus on the input
- THEN `cantidad` remains 1; no reset, navigation, or form submission occurs

#### Scenario: Keyboard +/− redirects quantity

- GIVEN focus is on the quantity input, `cantidad = 3`
- WHEN the user presses `+`
- THEN `cantidad = 4`; pressing `−` returns `cantidad = 3`

---

## REQ-004: Discrepancy Option Routing

The system MUST classify any payment discrepancy using a configurable threshold `umbralDiferencial = min($0.50 USD, 1% × totalVentaUsd)`, computed once when `CobroModal` opens. Exactly one option group MUST be shown at a time (mutually exclusive).

**Acceptance Criteria**
1. `umbralDiferencial` is computed at modal open; it is never recomputed mid-session
2. Overpayment (`overpago ≤ umbralDiferencial`): show ONLY "Diferencial cambiario (sobrante)"; hide "Dar vuelto", "SAF", "Propina"
3. Overpayment (`overpago > umbralDiferencial`): show "Dar vuelto", "SAF" (if client linked), "Propina"; hide "Diferencial cambiario"
4. Shortfall (`pendienteUsd ≤ umbralDiferencial`): show ONLY "Diferencial cambiario (faltante)"; no PIN required
5. Shortfall (`umbralDiferencial < pendienteUsd ≤ $2.00 USD`): show "Absorber (PIN supervisor)" + "Dejar a crédito"
6. Shortfall (`pendienteUsd > $2.00 USD`): show ONLY "Dejar a crédito"; "Absorber" MUST NOT appear

#### Scenario: Small overpayment routes to diferencial cambiario

- GIVEN `totalVentaUsd = $40.00`, `umbralDiferencial = $0.40`, `overpago = $0.20`
- WHEN overpayment options render
- THEN only "Diferencial cambiario (sobrante)" is shown; "Dar vuelto", "SAF", "Propina" are hidden

#### Scenario: Large shortfall hides absorber

- GIVEN `pendienteUsd = $3.00`, `umbralDiferencial = $0.30`
- WHEN discrepancy options render
- THEN only "Dejar a crédito" is shown; "Absorber (PIN supervisor)" does NOT appear

#### Scenario: Above-threshold overpayment routes to standard options

- GIVEN `overpago = $1.00`, `umbralDiferencial = $0.30`
- WHEN overpayment options render
- THEN "Dar vuelto", "SAF", and "Propina" are shown; "Diferencial cambiario (sobrante)" is NOT shown

---

## REQ-005: Vuelto Combinado

When vuelto mode is "Dar vuelto" and `totalVuelto > 0.01 USD`, the system MUST allow distributing change across all cash-capable payment methods used in the transaction. `puedeProcesar` MUST remain false until the split sum equals `totalVuelto` within ≤ $0.01 USD tolerance.

**Acceptance Criteria**
1. One editable split row per cash-capable payment method present in the current payment list
2. `puedeProcesar` is disabled while `|Σ splits − totalVuelto| > 0.01`
3. One `movimientos_metodo_cobro (tipo=EGRESO, origen=VUELTO)` row inserted per split entry inside `db.writeTransaction()`
4. All rows carry `empresa_id` from the authenticated user

#### Scenario: Multi-method vuelto confirmed (happy path)

- GIVEN total paid = $20.00 via USD cash + Bs cash, `totalVuelto = $3.00`
- WHEN cashier enters $2.00 for USD and $1.00 for Bs in the split table and confirms
- THEN two EGRESO VUELTO rows are inserted inside `db.writeTransaction()`

#### Scenario: Sum mismatch blocks Procesar

- GIVEN `totalVuelto = $3.00` and split entries sum to $2.50
- WHEN the UI validates the distribution
- THEN `puedeProcesar` remains false and an error indicator is displayed

---

## REQ-006: Saldo a Favor (SAF)

When `overpago > 0.01 USD` AND `overpago > umbralDiferencial` AND a client is linked, the system MUST offer "Acreditar en cuenta" as an alternative to physical change. On selection, exactly one `movimientos_cuenta (tipo='SAF')` MUST be inserted; no `EGRESO VUELTO` is created for the SAF amount.

**Acceptance Criteria**
1. SAF option is hidden when no client is linked to the sale
2. SAF option is hidden when `overpago ≤ 0.01 USD`
3. SAF option is hidden when `overpago ≤ umbralDiferencial` (routes to diferencial cambiario instead)
4. Inserted row MUST include: `tipo='SAF'`, `monto`, `tasa_pago`, `saldo_anterior`, `saldo_nuevo`, `venta_id`, `empresa_id`
5. `clientes.saldo_actual` MUST update solely via the existing PostgreSQL trigger on `movimientos_cuenta` insert; the frontend MUST NOT write this field directly
6. No `movimientos_metodo_cobro EGRESO VUELTO` row is created for the SAF amount
7. All inserts occur inside `db.writeTransaction()`

#### Scenario: SAF credits client account (happy path)

- GIVEN client selected, `overpago = $5.00`, `tasa_pago = 36.5000`
- WHEN cashier selects "Acreditar en cuenta" and confirms
- THEN one `movimientos_cuenta` row inserted: `tipo='SAF'`, `monto=5.00`, `tasa_pago=36.5000`, `saldo_anterior=X`, `saldo_nuevo=X−5.00`; no EGRESO VUELTO for $5.00

#### Scenario: SAF hidden when no client selected

- GIVEN `overpago = $5.00`, no client linked to the sale
- WHEN overpayment options render
- THEN only "Dar vuelto" and "Propina" are shown; "Acreditar en cuenta" does NOT appear

#### Scenario: SAF not offered at $0.01 threshold

- GIVEN client is selected AND `overpago = $0.01` exactly
- WHEN overpayment is evaluated
- THEN the SAF option is NOT displayed (threshold: `overpago MUST be > 0.01`)

#### Scenario: Write-transaction rollback on SAF failure

- GIVEN SAF is selected and `crearVenta()` is called
- WHEN any write inside the transaction fails
- THEN the entire transaction rolls back: no venta, pago, or movimiento_cuenta rows are persisted

---

## REQ-007: Propina / Sobrante Voluntario

When `overpago > umbralDiferencial`, the system MUST offer "Propina" as an option. On selection, the excess MUST remain in the register as `movimientos_metodo_cobro (tipo=INGRESO, origen=PROPINA)`. It MUST NOT modify `venta.total_usd`, `venta.total_bs`, or the fiscal receipt content.

**Acceptance Criteria**
1. "Propina" option visible only when `overpago > umbralDiferencial`
2. `venta.total_usd` and `venta.total_bs` MUST NOT change when propina is selected
3. One `movimientos_metodo_cobro` row inserted: `tipo=INGRESO`, `origen=PROPINA`, `monto=overpago`, `empresa_id`
4. No `movimientos_metodo_cobro EGRESO VUELTO` row created for the propina amount
5. All inserts occur inside `db.writeTransaction()`

#### Scenario: Propina does not modify venta total (happy path)

- GIVEN `totalVentaUsd = $50.00`, `overpago = $2.00`, cashier selects "Propina" and confirms
- WHEN `crearVenta()` executes
- THEN `venta.total_usd = 50.00` (unchanged), `venta.total_bs` unchanged; one INGRESO PROPINA row inserted for $2.00

#### Scenario: Propina not offered below threshold

- GIVEN `overpago = $0.20`, `umbralDiferencial = $0.30`
- WHEN overpayment options render
- THEN "Propina" is NOT shown

---

## REQ-008: Absorber Diferencial + Supervisor PIN

When `umbralDiferencial < pendienteUsd ≤ $2.00 USD`, the system MAY offer "El negocio asume la diferencia", gated behind a valid supervisor PIN for permission `ventas.absorber_diferencial`. An incorrect or cancelled PIN MUST prevent sale creation.

**Acceptance Criteria**
1. Option shown only when `umbralDiferencial < pendienteUsd ≤ $2.00 USD`
2. On click, `SupervisorPinDialog` opens with `requiredPermission = 'ventas.absorber_diferencial'`
3. On authorization, one `gastos` row inserted: `concepto='ABSORCION_DIFERENCIAL_POS'`, `monto_usd`, `cajero_id`, `supervisor_id`, `venta_id`, `empresa_id`
4. Venta created with `tipo='CONTADO'` and `saldo_pend_usd = 0`
5. Incorrect or cancelled PIN → `absorberDiferencial = false`; no venta and no `gastos` row are created
6. `pendienteUsd > $2.00 USD` → option NOT shown; only "Dejar a crédito" appears
7. All inserts occur inside `db.writeTransaction()`

#### Scenario: Supervisor authorizes absorption (happy path)

- GIVEN `pendienteUsd = $1.50`, `umbralDiferencial = $0.30`; supervisor enters correct PIN
- WHEN `crearVenta()` executes inside `db.writeTransaction()`
- THEN one `gastos` row with `concepto='ABSORCION_DIFERENCIAL_POS'`, `monto_usd=1.50`, `cajero_id`, `supervisor_id`, `venta_id`; `venta.saldo_pend_usd = 0`

#### Scenario: Incorrect PIN blocks sale

- GIVEN cashier clicks "El negocio asume la diferencia"
- WHEN supervisor enters incorrect PIN
- THEN `absorberDiferencial` remains false; dialog closes; no venta or gastos rows are created

#### Scenario: Shortfall above $2 USD hides absorber

- GIVEN `pendienteUsd = $2.50`
- WHEN discrepancy options render
- THEN "El negocio asume la diferencia" is NOT shown; only "Dejar a crédito" appears

---

## REQ-009: Diferencial Cambiario Faltante

When `pendienteUsd ≤ umbralDiferencial`, the system MUST auto-resolve the shortfall as a `gastos (concepto='DIFERENCIAL_CAMBIARIO_FALTANTE')` record and complete the sale without supervisor authorization.

**Acceptance Criteria**
1. Auto-resolve path is available (and pre-selected) only when `pendienteUsd ≤ umbralDiferencial`
2. One `gastos` row inserted: `concepto='DIFERENCIAL_CAMBIARIO_FALTANTE'`, `monto_usd`, `cajero_id`, `venta_id`, `empresa_id`; no `supervisor_id` required
3. Venta created with `saldo_pend_usd = 0`
4. `pendienteUsd > umbralDiferencial` → this path is NOT available; standard discrepancy flow (REQ-008) applies
5. All inserts occur inside `db.writeTransaction()`

#### Scenario: Below-threshold shortfall auto-resolved (happy path)

- GIVEN `pendienteUsd = $0.05`, `umbralDiferencial = $0.30`
- WHEN cashier presses Procesar
- THEN one `gastos` row with `concepto='DIFERENCIAL_CAMBIARIO_FALTANTE'`, `monto_usd=0.05`; `venta.saldo_pend_usd = 0`; no PIN requested

#### Scenario: Above-threshold shortfall routes to standard flow

- GIVEN `pendienteUsd = $0.80`, `umbralDiferencial = $0.30`
- WHEN discrepancy options render
- THEN "Diferencial cambiario (faltante)" is NOT shown; "Absorber (PIN supervisor)" or "Dejar a crédito" applies

---

## REQ-010: Diferencial Cambiario Sobrante

When `overpago ≤ umbralDiferencial`, the system MUST record the excess as `movimientos_metodo_cobro (tipo=INGRESO, origen=DIFERENCIAL_CAMBIARIO)` and complete the sale. No physical change, SAF, or propina is offered for this amount.

**Acceptance Criteria**
1. Only "Diferencial cambiario (sobrante)" shown when `overpago ≤ umbralDiferencial`
2. One `movimientos_metodo_cobro` row inserted: `tipo=INGRESO`, `origen=DIFERENCIAL_CAMBIARIO`, `monto=overpago`, `empresa_id`
3. No `EGRESO VUELTO` row for this amount
4. `overpago > umbralDiferencial` → this option NOT shown; standard overpayment flow (REQ-005/006/007) applies
5. All inserts occur inside `db.writeTransaction()`

#### Scenario: Below-threshold overpayment auto-resolved (happy path)

- GIVEN `overpago = $0.10`, `umbralDiferencial = $0.30`
- WHEN cashier presses Procesar
- THEN one INGRESO DIFERENCIAL_CAMBIARIO row inserted for $0.10; no vuelto, SAF, or propina offered

#### Scenario: Above-threshold overpayment routes to standard options

- GIVEN `overpago = $1.00`, `umbralDiferencial = $0.30`
- WHEN overpayment options render
- THEN "Diferencial cambiario (sobrante)" is NOT shown; "Dar vuelto", "SAF", and "Propina" appear
