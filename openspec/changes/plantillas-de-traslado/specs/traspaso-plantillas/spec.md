# Traspaso Plantillas Specification

## Purpose

Let users define and maintain reusable named sets of productos (no cantidades) for recurring stock transfers, so the traspaso form can be pre-filled instead of re-picking products every time.

## Requirements

### Requirement: Crear Plantilla

Creating a plantilla MUST require a non-empty `nombre` and at least one producto in its detail set. The header MUST be created with `is_active=1` and scoped to the current user's `empresa_id`.

#### Scenario: Plantilla creada correctamente

- GIVEN a user of empresa X on the "Plantillas" tab
- WHEN they submit nombre "Reposicion caja 1" with 3 productos selected
- THEN a `traspaso_plantillas` row is created with `empresa_id=X`, `is_active=1`
- AND 3 `traspaso_plantillas_det` rows are created referencing those productos

#### Scenario: Rechazo sin nombre

- WHEN the user submits the form with an empty `nombre`
- THEN the form is rejected and no rows are written

#### Scenario: Rechazo sin productos

- WHEN the user submits a `nombre` but selects zero productos
- THEN the form is rejected and no rows are written

### Requirement: Editar Plantilla

Editing a plantilla MUST allow changing `nombre`/`descripcion` and adding/removing productos from the detail set, restricted to plantillas belonging to the current user's `empresa_id`.

#### Scenario: Edicion de nombre y productos

- GIVEN plantilla P belongs to empresa X with 2 productos
- WHEN the user renames P and adds a 3rd producto
- THEN `traspaso_plantillas.nombre` is updated
- AND a new `traspaso_plantillas_det` row exists for the added producto

#### Scenario: Edicion bloqueada entre empresas

- GIVEN plantilla P belongs to empresa Y
- WHEN a user of empresa X attempts to load P for editing
- THEN P is not returned by any query and cannot be edited

### Requirement: Producto-Solo en Detalle

`traspaso_plantillas_det` MUST store only `producto_id` membership per plantilla, with no `cantidad` column. Quantities are always entered at traspaso-creation time, never stored on the template.

#### Scenario: Detalle sin cantidad

- GIVEN a plantilla with 3 productos
- WHEN its detail rows are inspected
- THEN each row has `producto_id` and no cantidad value is persisted anywhere on `traspaso_plantillas_det`

### Requirement: Desactivar Plantilla (Soft-Delete)

Deleting a plantilla MUST set `is_active=0` on the header via UPDATE. It MUST NOT hard-delete the row, and MUST NOT affect any previously created `traspasos_inventario` documents (templates and traspasos are decoupled).

#### Scenario: Desactivacion no borra el registro

- GIVEN an active plantilla P
- WHEN the user clicks "Desactivar"
- THEN `traspaso_plantillas.is_active` becomes `0`
- AND the row still exists in the database
- AND P no longer appears in the active plantillas list

#### Scenario: Traspasos existentes no afectados

- GIVEN plantilla P was used to pre-fill traspaso T last week
- WHEN P is later deactivated
- THEN traspaso T's stored lineas and kardex are unaffected

### Requirement: Aislamiento Multi-Tenant

Every list, create, edit, and deactivate operation on plantillas MUST filter by the current user's `empresa_id`. No plantilla or its productos MUST leak across empresas.

#### Scenario: Listado filtrado por empresa

- GIVEN empresa A and empresa B each have plantillas
- WHEN a user of empresa A opens the Plantillas tab
- THEN only empresa A's plantillas are listed

### Requirement: Estado Vacio sin Plantillas

The Plantillas tab MUST render a graceful empty state when the empresa has zero plantillas, instead of a broken or blank table.

#### Scenario: Empresa sin plantillas

- GIVEN empresa X has zero plantillas
- WHEN the Plantillas tab renders
- THEN an empty-state message is shown instead of an empty table
