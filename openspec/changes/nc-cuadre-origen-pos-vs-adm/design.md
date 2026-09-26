# Design: Desglose Salidas NC por Origen (POS vs Administración) en Cuadre de Caja

## Bugfix: root-cause corregido post-QA

La primera implementación de este cambio clasificaba por `notas_credito.liquidacion_modalidad` (`REFUND_TESORERIA` → Admin, cualquier otro valor → POS). QA confirmó que esto es **incorrecto**: `liquidacion_modalidad` indica el MECANISMO de reembolso (efectivo del cajón vs tesorería), no el PUNTO DE ENTRADA (POS vs Admin). El flujo POS "Devolver dinero" (`emitirNcRefund`, `nota-credito-pos-modal.tsx:444-463`) hardcodea `modalidad: 'REFUND_TESORERIA'` **con** `entryPoint: 'POS'` — toda NC emitida así quedaba mal clasificada como Admin.

El discriminador real de punto de entrada es `notas_credito.sesion_caja_id`, escrito UNA sola vez al INSERT del header (`use-notas-credito.ts:944`, fórmula en la línea 720: `sesionCajaIdParaNc = entryPoint === 'POS' ? sesionCajaActivaId ?? null : null`) y nunca actualizado después:
- NC desde POS (cualquier modalidad, incluida "devolver dinero") → `sesion_caja_id` no nulo → **POS**.
- NC desde Admin (Consulta de Factura / Tradicional) → `sesion_caja_id` es `null` → **Admin**, incluso cuando esa NC usa `REFUND_TESORERIA` con destino `SESION_CAJA` (el egreso de `movimientos_metodo_cobro` sí lleva la `sesion_caja_id` elegida por el admin, pero el HEADER de la NC no la vincula — comportamiento deseado, no un bug).

Este bugfix reemplaza `liquidacion_modalidad` por `sesion_caja_id` en el SELECT, el modelo puro y los tests; el resto del diseño (ubicación del código, forma de las filas-subtotal, invariante display-only) no cambia.

## Technical Approach

Extiende el SELECT/JOIN ya existente en `use-cuadre.ts` para traer `notas_credito.sesion_caja_id`, agrega una función pura de clasificación + subtotal a `cuadre-salidas-caja-model.ts` (mismo archivo que ya posee la lógica de "Salidas de Caja", no un archivo nuevo), y reutiliza dos patrones JSX ya probados en `cuadre-page.tsx` (badge por origen L1274-1295, fila-subtotal `CobranzasCxCTable` L1389-1392). Cero cambios en escritura, cero cambios en `splitEgresosArqueo` ni en ningún total agregado — es una re-agrupación de filas ya sumadas.

## Architecture Decisions

| # | Decisión | Elegido | Alternativa descartada |
|---|----------|---------|------------------------|
| 1 | Ubicación de la función de clasificación | Extender `cuadre-salidas-caja-model.ts` | Archivo sibling nuevo — descartado: ese archivo ya es el dueño del concepto "Salidas de Caja", ya importa `ORIGENES_DEVOLUCION_NC`; separar agrega indirección sin beneficio (el archivo resultante queda <110 líneas) |
| 2 | Row-type | Agregar `nc_sesion_caja_id: string \| null` a la interfaz `MovimientoEfectivoDetalle` existente (bugfix: reemplaza el `liquidacion_modalidad` de la primera implementación) | Tipo/hook paralelo — descartado: duplicaría el mapping null-safe que ya existe para `nro_ncr` en la misma fila |
| 3 | Color badge Admin | Nuevo acento (`purple`) | Reusar rojo más oscuro — descartado: en la misma columna conviven NC-POS (rojo) y NC-Adm; un tono de rojo similar es ambiguo a simple vista, `purple` es inconfundible frente a blue/orange/red ya usados |
| 4 | Forma de la fila-subtotal | 1 fila por (origen × moneda con monto > 0) | 1 fila combinada USD+Bs por origen — descartado: `MovimientosManualesTable` tiene una sola columna "Monto" (a diferencia de `CobranzasCxCTable` que tiene columnas USD/Bs separadas); una fila por moneda respeta el contrato ya existente de esa columna |
| 5 | Ubicación de las filas-subtotal | Al final del `tbody`, tras iterar todos los `items` | Intercaladas por grupo contiguo (idioma `CobranzasCxCTable`) — descartado: las filas NC-POS y NC-Adm no son necesariamente contiguas en el orden `fecha DESC` (se intercalan con `EGRESO_MANUAL`, `PAGO_PROVEEDOR`, etc.); agrupar requeriría reordenar la tabla, fuera de scope |

