# Reimpresión de Factura Specification

## Purpose

Consultar y reimprimir, desde Gestión de Clientes → detalle de cliente
(`FacturasEmpresaTable`), el estado completo de cualquier factura histórica:
detalle fiscal, métodos de pago, y evolución post-emisión (reversos, abonos,
reversos de abono, saldo a favor generado). El modal (`ConsultaFacturaModal`,
antes `ReimprimirFacturaModal`) conserva la reimpresión en formato térmico
58mm marcada "REIMPRESION" como una de sus acciones. Superficie única, solo
lectura.

> **Nota de historial**: superficie renombrada de "Reimprimir Factura" a
> "Consulta de Factura" en `consulta-factura-evolucion` (2026-09-11), que
> también un-hide "Métodos de pago" y agrega la sección de evolución
> post-emisión descrita abajo (reemplaza el bloque anterior de notas de
> crédito solo-cantidad). El propósito de reimpresión original se mantiene
> intacto. `replicar-consulta-factura-ventas-caja` (2026-09-12) extendió el
> mismo patrón a "Ventas → Consultas", y `facturas-emitidas-consulta-rowclick`
> (2026-09-12) lo extendió a "Ventas → Facturas emitidas → pestaña Facturas".

## Requirements

### Requirement: Apertura del detalle por click en fila

El sistema MUST abrir un modal al hacer click en una FILA de
`FacturasEmpresaTable` (sin botón por fila), montado solo cuando hay
factura seleccionada. Este patrón aplica en TRES superficies: Gestión de
Clientes → detalle de cliente, Ventas → Consultas
(`ventas-consultas-modal.tsx`, pestañas "Por Factura" y "Por Cliente"), y
Ventas → Facturas emitidas → pestaña Facturas (`facturas-empresa-tab.tsx`),
todas alimentadas por `useFacturasEmpresa`/`FacturaParaAnular` (sin
adapter) y filtradas por `empresa_id` del usuario actual.

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

#### Scenario: Click en fila desde Ventas → Consultas abre el mismo modal

