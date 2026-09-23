# Tasks: Desglose Salidas NC por Origen (POS vs Administración) en Cuadre de Caja

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-240 (model +50, tests +90, use-cuadre +4, cuadre-page +60) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr-default |
| Chain strategy | pending (no chaining needed) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `clasificarOrigenNc` + tests | PR único | Commit 1 (RED+GREEN juntos) |
| 2 | `splitSalidasNcPorOrigen` + tests | PR único | Commit 2, depende de Unit 1 |
| 3 | Test cruzado de invariante | PR único | Commit 3, depende de Unit 1+2 |
| 4 | Wiring `use-cuadre.ts` | PR único | Commit 4, sin tests nuevos (mapeo trivial) |
| 5 | Wiring `cuadre-page.tsx` (badge + subtotales) | PR único | Commit 5, cierre de la feature |

---

## Phase 1: `clasificarOrigenNc` (TDD)

- [x] 1.1 RED — En `src/features/reportes/components/__tests__/cuadre-salidas-caja-model.test.ts`, agregar `describe('clasificarOrigenNc')` con 5 casos: `REFUND_TESORERIA`→`'ADM'`; `EFECTIVO_REAL`, `SALDO_FAVOR`, `COMPENSACION_VENTA`, `AJUSTE_CXC`→`'POS'`; `null`→`'POS'`.
- [x] 1.2 GREEN — En `src/features/reportes/components/cuadre-salidas-caja-model.ts`, agregar `export type OrigenSalidaNc = 'POS' | 'ADM'`, `export interface ClasificacionNcInput { liquidacion_modalidad: string | null }` y `export function clasificarOrigenNc(item: ClasificacionNcInput): OrigenSalidaNc` (retorna `'ADM'` solo si `liquidacion_modalidad === 'REFUND_TESORERIA'`).

## Phase 2: `splitSalidasNcPorOrigen` (TDD)

- [x] 2.1 RED — Mismo archivo de test: `describe('splitSalidasNcPorOrigen')` con casos: mezcla POS/ADM en USD y Bs (verifica los 4 campos); solo origen POS (los campos ADM dan `0`, no `undefined`); solo origen ADM; `items: []` (todo `0`).
- [x] 2.2 GREEN — En `cuadre-salidas-caja-model.ts`, agregar `export interface SalidaNcSubtotalItem extends ClasificacionNcInput { origen: string; metodo_moneda: string; monto: string }`, `export interface SalidasNcSubtotales { posUsd: number; posBsNativo: number; admUsd: number; admBsNativo: number }` y `export function splitSalidasNcPorOrigen(items: SalidaNcSubtotalItem[]): SalidasNcSubtotales` — filtra por `ORIGENES_DEVOLUCION_NC` (ya importado), separa por `clasificarOrigenNc` × moneda nativa (`metodo_moneda === 'BS'` vs no), suma `parseFloat(monto)`.

## Phase 3: Invariante cruzado (sagrado)

- [x] 3.1 Test — En el mismo archivo, `describe('invariante: split por origen reconstruye splitEgresosArqueo')`: importar `splitEgresosArqueo` de `../cuadre-arqueo-teorico-model`; con un fixture mixto (POS+ADM, USD+Bs) construir ambas vistas (`SalidaNcSubtotalItem[]` y `MovimientoManualItem[]`) desde los mismos montos/monedas y assertar `posUsd + admUsd === devolucionesNcUsd` y `posBsNativo + admBsNativo === devolucionesNcBsNativo`.
- [x] 3.2 Verificar — `yarn test:run src/features/reportes/components/__tests__/cuadre-salidas-caja-model.test.ts` en verde; confirmar que Phase 1-3 no importan ni modifican `splitEgresosArqueo`.

## Phase 4: Wiring `use-cuadre.ts`

- [x] 4.1 En `MovimientoEfectivoDetalle` (L1502-1513), agregar campo `liquidacion_modalidad: string | null`.
- [x] 4.2 En el SELECT de `useMovimientosEfectivoCaja` (L1523-1539), agregar `nc.liquidacion_modalidad as liquidacion_modalidad` junto a `nc.nro_ncr as nro_ncr` (mismo JOIN existente a `notas_credito`, sin JOIN nuevo).
- [x] 4.3 En el mapeo de fila (L1544-1555), agregar `liquidacion_modalidad: row.liquidacion_modalidad ? String(row.liquidacion_modalidad) : null` (mismo patrón null-safe que `nro_ncr`).

## Phase 5: Wiring `cuadre-page.tsx`

- [x] 5.1 Importar `clasificarOrigenNc` y `splitSalidasNcPorOrigen` desde `./cuadre-salidas-caja-model` en `cuadre-page.tsx`.
- [x] 5.2 En `MovimientosManualesTable` (bloque `isDevolucionNc`, L1291-1295), reemplazar el badge fijo `NC` por condicional: `clasificarOrigenNc(m) === 'ADM'` → badge `NC · Adm` (`bg-purple-100 text-purple-700`); caso contrario → badge `NC` idéntico al actual (`bg-red-100 text-red-700`).
- [x] 5.3 Dentro de `MovimientosManualesTable`, calcular `const ncSubtotales = splitSalidasNcPorOrigen(items)` antes del `return`; tras el cierre del `.map` de `items` (fin del `tbody`, ~L1306), agregar hasta 4 `<tr>` condicionales (POS-USD, POS-Bs, ADM-USD, ADM-Bs) — cada una renderiza solo si su monto es `> 0`, reusando clases del subtotal de `CobranzasCxCTable` (L1399-1410: `bg-*-50/40 border-t border-*-200`, label `colSpan`, monto `font-mono font-bold`) con acento `red-*` para POS y `purple-*` para ADM.
- [x] 5.4 Verificación manual — confirmar que sin filas NC no aparece ninguna fila subtotal, y con un solo origen no aparece el subtotal del origen ausente (ni en $0.00). (Verificado por lógica: cada `<tr>` esta guardado por `monto > 0`, mismo mecanismo cubierto por los tests de `splitSalidasNcPorOrigen` — sin filas NC, todos los buckets dan `0` y ninguna fila renderiza.)

## Phase 6: Cierre

- [x] 6.1 `yarn test:run` completo en verde (salvo fallas preexistentes no relacionadas — ver reporte de apply).
- [x] 6.2 `yarn type-check` y `yarn type-check:test` en verde (salvo ruido preexistente esperado en `*.test.ts` sin globals de vitest tipados, y 3 errores preexistentes no relacionados en `producto-form-*` / `use-pwa-update.ts`, verificados idénticos en `git stash`).
- [x] 6.3 Confirmar que ningún valor de `egresosUsd`, `egresosBsNativo`, `devolucionesNc*`, `retiros*`, `vueltos*` (Card "Arqueo Teórico") cambió — revisión visual + Phase 3 como evidencia automatizada. `splitEgresosArqueo` no fue importado ni modificado por el código de produccion nuevo (solo por el test cruzado); test de invariante en verde.
