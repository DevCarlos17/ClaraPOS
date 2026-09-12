# Delta for Reimpresión de Factura

## ADDED Requirements

### Requirement: Búsqueda histórica completa preservada en Ventas emitidas

Al consumir `useFacturasEmpresa` en `ventas-consultas-modal.tsx` (pestañas
"Por Factura" y "Por Cliente"), el sistema MUST pasar un `fechaDesde`
explícito y amplio (no el valor por defecto de mes actual del hook) para
preservar la búsqueda de facturas de todo el histórico, tal como se
comportaba antes del reemplazo.

#### Scenario: Buscar factura de un mes anterior sigue funcionando

- GIVEN una factura emitida hace más de un mes
- WHEN el usuario la busca desde "Ventas → Consultas" (Por Factura o Por
  Cliente)
- THEN la factura aparece en el listado, sin restringirse al mes actual

### Requirement: PDF de Ventas emitidas usa el recibo térmico compartido

`ventas-consultas-modal.tsx` MUST NOT generar su propio PDF con jsPDF ni
renderizar su propio detalle inline; la exportación de PDF y el detalle de
una factura MUST usar el pipeline compartido (`ConsultaFacturaModal` +
`descargarReciboPdf`, el mismo builder térmico 58mm que el resto del
sistema).

#### Scenario: Exportar PDF desde Ventas emitidas usa el builder compartido

- GIVEN una factura seleccionada en "Ventas → Consultas"
- WHEN el usuario descarga el PDF
- THEN el PDF generado es el recibo térmico estándar (mismo builder que en
  Gestión de Clientes), no un layout bespoke

## MODIFIED Requirements

### Requirement: Apertura del detalle por click en fila

El sistema MUST abrir un modal al hacer click en una FILA de
`FacturasEmpresaTable` (sin botón por fila), montado solo cuando hay
factura seleccionada. Este patrón aplica en DOS superficies: Gestión de
Clientes → detalle de cliente, y Ventas → Consultas
(`ventas-consultas-modal.tsx`, pestañas "Por Factura" y "Por Cliente"),
ambas alimentadas por `useFacturasEmpresa` (shape `FacturaParaAnular`, sin
adapter) y filtradas por `empresa_id` del usuario actual.
(Previously: solo aplicaba a Gestión de Clientes → detalle de cliente.)

#### Scenario: Click en fila abre y cerrar limpia el modal

- GIVEN una tabla con al menos 2 facturas
- WHEN el usuario hace click en la fila de la factura B
- THEN se abre el modal con el detalle de B (no de A)
- AND al cerrarlo, vuelve la lista sin ningún botón de reimpresión montado

#### Scenario: Click en fila desde Ventas → Consultas abre el mismo modal

- GIVEN el listado de "Ventas → Consultas" (pestaña "Por Factura" o "Por
  Cliente") con facturas de la empresa actual
- WHEN el usuario hace click en una fila
- THEN se abre `ConsultaFacturaModal` con el detalle fiscal completo y la
  evolución de esa factura
