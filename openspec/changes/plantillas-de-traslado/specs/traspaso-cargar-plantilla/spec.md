# Traspaso Cargar Plantilla Specification

## Purpose

Let users pull a saved plantilla into the traspaso form so its productos pre-fill the lineas grid, replacing manual re-picking, while quantities are still entered fresh and the set stays freely editable.

## Requirements

### Requirement: Reemplazo de Lineas al Cargar

Selecting a plantilla in the traspaso form MUST replace the current `lineas` array entirely with the plantilla's productos, each mapped to an empty `cantidad`. It MUST NOT append to or merge with existing lineas.

#### Scenario: Carga reemplaza lineas vacias

- GIVEN the traspaso form has only the default empty linea
- WHEN the user selects plantilla P with 3 productos
- THEN `lineas` is replaced with 3 rows, one per producto, each with `cantidad=''`

#### Scenario: Carga con datos existentes requiere confirmacion

- GIVEN the user has already filled 2 lineas with productos and cantidades
- WHEN the user selects a plantilla
- THEN a confirmation prompt MUST appear before replacing
- AND lineas are only replaced if the user confirms

### Requirement: Producto sin Stock en Origen no Desaparece

A plantilla producto with zero or no `inventario_stock` in the selected `depositoOrigenId` MUST still load into the lineas grid. It MUST NOT be silently filtered out at load time.

#### Scenario: Producto sin stock se carga igual

- GIVEN plantilla P includes producto X with zero stock in the selected deposito origen
- WHEN P is loaded into the traspaso form
- THEN producto X appears as a linea with `cantidad=''`

### Requirement: Filtro de Busqueda Ignorado, Feedback de Stock Aplicado

Loading a plantilla MUST bypass the ProductoBuscador search filter (productos load directly, not searched one by one). The existing cantidad-exceeds-stock feedback MUST still apply once the user enters a cantidad on a loaded linea.

#### Scenario: Feedback de stock tras cargar

- GIVEN producto X loaded from a plantilla with 0 units available in origen
- WHEN the user types a cantidad greater than 0 for that linea
- THEN the same stock-exceeded/zero-stock visual feedback used for manual lineas is shown

### Requirement: Aislamiento Multi-Tenant al Cargar

The "Cargar plantilla" selector MUST only list and load plantillas belonging to the current user's `empresa_id`. No cross-empresa plantilla or its productos MUST be selectable or loadable.

#### Scenario: Selector solo muestra plantillas propias

- GIVEN empresa A and empresa B each have active plantillas
- WHEN a user of empresa A opens the "Cargar plantilla" selector
- THEN only empresa A's plantillas appear as options

### Requirement: Productos Inactivos al Cargar

If a plantilla references a producto that has since become inactive (`is_active=0`), loading it MUST still show that producto in the resulting lineas but flagged as inactive, consistent with the repo's `productosActivos` filtering elsewhere.

#### Scenario: Producto inactivo flaggeado

- GIVEN plantilla P references producto X, later deactivated
- WHEN P is loaded into the traspaso form
- THEN producto X appears in lineas, visually flagged as inactive rather than silently dropped

### Requirement: Estado Vacio - Plantilla sin Productos Activos

If every producto in a plantilla is inactive, loading it MUST still populate lineas (all flagged inactive) rather than producing an empty or broken grid.

#### Scenario: Todos los productos de la plantilla estan inactivos

- GIVEN plantilla P has 2 productos, both now inactive
- WHEN P is loaded into the traspaso form
- THEN both lineas appear flagged as inactive, with no error or blank grid

### Requirement: Sin Cambios al Flujo de Escritura

Loading a plantilla MUST only pre-fill client-side `lineas` state. It MUST NOT alter `crearTraspaso` or any part of the existing traspaso write/kardex path.

#### Scenario: Escritura sin cambios

- GIVEN a traspaso form pre-filled from a plantilla with cantidades entered
- WHEN the user submits the traspaso
- THEN `crearTraspaso` executes exactly as for manually-entered lineas, no plantilla-specific write logic
