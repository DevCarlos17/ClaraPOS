# Cuadre-Caja Layout Specification

_Capability: `cuadre-caja-layout` | Change: `cuadre-caja-redesign` | Date: 2026-07-04_

---

## Purpose

Defines the layout, interactivity, and information hierarchy of the cuadre de caja screen. This capability is **presentation-only** — the data layer (`use-cuadre.ts` hooks) is unchanged.

---

## Requirements

### Requirement: Two-Column Responsive Layout

The cuadre page MUST render a two-column grid (`left: summary | right: payment methods`) on viewports ≥ 1024 px and MUST collapse to a single-column stack on viewports < 1024 px.

#### Scenario: Desktop two-column layout renders

- GIVEN the cuadre page loads on a 1280 px desktop viewport
- WHEN the component tree mounts
- THEN the left summary column and right payment-methods column are displayed side-by-side
- AND both columns are visible without horizontal scrolling

#### Scenario: Mobile collapses to single column

- GIVEN the cuadre page loads on a 375 px mobile viewport
- WHEN the component tree mounts
- THEN the left column stacks above the right column
- AND no column overflows the viewport width

---

### Requirement: Prominent Net Total Card

The **Total Caja Neto Esperado** card MUST be the first visible element in the left column, above all KPI cards and arqueo sections. It MUST display the formula result: `Contado + Cobros Anteriores ± Diferencial Cambiario`.

#### Scenario: Net total is above the fold

- GIVEN the cuadre page loads on a 1280 px desktop viewport
- WHEN no scrolling has occurred
- THEN the Total Caja Neto Esperado card is fully visible within the initial viewport

#### Scenario: Net total formula is correct

- GIVEN `contado = 100`, `cobrosAnteriores = 50`, `diferencialCambiario = -10`
- WHEN the net total card renders
- THEN it displays `140` as the total

---

### Requirement: Diferencial Cambiario Visible Line

The diferencial cambiario MUST appear as a dedicated line item below the net total card, displaying both its USD and Bs values. It MUST NOT require accordion expansion to be seen.

#### Scenario: Diferencial cambiario is always visible

- GIVEN the cuadre page loads
- WHEN the user has not interacted with any accordion or toggle
- THEN the diferencial cambiario row shows its USD amount and Bs equivalent

---

### Requirement: Clickable Payment Method Rows

Each payment method row in the right column MUST be interactive. Clicking a row MUST open a detail view for that specific method.

#### Scenario: User clicks a method with transactions

- GIVEN the right column shows payment method rows
- WHEN the user clicks a row with `totalTransacciones > 0`
- THEN a detail view opens showing the method's ventas del día and cobros POS

#### Scenario: User clicks a method with zero transactions

- GIVEN a payment method row has `totalTransacciones = 0`
- WHEN the user clicks that row
- THEN the detail view opens and displays an empty-state message for each section

---

### Requirement: Payment Method Detail View — Two Sections

The drill-down detail view for a payment method MUST contain two distinct sections: **Ventas del día** (sales that used this method) and **Cobros desde POS** (POS collections that used this method). These sections MUST be visually separated (tabs or stacked sections).

#### Scenario: Detail view shows two sections

- GIVEN the user opens any payment method detail view
- WHEN the view renders
- THEN two sections are present: "Ventas del día" and "Cobros desde POS"
- AND each section only shows transactions matching the selected method

---

### Requirement: Split Arqueo Section

The arqueo section MUST display two panels side-by-side on ≥ 768 px: left = physical denomination count (`cuadre-conteo-fisico`), right = theoretical formula (`FONDO + VENTA + INGRESOS − EGRESOS`) with labeled line items and a visible total.

#### Scenario: Arqueo teórico formula matches expected values

- GIVEN `fondo = 200`, `venta = 500`, `ingresos = 100`, `egresos = 50`
- WHEN the teorico panel renders
- THEN it displays line items FONDO=200, VENTA=500, INGRESOS=100, EGRESOS=50 and total=750

#### Scenario: Arqueo panels are side-by-side on tablet+

- GIVEN viewport ≥ 768 px
- WHEN the arqueo section renders
- THEN the physical count panel and theoretical panel are horizontally adjacent

---

### Requirement: Invoice Sections — Ventas del día and Cobros desde POS

The main cuadre view MUST have two clearly labeled invoice sections: **Ventas del día** and **Cobros desde POS**. These MUST NOT be mixed in a single list.

#### Scenario: Invoice sections are distinct

- GIVEN the cuadre page loads with data for both ventas and cobros
- WHEN the user scrolls to the invoice area
- THEN "Ventas del día" and "Cobros desde POS" appear as separate labeled sections

---

### Requirement: Expandable Invoice Detail

Each invoice row within any invoice section MUST be expandable to reveal its line items (products/services).

#### Scenario: User expands an invoice

- GIVEN an invoice row in "Ventas del día"
- WHEN the user clicks the expand control
- THEN the invoice's product/service line items become visible below the row

#### Scenario: User collapses an expanded invoice

- GIVEN an invoice row is expanded
- WHEN the user clicks the expand control again
- THEN the line items collapse and the row returns to its compact state

---

## Non-Requirements

The following are explicitly **out of scope** for this capability:

| Item | Reason |
|------|--------|
| New PowerSync queries | Data layer unchanged |
| Supabase schema changes | Presentation-only change |
| New Zod schemas | No new form inputs |
| Changes to `use-cuadre.ts` logic | Hook contracts unchanged |
| PDF print layout (`cuadre-imprimir.tsx`) | Separate concern |
| Other reportes tabs (CxC, Inventario, Ventas) | Unrelated modules |

---

## Acceptance Criteria

| # | Condition | Measurable As |
|---|-----------|---------------|
| AC-1 | Net total card visible above the fold at 1280 px without scrolling | Visual / computed layout check |
| AC-2 | Diferencial cambiario visible without any interaction | Element present in DOM on mount |
| AC-3 | Clicking each payment method row opens detail view | onClick triggers state change |
| AC-4 | Detail view has exactly two sections per method | DOM contains two labeled section containers |
| AC-5 | Arqueo shows formula: FONDO + VENTA + INGRESOS − EGRESOS | Rendered line items match input values |
| AC-6 | Layout is single-column at 375 px | Column CSS resolves to block/full-width |
| AC-7 | Each invoice row has an expand/collapse control | Toggle interaction shows/hides line items |
| AC-8 | Existing SAF drill-down (caja spec CAP-2) still works | No regression in existing caja features |
