# Design: Ancho unificado de recibo (58mm térmico, 32 caracteres)

## Technical Approach

Un único módulo-constant `RECIBO_ANCHO_CHARS = 32` en `factura-export.ts` gobierna los tres
consumidores actuales (`SEPARADOR`, wrap PNG, wrap PDF). El truco: reutilizar `SEPARADOR`
(32 guiones) como **string de referencia** para medir el ancho real en cada motor —
`ctx.measureText` (px, canvas) y `doc.getTextWidth` (mm, jsPDF) — en vez de hardcodear un
valor de píxeles/mm. Así el "32" es siempre la fuente de verdad; el motor de render decide
cuánto ocupa en su propia unidad. `wrapPdfText`/`wrapCanvasText` no cambian de firma — solo
cambia cómo se calcula el `maxWidth` que reciben.

## Architecture Decisions

### Decision: Referencia de medición = `SEPARADOR` (no una constante nueva)

**Choice**: Medir el ancho canónico midiendo el propio `SEPARADOR` (32 guiones) con
`measureText`/`getTextWidth`.
**Alternatives considered**: String de referencia separado (ej. `'X'.repeat(32)`).
**Rationale**: Un guion es un carácter monoespaciado estándar en toda fuente (Courier,
`monospace`); reutilizar `SEPARADOR` evita una segunda constante y garantiza que el separador
visual y el ancho de wrap midan literalmente lo mismo.

### Decision: PNG — `PNG_ANCHO` deja de ser constante de módulo, se deriva dentro de la función

**Choice**: Mover el cálculo de ancho canónico (px) al inicio de `buildReciboImagenBlob`
(donde ya existe `ctx`), como `const pngAncho = ctx.measureText(SEPARADOR).width + PNG_PADDING * 2`.
Reemplaza el `PNG_ANCHO = 480` hardcodeado (línea 480) solo en su uso local (canvas.width,
fillRect); `PNG_PADDING`, `PNG_LINE_HEIGHT`, `PNG_ESCALA` no cambian.
**Alternatives considered**: Mantener `PNG_ANCHO` como constante de módulo con un valor
"aproximado" recalculado a mano.
**Rationale**: `ctx.measureText` requiere un contexto 2D real — no existe fuera de la función.
El PNG ya usa una única fuente/tamaño (`13px monospace`) en todas las líneas (título y cuerpo
solo cambian `bold`), así que una sola medición cubre el 100% de los casos.

### Decision: PDF — cambio de fuente a Courier en los campos con wrap de texto libre

**Choice**: Los 5 call-sites de `wrapPdfText` (emisor nombre L338, emisor dirección L351,
cliente nombre L372, cliente dirección L375, cierre L467) cambian su fuente activa de
`helvetica` a `courier` (mismo peso: normal/bold según ya está). El ancho máximo se mide
recién con `doc.getTextWidth(SEPARADOR)` **después** de fijar `courier` + el `fontSize` de ese
campo (14/9/8pt), porque el ancho en mm de 32 caracteres monoespaciados varía con el tamaño de
fuente. Tablas `autoTable` (Artículos, Totales, Métodos de pago) **no cambian** — usan columnas
de ancho fijo, no wrap por caracteres; quedan fuera de este cambio.
**Alternatives considered**: (a) mantener `helvetica` y solo pasar el mm derivado de Courier
como `maxWidth` — descartado: con fuente proporcional, una caja de "ancho de 32 caracteres"
puede contener 20 o 45 caracteres reales según el texto, rompiendo la paridad visual con el
PNG/texto (que sí es monoespaciado). (b) una única medición global a un tamaño fijo (9pt) para
todos los campos — descartado: el título (14pt) quedaría limitado a ~20 caracteres reales,
generando quiebres de línea excesivos no pedidos por el proposal.
**Rationale**: Courier es el estándar de los 14 fonts core de jsPDF (sin dependencias nuevas)
y replica visualmente una impresora térmica ESC/POS Font A — coherente con el objetivo del
proposal. Medir por tamaño de fuente activo mantiene "32 caracteres" literal en cada campo, no
solo una caja de mm sin relación con el conteo de caracteres.
**Visual impact flag**: nombre/RIF-dirección de emisor, cliente y cierre pasan de fuente
proporcional a monoespaciada en el PDF — cambio visual menor a validar con el tester.

