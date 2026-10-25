# Preview de Facturas Afectadas por Reverso de Tesorería Specification

## Purpose

El modal `reverso-modal.tsx` reversa un INGRESO sin mostrar qué facturas afecta. Esta spec define un panel **read-only** que, dado el `ingreso_id`, resuelve las facturas alcanzables vía el puente `movimientos_bancarios_pagos` (capability `tesoreria-trazabilidad-ingreso-pagos`) — directas y vía SAF — antes del reverso.

**Fuera de alcance**: el reverso real (mutación), el modal de consulta de factura en emisión, el camino BATCH/LOTE, permisos nuevos.

## Requirements

### Requirement: Resolución de facturas directas vía el puente

El sistema MUST resolver, para un `ingreso_id`, las facturas directas vía `movimientos_bancarios_pagos.ingreso_id` → `pago_id` → `pagos.venta_id` (no-NULL), con `monto_aplicado_usd` por fila. Cada entrada de `facturasDirectas` MUST incluir además `montoAplicadoNativo`, `monedaCodigo`, `metodoNombre` y `tasa`, vía JOIN `pagos`→`metodos_cobro`→`monedas`. `montoAplicadoNativo` MUST derivarse como `montoAplicadoUsd * tasa`; MUST NOT leerse de `pagos.monto` (monto completo del pago, no el aplicado a esta fila).

#### Scenario: Ingreso que paga una sola factura

- GIVEN un ingreso con 1 fila puente hacia 1 pago con `venta_id` no-NULL
- WHEN se computa el preview
- THEN se lista esa factura con su monto aplicado

#### Scenario: Abono global que paga varias facturas

- GIVEN el ingreso `38201beb` con 2 filas puente ($1 cada una) hacia `8954d635` y `ab7d1bab`
- WHEN se computa el preview
- THEN se listan ambas facturas, cada una con $1 aplicado

#### Scenario: Factura directa incluye moneda nativa y método

- GIVEN una fila con `montoAplicadoUsd=1`, `tasa=500`, método `'BANESCO PAGO MOVIL'`, moneda `'VES'`
- WHEN se computa el preview
- THEN la entrada incluye `montoAplicadoNativo=500`, `monedaCodigo='VES'`, `metodoNombre='BANESCO PAGO MOVIL'`, `tasa=500`

#### Scenario: Monto nativo se deriva de la fila puente, no del pago completo

- GIVEN un pago con `monto=1000` repartido en 2 filas de `monto_aplicado_usd=1` cada una, `tasa=500`
- WHEN se computa el preview para una fila
- THEN `montoAplicadoNativo` es `500` (= `1*500`), no `1000`

### Requirement: Resolución de facturas vía SAF

El sistema MUST, para cada `pago_id` del puente, invocar `detectarLoteSafDePago` y, si `generatedLote=true`, incluir sus `facturasAfectadas` etiquetadas "afectada por SAF", distintas de "afectada por pago directo". Cada entrada MUST incluir los mismos campos de `facturasDirectas` (`montoAplicadoNativo`, `monedaCodigo`, `metodoNombre`, `tasa`), tomados de la fila puente que originó el lote, enriquecidos en el spread del loop (`facturasSaf.push(...)`) — `detectarLoteSafDePago` MUST NOT modificarse (función pura, contrato compartido con `use-reverso-abono-directo.ts`).

#### Scenario: Excedente promovido a SAF y luego consumido, con moneda y método

- GIVEN un abono vía `pago_id` X con `tasa=500` y método `'BANESCO PAGO MOVIL'` que generó un lote SAF consumido en la factura D
- WHEN se computa el preview
- THEN la factura D aparece en `facturasSaf` con `montoAplicadoNativo`, `monedaCodigo='VES'`, `metodoNombre='BANESCO PAGO MOVIL'`, tomados de la fila puente de X

#### Scenario: `detectarLoteSafDePago` permanece sin cambios

- GIVEN la función pura `detectarLoteSafDePago`
- WHEN se enriquece `facturasSaf`
- THEN el enriquecimiento ocurre solo en el spread del loop, sin modificar `detectarLoteSafDePago`

### Requirement: Los nuevos JOINs de moneda/método no rompen el aislamiento multi-tenant

Los JOINs agregados a `metodos_cobro`/`monedas` MUST unirse por las FKs de `pagos` (`metodo_cobro_id`, `moneda_id`), nunca por `empresa_id` propio de esas tablas catálogo. El filtro `mbp.empresa_id = ?` sobre la fila puente MUST seguir siendo la única frontera de aislamiento. El enriquecimiento MUST ser de solo lectura (SELECT + JOIN), sin escrituras nuevas.

#### Scenario: Los nuevos JOINs no filtran datos de otra empresa

- GIVEN catálogos globales `metodos_cobro`/`monedas` compartidos entre empresas
- WHEN se computa el preview para un ingreso de la empresa A
- THEN solo se devuelven filas cuya fila puente tiene `empresa_id` de la empresa A

#### Scenario: El enriquecimiento no introduce mutaciones

- GIVEN el preview enriquecido
- WHEN se computa
- THEN no se ejecuta ningún `db.writeTransaction` ni escritura adicional

### Requirement: Renderizado dual-moneda y método de pago en el panel

El panel (`reverso-modal.tsx`) MUST renderizar cada factura (directa o SAF) con el monto vía `formatMontoPago` (de `factura-export.ts`) y el `metodoNombre` del pago.

#### Scenario: Panel muestra monto dual-moneda y método, en directas y en SAF por igual

- GIVEN una entrada (de `facturasDirectas` o `facturasSaf`) con `montoAplicadoUsd=1`, `montoAplicadoNativo=500`, `monedaCodigo='VES'`, `metodoNombre='BANESCO PAGO MOVIL'`
- WHEN se renderiza el panel
- THEN se muestra `"$1.00 (Bs. 500,00)"` junto a `"BANESCO PAGO MOVIL"`, con el mismo formato en ambos arreglos

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

### Requirement: Acción de reverso expuesta y gateada por presencia de SAF

El panel de facturas afectadas MUST exponer una acción de reverso habilitada SOLO cuando `facturasSaf` esté vacío para el ingreso previsualizado. Cuando `facturasSaf` no esté vacío, el panel MUST deshabilitar la acción y mostrar el mensaje de bloqueo SAF.

#### Scenario: Sin SAF — acción habilitada

- GIVEN un preview con `facturasSaf: []` y `facturasDirectas` no vacío
- WHEN se renderiza el panel
- THEN la acción de reverso está habilitada

#### Scenario: Con SAF — acción deshabilitada con mensaje

- GIVEN un preview con `facturasSaf` no vacío
- WHEN se renderiza el panel
- THEN la acción de reverso está deshabilitada y se muestra "Este abono generó saldo a favor consumido en otras facturas; reversar desde tesorería no está disponible todavía"
