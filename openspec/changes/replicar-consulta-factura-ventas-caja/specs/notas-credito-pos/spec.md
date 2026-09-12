# Delta for Notas de Crédito — Entrada POS

## ADDED Requirements

### Requirement: Reveal-gate de la sección de emisión de NC

Al seleccionar una factura, el sistema MUST mostrar únicamente su detalle
fiscal (artículos, base imponible, IVA, total, métodos de pago) y un pie
con tres acciones: `Volver`, `Reimprimir`, `Emitir nota de crédito`. La
sección NC (Tipo de nota de crédito, modalidad de liquidación, depósito de
reingreso, motivo de anulación, alerta "irreversible") MUST permanecer
oculta hasta presionar "Emitir nota de crédito"; al presionarlo se revela
y el pie pasa al flujo de anulación existente (termina en "Confirmar
Anulación"), sin alterar su lógica. El gate MUST resetear al cambiar de
factura, cerrar el panel, o presionar `Volver`. `Volver` MUST ser de una
sola etapa: siempre retorna al estado vacío de selección.

#### Scenario: Selección inicial solo muestra detalle y pie de tres acciones

- GIVEN una sesión de caja activa con facturas listadas
- WHEN el cajero selecciona una factura
- THEN el panel muestra solo el detalle fiscal
- AND el pie muestra Volver, Reimprimir y Emitir nota de crédito
- AND la sección NC no está visible

#### Scenario: Emitir nota de crédito revela la sección

- GIVEN una factura seleccionada, sección NC oculta
- WHEN el cajero presiona "Emitir nota de crédito"
- THEN se revela la sección NC completa
- AND el pie pasa al flujo de anulación existente

#### Scenario: Cambiar de factura reoculta la sección NC

- GIVEN la sección NC revelada para la factura A
- WHEN el cajero selecciona la factura B
- THEN el panel de B inicia oculto (solo detalle + pie de tres acciones)

#### Scenario: Volver es de una sola etapa

- GIVEN la sección NC revelada para una factura
- WHEN el cajero presiona "Volver"
- THEN el panel regresa directo al estado vacío de selección, sin estado
  intermedio

### Requirement: Reimpresión desde la entrada POS de NC

Con factura seleccionada, `Reimprimir` MUST abrir `ConsultaFacturaModal`
(detalle fiscal + evolución), reusando
`useReciboDesdeFactura`/`useEvolucionFactura` — mismo patrón que Gestión
de Clientes y Ventas → Consultas. MUST estar disponible solo con factura
seleccionada.

#### Scenario: Reimprimir abre el modal de consulta completo

- GIVEN una factura seleccionada en la entrada POS de NC
- WHEN el cajero presiona "Reimprimir"
- THEN se abre `ConsultaFacturaModal` con detalle y evolución de esa
  factura

## MODIFIED Requirements

### Requirement: Selección de tipo de nota de crédito (TOTAL o PARCIAL)

Los botones "Total"/"Parcial" (existentes) MUST mostrarse solo dentro de
la sección NC ya revelada (ver "Reveal-gate"), nunca al solo seleccionar
la factura. TOTAL MUST invocar `crearNotaCredito()` con `tipo=TOTAL` sin
alterar su lógica. PARCIAL MUST habilitar cantidad a devolver por línea,
paso entero o decimal (0.001) según `unidades.es_decimal`. Solo se crean
registros nuevos (`notas_credito`, `notas_credito_det`).
(Previously: botones disponibles al seleccionar la factura, sin gate.)

#### Scenario: NC TOTAL reversa la factura completa

- GIVEN sección NC revelada para una factura seleccionada
- WHEN el cajero elige TOTAL
- THEN se invoca `crearNotaCredito` con `tipo=TOTAL`, sin cambios en su
  implementación

#### Scenario: NC PARCIAL habilita selección de líneas

- GIVEN sección NC revelada, factura con varias líneas
- WHEN el cajero elige PARCIAL
- THEN cada línea muestra cantidad a devolver, en 0 inicialmente

#### Scenario: Cantidad a devolver no puede exceder lo facturado

- GIVEN sección NC revelada, línea facturada con cantidad X
- WHEN el cajero ingresa una cantidad mayor a X
- THEN el sistema rechaza el valor

#### Scenario: Cantidad respeta es_decimal de la unidad

- GIVEN sección NC revelada, línea con `unidades.es_decimal=0`
- WHEN el cajero ingresa una cantidad con decimales
- THEN el sistema rechaza el valor; solo acepta enteros

#### Scenario: Al menos una línea requerida en PARCIAL

- GIVEN sección NC revelada, modo PARCIAL con cantidades en 0
- WHEN el cajero intenta confirmar la NC
- THEN se bloquea hasta que alguna línea tenga cantidad mayor a 0
