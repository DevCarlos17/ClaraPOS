# CxP Mobile Responsive Specification

## Purpose

Defines mobile (`<768px`) UX for `cxp-page.tsx`: the client-side rendering strategy for the proveedor list and the mobile presentation of a selected proveedor's detail (facturas + gastos), reusing the existing `proveedorSeleccionado` selection state. Desktop (`md:`+) is unchanged.

> **Nota de historial (corregida en `sdd-archive`, 2026-09-12)**: el diseño inicial de esta spec era master-detail con un nuevo control "Volver" dedicado. Ese diseño fue reemplazado ANTES de mergear (PR #108) por un modal (`Dialog`) que mantiene la lista siempre visible; el cierre del modal usa el close "X" por defecto de Radix Dialog — NO se agregó ningún control "Volver" nuevo. Esta spec fue corregida durante el archive para reflejar lo shippeado. La paginación de PR #108 fue luego RETIRADA por el fix `cxc-cxp-scroll-altura` (PR #109) a favor de lista completa con scroll interno — el alto acotado y el scroll de los paneles se definen en esa spec, no aquí.

## Requirements

### Requirement: Mobile detail via modal, list stays visible

On viewports `<768px`, the proveedor list panel MUST remain visible at all times. Tapping a proveedor MUST open a shadcn `Dialog` modal showing `DetallePanel` for that proveedor — the list panel MUST NOT hide or unmount. No new selection state is introduced beyond the existing `proveedorSeleccionado`.

#### Scenario: Tapping a proveedor opens the modal

- GIVEN viewport `<768px` and the proveedor list rendered
- WHEN the user taps a proveedor row
- THEN a `Dialog` modal opens showing that proveedor's `DetallePanel`
- AND the list panel remains rendered and visible underneath

#### Scenario: Closing the modal uses the default Radix close control

- GIVEN the modal open for a selected proveedor
- WHEN the user taps the Dialog's default close "X"
- THEN the modal closes and the list panel is unchanged; no bespoke Volver control exists

#### Scenario: Desktop keeps the inline 2-column layout

- GIVEN viewport `>=768px`
- WHEN a proveedor is selected
- THEN both panels remain visible side by side as before this change

### Requirement: Debt rows to cards on mobile (facturas and gastos)

On viewports `<768px`, each row of BOTH the facturas table and the gastos table MUST render as a card (via the shared `DeudaCard` component), using the same data and `onPagar`/`onPagarGasto`/`onVerDetalle` handlers as today.

#### Scenario: Facturas table hidden, cards shown

- GIVEN viewport `<768px` and pending facturas
- WHEN the detail modal renders
- THEN the facturas `<table>` carries `hidden md:block` and a card list (`md:hidden`) renders one card per factura

#### Scenario: Gastos table hidden, cards shown

- GIVEN viewport `<768px` and pending gastos
- WHEN the detail modal renders
- THEN the gastos `<table>` carries `hidden md:block` and a card list (`md:hidden`) renders one card per gasto

#### Scenario: Card action fires correct handler

- GIVEN a rendered factura or gasto card
- WHEN its Pagar button is tapped
- THEN `onPagar`/`onPagarGasto` fires with the correct row

#### Scenario: Desktop keeps both tables

- GIVEN viewport `>=768px`
- WHEN `DetallePanel` renders
- THEN both tables are visible and no card lists render

### Requirement: Full-list rendering, no server-side pagination

The full filtered proveedor list and the full filtered facturas/gastos lists MUST be rendered client-side, without a SQL `LIMIT` tied to the KPI-feeding data source. Panel height-bounding and internal scroll are OUT OF SCOPE of this spec — see `cxc-cxp-scroll-altura`.

#### Scenario: No SQL LIMIT feeding KPIs

- GIVEN the proveedor list query
- WHEN it executes
- THEN it carries no `LIMIT` clause tied to the KPI-feeding data source

### Requirement: No regression to preserved business logic

The system MUST preserve `empresa_id` filtering (via `useProveedoresConDeuda`/`useFacturasCompraPendientes`/`useGastosPendientesProveedor`), USD amounts, and Pagar/Reporte flows unchanged.

#### Scenario: empresa_id and business flows preserved

- GIVEN CxP hooks already filter by `empresa_id` and existing Pagar/Reporte flows work
- WHEN mobile layout changes are applied
- THEN no query, filter, or business-flow logic changes
