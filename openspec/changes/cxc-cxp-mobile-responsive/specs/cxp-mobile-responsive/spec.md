# CxP Mobile Responsive Specification

## Purpose

Defines mobile (`<768px`) master-detail navigation, a new Volver control, and row→card presentation for both the facturas and gastos tables in `cxp-page.tsx`, reusing the existing `proveedorSeleccionado` state. Desktop (`md:`+) is unchanged.

## Requirements

### Requirement: Mobile master-detail navigation

On viewports `<768px`, the system MUST show exactly one of the proveedor list panel or `DetallePanel` at a time, driven by the existing `proveedorSeleccionado` state. No new selection state SHALL be introduced.

#### Scenario: No proveedor selected

- GIVEN `proveedorSeleccionado` is `null` and viewport `<768px`
- WHEN the CxP screen renders
- THEN the proveedor list panel is visible full-width and `DetallePanel` is not visible

#### Scenario: Proveedor selected

- GIVEN the user taps a proveedor in the list
- WHEN `proveedorSeleccionado` becomes non-null
- THEN the list panel hides and `DetallePanel` becomes visible full-width

#### Scenario: Desktop unaffected

- GIVEN viewport `>=768px`
- WHEN selection changes
- THEN both panels remain visible side by side as today

### Requirement: New Volver control on mobile

The system MUST add a Volver/back control to `DetallePanel`, visible only on `<768px` (`md:hidden`), since no close/back affordance exists today. Tapping it MUST reset `proveedorSeleccionado` to `null`.

#### Scenario: Volver visible only on mobile

- GIVEN viewport `<768px` and a proveedor selected
- WHEN `DetallePanel` renders
- THEN a Volver button is visible

#### Scenario: Volver returns to list

- GIVEN the Volver button is tapped
- WHEN `proveedorSeleccionado` resets to `null`
- THEN the list panel becomes visible again

#### Scenario: Volver hidden on desktop

- GIVEN viewport `>=768px`
- WHEN `DetallePanel` renders
- THEN the Volver button is not visible (`md:hidden`)

### Requirement: Debt rows to cards on mobile (facturas and gastos)

On viewports `<768px`, each row of BOTH the facturas table and the gastos table MUST render as a card (numero, fecha, tipo/descripcion, total, pendiente, accion), using the same data and `onPagar`/`onPagarGasto`/`onVerDetalle` handlers as today.

#### Scenario: Facturas table hidden, cards shown

- GIVEN viewport `<768px` and pending facturas
- WHEN `DetallePanel` renders
- THEN the facturas `<table>` carries `hidden md:block` and a card list (`md:hidden`) renders one card per factura

#### Scenario: Gastos table hidden, cards shown

- GIVEN viewport `<768px` and pending gastos
- WHEN `DetallePanel` renders
- THEN the gastos `<table>` carries `hidden md:block` and a card list (`md:hidden`) renders one card per gasto

#### Scenario: Card action fires correct handler

- GIVEN a rendered factura or gasto card
- WHEN its Pagar button is tapped
- THEN `onPagar`/`onPagarGasto` fires with the correct row

#### Scenario: Desktop keeps both tables

- GIVEN viewport `>=768px`
- WHEN `DetallePanel` renders
- THEN both tables are visible and no card lists render

### Requirement: No regression to preserved business logic

The system MUST preserve `empresa_id` filtering (via `useProveedoresConDeuda`/`useFacturasCompraPendientes`/`useGastosPendientesProveedor`), USD amounts, and Pagar/Reporte flows unchanged.

#### Scenario: empresa_id and business flows preserved

- GIVEN CxP hooks already filter by `empresa_id` and existing Pagar/Reporte flows work
- WHEN mobile layout changes are applied
- THEN no query, filter, or business-flow logic changes
