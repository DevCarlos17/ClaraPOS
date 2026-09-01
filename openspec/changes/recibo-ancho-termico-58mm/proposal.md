# Proposal: Ancho unificado de recibo (58mm térmico, 32 caracteres)

## Intent

`factura-export.ts` usa **tres anchos no coordinados**: separadores fijos (40 chars), wrap PNG
(~62 chars, px fijo), wrap PDF (maxWidth propio en mm). Resultado: campos largos (dirección del
cliente, etc.) imprimen después de donde terminan los `-----` — descuadrado, confirmado con
imagen del tester. Unificar a un ancho canónico de 32 caracteres (estándar térmico 58mm, fuente
ESC/POS A) resuelve el desalineado, mejora legibilidad móvil, y prepara impresión térmica futura.

## Scope

### In Scope

- Constante única `RECIBO_ANCHO_CHARS = 32` como fuente de verdad.
- `SEPARADOR` deriva de la constante.
- Wrap PNG: px calculado desde 32 chars monoespaciados vía `ctx.measureText` (no `PNG_ANCHO`
  fijo desacoplado).
- Wrap PDF: mm calculado desde 32 chars vía `doc.getTextWidth` (nueva conversión chars→mm),
  reemplazando el `maxWidth` fijo actual.
- Todo campo (emisor, cliente, productos, pagos) envuelve al mismo ancho — sin desborde.
- Aplicado en ambas rutas de render: `buildReciboPdfBlob` y
  `construirLineasRecibo`/`buildReciboTextoPlano`.
- Helpers de conversión (chars→px, chars→mm, separador) puros y unit-testeables.

### Out of Scope

- Impresión térmica real / comandos ESC/POS (futuro; este cambio prepara el ancho).
- Opción 80mm (se decide 58mm/32 chars ahora).
- Subtotal en tabla de artículos y desglose Base/IVA en modal de COMPRA (feedback separado,
  changes independientes).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `recibo-venta-exportacion`: "Ajuste de layout para texto largo" pasa de wrap independiente
  por ruta a un único ancho canónico compartido (32 chars) que gobierna separadores, PDF y PNG.

## Approach

Definir `RECIBO_ANCHO_CHARS = 32`. Derivar: (1) `SEPARADOR`, (2) px PNG midiendo 32 chars con
`ctx.measureText`, (3) mm PDF midiendo 32 chars con `doc.getTextWidth`. Los tres consumidores
quedan alineados al mismo contenido, sin importar la unidad de cada motor.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/utils/factura-export.ts` | Modified | Constante + derivación de anchos en `SEPARADOR`, PNG, PDF |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| 32 chars parte nombres largos en más líneas | Med | Aceptado: prioridad es alineación; wrap ya existía |
| Medición de fuente varía entre navegadores | Low | Se mide en runtime, no se hardcodea px |

## Rollback Plan

Revertir el commit de `RECIBO_ANCHO_CHARS` y helpers; código vuelve a los tres anchos previos.
Sin cambios de schema ni datos persistidos.

## Dependencies

Ninguna externa.

## Success Criteria

- [ ] Separadores, wrap PNG y wrap PDF derivan de `RECIBO_ANCHO_CHARS = 32`.
- [ ] Ningún campo se desborda del ancho de los separadores en PDF ni PNG.
- [ ] Helpers de conversión (chars→px, chars→mm) cubiertos por unit tests puros.
- [ ] Ambas rutas de render verificadas manualmente sin desbordamiento.
