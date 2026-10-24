# Tasks: Trazabilidad Pago en Venta — Capa Simple (`crearVenta`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~130-190 (≈15-20 wiring en `use-ventas.ts` + ≈110-170 tests nuevos en `use-ventas.test.ts`, que YA existe con fixtures `mockTx`/`VentaTxFixtures` reutilizables — no hay costo de infra de test nueva) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR, stacked a main |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Wiring completo (Paso 5 + Paso 8) + tests nuevos, en 1 PR | PR 1 (único) | Base: main. Wiring y tests van en el mismo PR porque es TDD estricto sobre una sola ruta (`crearVenta`) — separarlos rompería la regla "tests con el codigo" de work-unit-commits sin ganar nada (no hay slice independiente real: Paso 8 no compila/tiene sentido sin Paso 5). Commits internos sí se separan (ver Fase 2 vs 3). |

Nota: `use-ventas.test.ts` YA EXISTE (1442 líneas, patrón `mockTx`/`VentaTxFixtures`/`beforeEach` maduro) — el riesgo de "infra de test inflando el PR" mencionado en el forecast del design NO aplica aquí; es una extensión de suite existente, no bootstrap.

## Phase 1: RED — Tests que fallan primero (TDD)

- [x] 1.1 En `src/features/ventas/hooks/__tests__/use-ventas.test.ts`, extender el stub de `tx.execute` para soportar fixtures de `metodosCobro`/`bancosEmpresa`/`monedasCodigoIso` (el array `calls` ya captura TODO `tx.execute`, incl. `INSERT INTO movimientos_bancarios_pagos`, sin cambios adicionales — el gap real era que el stub de `metodos_cobro` estaba hardcodeado a `deposito_directo=0`, impidiendo ejercer la rama de banco directo).
- [x] 1.2 Test: **pago directo simple (100% transferencia, `deposito_directo=1`)** — tras `crearVenta`, existe exactamente 1 INSERT a `movimientos_bancarios_pagos` con `pago_id` = el `id` insertado en `pagos` para ese leg y `monto_aplicado_usd` = `toStorageString` del monto exacto de la venta.
- [x] 1.3 Test: **pago mixto (transferencia $60 + efectivo $40)** — exactamente 1 fila puente (la del leg transferencia), 0 filas para el leg efectivo.
- [x] 1.4 Test: **100% efectivo / método batch (`deposito_directo=0` o sin `banco_empresa_id`)** — 0 filas puente, `crearVenta` no revienta.
- [x] 1.5 Test: **monto capeado, no recalculado (modo SAF-FACTURAS, `isSafWithAssignments`)** — `monto_aplicado_usd` del puente == `pagoMontoUsd` capeado de Paso 5, explícitamente distinto del `montoUsd` sin capear que usa Paso 8 para `pagosContadoContab`/accounting. Implementado con `discrepancy.montoUsd=0` para activar `isSafWithAssignments` sin ejecutar el switch completo de Paso 7c (ver Deviations).
- [x] 1.6 Test: **cap SAF a cero (branch `continue` de Paso 5, L859-862)** — ese leg no inserta en `pagos` y Paso 8 no inserta puente para él (`pagoIdsPorPago[i] === null`); el resto de legs de la misma venta SÍ generan su puente correctamente (prueba que el índice no se desalinea).
- [x] 1.7 Test de regresión: snapshot de las llamadas existentes (`pagos`, `movimientos_metodo_cobro`, `movimientos_bancarios`, `UPDATE bancos_empresa`, kardex) permanece sin cambios en SQL/params tras el wiring. Confirmado: 1.2, 1.3, 1.5, 1.6 fallaron en RED (ausencia del INSERT puente); 1.4 y 1.7 ya pasaban antes del wiring (negativo-space / snapshot, por diseño).
- [x] 1.8 Verificación RED: `yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts` — confirmado: 1.2, 1.3, 1.5, 1.6 fallaron (`expected [] to have a length of 1 but got +0`); 30/34 passed, 4 failed exactamente como lo predicho.

## Phase 2: GREEN — Wiring Paso 5 (correlación)

- [x] 2.1 En `src/features/ventas/hooks/use-ventas.ts`, tras L839 (antes del `for (const pago of pagos)` de Paso 5), declarado `const pagoIdsPorPago: Array<{ pagoId: string; montoUsd: Decimal } | null> = []`.
- [x] 2.2 En el branch de cap-a-cero (antes del `continue`), agregado `pagoIdsPorPago.push(null)`.
- [x] 2.3 Inmediatamente después del `INSERT INTO pagos` (antes del bloque `if (montoMovVenta.gt(0))`), agregado `pagoIdsPorPago.push({ pagoId, montoUsd: pagoMontoUsd })`.
- [x] 2.4 Verificado con `yarn type-check:test` — cero errores nuevos (solo baseline preexistente en archivos no tocados).

