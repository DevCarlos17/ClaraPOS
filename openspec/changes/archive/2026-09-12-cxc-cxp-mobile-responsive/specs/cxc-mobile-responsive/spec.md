# CxC Mobile Responsive Specification

## Purpose

Defines mobile (`<768px`) UX for the Cuentas por Cobrar screen (`cxc-list.tsx` + `cxc-cliente-detalle.tsx`): the client-side rendering strategy for the debtor list and the mobile presentation of a selected debtor's detail, reusing the existing `clienteSeleccionado` selection state. Desktop (`md:`+) behavior is unchanged (2-column inline layout).

> **Nota de historial (corregida en `sdd-archive`, 2026-09-12)**: el diseño inicial de esta spec era master-detail (ocultar la lista al seleccionar un cliente). Ese diseño fue reemplazado ANTES de mergear (commit `72bfcd1`, PR #108) por un modal (`Dialog`) que mantiene la lista siempre visible + paginación client-side. Esta spec fue corregida durante el archive para reflejar lo que realmente se shippeó, no el diseño original de `proposal.md`. La paginación de PR #108 fue luego RETIRADA por el fix `cxc-cxp-scroll-altura` (PR #109) a favor de lista completa dentro de un contenedor con scroll interno — el alto acotado y el scroll de los paneles se definen en la spec de `cxc-cxp-scroll-altura`, no aquí.

## Requirements

### Requirement: Mobile detail via modal, list stays visible

On viewports `<768px`, the debtor list panel MUST remain visible at all times. Tapping a debtor MUST open a shadcn `Dialog` modal showing `CxcClienteDetalle` for that client — the list panel MUST NOT hide or unmount. Closing the modal MUST NOT alter the list. No new selection state is introduced; the modal's open/closed state is derived from the existing `clienteSeleccionado`.

#### Scenario: Tapping a debtor opens the modal

- GIVEN viewport `<768px` and the debtor list rendered
- WHEN the user taps a debtor row
- THEN a `Dialog` modal opens showing that debtor's detail
- AND the list panel remains rendered and visible underneath

#### Scenario: Closing the modal preserves the list

- GIVEN the modal open for a selected debtor
- WHEN the user closes the modal
- THEN the list panel is still visible, unchanged — no master-detail hide/show occurs

#### Scenario: Desktop keeps the inline 2-column layout

- GIVEN viewport `>=768px`
- WHEN a debtor is selected
- THEN both the list and the detail panel (`hidden md:block`, unconditional) remain visible side by side, as before this change

### Requirement: Debt row to card on mobile

On viewports `<768px`, each row of the pending-invoices table MUST render as a card (via the shared `DeudaCard` component) showing factura number, fecha, tipo badge, total, pendiente, equiv. Bs, and an accion button, using the same data and the same `onPagar`/detail-open handlers as the desktop row.

#### Scenario: Table hidden, cards shown on mobile

- GIVEN viewport `<768px` and at least one pending invoice
- WHEN the detail modal renders
- THEN the `<table>` element carries `hidden md:block`
- AND a sibling card list (`md:hidden`, `data-testid="cxc-mobile-card-list"`) renders one `DeudaCard` per invoice row

#### Scenario: Card action fires correct handler

- GIVEN a rendered card for invoice X
- WHEN the user taps its Pagar/Ver button
- THEN the same handler the desktop row's button calls fires with invoice X

#### Scenario: Desktop keeps the table

- GIVEN viewport `>=768px`
- WHEN the detail panel renders
- THEN the table is visible and no card list renders

### Requirement: Full-list rendering, no server-side pagination

The full filtered debtor list and the full filtered debt list per debtor MUST be rendered client-side, without a SQL `LIMIT` tied to the KPI-feeding data source (KPIs are computed from the same full arrays). Panel height-bounding and internal scroll for both the debtor list and the debt list are OUT OF SCOPE of this spec — see `cxc-cxp-scroll-altura` for that behavior.

#### Scenario: No SQL LIMIT feeding KPIs

- GIVEN the debtor list and debt list queries
- WHEN they execute
- THEN neither carries a `LIMIT` clause tied to the KPI-feeding data source

### Requirement: No regression to preserved business logic

The system MUST preserve `empresa_id` filtering, bimonetario USD/Bs display, decimal precision, and Pagar/Abono Global/Imprimir flows unchanged. This spec covers layout only.

#### Scenario: empresa_id and business flows preserved

- GIVEN CxC hooks already filter by `empresa_id` and existing Pagar/Abono Global/Imprimir flows work
- WHEN mobile layout changes are applied
- THEN no query, filter, or business-flow logic changes
