# Proposal: Trazabilidad Pago en Venta — Capa SAF/FIFO (`crearVenta`)

> Change: `trazabilidad-pago-saf-en-venta-pos` | Phase: propose | Project: clarapos

## Intent

`trazabilidad-pago-en-venta-simple` (mergeado, PR #263) cableó el puente `movimientos_bancarios_pagos` para el camino POS "simple" en `crearVenta` (1 pago leg -> 1 ingreso -> 1 fila puente), pero dejó explícitamente fuera el camino SAF/FIFO (Paso 7c, `discrepancy.mode==='SAF'`): cuando un pago POS excede la factura de caja, el excedente se aplica vía FIFO a facturas viejas pendientes y/o se promueve a anticipo (`saf_creditos_lotes`). Bug reportado: un pago de 1000 (500 cierra la factura de caja, 500 de excedente aplicado por FIFO a una factura vieja) muestra 1 solo ingreso de 1000 en Tesorería; al revertirlo, solo se detecta la factura de caja (500) — la factura FIFO (500) queda invisible.

Causa raíz CONFIRMADA (exploración, obs-4fea2ec5921de64a): el Paso 7c de `crearVenta` crea pagos de excedente (FIFO a factura vieja Y remanente/anticipo) que nunca reciben fila puente, porque `aplicarPagoFacturaEnTx` (use-cxc.ts) siempre se invoca con `skipBankAndAccounting:true` desde POS, lo que salta por completo el bloque que contiene el INSERT puente. `previewFacturasAfectadas` (único mecanismo de detección, consulta solo esa tabla) y el orquestador de reverso nunca ven esos pagos.

## Scope

### In Scope
- Cambiar `aplicarPagoFacturaEnTx` (`use-cxc.ts:500`) de `Promise<void>` a `Promise<{ pagoId: string; montoUsd: Decimal }>`.
- Paso 7c de `crearVenta` (`use-ventas.ts:1143-1313`): capturar el retorno de CADA invocación FIFO (Paso A, `invoiceAssignments`) más el pago remanente/anticipo (Paso B, `pagoExcedenteIdSaf`) en un array `safFifoBridgeEntries[]` de alcance de función.
- Paso 8 (`use-ventas.ts:1716-1813`): volcar `safFifoBridgeEntries` como filas puente adicionales contra el `movBancoId` del leg que fondea el SAF (`pagoSaf = pagos.find(p => p.moneda==='BS') ?? pagos[0]`), aditivo a la fila `correlacion` ya existente para ese mismo leg.
- Extender `use-ventas.test.ts` (describe `crearVenta — trazabilidad movimientos_bancarios_pagos`) con casos SAF: FIFO-a-factura-vieja, remanente/anticipo, ambos combinados.
- Extender `use-cxc.test.ts` con un caso que asegure la nueva forma de retorno (`pagoId`/`montoUsd`) de `aplicarPagoFacturaEnTx`.

### Out of Scope
- La supresión `isPosAllocation=1` de `movimientos_metodo_cobro`: sin cambios.
- La correlación de bridge de la venta "simple" (Paso 5/8 sobre `pagos[]` original, ya mergeada): sin cambios.
- Limitación pre-existente "métodos no-`deposito_directo` nunca generan fila puente" (batch/lote): fuera de alcance, no relacionado con este bug.
- Bug `ventas.tipo` no actualizado en reverso: ya diferido en el change anterior.
- Backfill de pagos SAF legacy: no aplica (datos de prueba).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `tesoreria-trazabilidad-ingreso-pagos`: extiende la spec para cubrir el camino SAF/FIFO-a-factura-vieja y el remanente/anticipo generados dentro de `crearVenta` (POS), que hoy quedan sin fila puente y por tanto invisibles para `previewFacturasAfectadas` y el reverso de tesorería.

## Approach

Espejar el patrón `bridgeEntries[]` fan-in ya usado por `registrarAbonoGlobal` (CxC):
1. `aplicarPagoFacturaEnTx` retorna `{pagoId, montoUsd}` en vez de `void` (cambio aditivo — los call sites existentes que ignoran el retorno, como `registrarPagoFactura` L927, siguen compilando).
2. Paso 7c acumula un `pagoId` por cada factura FIFO tocada (loop existente sobre `invoiceAssignments`) MÁS el `pagoId` del remanente/anticipo cuando existe — ambos en `safFifoBridgeEntries[]`.
3. Paso 8 inserta 1 fila puente por entrada de `safFifoBridgeEntries`, todas vinculadas al `movBancoId` del leg `pagoSaf`, dentro de la misma `writeTransaction`.

**Por qué el remanente/anticipo NO es cosmético**: el chequeo de seguridad SAF en `reversarAbonoDirectoDesdeTesoreria` (bloquea revertir un pago cuyo crédito de excedente ya fue consumido en otra factura) solo puede dispararse si ese pago tiene fila puente. Sin bridgear el remanente/anticipo, un reverso podría proceder sin esa validación y corromper estado silenciosamente. Es un requisito duro, no un nice-to-have.

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `src/features/cxc/hooks/use-cxc.ts` | Modified | `aplicarPagoFacturaEnTx` (L500) cambia tipo de retorno a `{pagoId, montoUsd}` |
| `src/features/ventas/hooks/use-ventas.ts` | Modified | Paso 7c (~L1143-1313) captura `safFifoBridgeEntries[]`; Paso 8 (~L1716-1813) INSERT puente adicional por entrada |
| `src/features/ventas/hooks/__tests__/use-ventas.test.ts` | Modified | Nuevos casos SAF en el describe de bridge ya existente (fixtures L768, L834, L1605, L1658) |
| `src/features/cxc/hooks/__tests__/use-cxc.test.ts` | Modified | Caso de aserción sobre la nueva forma de retorno |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cambiar el tipo de retorno de `aplicarPagoFacturaEnTx`, función financiera compartida | Medium | Cambio aditivo (`void`->objeto); suite completa `use-cxc.test.ts` debe seguir verde + nueva aserción de forma |
| Atribuir `safFifoBridgeEntries` al leg incorrecto (`pagoSafIndex` mal calculado en pago mixto) | Medium | Indexar explícitamente por `pagos.indexOf(pagoSaf)`; test de regresión con pago mixto + SAF |
| Confundir este fix con la limitación pre-existente de métodos batch | Low | Fuera de alcance documentado explícitamente; no se toca el guard `depositoDirecto===1` |
| Doble-conteo si se reintroduce el bloque `skipBankAndAccounting` bridge dentro de `aplicarPagoFacturaEnTx` | Low | El INSERT puente para SAF se hace SOLO en Paso 8 de `use-ventas.ts`, nunca dentro de `aplicarPagoFacturaEnTx` |

## Rollback Plan

Revertir el commit de wiring: el cambio de retorno de `aplicarPagoFacturaEnTx` y los nuevos INSERT puente en Paso 8 son aditivos sobre código ya existente. Los writes de `pagos`, `ventas.saldo_pend_usd`, `saf_creditos_lotes` y `movimientos_cuenta` no se alteran. La tabla puente simplemente deja de poblarse para el camino SAF; sin pérdida de datos ni breaking change de tipos en call sites existentes.

## Dependencies

- Requiere `trazabilidad-pago-en-venta-simple` (PR #263, mergeado a `develop` 2026-10-24) — este change es su follow-up directo.
- Requiere `migrations/0117_movimientos_bancarios_pagos.sql` (ya mergeada).
- Construye sobre engram `sdd/trazabilidad-pago-saf-en-venta-pos/explore` (obs-4fea2ec5921de64a).

## Effort Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~30-50 (wiring: 1 return-type + 2 bloques aditivos) + ~60-100 (tests) |
| Chained PRs recommended | No — 1 PR, diff pequeño |
| 400-line budget risk | Low |
| Decision needed before apply | Recomendado: spec delta + design corto (diagrama de secuencia para el `pagoSafIndex` y el fan-in de `safFifoBridgeEntries`) antes de tasks, por tocar función financiera compartida (`aplicarPagoFacturaEnTx`) |

## Verification Plan

- `yarn test:run` (TDD estricto, RED-GREEN-REFACTOR): nuevos casos SAF en `use-ventas.test.ts` (FIFO solo, remanente/anticipo solo, ambos combinados, pago mixto+SAF) + caso de forma de retorno en `use-cxc.test.ts`; suite completa de ambos archivos debe quedar verde.
- `yarn type-check` sin errores tras el cambio de firma.
- QA manual en staging: venta POS con excedente FIFO a factura vieja -> preview de reverso detecta AMBAS facturas afectadas (caja + FIFO) -> reverso bloquea si el excedente ya fue consumido en otra factura.

## Success Criteria

- [ ] Todo pago FIFO-a-factura-vieja creado en Paso 7c tiene exactamente 1 fila puente vinculada al `movBancoId` del leg `pagoSaf`
- [ ] Todo pago remanente/anticipo (`pagoExcedenteIdSaf`) creado en Paso 7c tiene exactamente 1 fila puente
- [ ] `previewFacturasAfectadas` detecta TODAS las facturas afectadas por un pago con excedente SAF (caja + FIFO), no solo la de caja
- [ ] El chequeo de seguridad SAF en `reversarAbonoDirectoDesdeTesoreria` se dispara correctamente cuando el excedente ya fue consumido
- [ ] `yarn test:run` y `yarn type-check` pasan sin errores; suite `use-cxc.test.ts` sigue verde
