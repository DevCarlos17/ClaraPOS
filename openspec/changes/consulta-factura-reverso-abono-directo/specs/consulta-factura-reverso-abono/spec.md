# Consulta de Factura — Reverso de Abono Directo Specification

## Purpose

Reversar un abono puntual desde "Consulta de Factura" (4 sitios), eligiendo el pago exacto en vez de un grupo por método. Slice 1 cubre solo DIRECTOS (simples o fan-in global), reusando orquestadores de Tesorería. BATCH/SAF/LEGACY se bloquean con mensajes distintos. Fuera de alcance: batch real, guard de sesión cerrada, fan-in batch-global, SAF.

## Requirements

### Requirement: Listado individual y clasificación vía adapter pago_id → ingreso_id

El sistema MUST listar cada `pago` individualmente, no agrupado por método. Al seleccionar uno, MUST consultar `movimientos_bancarios_pagos WHERE pago_id=? AND empresa_id=?`: fila encontrada → DIRECTO (`ingreso_id`); sin fila y `deposito_directo=0` → BATCH; sin fila y `deposito_directo=1` → LEGACY.

#### Scenario: Abonos distintos quedan identificables

- GIVEN una factura con 2 pagos de métodos distintos
- WHEN el usuario abre Consulta de Factura
- THEN cada abono aparece como fila individual

#### Scenario: Pago directo resuelve ingreso_id

- GIVEN un pago con fila en el puente
- WHEN el usuario lo selecciona
- THEN se clasifica DIRECTO con su `ingreso_id`

### Requirement: Preview y confirmación de reverso directo

Para un abono DIRECTO, el sistema MUST mostrar el preview de facturas afectadas (`previewFacturasAfectadas`) antes de confirmar; al confirmar MUST invocar `reversarAbonoDirectoDesdeTesoreria` con el `ingreso_id`: egreso bancario + saldo banco + reapertura de cada factura + saldo cliente, en una sola transacción.

#### Scenario: Abono simple afecta solo esta factura

- GIVEN un pago directo cuyo ingreso liga a 1 solo pago
- WHEN el usuario confirma
- THEN se crea 1 egreso y la factura/cliente actualizan saldo

#### Scenario: Abono global reversa N facturas con 1 egreso

- GIVEN un pago directo cuyo ingreso liga a N pagos sobre N facturas (fan-in)
- WHEN el usuario confirma
- THEN se crea EXACTAMENTE 1 egreso por el total y las N facturas reabren con sus N pagos `is_reversed=1`

### Requirement: Tres estados deshabilitados distintos, sin conflar

El sistema MUST deshabilitar la confirmación con un mensaje DISTINTO por caso: BATCH → "reverso por lote no disponible todavía"; SAF → fan-in con lote SAF (`detectarLoteSafDePago`), mensaje de bloqueo existente; LEGACY → directo sin puente, mensaje de "sin trazabilidad".

#### Scenario: Abono BATCH deshabilitado

- GIVEN un abono clasificado BATCH
- WHEN el usuario lo selecciona
- THEN el botón está deshabilitado con el mensaje de lote

#### Scenario: Abono SAF deshabilitado tras resolver fan-in

- GIVEN un abono directo cuyo fan-in incluye un pago generador de lote SAF
- WHEN el usuario abre la confirmación
- THEN el botón está deshabilitado con el mensaje de bloqueo SAF

#### Scenario: Abono LEGACY deshabilitado

- GIVEN un abono clasificado LEGACY (directo sin puente)
- WHEN el usuario lo selecciona
- THEN el botón está deshabilitado con el mensaje de "sin trazabilidad"

### Requirement: Warning pasivo si la sesión está cerrada

Si la sesión del abono está CERRADA, el sistema SHALL mostrar un warning pasivo pero MUST permitir confirmar igual (warn-and-allow; guard duro en Slice 2).

#### Scenario: Sesión cerrada muestra warning y permite confirmar

- GIVEN un abono directo cuya sesión está CERRADA
- WHEN el usuario abre la confirmación
- THEN se muestra un warning y el botón de confirmar permanece habilitado

### Requirement: Reuso en los 4 sitios de entrada y aislamiento multi-tenant

El flujo MUST comportarse igual en los 4 puntos donde se abre `ConsultaFacturaModal` (Gestión de Clientes, Ventas → Consultas, Facturas Emitidas, "Reimprimir" desde Facturas Emitidas-Sesión Actual/POS). Toda lectura/escritura MUST filtrar por `empresa_id` actual.

#### Scenario: Mismo resultado sin importar el sitio de entrada

- GIVEN el mismo pago directo accedido desde cualquiera de los 4 sitios
- WHEN el usuario reversa el abono
- THEN el efecto es idéntico sin importar el sitio

#### Scenario: Aislamiento por empresa en la clasificación

- GIVEN dos empresas con `pago_id` potencialmente coincidente
- WHEN se resuelve la clasificación del pago
- THEN la consulta al puente filtra por `empresa_id` del usuario actual
