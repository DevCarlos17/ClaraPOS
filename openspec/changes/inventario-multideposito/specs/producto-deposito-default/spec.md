# Producto Deposito Default Specification

## Purpose

A product needs a persistent, editable default deposito that drives where its stock-in lands (initial stock, compras, kardex ingreso) when no other context (caja, purchase line) overrides it.

## Requirements

### Requirement: Persistencia del Deposito por Defecto

`productos.deposito_id` MUST be persisted (nullable) as the product's default deposito. The product-form MUST save this field on create AND MUST make it editable when editing an existing product (today it is create-only, one-shot local state).

#### Scenario: Crear producto con deposito default

- GIVEN a new product form with "Almacen Principal" selected in the Inventario tab
- WHEN the user submits create
- THEN `productos.deposito_id` is persisted with that deposito's id
- AND the initial-stock kardex entry uses the same deposito

#### Scenario: Editar deposito default de producto existente

- GIVEN an existing product with `deposito_id = A`
- WHEN the user opens edit, changes the deposito field to B, and saves
- THEN `productos.deposito_id` is updated to B
- AND existing stock already in A is NOT retroactively moved

### Requirement: Fallback a Deposito Principal

When `productos.deposito_id` is NULL (unmigrated or never set), consuming flows (compras, kardex ingreso) MUST fall back to the empresa's `es_principal = 1` deposito.

#### Scenario: Producto con deposito null

- GIVEN a product with `deposito_id = NULL`
- WHEN a purchase line or kardex ingreso resolves its default deposito
- THEN the empresa's principal deposito is used
- AND no error is raised to the user

### Requirement: Migracion en Lockstep

`productos.deposito_id` MUST exist simultaneously in the SQL migration, `schema.ts`, `kysely/types.ts`, and PowerSync sync rules before any code path reads or writes it.

#### Scenario: Lockstep verificado antes de mergear

- GIVEN a PR introduces `productos.deposito_id`
- WHEN the PR is reviewed
- THEN the diff includes `migrations/`, `schema.ts`, `kysely/types.ts`, and sync rules changes together
