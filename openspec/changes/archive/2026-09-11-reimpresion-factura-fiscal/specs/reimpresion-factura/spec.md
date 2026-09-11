# Reimpresión de Factura Specification

## Purpose

Reimprimir, desde Gestión de Clientes → detalle de cliente
(`FacturasEmpresaTable`), cualquier factura histórica en formato térmico
58mm, marcada "REIMPRESION". Superficie única v1, solo lectura.

## Requirements

### Requirement: Apertura del detalle por click en fila

El sistema MUST abrir un modal al hacer click en una FILA de
`FacturasEmpresaTable` (sin botón por fila), montado solo cuando hay
factura seleccionada.

#### Scenario: Click en fila abre y cerrar limpia el modal

- GIVEN una tabla con al menos 2 facturas
- WHEN el usuario hace click en la fila de la factura B
- THEN se abre el modal con el detalle de B (no de A)
- AND al cerrarlo, vuelve la lista sin ningún botón de reimpresión montado

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

## Out of Scope (v1)

- Reimpresión en `nota-credito-pos-modal.tsx` (FROZEN).
- `ventas-consultas-modal.tsx`: su PDF ad-hoc no térmico.
- Cualquier botón de acción por fila.
