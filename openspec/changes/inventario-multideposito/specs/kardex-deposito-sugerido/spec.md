# Kardex Deposito Sugerido Specification

## Purpose

Manual kardex ingreso should default to the product's own deposito instead of an empty/principal-only fallback, while remaining fully user-overridable.

## Requirements

### Requirement: Deposito Sugerido en Ingreso Manual

The manual kardex ingreso form MUST pre-select the deposito field with the product's `productos.deposito_id` (fallback empresa principal). The suggestion MUST remain user-overridable before saving.

#### Scenario: Sugerencia por defecto

- GIVEN the user opens "Nuevo Movimiento" for a product with `deposito_id = A`
- WHEN the form loads
- THEN the deposito field is pre-selected to A

#### Scenario: Usuario sobrescribe la sugerencia

- GIVEN the pre-selected deposito is A
- WHEN the user manually selects deposito B before saving
- THEN the kardex entry is written to B, not A

#### Scenario: Registro por lote respeta sugerencia por producto

- GIVEN a batch entry with multiple products, each with a different `deposito_id`
- WHEN the form pre-fills each row
- THEN each row defaults independently to its own product's deposito
