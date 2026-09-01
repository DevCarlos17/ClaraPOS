# Recibo Venta Exportación Specification

## Purpose

Define the export behavior of the sales receipt (`venta-exitosa-modal.tsx` → `factura-export.ts`),
rendered across three paths (PDF, PNG, plain text) via the shared `buildReciboData` /
`construirFilasTotales` pipeline.

> **Capability coordination note**: `recibo-venta-exportacion` has multiple active (not yet
> archived) sibling changes contributing to it: `recibo-igtf-orden-abono-factura` (owns the fiscal
> totals ordering + SAF invoice-reference requirements), `recibo-desglose-pagos-orden` (owns the
> "Cierre por manejo de excedente" requirement), `recibo-ancho-termico-58mm`, and
> `factura-descarga-compartir`. This spec file currently reflects ONLY the requirements delivered
> by `recibo-moneda-presentacion` (archived 2026-08-15). When each sibling change is archived, its
> ADDED/MODIFIED requirements MUST be merged in additively — never overwriting the requirements
> below.

## Requirements

### Requirement: Configuración de moneda de presentación por empresa

El sistema MUST permitir configurar `moneda_presentacion_documentos` ('USD' | 'BS') por empresa
en `empresas.config` (JSON). Ausente o inválido MUST comportarse como 'USD'.

#### Scenario: Config 'BS' vs ausente/inválida

- GIVEN `empresas.config.moneda_presentacion_documentos = 'BS'`
- WHEN se genera el recibo
- THEN los montos primarios se muestran en Bs
- AND si el campo está ausente o tiene un valor distinto de 'USD'/'BS', se muestran en USD (default)

### Requirement: Ambas monedas siempre visibles en montos del recibo

El sistema MUST mostrar USD y Bs simultáneamente en TODO monto del recibo: precio unitario y
total de cada línea de artículo, Monto Exento, Base Imponible, IVA por alícuota, TOTAL FACTURA
(pre-IGTF) e IGTF. Esto NO altera el orden de las filas de totales.

#### Scenario: Línea de artículo y filas de totales muestran ambas monedas

- GIVEN una venta con tasa 500, línea de $10.00, Monto Exento, Base Imponible, IVA 16% e IGTF
- WHEN se genera el recibo (PDF y texto/PNG)
- THEN la línea de artículo y cada fila de totales muestran su monto en USD y en Bs, con los
  mismos valores en ambas rutas

### Requirement: Moneda primaria y contraparte en montos del recibo

Con `'BS'`, el sistema MUST mostrar Bs primario y USD entre paréntesis (`Bs. X,XX ($Y.YY)`) en
artículos y totales intermedios. Con `'USD'` (o ausente), MUST mostrar USD primario y Bs entre
paréntesis (`$Y.YY (Bs. X,XX)`).

#### Scenario: Bs primero en 'BS', USD primero en default — misma línea, ambas direcciones

- GIVEN una línea de $10.00 con tasa 500
- WHEN `moneda_presentacion_documentos = 'BS'`
- THEN muestra "Bs. 5.000,00 ($10.00)"
- AND WHEN ausente (default 'USD'), muestra "$10.00 (Bs. 5.000,00)"

### Requirement: Seam tipado de moneda de presentación

El sistema MUST modelar la moneda de presentación como tipo `MonedaPresentacion = 'USD' | 'BS'`
inyectado en `BuildReciboDataInput`, no como booleano hardcodeado.

#### Scenario: Builder recibe el tipo explícito

- GIVEN un `BuildReciboDataInput` con `monedaPresentacion: 'BS'`
- WHEN se invoca `buildReciboData`
- THEN el resultado refleja Bs como primaria vía la tabla de mapeo, sin lógica ad-hoc

### Requirement: Desglose de métodos de pago con reconciliación

El sistema MUST agrupar `pagos` por `metodo_cobro_id`, sumando montos del mismo método en una
línea. Todo método MUST mostrar su monto nativo como primario y el equivalente de la otra
moneda entre paréntesis (`monto_usd × tasa` para Bs, `monto_bs / tasa` para USD), independiente
del toggle del recibo (`moneda_presentacion_documentos`). La suma en Bs MUST reconciliar con el
total de factura en Bs.

#### Scenario: Dos pagos del mismo método se consolidan

- GIVEN 2 pagos de Pago Móvil Mercantil de Bs 100 cada uno
- WHEN se genera el desglose
- THEN aparece una sola línea "Pago Móvil Mercantil — Bs 200"

#### Scenario: Método USD con equivalente en Bs

- GIVEN un pago de Efectivo Dólares de $1 con tasa 500
- WHEN se genera el desglose
- THEN la línea muestra "$1.00 (Bs. 500,00)"

#### Scenario: Método Bs también muestra su equivalente USD

- GIVEN un pago de PDV Banesco de Bs 300 con tasa 500, recibo en modo 'USD'
- WHEN se genera el desglose
- THEN la línea muestra "Bs. 300,00 ($0.60)" — Bs sigue primaria pese al toggle USD

#### Scenario: Reconciliación con el total de factura

- GIVEN factura Bs 1000 ($2) pagada con Pago Móvil Bs 200, Efectivo Dólares $1 (Bs 500) y PDV
  Banesco Bs 300
- WHEN se suman las líneas en Bs
- THEN el total (Bs 1000) reconcilia con el total de factura
</content>
