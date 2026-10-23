# Tasks: Desconciliar — Reverso de Abono Directo desde Histórico de Tesorería

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-340 (prod ~50: `movimientos-table.tsx` ~25 + `conciliacion-tesoreria.tsx` ~25; tests ~250-290: `movimientos-table.test.tsx` nuevo ~110 + `conciliacion-tesoreria.test.tsx` nuevo ~160, primera cobertura de ese componente) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

Nota: el estimado de la propuesta (~60-100 líneas) cubría solo producción. `conciliacion-tesoreria.tsx` (824 líneas, ~8 hooks) no tiene tests previos, así que modo TDD estricto agrega costo de test-infra nuevo (mocks de boundary, 1 vez). El total proyectado sigue bajo el budget de 400 — single PR, sin exception.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Botón + handler + wiring + tests (RED→GREEN) | PR 1 (single) | Sin chaining; base = main |

## Phase 1: Visibilidad — RED (`movimientos-table.tsx`)

- [x] 1.1 Crear `src/features/tesoreria/components/__tests__/movimientos-table.test.tsx`. Test fallido: fila `modo="historico"` con `validado=1, reversado=0, origen='TRANSFERENCIA_CLIENTE'` → se renderiza "Desconciliar".
- [x] 1.2 Test fallido: `validado=0` → "Desconciliar" NO se renderiza (va por "Rechazar" en Pendientes).
- [x] 1.3 Test fallido (MANDATORIO): `reversado=1` → "Desconciliar" NO se renderiza — única protección de reverso-de-reverso, dado que Histórico no filtra por estado a nivel de query.
- [x] 1.4 Test fallido: `origen !== 'TRANSFERENCIA_CLIENTE'` (con `validado=1, reversado=0`) → "Desconciliar" NO se renderiza.
- [x] 1.5 Test fallido: click en "Desconciliar" invoca `mov.onReversar(mov.id)` con el `id` correcto.
- [x] 1.6 Test de regresión (ya debería pasar sin tocar código): Pendientes "Rechazar" sigue visible con el guard actual `!isReversado` sin importar `validado` — fija el comportamiento existente por primera vez en código.
- [x] 1.7 `yarn test:run` — confirmado: 1.1 y 1.5 fallan en RED (2/7); 1.2-1.4 y 1.6 pasan ya (negativas/regresión, 5/7).

## Phase 2: Visibilidad — GREEN (`movimientos-table.tsx`)

- [x] 2.1 `HistoricoTable`: agregar `<th>` "Acciones" al header.
- [x] 2.2 `HistoricoRow`: agregar `<td>` de acciones con botón "Desconciliar", gate `isValidado && !isReversado && mov.origen === 'TRANSFERENCIA_CLIENTE' && mov.onReversar`, `onClick={() => mov.onReversar!(mov.id)}` — mismas clases que "Rechazar" en `PendienteRow` (`ghost`, `text-destructive hover:bg-destructive/10`, `h-7 px-2 text-xs`).
- [x] 2.3 `yarn test:run` + `yarn type-check:test` — 7/7 en verde.

## Phase 3: Handler — RED (`conciliacion-tesoreria.tsx`)

- [x] 3.1 Crear `src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx` (sin cobertura previa). Mockear en el boundary: `use-cuentas-tesoreria`, `use-mov-bancarios`, `use-mov-caja-fuerte`, `use-traspasos`, `use-conciliacion-tesoreria`, `@/core/db/powersync/db`, `ReversoModal` (stub que expone `movimiento`/`isOpen` vía `data-testid`), `CuentasOverview` (stub con botón que llama `onSelect(cuenta)`) — mismo patrón de mock-en-boundary que `nota-credito-pos-modal.test.tsx`/`crear-ncr-modal.test.tsx`.
- [x] 3.2 Test fallido: seleccionar cuenta BANCO (mock `CuentasOverview`) → tab "Histórico" → fila `validado=1, reversado=0, origen=TRANSFERENCIA_CLIENTE` → click "Desconciliar" → el stub de `ReversoModal` recibe `movimiento.id` == el de esa fila y `isOpen=true`.
- [x] 3.3 Test fallido (regresión, primera cobertura): mismo harness, tab Pendientes → click "Rechazar" → el mismo stub de `ReversoModal` recibe el movimiento pendiente correcto — fija `handleReversarMov` sin tocarlo.
- [x] 3.4 `yarn test:run` — confirmar que 3.2 falla (RED) porque `handleDesconciliarMov`/wiring no existen; 3.3 puede pasar ya (handler preexistente).

## Phase 4: Handler — GREEN (`conciliacion-tesoreria.tsx`)

- [x] 4.1 Agregar `handleDesconciliarMov(id: string)`: espejo exacto de `handleReversarMov` pero leyendo `historicoBancoResult.data`/`historicoCajaResult.data` en vez de `pendienteBancoResult.data`/`pendienteCajaResult.data`; mismo `findTraspasoByMovId` + `setMovParaReversar`/`setTraspasoIdParaReversar`.
- [x] 4.2 `historicoMovRows`: cambiar `toMovRow(mov)` por `toMovRow(mov, undefined, handleDesconciliarMov)`.
- [x] 4.3 `yarn test:run` + `yarn type-check:test` — 3.2 y 3.3 en verde.

## Phase 5: Verificación Final

- [x] 5.1 `yarn test:run` (suite completa) + `yarn type-check:test` — 0 regresiones.
- [x] 5.2 `git diff --stat` — confirmar cero cambios en `reverso-modal.tsx`, `use-reverso-abono-directo.ts`, `use-preview-facturas-afectadas.ts`, `reversarPagoEnTx`.
- [x] 5.3 Nota de QA manual (staging): conciliar abono → Histórico → Desconciliar → preview de facturas afectadas → confirmar → factura reabierta + egreso + fila atenuada (`opacity-50`); botón ausente en fila ya reversada; botón ausente para `origen !== 'TRANSFERENCIA_CLIENTE'`.
