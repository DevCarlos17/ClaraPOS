# Tasks: Trazabilidad Pago SAF en Venta POS

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150-230 (≈15-25 fixture infra + ≈25-40 wiring in `use-cxc.ts`/`use-ventas.ts` + ≈110-170 new tests across `use-ventas.test.ts`/`use-cxc.test.ts`, extending existing mature `mockCrearVentaTx`/`makeTx` fixture patterns — no new test infra bootstrap) |
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
| 1 | Fixture pre-step + return-type change + SAF bridge wiring + tests, en 1 PR | PR 1 (único) | Base: main. TDD estricto sobre una sola ruta (`crearVenta` SAF branch) — Phase 3 (GREEN) no compila/tiene sentido sin Phase 2 (RED) ni sin Phase 1 (fixture gap). Commits internos se separan por fase. |

## Phase 1: Test Infra — fixture gap fix (pre-step, no behavior change)

- [x] 1.1 En `use-ventas.test.ts`, agregar `ventasPendientes?: Record<string, { nro_factura: string; saldo_pend_usd: string; total_usd: string; tasa: string }>` a `VentaTxFixtures` (~L181-191).
- [x] 1.2 En `mockCrearVentaTx` (antes del fallback `return { rows: { length: 0, ... } }` ~L339), agregar branch `SELECT nro_factura, saldo_pend_usd, total_usd, tasa FROM ventas WHERE id = ?` resuelto por `params[0]` contra `opts.ventasPendientes`; venta no mapeada → `length: 0` (preserva "Factura no encontrada" para fixtures que no la definen).
- [x] 1.3 Evaluar si `mockCrearVentaTxStatefulCliente` (~L369) necesita la misma branch; agregarla SOLO si algún test de Phase 2 la usa, si no documentar "no requerido". → No requerido: todos los casos SAF/FIFO de Phase 2 usan `mockCrearVentaTx` (estatico), consistente con los tests SAF preexistentes del mismo describe block.
- [x] 1.4 Verificar: cero cambios de expectativas — `yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts` sigue 100% verde (mismo conteo que baseline: 34/34).

## Phase 2: RED — tests que fallan primero (TDD)

- [x] 2.1 `use-cxc.test.ts`, describe bridge (~L1492): test que `aplicarPagoFacturaEnTx` RETORNA `{pagoId, montoUsd}` (match con el `id`/monto del INSERT a `pagos` capturado) — falla hoy (`undefined`).
- [x] 2.2 `use-ventas.test.ts`, nuevo describe `crearVenta — trazabilidad movimientos_bancarios_pagos (capa SAF/FIFO, change trazabilidad-pago-saf-en-venta-pos)`:
  - [x] 2.2.1 FIFO a 1 factura vieja: excedente cierra 1 factura → exactamente 1 fila puente extra (`ingreso_id` = `movBancoId` del leg `pagoSaf`, `pago_id` = pago FIFO, `monto_aplicado_usd` capeado).
  - [x] 2.2.2 FIFO a 3 facturas viejas → 3 filas puente extra, mismo `ingreso_id`.
  - [x] 2.2.3 Remanente/anticipo solo (`pagoExcedenteIdSaf`, `venta_id=NULL`) → 1 fila puente.
  - [x] 2.2.4 Combinado (2 facturas FIFO + remanente) → 3 filas puente extra, mismo `ingreso_id`.
  - [x] 2.2.5 Pago mixto (leg BS `deposito_directo=1` fondea SAF + leg efectivo): TODAS las filas SAF/FIFO atan al `movBancoId` del leg BS; leg efectivo con 0 filas/sin movimiento.
  - [x] 2.2.6 No-regresión: fila `correlacion` de venta simple (Paso 5/8) sin cambios, supresión `isPosAllocation` intacta, ningún `pago`/`movimiento_cuenta` existente mutado (snapshot de calls previos).
- [x] 2.3 Verificar RED: `yarn test:run src/features/ventas/hooks src/features/cxc/hooks` — 2.1 y 2.2.1-2.2.5 fallan (ausencia de INSERT puente extra / forma de retorno incorrecta); 2.2.6 pasa ya (negative-space, por diseño). **Gap adicional descubierto** (no documentado originalmente): `aplicarPagoFacturaEnTx` resuelve moneda via query parametrizada (`codigo_iso = ?`), distinta de las queries literales (`codigo_iso = 'USD'`) que ya cubria el mock de `crearVenta` — se agrego una rama extra a `mockCrearVentaTx` (mismo fixture pre-step, cero cambio de comportamiento) para que el RED exponga el gap real (ausencia de filas puente) en vez de un crash de fixture.

## Phase 3: GREEN — implementación

