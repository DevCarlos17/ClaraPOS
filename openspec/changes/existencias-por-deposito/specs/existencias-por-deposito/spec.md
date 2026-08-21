# Existencias por Deposito Specification

## Purpose

Give operators a read-only product x deposito stock matrix so they can answer "cuanto tengo de X en cada deposito" directly from `inventario_stock`, without editing anything. Lives as a new default tab inside the existing Traspasos page.

## Requirements

### Requirement: Filas de Productos Almacenables

The matrix MUST show one row per producto with `tipo='P'` belonging to the current empresa. It MUST exclude `tipo='S'` (servicios, always stock 0) and `tipo='C'` (combos, no own stock).

#### Scenario: Matriz excluye servicios y combos

- GIVEN empresa X has productos of tipo `P`, `S`, and `C`
- WHEN the "Existencias por deposito" tab renders
- THEN only `tipo='P'` productos appear as rows
- AND `tipo='S'` and `tipo='C'` productos are excluded

### Requirement: Columnas de Depositos Activos Ordenadas

The matrix MUST render one column per active deposito (`activo=true`) of the current empresa, ordered with the `es_principal` deposito first, then the rest by `nombre` ascending.

#### Scenario: Orden de columnas

- GIVEN empresa X has 3 active depositos, one marked `es_principal`
- WHEN the matrix renders
- THEN the `es_principal` deposito is the first column
- AND remaining columns follow alphabetically by `nombre`

#### Scenario: Depositos inactivos excluidos

- GIVEN empresa X has an inactive deposito with residual stock
- WHEN the matrix renders
- THEN that deposito does not appear as a column

### Requirement: Valor de Celda con Semantica de Fila Ausente

For each producto/deposito cell, the matrix MUST show `cantidad_actual` formatted to 3 decimals when an `inventario_stock` row exists, and MUST show `'0.000'` when no such row exists, without dropping the producto from the matrix.

#### Scenario: Producto con stock registrado

- GIVEN producto P has an `inventario_stock` row for deposito D with `cantidad_actual='12.500'`
- WHEN the matrix renders
- THEN the cell (P, D) shows `'12.500'`

#### Scenario: Producto sin fila de stock en un deposito

- GIVEN producto P has no `inventario_stock` row for deposito D
- WHEN the matrix renders
- THEN the cell (P, D) shows `'0.000'`
- AND producto P still appears as a row in the matrix

### Requirement: Aislamiento Multi-Tenant

Every query backing the matrix MUST filter by `empresa_id` of the current user. The matrix MUST NOT show productos, depositos, or stock quantities belonging to another empresa.

#### Scenario: Sin fuga entre empresas

- GIVEN empresa A and empresa B each have productos, depositos, and stock
- WHEN a user of empresa A opens the matrix
- THEN only empresa A's productos, depositos, and quantities appear

### Requirement: Filtro de Busqueda por Nombre o Codigo

The view MUST provide a text search filter that narrows matrix rows by `nombre` or `codigo` (case-insensitive substring), matching `ProductoList` search behavior.

#### Scenario: Busqueda reduce filas

- GIVEN the matrix has 50 productos
- WHEN the user types a substring matching 3 productos' `nombre` or `codigo`
- THEN only those 3 rows remain visible

#### Scenario: Busqueda sin resultados

- GIVEN the user types a search term matching no producto
- WHEN the filter is applied
- THEN the matrix shows an empty-state message instead of rows

### Requirement: Pestanas sin Alterar el Historico de Traspasos

The Traspasos route MUST expose two tabs: "Existencias por deposito" as the default/primary tab, and "Historico de traspasos" as the secondary tab rendering the existing `TraspasoList` unchanged.

#### Scenario: Tab por defecto

- WHEN a user navigates to the Traspasos route
- THEN the "Existencias por deposito" tab is active by default

#### Scenario: Historico sin cambios de comportamiento

- WHEN the user switches to "Historico de traspasos"
- THEN `TraspasoList` renders with its existing create/list/detail behavior unaffected

### Requirement: Vista de Solo Lectura

The matrix view MUST NOT perform any insert, update, or delete against `inventario_stock`, `productos`, `depositos`, or `traspasos_inventario` tables.

#### Scenario: Sin mutaciones desde la matriz

- GIVEN the "Existencias por deposito" tab is open
- WHEN the user searches or scrolls the matrix
- THEN no `writeTransaction` or mutation is triggered by this view

### Requirement: Estados Vacios sin Depositos o sin Productos

The view MUST render a graceful empty state when the empresa has zero active depositos (no columns) or zero `tipo='P'` productos (no rows), instead of a broken or blank table.

#### Scenario: Empresa sin depositos activos

- GIVEN empresa X has no active depositos
- WHEN the matrix renders
- THEN an empty-state message is shown instead of a columnless table

#### Scenario: Empresa sin productos tipo P

- GIVEN empresa X has zero `tipo='P'` productos
- WHEN the matrix renders
- THEN an empty-state message is shown instead of a rowless table