## Data Flow

    RECIBO_ANCHO_CHARS = 32
            │
            ▼
      generarSeparador() ──► SEPARADOR (32 guiones, ya usado en construirLineasRecibo)
            │
            ├──► PNG:  ctx.font = '13px monospace'; ctx.measureText(SEPARADOR).width
            │           └─► pngAncho (px) ─► wrapCanvasText(...) para TODAS las líneas
            │
            └──► PDF:  doc.setFont('courier', peso); doc.setFontSize(tamaño)
                        doc.getTextWidth(SEPARADOR) ─► maxWidth (mm) ─► wrapPdfText(...)
                        (repetido por cada tamaño de fuente: 14/9/8pt)

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/ventas/utils/factura-export.ts` | Modify | `RECIBO_ANCHO_CHARS` (nueva const), `generarSeparador()` (nueva pure fn), `SEPARADOR = generarSeparador()` (L219), `pngAncho` derivado dentro de `buildReciboImagenBlob` reemplazando usos de `PNG_ANCHO` en L518/L523 (L480 se elimina como const de módulo), 5 call-sites de `wrapPdfText` cambian fuente a `courier` y su `maxWidth` a `doc.getTextWidth(SEPARADOR)` post-`setFont`/`setFontSize` (L338, L351, L372/375, L467) |
| `src/features/ventas/utils/__tests__/factura-export.test.ts` | Modify | Tests nuevos para `generarSeparador` y para el largo/forma de `SEPARADOR` (32 en vez de 40) |

## Interfaces / Contracts

```typescript
/** Pure. Genera el separador visual del recibo (default: ancho canónico). */
function generarSeparador(chars: number = RECIBO_ANCHO_CHARS): string

const RECIBO_ANCHO_CHARS = 32
const SEPARADOR = generarSeparador()

// PNG (dentro de buildReciboImagenBlob, requiere ctx real — no se extrae a helper puro)
ctx.font = '13px monospace'
const pngAncho = ctx.measureText(SEPARADOR).width + PNG_PADDING * 2

// PDF (por cada tamaño de fuente usado: 14, 9, 8 — requiere doc real)
doc.setFont('courier', peso)
doc.setFontSize(tamaño)
const maxWidth = doc.getTextWidth(SEPARADOR)
```

`wrapPdfText(doc, text, maxWidth)` y `wrapCanvasText(ctx, text, maxWidthPx)` no cambian de
firma ni implementación (constraint: reuso obligatorio).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `generarSeparador()` | Pure: default 32 guiones, `generarSeparador(10)` → 10 guiones |
| Unit | `SEPARADOR` en `buildReciboTextoPlano` | Assert `texto.includes('-'.repeat(32))` reemplaza cualquier expectativa previa de 40 |
| Unit | Wrap PNG con ancho derivado | Reusar `mockCtx()` existente (`measureText: text.length*10`) de `recibo-pagos.test.ts` — con ese mock, 32 chars → 320px determinístico, cubre la fórmula sin canvas real |
| Manual | PDF con Courier, PNG, texto compartido | Generar recibo con dirección larga (cliente + emisor) en los 3 formatos, verificar sin desborde y `pngAncho`/mm-Courier visualmente alineados a los separadores |

No se agregan asserts a nivel de bytes de PDF/PNG (deuda ya documentada en el spec — DEUDA-3,
sin cambios en esta propuesta).

## Migration / Rollout

No migration required. Cambio puramente de presentación (constantes + fuente PDF), sin schema
ni datos persistidos. Revertir el commit restaura los tres anchos previos (40 / 480px / mm
propio de `helvetica`).

## Open Questions

- [ ] ¿El RIF del emisor (línea sin wrap, L345) también debe pasar a `courier` por coherencia
      visual con el resto del bloque emisor, aunque nunca requiera wrap? (no bloquea: es
      cosmético, se puede resolver en tasks/apply)
