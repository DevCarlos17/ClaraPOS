# Delta for Tesorería — Preview de Facturas Afectadas por Reverso

## ADDED Requirements

### Requirement: Renderizado dual-moneda y método de pago en el panel

El panel (`reverso-modal.tsx`) MUST renderizar cada factura (directa o SAF) con el monto vía `formatMontoPago` (de `factura-export.ts`) y el `metodoNombre` del pago.

#### Scenario: Panel muestra monto dual-moneda y método, en directas y en SAF por igual

- GIVEN una entrada (de `facturasDirectas` o `facturasSaf`) con `montoAplicadoUsd=1`, `montoAplicadoNativo=500`, `monedaCodigo='VES'`, `metodoNombre='BANESCO PAGO MOVIL'`
- WHEN se renderiza el panel
- THEN se muestra `"$1.00 (Bs. 500,00)"` junto a `"BANESCO PAGO MOVIL"`, con el mismo formato en ambos arreglos

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

## MODIFIED Requirements

### Requirement: Resolución de facturas directas vía el puente

El sistema MUST resolver, para un `ingreso_id`, las facturas directas vía `movimientos_bancarios_pagos.ingreso_id` → `pago_id` → `pagos.venta_id` (no-NULL), con `monto_aplicado_usd` por fila. Cada entrada de `facturasDirectas` MUST incluir además `montoAplicadoNativo`, `monedaCodigo`, `metodoNombre` y `tasa`, vía JOIN `pagos`→`metodos_cobro`→`monedas`. `montoAplicadoNativo` MUST derivarse como `montoAplicadoUsd * tasa`; MUST NOT leerse de `pagos.monto` (monto completo del pago, no el aplicado a esta fila).

(Previously: solo `ventaId`/`nroFactura`/`montoAplicadoUsd`.)

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

El sistema MUST, para cada `pago_id` del puente, invocar `detectarLoteSafDePago` y, si `generatedLote=true`, incluir sus `facturasAfectadas` etiquetadas "afectada por SAF". Cada entrada MUST incluir los mismos campos de `facturasDirectas` (`montoAplicadoNativo`, `monedaCodigo`, `metodoNombre`, `tasa`), tomados de la fila puente que originó el lote, enriquecidos en el spread del loop (`facturasSaf.push(...)`) — `detectarLoteSafDePago` MUST NOT modificarse (función pura, contrato compartido con `use-reverso-abono-directo.ts`).

(Previously: sin campos de moneda/método.)

#### Scenario: Excedente promovido a SAF y luego consumido, con moneda y método

- GIVEN un abono vía `pago_id` X con `tasa=500` y método `'BANESCO PAGO MOVIL'` que generó un lote SAF consumido en la factura D
- WHEN se computa el preview
- THEN la factura D aparece en `facturasSaf` con `montoAplicadoNativo`, `monedaCodigo='VES'`, `metodoNombre='BANESCO PAGO MOVIL'`, tomados de la fila puente de X

#### Scenario: `detectarLoteSafDePago` permanece sin cambios

- GIVEN la función pura `detectarLoteSafDePago`
- WHEN se enriquece `facturasSaf`
- THEN el enriquecimiento ocurre solo en el spread del loop, sin modificar `detectarLoteSafDePago`
</content>
