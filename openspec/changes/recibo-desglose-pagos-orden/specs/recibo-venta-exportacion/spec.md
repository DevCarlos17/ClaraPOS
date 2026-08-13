# Delta for Recibo Venta Exportación

## ADDED Requirements

### Requirement: Orden de secciones del recibo

El recibo (PDF y PNG) MUST renderizar secciones en este orden: (1) emisor, (2) nro + fecha, (3) cliente, (4) artículos, (5) totales, (6) desglose de pagos.

#### Scenario: Recibo completo respeta el orden

- GIVEN un recibo con todas las secciones presentes
- WHEN se renderiza en PDF o PNG
- THEN las secciones siguen ese orden exacto

### Requirement: Desglose de métodos de pago con reconciliación

El sistema MUST agrupar `pagos` por `metodo_cobro_id`, sumando montos del mismo método en una línea. Métodos USD MUST mostrar $ y su equivalente Bs (`monto_usd × tasa`); métodos Bs MUST mostrar solo Bs. La suma de líneas en Bs MUST reconciliar con el total de factura en Bs (tolerancia de redondeo Decimal).

#### Scenario: Dos pagos del mismo método se consolidan

- GIVEN 2 pagos de Pago Móvil Mercantil de Bs 100 cada uno
- WHEN se genera el desglose
- THEN aparece una sola línea "Pago Móvil Mercantil — Bs 200"

#### Scenario: Método USD con equivalente en Bs

- GIVEN un pago de Efectivo Dólares de $1 con tasa 500
- WHEN se genera el desglose
- THEN la línea muestra "$1 (Bs 500)"

#### Scenario: Método Bs sin equivalente

- GIVEN un pago de Punto de Venta Banesco de Bs 300
- WHEN se genera el desglose
- THEN la línea muestra solo "Bs 300"

#### Scenario: Reconciliación con el total de factura

- GIVEN factura Bs 1000 ($2) pagada con Pago Móvil Bs 200, Efectivo Dólares $1 (Bs 500) y PDV Banesco Bs 300
- WHEN se suman las líneas de pago en Bs
- THEN el total (Bs 1000) reconcilia con el total de factura en Bs

### Requirement: Cierre por manejo de excedente

Si la venta tuvo excedente (`discrepancyMode`), el recibo MUST mostrar una línea de cierre tras el desglose de pagos, en Bs y $: VUELTO indica el vuelto entregado; SAF indica "Saldo a favor del cliente: Bs X ($ Y)"; PROPINA indica "Propina: Bs X ($ Y)"; DIFERENCIAL_SOBRANTE usa texto distintivo propio.

#### Scenario: Vuelto entregado

- GIVEN `discrepancyMode = VUELTO`
- WHEN se genera el recibo
- THEN se muestra el vuelto entregado

#### Scenario: Saldo a favor

- GIVEN `discrepancyMode = SAF`
- WHEN se genera el recibo
- THEN se muestra "Saldo a favor del cliente: Bs X ($ Y)"

#### Scenario: Propina

- GIVEN `discrepancyMode = PROPINA`
- WHEN se genera el recibo
- THEN se muestra "Propina: Bs X ($ Y)"

#### Scenario: Diferencial sobrante

- GIVEN `discrepancyMode = DIFERENCIAL_SOBRANTE`
- WHEN se genera el recibo
- THEN se muestra el texto distintivo de este modo

### Requirement: Cierre por saldo a crédito

Si la venta es CREDITO y `saldo_pend_usd > 0`, el recibo MUST mostrar como última línea "Quedó a crédito: Bs X ($ Y)", con Bs = `saldo_pend_usd × ventas.tasa`.

#### Scenario: Pago parcial deja remanente a crédito

- GIVEN una venta CREDITO con pago parcial y `saldo_pend_usd > 0`
- WHEN se genera el recibo
- THEN la última línea muestra "Quedó a crédito: Bs X ($ Y)"

### Requirement: Ajuste de layout para texto largo

Dirección, razón social y usuario del emisor MUST ajustarse (wrap o truncado) al ancho del documento en PDF y PNG, sin desbordar.

#### Scenario: Dirección larga no desborda

- GIVEN una dirección de empresa muy larga
- WHEN se genera el recibo en PDF o PNG
- THEN el texto se ajusta en varias líneas o se trunca

### Requirement: Renderizado sin mutación de datos

Generar el recibo MUST NOT mutar ningún valor en `pagos`, `movimientos_metodo_cobro`, `movimientos_cuenta` ni `ventas`.

#### Scenario: Generación no altera datos persistidos

- GIVEN una venta con pagos, excedente o crédito persistidos
- WHEN se genera el recibo múltiples veces
- THEN los valores de origen no cambian