## Phase 3: GREEN — Wiring Paso 8 (INSERT puente) + imports

- [x] 3.1 Confirmado: `uuidv4` y `toStorageString` ya estaban importados en `use-ventas.ts` — cero imports nuevos.
- [x] 3.2 Cambiado `for (const pago of pagos)` (Paso 8) a `for (const [i, pago] of pagos.entries())`.
- [x] 3.3 Agregado inmediatamente después del `UPDATE bancos_empresa`, dentro del mismo `if (bancoId && depositoDirecto && montoUsd > 0)`: `const correlacion = pagoIdsPorPago[i]`, y si no es `null`, el INSERT puente con el shape exacto de `use-cxc.ts` (`INSERT INTO movimientos_bancarios_pagos (id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)` con `[uuidv4(), empresa_id, movBancoId, correlacion.pagoId, toStorageString(correlacion.montoUsd), now, usuario_id]`).
- [x] 3.4 Verificación GREEN: `yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts` — 34/34 passed (incluye un fix de test: el filtro `startsWith('INSERT INTO movimientos_bancarios')` matcheaba de forma ambigua también `movimientos_bancarios_pagos`; corregido a excluir explícitamente el sufijo `_pagos`).
- [x] 3.5 `yarn type-check:test` — cero errores nuevos atribuibles a este cambio (3 errores preexistentes en `producto-form-*.test.tsx` y `use-pwa-update.ts`, archivos no tocados por este change).

## Phase 4: Verificación final / Regresión amplia

- [x] 4.1 Corrida `yarn test:run src/features/ventas/hooks src/features/cxc/hooks` — 250/250 passed, 10/10 archivos. (La corrida amplia `src/features/ventas src/features/cxc`, que incluye componentes UI, mostró 2 timeouts preexistentes y no relacionados en `seleccion-lineas-nc.test.tsx`/`pago-factura-modal.test.tsx` — tests de UI con debounce/typing, 5000ms timeout, cero relación con `use-ventas.ts`/`use-cxc.ts`).
- [x] 4.2 Diff final de `use-ventas.ts` revisado: 100% aditivo (24 líneas agregadas, 3 líneas modificadas — únicamente la firma `for (const pago of pagos)` → `for (const [i, pago] of pagos.entries())`, sintácticamente equivalente; ninguna sentencia preexistente reordenada).
- [x] 4.3 Diff de `use-ventas.test.ts` revisado: nuevo `describe` hermano `crearVenta — trazabilidad movimientos_bancarios_pagos (capa simple, change trazabilidad-pago-en-venta-simple)` con 6 tests nuevos; único cambio a infraestructura preexistente fue extender `VentaTxFixtures` + las 2 funciones `mockCrearVentaTx*` con 3 branches nuevos (`metodosCobro`/`bancosEmpresa`/`monedasCodigoIso`), sin tocar ningún test preexistente.

## Deviations from Design

- **1.5/1.6 no usan la machinery real de SAF-FACTURAS**: en vez de construir fixtures completas para `aplicarPagoFacturaEnTx` (Paso 7c, Paso A), los tests usan `discrepancy.montoUsd=0` para saltar por completo el switch de Paso 7c (gate `discrepancy.montoUsd > 0.001`), mientras que `isSafWithAssignments` en Paso 5 solo depende de `discrepancy.mode==='SAF' && invoiceAssignments.length>0` (independiente de `montoUsd`). Esto activa el capeo de Paso 5 sin arrastrar el CxC completo — más simple, mismo code path ejercitado (`if (pagoMonto.lte(0.001)) { push(null); continue }`), sin riesgo adicional. Documentado inline en los tests.
- **1.6 ("cap SAF a cero") usa orden [válido, null] en vez de [null, válido]**: se confirmó por lectura del código que el capeo SAF es monotónico (una vez que `totalAbonadoUsd >= totalUsd`, TODOS los legs subsiguientes capean a cero) — por lo tanto un leg válido NUNCA puede seguir a un leg capeado-a-cero genuino dentro del mismo modo SAF. El test demuestra la garantía real y relevante: `pagoIdsPorPago.length === pagos.length` siempre (incluyendo el `null` final), y el leg previo sigue correlacionando correctamente.
