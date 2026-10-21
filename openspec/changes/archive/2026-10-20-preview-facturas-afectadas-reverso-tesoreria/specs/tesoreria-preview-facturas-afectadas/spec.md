# Preview de Facturas Afectadas por Reverso de Tesorería Specification

## Purpose

El modal `reverso-modal.tsx` reversa un INGRESO sin mostrar qué facturas afecta. Esta spec define un panel **read-only** que, dado el `ingreso_id`, resuelve las facturas alcanzables vía el puente `movimientos_bancarios_pagos` (capability `tesoreria-trazabilidad-ingreso-pagos`) — directas y vía SAF — antes del reverso.

**Fuera de alcance**: el reverso real (mutación), el modal de consulta de factura en emisión, el camino BATCH/LOTE, permisos nuevos.

## Requirements

### Requirement: Resolución de facturas directas vía el puente

El sistema MUST resolver, para un `ingreso_id`, las facturas directas vía `movimientos_bancarios_pagos.ingreso_id` → N `pago_id` → `pagos.venta_id` (no-NULL), con el `monto_aplicado_usd` por fila puente.

#### Scenario: Ingreso que paga una sola factura

- GIVEN un ingreso con 1 fila puente hacia 1 pago con `venta_id` no-NULL
- WHEN se computa el preview
- THEN se lista esa factura con su monto aplicado

#### Scenario: Abono global que paga varias facturas

- GIVEN el ingreso `38201beb` con 2 filas puente ($1 cada una) hacia `8954d635` y `ab7d1bab`
- WHEN se computa el preview
- THEN se listan ambas facturas, cada una con $1 aplicado

### Requirement: Resolución de facturas vía SAF

El sistema MUST, para cada `pago_id` del puente, invocar `detectarLoteSafDePago` y, si `generatedLote=true`, incluir sus `facturasAfectadas` etiquetadas "afectada por SAF", distintas de "afectada por pago directo".

#### Scenario: Excedente promovido a SAF y luego consumido

- GIVEN un abono con excedente que generó un lote SAF consumido en la factura D
- WHEN se computa el preview
- THEN la factura D aparece etiquetada "afectada por SAF" con su monto

### Requirement: Exclusión de pagos ya reversados

El sistema MUST excluir cualquier fila puente cuyo `pago_id` tenga `pagos.is_reversed = 1`.

#### Scenario: Pago ya reversado desde CxC no aparece

- GIVEN una fila puente cuyo pago tiene `is_reversed = 1`
- WHEN se computa el preview
- THEN esa factura NO se lista

### Requirement: Aplicabilidad del preview basada en el origen real

El sistema MUST determinar si el preview aplica solo con `movimiento.origen === 'TRANSFERENCIA_CLIENTE'`, sin depender de `doc_origen_tipo`. Para otro `origen`, el sistema MUST NOT renderizar el panel de facturas afectadas ni invocar el cómputo del preview, y MUST NOT sugerir que el ingreso es reversable-desde-tesorería vía este flujo.

#### Scenario: Ingreso de lote o consolidación de cierre

- GIVEN un ingreso con `origen` distinto de `TRANSFERENCIA_CLIENTE`
- WHEN se abre el modal de reverso
- THEN no se renderiza el panel de facturas afectadas (ausencia total, sin texto "no aplica")

### Requirement: Estado legacy para ingresos sin trazabilidad

El sistema MUST distinguir, para un ingreso `TRANSFERENCIA_CLIENTE` sin filas en `movimientos_bancarios_pagos`, un estado "sin trazabilidad / legacy" del estado "no afecta facturas" (0 resultados con trazabilidad confirmada).

#### Scenario: Ingreso directo anterior al puente

- GIVEN un ingreso `TRANSFERENCIA_CLIENTE` previo al puente, sin filas asociadas
- WHEN se computa el preview
- THEN el panel muestra "sin trazabilidad / legacy", no "0 facturas afectadas"

### Requirement: Solo lectura y aislamiento multi-tenant

El sistema MUST computar el preview vía lecturas locales únicamente, sin `db.writeTransaction` ni mutar `pagos`/`ventas`/`clientes`/`movimientos_bancarios`. Toda query MUST filtrar por `empresa_id` del usuario. El cómputo MUST ser un snapshot al abrir el modal, no una suscripción reactiva.

#### Scenario: Preview no muta ningún dato

- GIVEN el modal abierto sobre un ingreso válido
- WHEN se computa el preview
- THEN ningún registro cambia de estado

#### Scenario: Aislamiento por empresa

- GIVEN dos empresas con `pago_id` coincidentes por coincidencia
- WHEN se computa el preview para un ingreso de la empresa A
- THEN solo se devuelven filas con `empresa_id` de la empresa A

### Requirement: Consistencia del total mostrado

Para un ingreso `TRANSFERENCIA_CLIENTE` no-legacy, la suma de montos aplicados (directos + SAF) MUST igualar el monto del ingreso, tolerancia `$0.01`.

#### Scenario: El total del preview coincide con el monto del ingreso

- GIVEN el ingreso `38201beb` de $2 con 2 facturas de $1
- WHEN se computa el preview
- THEN la suma de montos aplicados es $2
