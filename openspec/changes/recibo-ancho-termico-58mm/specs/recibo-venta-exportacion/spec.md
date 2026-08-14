# Delta for Recibo Venta Exportación

## MODIFIED Requirements

### Requirement: Ajuste de layout para texto largo

Todo texto del recibo (dirección y razón social del emisor, nombre y dirección del cliente,
nombres de producto, referencias de pago) MUST envolver (wrap) al mismo ancho canónico de 32
caracteres usado por los separadores, sin desbordar en PDF ni PNG.
(Previously: solo dirección/razón social/usuario del emisor ajustaban a un ancho propio de cada
ruta de render, no coordinado con los separadores.)

#### Scenario: Dirección de cliente larga se ajusta sin desbordar el separador

- GIVEN una dirección de cliente "Barrio Raul Leono, casa 100 - 35, calle 79, Maracaibo, Zulia"
- WHEN se genera el recibo en PDF o PNG
- THEN el texto envuelve en varias líneas de máximo 32 caracteres
- AND ninguna línea envuelta excede el ancho de los separadores

#### Scenario: Dirección de empresa larga no desborda

- GIVEN una dirección de empresa muy larga
- WHEN se genera el recibo en PDF o PNG
- THEN el texto se ajusta en varias líneas de máximo 32 caracteres, alineadas con el separador

#### Scenario: Nombre de producto largo se ajusta al mismo ancho

- GIVEN un producto con nombre que excede 32 caracteres
- WHEN se genera el recibo
- THEN el nombre envuelve en el listado de artículos sin exceder el ancho del separador

#### Scenario: Referencia de pago larga se ajusta al mismo ancho

- GIVEN un pago con referencia de texto larga
- WHEN se genera el desglose de pagos
- THEN la referencia envuelve sin exceder el ancho del separador

## ADDED Requirements

### Requirement: Ancho canónico único del recibo

El sistema MUST definir una única constante `RECIBO_ANCHO_CHARS = 32` (58mm térmico, fuente
ESC/POS Font A) como fuente de verdad del ancho de contenido. `SEPARADOR` MUST derivarse de esta
constante, y ambas rutas de render (`buildReciboPdfBlob` para PDF, `construirLineasRecibo` /
`buildReciboTextoPlano` para PNG/texto) MUST derivar su ancho de wrap de la misma constante, cada
una convirtiendo a su propia unidad (px o mm) en runtime.

#### Scenario: Separador de 32 caracteres exactos

- GIVEN la constante `RECIBO_ANCHO_CHARS = 32`
- WHEN se genera el separador del recibo
- THEN la línea `-----` tiene exactamente 32 caracteres

#### Scenario: PDF y PNG producen el mismo wrap para el mismo contenido

- GIVEN un mismo recibo con campos de texto largo
- WHEN se renderiza en PDF y en PNG
- THEN ambas rutas envuelven el texto en los mismos puntos de 32 caracteres

### Requirement: Derivación pura y testeable de unidades de ancho

Las funciones que convierten el ancho canónico en caracteres a unidades de cada motor de render
(píxeles para PNG vía `ctx.measureText`, milímetros para PDF vía `doc.getTextWidth`) y la
generación del separador MUST ser funciones puras, deterministas y cubiertas por unit tests, sin
hardcodear valores fijos de px o mm.

#### Scenario: Generador de separador es puro

- GIVEN la función que genera el separador a partir de un ancho en caracteres
- WHEN se invoca con `32`
- THEN retorna una cadena de 32 guiones, de forma determinista

#### Scenario: Conversión chars→px es medida, no hardcodeada

- GIVEN la constante de 32 caracteres
- WHEN se calcula el ancho en píxeles para PNG
- THEN el valor se obtiene midiendo el texto en runtime (`ctx.measureText`), no de una constante
  px fija

## Not Modified

El requisito "Renderizado sin mutación de datos" (display-only, sin mutar `pagos`,
`movimientos_metodo_cobro`, `movimientos_cuenta` ni `ventas`) no cambia — este delta no toca datos
persistidos, solo cálculo de ancho/wrap en el render.