## Data Flow

```
use-cuadre.ts (useMovimientosEfectivoCaja, L1521-1542)
  SELECT ... nc.sesion_caja_id as nc_sesion_caja_id   (+1 columna al SELECT ya existente, L1529)
        │
        ▼
MovimientoEfectivoDetalle[]                  (+1 campo al tipo, L1502-1513; mapeo null-safe igual a nro_ncr)
        │
        ▼
cuadre-page.tsx: egresosDetalle = movsEfectivoDetalle.filter(esSalidaCaja)   (SIN CAMBIOS, L257)
        │
        ├──────────────────────────────┬───────────────────────────────┐
        ▼                              ▼
MovimientosManualesTable          splitSalidasNcPorOrigen(egresosDetalle)
  por fila NC: clasificarOrigenNc(m)      → { posUsd, posBsNativo, admUsd, admBsNativo }
    → badge "NC" (POS) | "NC · Adm" (ADM)         │
  al final del tbody: filas subtotal      ◄────────┘  (solo currency/origen con monto > 0)
```

`splitEgresosArqueo` (Card "Arqueo Teórico") **no cambia** — sigue leyendo `movManualesCaja`, fuente independiente. El invariante se verifica por test (ver abajo), no por dependencia de código.

## Interfaces / Contracts

`cuadre-salidas-caja-model.ts` (agregar, sin tocar lo existente):

```ts
export type OrigenSalidaNc = 'POS' | 'ADM'

export interface ClasificacionNcInput {
  nc_sesion_caja_id: string | null
}

// Única fuente de verdad: SOLO nc.sesion_caja_id, nunca `liquidacion_modalidad`
// ni `concepto` (Spec caja, Req 1 corregido — ver "Bugfix" arriba).
// sesion_caja_id no nulo/no vacío → POS. null/undefined/'' → ADM.
export function clasificarOrigenNc(item: ClasificacionNcInput): OrigenSalidaNc {
  return item.nc_sesion_caja_id != null && item.nc_sesion_caja_id !== '' ? 'POS' : 'ADM'
}

export interface SalidaNcSubtotalItem extends ClasificacionNcInput {
  origen: string
  metodo_moneda: string
  monto: string
}

export interface SalidasNcSubtotales {
  posUsd: number
  posBsNativo: number
  admUsd: number
  admBsNativo: number
}

// Mirror de splitEgresosArqueo: filtra por ORIGENES_DEVOLUCION_NC, separa por moneda
// nativa (sin convertir), nunca suma entre orígenes. Pura re-agrupación de filas ya
// sumadas — no es una fuente de verdad nueva para ningún total.
export function splitSalidasNcPorOrigen(items: SalidaNcSubtotalItem[]): SalidasNcSubtotales
```

`use-cuadre.ts`: `MovimientoEfectivoDetalle` (L1502-1513) gana `nc_sesion_caja_id: string | null`; SELECT (L1530) gana `nc.sesion_caja_id as nc_sesion_caja_id`; mapeo de fila (L1557) gana `nc_sesion_caja_id: row.nc_sesion_caja_id ? String(row.nc_sesion_caja_id) : null` — mismo patrón null-safe que `nro_ncr` una línea arriba.

