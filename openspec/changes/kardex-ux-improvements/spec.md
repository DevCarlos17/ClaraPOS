# Spec: Kardex UX Improvements

> Change: `kardex-ux-improvements`
> Date: 2026-06-29
> Capabilities: kardex-filtros · kardex-print · kardex-product-autocomplete · ajuste-masivo-flow
> All capabilities are NEW — full specs (no deltas)

---

## Capability: kardex-filtros

### Requirement: Auto-Preload on Mount

The system MUST display current-month movements automatically on page load without user action. The default date range SHALL be `startOfMonth()` through today. Users MUST be able to change dates and re-query. The "Consultar" button MUST continue to work as before.

#### Scenario: SC-01 — Auto-load on navigation

- GIVEN a user navigates to the Kardex page
- WHEN the component mounts
- THEN the table displays current-month movements immediately without pressing "Consultar"

#### Scenario: SC-02 — Re-query with changed range

- GIVEN the kardex page is loaded with current-month data
- WHEN the user changes the date range and presses "Consultar"
- THEN the table refreshes with the new date range results

---

### Requirement: Facturación Causa Option

The causa dropdown MUST include "Facturación" as an option. Selecting "Facturación" SHALL filter rows where `origen = 'VEN'`. The value `'FACTURACION'` MUST NOT be written to the database — it is a UI-only filter value.

#### Scenario: SC-03 — Facturación filter

- GIVEN the causa dropdown is visible
- WHEN the user selects "Facturación"
- THEN only movements with `origen = 'VEN'` are shown

#### Scenario: SC-04 — Other causa options unaffected

- GIVEN the causa dropdown is visible
- WHEN the user selects "Merma"
- THEN only rows with `tipo_salida = 'MERMA'` are shown AND no `origen = 'VEN'` rows appear

---

### Requirement: Dynamic Causa Visibility

The causa select MUST be hidden when `filtroTipo = 'E'` (Entradas). The causa select MUST be visible when `filtroTipo = ''` (Todos) or `'S'` (Salidas). When the user switches to Entradas, `filtroTipoSalida` MUST reset to `''`. Causa options for Salidas and Todos SHALL be: Todas, Merma, Extravío, Consumo Interno, Facturación.

#### Scenario: SC-05 — Causa hidden when Entradas selected

- GIVEN filtroTipo is Salidas or Todos
- WHEN the user switches to Entradas
- THEN the causa select disappears AND `filtroTipoSalida` resets to `''`

#### Scenario: SC-06 — Causa visible when Salidas selected

- GIVEN filtroTipo is Entradas
- WHEN the user switches to Salidas
- THEN the causa select appears with options: Todas, Merma, Extravío, Consumo Interno, Facturación

#### Scenario: SC-07 — Causa visible when Todos selected

- GIVEN filtroTipo is Entradas
- WHEN the user switches to Todos
- THEN the causa select appears with the same 4 options as Salidas

---

## Capability: kardex-print

### Requirement: Print Filtered Results

The system MUST display a print button in the filter bar. The button MUST be disabled when `aplicado = false` OR `results.length === 0`. Clicking the button SHALL open a browser print dialog using `window.open() + window.print()`. The print header MUST include: company name (if available), filter summary (date range, product, department, type, cause), and generation timestamp. The print table MUST include all 8 visible columns: Fecha, Producto, Tipo, Origen, Causa, Cantidad, Stock, Motivo.

#### Scenario: SC-08 — Print button disabled without results

- GIVEN the Kardex page has loaded but no query has been applied
- WHEN the user views the filter bar
- THEN the print button is visible AND disabled

#### Scenario: SC-09 — Print opens dialog with correct data

- GIVEN a query has been applied and results are showing
- WHEN the user clicks the print button
- THEN a print window opens with: filter summary header, all 8 data columns, and generation timestamp

---

## Capability: kardex-product-autocomplete

### Requirement: Product Search Hook

The system MUST provide a `useBuscarProductosKardex(query)` hook returning products matching `query` by `nombre` OR `codigo` (LIKE %query%). The hook MUST filter by `empresa_id` and return at most 15 results. An empty string query MUST return an empty array. The query `'*'` MUST return the first 50 products.

### Requirement: Autocomplete Dropdown Component

The system MUST provide a `KardexProductoBuscador` component that displays matching suggestions as the user types. Each suggestion MUST show `codigo` (monospace) and `nombre`. Selecting a suggestion MUST set the search value and close the dropdown. Clicking outside the dropdown MUST close it. Pressing Escape MUST close the dropdown. No dropdown SHALL be shown for an empty input.

#### Scenario: SC-10 — Partial text search shows matches

- GIVEN the search input is focused
- WHEN the user types a partial string (e.g. "ado")
- THEN a dropdown appears with products whose `nombre` or `codigo` contains the string

#### Scenario: SC-11 — Wildcard returns first 50

- GIVEN the search input is focused
- WHEN the user types `*`
- THEN a dropdown appears with the first 50 products of the current company

#### Scenario: SC-12 — Selecting a suggestion closes dropdown

- GIVEN the autocomplete dropdown is open
- WHEN the user clicks a product suggestion
- THEN the search input shows the product name AND the dropdown closes

#### Scenario: SC-13 — Outside click closes dropdown

- GIVEN the autocomplete dropdown is open
- WHEN the user clicks anywhere outside the dropdown
- THEN the dropdown closes

#### Scenario: SC-14 — Empty input shows no dropdown

- GIVEN the search input is empty
- WHEN the component renders or the user clears the input
- THEN no dropdown is shown

---

## Capability: ajuste-masivo-flow

### Requirement: Count Table Flow Gate

On page load, the adjustment table MUST NOT be shown. The system MUST display a "Generar Planilla de Conteo" button. The button MUST be disabled until at least one department is selected. Clicking the button MUST set `tablaMostrada = true` and render the table. Changing the department or deposito selection MUST reset `tablaMostrada = false`, hiding the table. All existing table logic (editing, saving, bulk apply) MUST remain unchanged.

#### Scenario: SC-15 — Initial state hides table

- GIVEN the Ajuste Masivo page loads
- WHEN no department is selected
- THEN the count table is hidden AND the "Generar Planilla" button is visible but disabled

#### Scenario: SC-16 — Department selection enables button

- GIVEN the page is loaded and no department is selected
- WHEN the user selects a department
- THEN the "Generar Planilla de Conteo" button becomes enabled

#### Scenario: SC-17 — Button click reveals table

- GIVEN a department is selected and the button is enabled
- WHEN the user clicks "Generar Planilla de Conteo"
- THEN the count table appears with the selected department's products

#### Scenario: SC-18 — Scope change resets table

- GIVEN the count table is currently visible
- WHEN the user changes the department or deposito selection
- THEN the table hides AND the button becomes enabled for re-confirmation
