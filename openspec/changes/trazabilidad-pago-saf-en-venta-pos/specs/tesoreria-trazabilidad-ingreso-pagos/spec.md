# Delta for Trazabilidad Ingreso de Tesorería ↔ Pagos (Camino Directo)

> Extiende `crearVenta` (POS) al excedente SAF/FIFO (Paso 7c): esos `pagos` hoy no reciben fila puente, invisibles para preview y reverso. Fuera de alcance (sin cambios): supresión `isPosAllocation`, correlación de venta simple, métodos batch.

## ADDED Requirements

### Requirement: Excedente FIFO a factura(s) vieja(s) en venta POS

Cuando el Paso 7c aplica excedente vía FIFO a facturas viejas pendientes (`invoiceAssignments`), el sistema MUST insertar 1 fila puente por factura tocada, vinculada al `ingreso_id` del leg `pagoSaf`, con `monto_aplicado_usd` capeado al monto aplicado. Aditiva a la fila `correlacion` del leg de caja.

#### Scenario: Excedente cierra 1 factura vieja vía FIFO

- GIVEN una venta `deposito_directo=1` cuyo excedente cierra 1 factura vieja vía FIFO
- WHEN `crearVenta` confirma la venta
- THEN existe fila puente para el pago de caja Y para el pago FIFO, ambas contra el mismo `ingreso_id`
- AND el reverso detecta AMBAS facturas afectadas

#### Scenario: Excedente distribuido en múltiples facturas viejas

- GIVEN un excedente que cubre 3 facturas viejas por orden FIFO
- WHEN `crearVenta` confirma la venta
- THEN se crean 3 filas puente adicionales (una por `pagoId`), todas contra el mismo `ingreso_id`

### Requirement: Remanente/anticipo SAF — fila puente obligatoria

Cuando el excedente supera todas las pendientes y se promueve a anticipo (`pagoExcedenteIdSaf`, `venta_id=NULL`, ancla `saf_creditos_lotes`), el sistema MUST insertar 1 fila puente para ese pago. No es cosmético: el chequeo de seguridad SAF solo puede dispararse si el pago tiene fila puente.

#### Scenario: Excedente supera todas las pendientes genera anticipo bridgeado

- GIVEN un excedente que excede todas las facturas pendientes del cliente
- WHEN `crearVenta` promueve el remanente a anticipo
- THEN existe 1 fila puente para el pago de anticipo, vinculada al mismo `ingreso_id`

### Requirement: Atribución al leg correcto en pago mixto con excedente SAF

Con excedente SAF en pago mixto, el sistema MUST vincular TODAS las filas FIFO/anticipo al `movBancoId` del leg `pagoSaf` (`pagos.find(moneda==='BS') ?? pagos[0]`), nunca a otro leg. Legs `deposito_directo=0` MUST NOT generar movimiento ni fila puente (sin cambios).

#### Scenario: Pago mixto atribuye el excedente SAF al leg correcto

- GIVEN un leg en Bs (`deposito_directo=1`) y otro en efectivo, con excedente SAF financiado por el leg en Bs
- WHEN `crearVenta` confirma la venta
- THEN las filas FIFO/anticipo se crean contra el `ingreso_id` del leg en Bs
- AND el leg en efectivo no genera fila puente ni movimiento bancario

### Requirement: No regresión — sin doble conteo ni mutación de registros financieros

El wiring SAF MUST ser aditivo: MUST NOT alterar la fila `correlacion` de la venta simple, la supresión `isPosAllocation`, ni los `pagos`/`movimientos_cuenta` ya creados por el Paso 7c.

#### Scenario: Bridge simple y supresión de cuadre permanecen intactos

- GIVEN una venta POS con excedente SAF
- WHEN `crearVenta` se ejecuta en su única `writeTransaction`
- THEN la fila `correlacion` de caja no cambia, la supresión de cuadre sigue aplicando, y ningún `pago`/`movimiento_cuenta` existente se modifica

### Requirement: Reverso completo detecta y revierte TODAS las aplicaciones SAF bridgeadas

Con las filas puente adicionales, el preview MUST listar TODAS las facturas afectadas (caja + FIFO) y el reverso MUST revertir cada aplicación bridgeada (restaurar `saldo_pend_usd` o compensar el lote SAF), no solo detectarlas; y MUST bloquear si el crédito ya fue consumido.

#### Scenario: Preview y reverso cubren caja + FIFO

- GIVEN un ingreso con fila `correlacion` (caja) y filas FIFO/anticipo adicionales
- WHEN se previsualiza y confirma el reverso
- THEN se listan y revierten TODAS las facturas afectadas, restaurando `saldo_pend_usd` de cada una

#### Scenario: Reverso bloquea si el crédito del anticipo ya fue consumido

- GIVEN un anticipo bridgeado cuyo crédito SAF ya fue aplicado a otra factura
- WHEN se intenta revertir el movimiento que lo originó
- THEN el chequeo de seguridad SAF lo detecta vía la fila puente y bloquea el reverso
