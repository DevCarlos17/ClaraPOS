# Trazabilidad Ingreso de Tesorería ↔ Pagos (Camino Directo) Specification

## Purpose

Hoy un `movimientos_bancarios` INGRESO `origen='TRANSFERENCIA_CLIENTE'` (abono directo, `deposito_directo=1`) no tiene FK formal hacia el/los `pago_id` que representa. Esta spec define la tabla puente `movimientos_bancarios_pagos` y el wiring aditivo en `aplicarPagoFacturaEnTx`/`registrarAbonoGlobal` que la pueblan, solo para el camino directo.

## Requirements

### Requirement: Tabla puente append-only e inmutable

El sistema MUST proveer `movimientos_bancarios_pagos` con `id`, `empresa_id`, `ingreso_id` (FK `movimientos_bancarios`), `pago_id` (FK `pagos`), `monto_aplicado_usd` (`NUMERIC(20,8)` servidor / `column.text` PowerSync, CHECK `> 0`), `created_at`, `created_by`. MUST ser insert-only: sin RLS UPDATE/DELETE, `insertOnly: true` en PowerSync; reintentos de PUT convergen via `ON CONFLICT DO NOTHING`.

#### Scenario: Fila puente nunca se edita ni se borra

- GIVEN una fila puente ya creada
- WHEN cualquier cliente intenta UPDATE o DELETE sobre ella
- THEN RLS lo rechaza (no hay policy de UPDATE/DELETE)

### Requirement: Caso simple — 1 pago, 1 fila puente

Cuando `aplicarPagoFacturaEnTx` crea un INGRESO directo, el sistema MUST insertar exactamente 1 fila puente vinculando ese `ingreso_id` con el `pago_id` de la misma transacción, `monto_aplicado_usd` = monto USD del pago.

#### Scenario: Pago de una factura por transferencia

- GIVEN una factura pagada por un método `deposito_directo=1`
- WHEN se confirma `aplicarPagoFacturaEnTx`
- THEN se crea 1 fila puente con `ingreso_id` real y `pago_id` de ese pago

### Requirement: Abono global FIFO — fan-in trazable

Cuando `registrarAbonoGlobal` distribuye un abono directo FIFO entre N facturas (N `pago_id`) y, si sobra monto, 1 `pago_id` de anticipo (promovido a SAFC), el sistema MUST insertar una fila puente por cada `pago_id` tocado, vinculada al mismo `ingreso_id`. La suma de `monto_aplicado_usd` MUST igualar el monto del INGRESO (tolerancia `$0.01`).

#### Scenario: Transferencia distribuida en 2 facturas sin excedente

- GIVEN un abono directo de $80 que cubre factura A ($30) y B ($50) exacto
- WHEN se confirma `registrarAbonoGlobal`
- THEN se crean 2 filas puente (una por `pago_id` FIFO) que suman $80

#### Scenario: Transferencia con excedente promovido a saldo a favor

- GIVEN un abono directo de $100: factura A ($30), B ($50), $20 de excedente
- WHEN se confirma `registrarAbonoGlobal`
- THEN se crean 3 filas puente — 2 FIFO ($30, $50) + 1 del `pago_id` anticipo ($20) — sumando $100

#### Scenario: Abono 100% excedente sin facturas pendientes

- GIVEN un cliente sin facturas pendientes que abona $50 directo
- WHEN se confirma `registrarAbonoGlobal`
- THEN se crea exactamente 1 fila puente, del `pago_id` anticipo, por $50

### Requirement: Exclusión de métodos batch/lote

Los pagos por métodos `deposito_directo=0` MUST NOT generar fila puente: ese camino no crea un INGRESO `TRANSFERENCIA_CLIENTE` en la misma transacción.

#### Scenario: Pago en efectivo o POS no crea fila puente

- GIVEN una factura pagada con un método `deposito_directo=0`
- WHEN se confirma el pago
- THEN no se inserta ninguna fila en `movimientos_bancarios_pagos`

### Requirement: Aislamiento multi-tenant

Toda fila puente MUST llevar el `empresa_id` del pago/ingreso que vincula. RLS SELECT/INSERT MUST filtrar via `current_empresa_id()`.

#### Scenario: Fila puente hereda empresa del abono

- GIVEN un abono directo de un cliente de la empresa A
- WHEN se crean las filas puente
- THEN todas tienen `empresa_id` = empresa A

### Requirement: Ingresos legacy sin bridge quedan no-reversables

Los INGRESO creados antes de esta migración MUST NOT tener filas puente (sin backfill) y MUST tratarse como no reversables desde tesorería.

#### Scenario: Ingreso pre-migración no tiene filas puente

- GIVEN un INGRESO directo creado antes de `migrations/0117`
- WHEN se consulta `movimientos_bancarios_pagos` por su `ingreso_id`
- THEN no se encuentra ninguna fila (legacy/no reversable)