- GIVEN el listado de "Ventas → Consultas" (pestaña "Por Factura" o "Por
  Cliente") con facturas de la empresa actual
- WHEN el usuario hace click en una fila
- THEN se abre `ConsultaFacturaModal` con el detalle fiscal completo y la
  evolución de esa factura

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

### Requirement: Contenido del modal de reimpresión

El modal MUST mostrar `FacturaDetallePanel` de la factura seleccionada y
los botones "Descargar PDF" y "Compartir".

#### Scenario: Modal muestra detalle fiscal y ambos botones

- GIVEN una factura seleccionada, `navigator.share` disponible
- WHEN se abre el modal
- THEN se renderiza `FacturaDetallePanel` con sus datos, junto a "Descargar
  PDF" y "Compartir"

### Requirement: Reimpresión en PDF con marca REIMPRESION

"Descargar PDF" MUST generar el mismo PDF térmico 58mm del POS post-venta,
con "REIMPRESION" centrada entre encabezado y tabla de artículos.

#### Scenario: PDF reimpreso incluye la marca en su posición

- GIVEN una factura guardada
- WHEN el usuario presiona "Descargar PDF"
- THEN el PDF es idéntico al formato de venta original
- AND contiene "REIMPRESION" centrada entre encabezado y "Artículos"

### Requirement: Reimpresión por Compartir

"Compartir" MUST compartir la imagen (o texto de fallback) térmica,
ocultarse sin `navigator.share`, y tratar `AbortError` en silencio.

#### Scenario: Compartir oculto sin navigator.share

- GIVEN `navigator.share` es `undefined`
- WHEN se abre el modal
- THEN el botón "Compartir" no se renderiza

#### Scenario: Cancelar el share sheet no muestra error

- GIVEN `navigator.share` disponible
- WHEN el usuario presiona "Compartir" y cancela (`AbortError`)
- THEN no se muestra ningún mensaje de error

### Requirement: Marca presente en ambas rutas de render, ausente en la venta original

"REIMPRESION" MUST aparecer centrada entre encabezado y artículos en PDF y
texto/PNG. El recibo de venta en vivo MUST NOT mostrarla nunca
(`esReimpresion` default `false`).

#### Scenario: Marca presente al reimprimir, ausente en venta en vivo

- GIVEN una factura reimpresa y una venta recién cobrada
- WHEN se generan PDF y texto/PNG de ambas
- THEN las dos salidas de la reimpresión muestran "REIMPRESION" centrada
- AND el recibo de la venta en vivo no la muestra en ningún punto

### Requirement: Aislamiento por empresa en la reconstrucción

Reconstruir una factura guardada a datos de recibo MUST resolver
únicamente facturas de la `empresa_id` del usuario actual.

#### Scenario: Solo se reimprimen facturas de la empresa actual

- GIVEN un usuario de la empresa X
- WHEN reimprime una factura desde detalle de cliente
- THEN la factura reconstruida pertenece a X
- AND ninguna factura de otra empresa es alcanzable desde este flujo

### Requirement: Reimpresión es pura lectura

Reimprimir MUST NOT escribir en ninguna tabla (`ventas`, `movimientos_*`)
y MUST producir salida idéntica cada vez para la misma factura.

#### Scenario: Reimprimir dos veces no altera BD ni resultado

- GIVEN una factura guardada
- WHEN el usuario la reimprime (PDF) dos veces
- THEN ambas salidas son idénticas y ninguna tabla recibe un registro nuevo

### Requirement: Neutralidad de comportamiento en consumidores existentes

Extraer la reconstrucción `ventas → ReciboData` compartida MUST NOT
alterar el comportamiento observable de `nota-credito-pos-modal.tsx` ni
`crear-ncr-modal.tsx`.

#### Scenario: Suites de NC existentes pasan sin cambios

- GIVEN las suites de ambos modales previas a este cambio
- WHEN corren contra el código post-extracción
- THEN pasan sin haber sido modificadas

### Requirement: Métodos de pago visibles en el detalle

El sistema MUST mostrar el desglose de "Métodos de pago" en el panel de
detalle (`FacturaDetallePanel`), con los mismos montos USD/Bs que ya se
muestran en PDF y texto/PNG. Este bloque estaba oculto en el panel aunque ya
se calculaba (`recibo.pagos` siempre poblado).

#### Scenario: Panel muestra métodos de pago con los mismos montos que el PDF

- GIVEN una factura con pagos por más de un método de cobro
- WHEN se abre el modal de consulta
- THEN el panel muestra "Métodos de pago" con los mismos montos USD/Bs que
  el PDF y el texto/PNG

### Requirement: Evolución post-emisión en el detalle

El sistema MUST mostrar, cuando exista, la evolución post-emisión de la
factura (reversos con monto real, abonos posteriores, reversos de abono,
saldo a favor generado), reemplazando el bloque anterior de notas de crédito
solo-cantidad. Evolución vacía MUST NOT renderizar ninguna sección nueva.

#### Scenario: Evolución poblada muestra las 4 variantes

- GIVEN una factura con un reverso, un abono posterior, un reverso de abono
  y saldo a favor generado
- WHEN se abre el modal de consulta
- THEN el panel muestra las 4 líneas correspondientes con sus montos USD/Bs

#### Scenario: Evolución vacía no agrega ninguna sección

- GIVEN una factura sin reversos/abonos/reversos-de-pago/SAF posteriores
- WHEN se abre el modal de consulta
- THEN no se renderiza ninguna sección de evolución (salida idéntica a antes
  del cambio)

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

## Out of Scope (v1)

- Reimpresión en `nota-credito-pos-modal.tsx` (FROZEN).
- `ventas-consultas-modal.tsx`: su PDF ad-hoc no térmico (superado — ver
  requirement "PDF de Ventas emitidas usa el recibo térmico compartido").
- Cualquier botón de acción por fila dedicado a reimpresión (el botón
  "Aplicar nota de crédito" de `notas-credito-admin` es una acción distinta
  que coexiste en la misma fila, ver requirement de apertura por click).
- Corregir la causa raíz del "capped pagos" SAF-FIFO en `use-ventas.ts`
  (caveat aceptado, documentado en `factura-detalle-panel.tsx`).
