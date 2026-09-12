# CxC Mobile Responsive Specification

## Purpose

Defines mobile (`<768px`) master-detail navigation and row→card presentation for the Cuentas por Cobrar screen (`cxc-list.tsx` + `cxc-cliente-detalle.tsx`), reusing the existing `clienteSeleccionado` selection state. Desktop (`md:`+) behavior is unchanged.

## Requirements

### Requirement: Mobile master-detail navigation

On viewports `<768px`, the system MUST show exactly one of the debtor list panel or the debtor detail panel at a time, driven by the existing `clienteSeleccionado` state. No new selection state SHALL be introduced.

#### Scenario: No client selected

- GIVEN `clienteSeleccionado` is `null` and viewport `<768px`
- WHEN the CxC screen renders
- THEN the debtor list panel is visible full-width and the detail panel is not visible

#### Scenario: Client selected

- GIVEN the user taps a debtor in the list
- WHEN `clienteSeleccionado` becomes non-null
- THEN the list panel hides and `CxcClienteDetalle` becomes visible full-width

#### Scenario: Volver returns to list (reuses existing close X)

- GIVEN a debtor is selected and the detail panel's close "X" is tapped
- WHEN `onClose` fires and `clienteSeleccionado` resets to `null`
- THEN the list panel becomes visible again and the detail panel hides

#### Scenario: Desktop unaffected

- GIVEN viewport `>=768px`
- WHEN any selection state changes
- THEN both panels remain visible side by side as today, no `hidden` applied

### Requirement: Debt row to card on mobile

On viewports `<768px`, each row of the pending-invoices table MUST render as a card showing factura number, fecha, tipo badge, total, pendiente, equiv. Bs, and an accion button, using the same data and the same `onPagar`/detail-open handlers as the desktop row.

#### Scenario: Table hidden, cards shown on mobile

- GIVEN viewport `<768px` and at least one pending invoice
- WHEN the detail panel renders
- THEN the `<table>` element carries `hidden md:block`
- AND a sibling card list (`md:hidden`) renders one card per invoice row

#### Scenario: Card action fires correct handler

- GIVEN a rendered card for invoice X
- WHEN the user taps its Pagar/Ver button
- THEN the same handler the desktop row's button calls fires with invoice X

#### Scenario: Desktop keeps the table

- GIVEN viewport `>=768px`
- WHEN the detail panel renders
- THEN the table is visible and no card list renders

### Requirement: No regression to preserved business logic

The system MUST preserve `empresa_id` filtering, bimonetario USD/Bs display, decimal precision, and Pagar/Abono Global/Imprimir flows unchanged. This spec covers layout only.

#### Scenario: empresa_id and business flows preserved

- GIVEN CxC hooks already filter by `empresa_id` and existing Pagar/Abono Global/Imprimir flows work
- WHEN mobile layout changes are applied
- THEN no query, filter, or business-flow logic changes
