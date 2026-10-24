# Trazabilidad Ingreso de Tesorería ↔ Pagos (Camino Directo) Specification

## Purpose

Un `movimientos_bancarios` INGRESO `origen='TRANSFERENCIA_CLIENTE'` (abono directo, `deposito_directo=1`) tiene FK formal hacia el/los `pago_id` que representa vía la tabla puente `movimientos_bancarios_pagos`. Esta spec define esa tabla y el wiring aditivo que la puebla en los tres caminos directos: `aplicarPagoFacturaEnTx` y `registrarAbonoGlobal` (CxC), y `crearVenta` (POS, pago al momento de facturar) — solo para el camino directo (`deposito_directo=1`).

## Requirements

### Requirement: Tabla puente append-only e inmutable

El sistema MUST proveer `movimientos_bancarios_pagos` con `id`, `empresa_id`, `ingreso_id` (FK `movimientos_bancarios`), `pago_id` (FK `pagos`), `monto_aplicado_usd` (`NUMERIC(20,8)` servidor / `column.text` PowerSync, CHECK `> 0`), `created_at`, `created_by`. MUST ser insert-only: sin RLS UPDATE/DELETE, `insertOnly: true` en PowerSync; reintentos de PUT convergen via `ON CONFLICT DO NOTHING`.

#### Scenario: Fila puente nunca se edita ni se borra

- GIVEN una fila puente ya creada
- WHEN cualquier cliente intenta UPDATE o DELETE sobre ella
- THEN RLS lo rechaza (no hay policy de UPDATE/DELETE)

### Requirement: Caso simple — 1 pago, 1 fila puente

Cuando un camino directo (CxC vía `aplicarPagoFacturaEnTx`, o POS vía `crearVenta` con un método `deposito_directo=1`) crea un INGRESO bancario, el sistema MUST insertar exactamente 1 fila puente vinculando ese `ingreso_id` con el `pago_id` de la misma transacción, `monto_aplicado_usd` = monto USD real insertado en `pagos` (capeado, nunca el recalculado en pasos posteriores).

#### Scenario: Pago de una factura por transferencia (CxC)

- GIVEN una factura pagada por un método `deposito_directo=1`
- WHEN se confirma `aplicarPagoFacturaEnTx`
- THEN se crea 1 fila puente con `ingreso_id` real y `pago_id` de ese pago

#### Scenario: Venta POS pagada íntegramente por transferencia

- GIVEN una venta de $150.00 pagada 100% con un método `deposito_directo=1` (transferencia)
- WHEN `crearVenta` confirma la venta
- THEN se crea exactamente 1 fila puente vinculando el ingreso `TRANSFERENCIA_CLIENTE` (`doc_origen_tipo='VENTA'`) con el `pago_id` de ese leg
- AND `monto_aplicado_usd` = 150.00 (el `pagoMontoUsd` capeado de Paso 5, no el `montoUsd` recalculado de Paso 8)

#### Scenario: Preview de facturas afectadas resuelve el origen VENTA

- GIVEN el bridge creado para la venta POS pagada por transferencia
- WHEN `previewFacturasAfectadas` se ejecuta sobre ese `ingreso_id`
- THEN resuelve la factura en estado `OK` (ya no `LEGACY`)

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

Los pagos por métodos `deposito_directo=0`, sin importar el camino (CxC o POS/`crearVenta`), MUST NOT generar fila puente: ese camino no crea un INGRESO `TRANSFERENCIA_CLIENTE` en la misma transacción.

#### Scenario: Pago en efectivo o POS no crea fila puente (CxC)

- GIVEN una factura pagada con un método `deposito_directo=0`
- WHEN se confirma el pago
- THEN no se inserta ninguna fila en `movimientos_bancarios_pagos`

#### Scenario: Venta POS pagada íntegramente en efectivo

- GIVEN una venta pagada 100% con un método `deposito_directo=0` (efectivo)
- WHEN `crearVenta` confirma la venta
- THEN no se inserta ninguna fila en `movimientos_bancarios_pagos` (no existe ingreso bancario directo que vincular)

### Requirement: Pago mixto en venta POS — filas puente independientes por leg directo

Cuando una venta POS se paga con N métodos (pago mixto), el sistema MUST insertar 1 fila puente por cada leg `deposito_directo=1`, vinculada a su propio `ingreso_id` y `pago_id` (1:1 por leg, sin fan-in), y MUST NOT insertar fila para legs `deposito_directo=0`. Cada fila hereda `empresa_id`, reutilizando la tabla puente append-only ya definida.

#### Scenario: Venta pagada parte transferencia, parte efectivo

- GIVEN una venta de $100.00: $60.00 por transferencia (`deposito_directo=1`) y $40.00 en efectivo (`deposito_directo=0`)
- WHEN `crearVenta` confirma la venta
- THEN se crea exactamente 1 fila puente para el leg de transferencia, con `monto_aplicado_usd` = 60.00, vinculada a su propio ingreso y pago
- AND no se crea ninguna fila puente para el leg de efectivo

### Requirement: No regresión en el flujo existente de `crearVenta`

El wiring del bridge MUST ser aditivo: MUST NOT alterar la creación de la venta, los `pagos`, `movimientos_bancarios`, el kardex ni los asientos contables ya existentes en `crearVenta`.

#### Scenario: `crearVenta` mantiene su comportamiento previo

- GIVEN cualquier venta POS (pago directo, mixto o 100% batch)
- WHEN `crearVenta` se ejecuta dentro de su única `writeTransaction`
- THEN los registros de venta, pagos, movimiento bancario, kardex y asientos contables se crean exactamente igual que antes del wiring
- AND solo se agregan filas puente adicionales cuando el leg es de método directo

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
