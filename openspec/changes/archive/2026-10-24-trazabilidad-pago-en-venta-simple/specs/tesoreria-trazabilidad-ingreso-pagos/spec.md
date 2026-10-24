# Delta for Trazabilidad Ingreso de Tesorería ↔ Pagos (Camino Directo)

> Extiende el camino directo (hoy solo CxC) para cubrir también POS: pago directo al facturar en `crearVenta`. Fuera de alcance: capa SAF-overflow (ingresos quedan LEGACY, diferido) y bug `ventas.tipo` en reverso (diferido). Sin backfill de ingresos VENTA pre-existentes.

## MODIFIED Requirements

### Requirement: Caso simple — 1 pago, 1 fila puente

Cuando un camino directo (CxC vía `aplicarPagoFacturaEnTx`, o POS vía `crearVenta` con un método `deposito_directo=1`) crea un INGRESO bancario, el sistema MUST insertar exactamente 1 fila puente vinculando ese `ingreso_id` con el `pago_id` de la misma transacción, `monto_aplicado_usd` = monto USD real insertado en `pagos` (capeado, nunca el recalculado en pasos posteriores).
(Previously: solo cubría el camino CxC vía `aplicarPagoFacturaEnTx`)

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

### Requirement: Exclusión de métodos batch/lote

Los pagos por métodos `deposito_directo=0`, sin importar el camino (CxC o POS/`crearVenta`), MUST NOT generar fila puente: ese camino no crea un INGRESO `TRANSFERENCIA_CLIENTE` en la misma transacción.
(Previously: solo describía el camino CxC)

#### Scenario: Pago en efectivo o POS no crea fila puente (CxC)

- GIVEN una factura pagada con un método `deposito_directo=0`
- WHEN se confirma el pago
- THEN no se inserta ninguna fila en `movimientos_bancarios_pagos`

#### Scenario: Venta POS pagada íntegramente en efectivo

- GIVEN una venta pagada 100% con un método `deposito_directo=0` (efectivo)
- WHEN `crearVenta` confirma la venta
- THEN no se inserta ninguna fila en `movimientos_bancarios_pagos` (no existe ingreso bancario directo que vincular)

## ADDED Requirements

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