`cuadre-page.tsx` `MovimientosManualesTable` (L1255-1311): dentro del bloque `isDevolucionNc` (L1291-1295), reemplazar el badge fijo `NC` por un condicional `clasificarOrigenNc(m) === 'ADM'` (texto/color) vs `POS` (idéntico al badge actual). Tras el `.map` de `items` (cierre de `tbody`), agregar hasta 4 `<tr>` condicionales (POS-USD, POS-Bs, ADM-USD, ADM-Bs), cada uno solo si su monto es `> 0`, reusando las clases de `CobranzasCxCTable` subtotal (`bg-*-50/40 border-t border-*-200`, label `colSpan`, monto `font-mono font-bold`).

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/reportes/hooks/use-cuadre.ts` | Modify | +1 columna SELECT, +1 campo en `MovimientoEfectivoDetalle`, +1 línea de mapeo |
| `src/features/reportes/components/cuadre-salidas-caja-model.ts` | Modify | +`clasificarOrigenNc`, +`splitSalidasNcPorOrigen` (funciones puras, sin DOM ni DB) |
| `src/features/reportes/components/cuadre-page.tsx` | Modify | Badge condicional POS/ADM en `MovimientosManualesTable`; filas subtotal al final del `tbody` |
| `src/features/reportes/components/__tests__/cuadre-salidas-caja-model.test.ts` | New/extend | Tests TDD de `clasificarOrigenNc` y `splitSalidasNcPorOrigen` |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|---------------|----------|
| Unit (puro) | `clasificarOrigenNc`: `nc_sesion_caja_id` no nulo/no vacío → `POS`; `null`/`''`/`undefined` → `ADM`; escenarios narrativos "POS devolver dinero" y "Admin REFUND_TESORERIA→SESION_CAJA" (ver Spec caja) | `cuadre-salidas-caja-model.test.ts`, sin mocks, `yarn test:run` |
| Unit (puro) | `splitSalidasNcPorOrigen`: mezcla POS/ADM × USD/Bs; caso un solo origen (el ausente da `0`, no `undefined`); caso sin filas NC (todo `0`) | Mismo archivo, fixtures inline |
| Unit (invariante) | `posUsd + admUsd === devolucionesNcUsd` y `posBsNativo + admBsNativo === devolucionesNcBsNativo`, comparando contra `splitEgresosArqueo` sobre el mismo fixture | Test cruzado en `cuadre-salidas-caja-model.test.ts` importando `splitEgresosArqueo` — prueba estructuralmente la Sección "Invariante sagrado" |
| Manual/visual | Badge y subtotales no rompen el grid de 4 columnas en mobile/desktop | Revisión visual en PR (fuera de `yarn test:run`, no automatizable sin infra E2E) |

## Migration / Rollout

No requiere migración SQL (`notas_credito.sesion_caja_id` ya existe desde `nc-cuadre-sesion`, y sigue existiendo en `schema.ts` de PowerSync). Sin cambios a `schema.ts`. Rollback trivial: revertir el commit restaura el badge único `NC` y el SELECT sin la columna nueva — cero impacto en datos persistidos.

## Out of Scope (explícito)

- Migraciones SQL.
- Cualquier cambio de escritura en `use-notas-credito.ts` (solo se lee `notas_credito.sesion_caja_id`, ya persistido hoy).
- Recalcular `egresosUsd`/`egresosBsNativo`/`splitEgresosArqueo` o el invariante `retiros + devolucionesNc + vueltos == total egresos` — estas funciones no se tocan ni se importan desde el modelo nuevo.
- Reordenar filas de `MovimientosManualesTable` (las subtotal van al final, no intercaladas).
- Módulo Clínica.

## Open Questions

- [ ] Confirmar el acento de color `purple` para el badge `NC · Adm` (elección de este documento) — si el equipo prefiere otro tono no usado en la tabla, es un cambio de una clase Tailwind, sin impacto en el resto del diseño.
</content>
