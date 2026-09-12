# Delta for Reimpresión de Factura

## MODIFIED Requirements

### Requirement: Apertura del detalle por click en fila

El sistema MUST abrir un modal al hacer click en una FILA de
`FacturasEmpresaTable` (sin botón por fila), montado solo cuando hay
factura seleccionada. Este patrón aplica en TRES superficies: Gestión de
Clientes → detalle de cliente, Ventas → Consultas
(`ventas-consultas-modal.tsx`, pestañas "Por Factura" y "Por Cliente"), y
Ventas → Facturas emitidas → pestaña Facturas (`facturas-empresa-tab.tsx`),
todas alimentadas por `useFacturasEmpresa`/`FacturaParaAnular` (sin
adapter) y filtradas por `empresa_id` del usuario actual.
(Previously: aplicaba a Gestión de Clientes y a Ventas → Consultas.)

En Facturas emitidas → pestaña Facturas, esta es la PRIMERA superficie
donde el botón de acción por fila ("Aplicar nota de crédito") coexiste
visible en la misma fila que ahora también dispara el modal de consulta.
El botón `onClick` MUST llamar `e.stopPropagation()` para que un click en
el botón NUNCA abra también `ConsultaFacturaModal`.

#### Scenario: Click en fila abre y cerrar limpia el modal

- GIVEN una tabla con al menos 2 facturas
- WHEN el usuario hace click en la fila de la factura B
- THEN se abre el modal con el detalle de B (no de A)
- AND al cerrarlo, vuelve la lista sin ningún botón de reimpresión montado

#### Scenario: Click en fila desde Facturas emitidas (admin) abre el mismo modal

- GIVEN el listado de la pestaña Facturas en `/ventas/facturas-emitidas`
  con facturas de la empresa actual
- WHEN el usuario hace click en una fila, fuera del botón "Aplicar nota de
  crédito"
- THEN se abre `ConsultaFacturaModal` con el detalle fiscal completo y la
  evolución de esa factura

#### Scenario: Click en el botón de acción no dispara el modal de consulta

- GIVEN una fila de la pestaña Facturas con el botón "Aplicar nota de
  crédito" visible
- WHEN el usuario hace click en ese botón
- THEN `ConsultaFacturaModal` permanece cerrado
- AND el botón sigue disparando su propio flujo (`CrearNcrModal`) sin
  cambios
