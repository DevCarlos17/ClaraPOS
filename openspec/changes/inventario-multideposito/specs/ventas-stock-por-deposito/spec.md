# Ventas Stock Por Deposito Specification

## Purpose

Sales must discount stock from the deposito actually tied to the active caja, and every stock-availability check (article select, quantity guard, local re-check, server re-check) must be scoped to that same deposito instead of the empresa-wide denormalized `productos.stock`. This is the highest-risk capability in the change (financial-critical, 4 call sites + 1 Edge Function).

## Requirements

### Requirement: Egreso de Venta desde el Deposito de la Caja

Sale stock-out MUST resolve the deposito from the active caja (`sesion_caja_id → cajas.deposito_id`). It MUST NOT use the empresa-wide principal fallback when a caja/deposito context is available.

#### Scenario: Venta descuenta del deposito de la caja

- GIVEN an open sesion_caja on caja C1 (`deposito_id = A`)
- WHEN a sale is confirmed
- THEN the kardex salida and `inventario_stock` decrement occur for deposito A

#### Scenario: Venta sin sesion de caja activa

- GIVEN no active sesion_caja/caja context exists
- WHEN a sale is confirmed
- THEN the sale falls back to the empresa's principal deposito (documented fallback, mirrors the existing factura-numbering fallback)

### Requirement: Validacion de Stock Escopeada por Deposito

Article-select filtering, quantity-guard highlighting, the local `writeTransaction` re-check, and the `validar-stock` Edge Function MUST all read per-`(producto, deposito)` quantity from `inventario_stock` scoped to the caja's deposito. None of the 4 call sites may read the denormalized `productos.stock` for availability decisions.

#### Scenario: Producto sin stock en el deposito de la caja queda oculto/bloqueado

- GIVEN product P has `inventario_stock = 0` in deposito B (the caja's deposito) but `> 0` in deposito A
- WHEN the POS article select/search renders for a caja whose deposito is B
- THEN P is excluded from selectable results (services with `tipo = 'S'` remain exempt from this filter)

#### Scenario: Cantidad excede stock del deposito

- GIVEN product P has 3 units available in the caja's deposito
- WHEN the user adds 5 units to the cart line
- THEN the line is highlighted red (`stockDisponible < 0`) and checkout is blocked unless the user holds `PERMISSIONS.SALES_OVERRIDE_STOCK`

#### Scenario: Re-chequeo local en la transaccion rechaza stock insuficiente

- GIVEN a stale client-side stock snapshot
- WHEN `crearVenta`'s `writeTransaction` re-reads `inventario_stock` fresh for the caja's deposito and finds insufficient quantity
- THEN the transaction throws and no venta/kardex row is committed

#### Scenario: Edge Function valida por deposito en el servidor

- GIVEN a checkout request that includes the caja's `deposito_id`
- WHEN `validar-stock` queries per-deposit stock in Postgres and finds it insufficient
- THEN it returns HTTP 409 and the client blocks `crearVenta`