- [x] 3.1 `src/features/cxc/hooks/use-cxc.ts` L500-504: `aplicarPagoFacturaEnTx` cambia `Promise<void>` → `Promise<{ pagoId: string; montoUsd: Decimal }>`.
- [x] 3.2 Mismo archivo, fin de función (~L778, antes del `}` de L779): agregar `return { pagoId, montoUsd }`.
- [x] 3.3 `src/features/ventas/hooks/use-ventas.ts` ~L1141 (antes de `if (discrepancy && discrepancy.mode...)`): hoist `let pagoSafIndex = -1` y `const safFifoBridgeEntries: Array<{ pagoId: string; montoUsd: Decimal }> = []` a scope de función.
- [x] 3.4 ~L1150 dentro de `case 'SAF'`: tras `const pagoSaf = pagos.find(...) ?? pagos[0]`, fijar `pagoSafIndex = pagos.indexOf(pagoSaf)`.
- [x] 3.5 ~L1168 Paso A (loop FIFO): destructurar el `await aplicarPagoFacturaEnTx(...)` y `safFifoBridgeEntries.push({ pagoId, montoUsd })` con el valor retornado (NO re-derivado de `inv.montoUsd`).
- [x] 3.6 ~L1224-1234 Paso B (remanente/anticipo): tras el INSERT a `pagos` con `pagoExcedenteIdSaf`, `safFifoBridgeEntries.push({ pagoId: pagoExcedenteIdSaf, montoUsd: remainingSaf })`.
- [x] 3.7 ~L1804-1811 Paso 8 (dentro de `if (bancoId && depositoDirecto && montoUsd > 0)`, tras el INSERT puente `correlacion` existente): agregar `if (i === pagoSafIndex) { for (const entry of safFifoBridgeEntries) { INSERT INTO movimientos_bancarios_pagos (...) VALUES (uuidv4(), empresa_id, movBancoId, entry.pagoId, toStorageString(entry.montoUsd), now, usuario_id) } }`.
- [x] 3.8 `yarn type-check:test` — cero errores nuevos (4 errores pre-existentes en archivos no tocados por este change, confirmados identicos via `git stash` contra baseline `develop`); el call site L929 de `use-cxc.ts` (ignora el retorno) sigue compilando sin cambios.

## Phase 4: Verificación final / Regresión amplia

- [x] 4.1 `yarn test:run src/features/ventas/hooks src/features/cxc/hooks` — 100% verde (277/277: 270 baseline + 7 nuevos), incluye los tests de Phase 2 ahora en GREEN.
- [x] 4.2 `yarn test:run src/features/tesoreria/hooks` — 30/30 verde, sin tocar esos archivos: confirma que `previewFacturasAfectadas`/`reversarAbonoDirectoDesdeTesoreria` detectan/revierten las filas SAF nuevas sin cambio de código (design: "no new detection logic").
- [x] 4.3 `yarn type-check:test` — cero errores nuevos a nivel de proyecto (4 errores pre-existentes, idénticos en baseline `develop` via `git stash`, en archivos no tocados por este change).
- [x] 4.4 Revisar diff final: 100% aditivo confirmado via `git diff` — unicas lineas `-` son el tipo de retorno (`void`→objeto) y la linea de la llamada que ahora destructura el mismo `await aplicarPagoFacturaEnTx(...)`; ninguna sentencia preexistente reordenada/eliminada en `use-cxc.ts`/`use-ventas.ts`.

### Nota de forecast (post-implementacion)

Diff real: `use-cxc.ts` +4/-2, `use-ventas.ts` +38/-2 (wiring, ~42 lineas netas, dentro del rango estimado ≈25-40) + `use-cxc.test.ts` +22, `use-ventas.test.ts` +350 (tests, 372 lineas — por ENCIMA del rango estimado ≈110-170, por el estilo de comentarios extensivo ya establecido en el archivo). **Total: 412 inserciones / 2 eliminaciones = 414 lineas cambiadas — supera el presupuesto de revision de 400 lineas** (vs. forecast original "Low risk", 150-230). Causa: 6 escenarios RED (2.2.1-2.2.6) con fixtures y comentarios verbosos consistentes con el resto del archivo, no logica de mas. Reportado como riesgo en el return summary — no se detuvo la implementacion porque el PR sigue siendo una sola unidad de trabajo coherente (no hay forma natural de partir 1 sola ruta de codigo en 2 PRs sin romper TDD atomico), pero el reviewer deberia saberlo antes de aprobar.

## Scope Guards (NO tocar — recordatorios)

- NO alterar la supresión `isPosAllocation` (`use-cxc.ts` L579).
- NO alterar el bridge `correlacion` de la venta simple (Paso 5/8, `pagoIdsPorPago`) ya mergeado en `trazabilidad-pago-en-venta-simple`.
- NO expandir cobertura a métodos no-`deposito_directo` (batch) — limitación preexistente, fuera de alcance explícito.
- NO correr `yarn format`/`prettier --write` — el repo no tiene config de Prettier; corrompería el estilo.
