# Inventario Stock Autoritativo Specification

## Purpose

`inventario_stock` is currently written once at product creation and never maintained afterward. This capability makes it the real, authoritative per-deposit stock counter, kept in sync transactionally by every stock-mutating write path, with `movimientos_inventario` (kardex) remaining the immutable historical source of truth and a recalculation repair function as a safety net.

## Requirements

### Requirement: Fuente Unica de Verdad por Deposito

`inventario_stock.cantidad_actual` MUST be the authoritative per-`(empresa, producto, deposito)` stock counter, updated atomically alongside every `movimientos_inventario` insert across ALL write paths: ventas, compras, kardex, ajustes, traspasos.

#### Scenario: Cada ruta de escritura actualiza inventario_stock atomicamente

- GIVEN any of the five write paths inserts a kardex row
- WHEN the insert commits
- THEN `inventario_stock.cantidad_actual` for that `(producto, deposito)` is updated in the SAME `writeTransaction`
- AND `productos.stock` (denormalized cross-deposit total) is updated too

### Requirement: productos.stock como Total Desnormalizado

`productos.stock` MUST represent the sum across all depositos for that producto and MUST stay in sync transactionally whenever any deposito's `inventario_stock` changes.

#### Scenario: Suma cruzada de depositos coincide

- GIVEN a product with stock 10 in deposito A and 5 in deposito B
- WHEN `productos.stock` is read
- THEN it equals 15

### Requirement: Kardex Inmutable como Fuente de Verdad Historica

`movimientos_inventario` rows MUST NEVER be updated or deleted (enforced by existing `trg_kardex_no_update`/`trg_kardex_no_delete` triggers). `inventario_stock` is a maintained PROJECTION over kardex, never an independent source.

#### Scenario: Funcion de recalculo reconstruye desde kardex

- GIVEN `inventario_stock` is suspected stale/drifted for an empresa
- WHEN "recalcular desde kardex" is invoked
- THEN `inventario_stock.cantidad_actual` for every `(producto, deposito)` is recomputed as `SUM(entradas) - SUM(salidas)` from `movimientos_inventario` and persisted, matching kardex exactly

### Requirement: No Stock Negativo por Deposito

Stock-out writes MUST NOT leave `inventario_stock.cantidad_actual` negative for the affected `(producto, deposito)`. This replaces the prior empresa-wide non-negative check.

#### Scenario: Guard per-deposito bloquea salida excesiva

- GIVEN deposito A has 2 units of producto P
- WHEN a stock-out of 3 units is attempted against deposito A
- THEN the write is rejected before commit

### Requirement: Precision Decimal

Quantity fields (`cantidad_actual`, `movimientos_inventario.cantidad`, stock deltas) MUST use decimal-safe arithmetic (`decimal.js`), 3-decimal precision, NEVER floating-point.

#### Scenario: Suma de decimales sin error de redondeo

- GIVEN two kardex entries of 0.125 and 0.125 units
- WHEN `inventario_stock` is updated
- THEN the result is exactly 0.250, not a float-rounding artifact

### Requirement: Aislamiento Multi-Tenant

Every `inventario_stock` and `movimientos_inventario` read/write MUST filter by the current user's `empresa_id`. Cross-empresa stock MUST NEVER be visible or mutable.

#### Scenario: Filtro empresa_id en toda escritura

- GIVEN a user of empresa E1
- WHEN any deposito-scoped stock write executes
- THEN the WHERE/INSERT includes `empresa_id = E1` and no row for another empresa is read or touched
