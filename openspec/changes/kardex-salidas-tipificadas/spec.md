# Kardex Salidas Tipificadas — Specification

## Purpose

Add typed-exit classification (MERMA, EXTRAVIO, CONSUMO_INTERNO) to manual inventory exits. Auto-populate cost fields from current product cost and exchange rate, atomically generate a `gasto` record, and link it back to the originating movement via `doc_origen_id / doc_origen_tipo`.

---

## Requirements

### Requirement: DB Schema — New Columns

`movimientos_inventario` MUST add nullable `tipo_salida TEXT`. Valid values: `MERMA`, `EXTRAVIO`, `CONSUMO_INTERNO`, or `null` (non-manual movements). `gastos` MUST add nullable `doc_origen_id TEXT` and `doc_origen_tipo TEXT`. Existing records SHALL remain unaffected (columns default to null).

### Requirement: Typed Exit Selector — Manual Form

The movimiento form MUST display a typed-exit selector (labels: "Merma", "Extravío", "Consumo Interno") when `tipo_movimiento = 'SALIDA'`. The selector MUST NOT appear for `ENTRADA` movements. Submission MUST be blocked with a validation error if no type is selected for a salida.

#### Scenario: SC-01 — Manual exit MERMA creates movement and gasto

- GIVEN a product with `costo_usd` and an active exchange rate exist
- WHEN user submits movimiento form with `tipo=SALIDA`, `tipo_salida=MERMA`, and `cantidad`
- THEN a `movimientos_inventario` row is created with `tipo_salida='MERMA'`, `costo_unitario=producto.costo_usd`, `tasa_cambio=tasa_vigente`
- AND a `gasto` row is created with `monto_usd = cantidad × costo_unitario`, `concepto = "Salida por MERMA: {producto_nombre}"`, `doc_origen_id = movimiento.id`, `doc_origen_tipo = 'MOVIMIENTO_INVENTARIO'`

#### Scenario: SC-02 — Manual exit EXTRAVIO creates gasto with correct concepto

- GIVEN user selects `tipo_salida=EXTRAVIO`
- WHEN form is submitted
- THEN gasto `concepto = "Salida por EXTRAVIO: {producto_nombre}"` and `doc_origen_tipo = 'MOVIMIENTO_INVENTARIO'`

#### Scenario: SC-03 — Manual exit CONSUMO_INTERNO creates gasto

- GIVEN user selects `tipo_salida=CONSUMO_INTERNO`
- WHEN form is submitted
- THEN gasto `concepto = "Salida por CONSUMO_INTERNO: {producto_nombre}"` and amounts are correctly populated

#### Scenario: SC-04 — Salida without tipo_salida is blocked

- GIVEN user opens movimiento form with `tipo=SALIDA`
- WHEN submitted without selecting a `tipo_salida`
- THEN submission is blocked and a validation error is shown to the user

#### Scenario: SC-05 — ENTRADA movement shows no typed-exit selector

- GIVEN user opens movimiento form with `tipo=ENTRADA`
- WHEN the form renders
- THEN the typed-exit selector is NOT visible
- AND no gasto is generated upon successful submission

### Requirement: Cost Auto-Population

When a typed exit is selected, the system MUST populate `costo_unitario` from `producto.costo_usd`, `tasa_cambio` from the current active exchange rate, `total_usd = cantidad × costo_unitario` (2 decimal places), and `total_bs = total_usd × tasa_cambio` (2 decimal places). Computed totals MUST be shown before the user confirms.

### Requirement: Atomic Write — Kardex + Gasto

The `movimientos_inventario` insert and its `gasto` insert MUST execute within a single `db.writeTransaction`. If either operation fails, the full transaction MUST be rolled back — no orphan records of either type.

#### Scenario: SC-07 — Gasto failure rolls back entire transaction

- GIVEN a user submits a valid typed exit
- WHEN the gasto insert fails mid-transaction
- THEN the entire transaction is rolled back
- AND no `movimientos_inventario` row is persisted

### Requirement: Bulk Adjustment — Cost Bug Fix

`aplicarAjuste` MUST read `costo_usd` from `productos` when `costo_unitario` is null and `afecta_costo = 1`. Generated gastos for bulk adjustments MUST use `doc_origen_tipo = 'AJUSTE_INVENTARIO'`.

#### Scenario: SC-06 — Bulk adjustment generates gasto with real unit cost

- GIVEN an ajuste masivo with typed exits for products with existing `costo_usd`
- WHEN `aplicarAjuste` is executed
- THEN each line generates a gasto with `monto_usd = cantidad × producto.costo_usd` (not $0)
- AND `doc_origen_tipo = 'AJUSTE_INVENTARIO'`

### Requirement: Gasto Visibility

Generated gastos MUST be queryable in the gastos module filtered by `empresa_id`.

#### Scenario: SC-08 — Generated gasto appears in gastos module

- GIVEN a typed exit has been completed for empresa X
- WHEN the gastos module is queried for empresa X
- THEN the generated gasto appears with `doc_origen_id` pointing to the originating movement
