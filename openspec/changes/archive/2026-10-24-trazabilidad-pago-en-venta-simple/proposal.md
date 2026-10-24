# Proposal: Trazabilidad Pago en Venta — Capa Simple (`crearVenta`)

> Change: `trazabilidad-pago-en-venta-simple` | Phase: propose | Project: clarapos

## Intent

`trazabilidad-ingreso-pagos-directo` (mergeado, PR #254/#255) ya cablea el puente `movimientos_bancarios_pagos` para abonos directos vía CxC (`aplicarPagoFacturaEnTx`, `registrarAbonoGlobal`). Pero el camino POS — un cliente paga por transferencia **al momento de facturar** en `crearVenta` — quedó fuera: ningún INGRESO `doc_origen_tipo='VENTA'` tiene fila puente. Causa raíz confirmada por exploración (#5730): dos loops separados (~850 líneas) sobre el mismo array `pagos[]` — Paso 5 crea cada `pago` con `pagoId=uuidv4()` local nunca capturado fuera del loop; Paso 8 crea el INGRESO bancario sin canal de correlación hacia ese `pagoId`. Resultado: el preview "facturas afectadas" y el reverso de tesorería — ya mergeados y genéricos por `pago_id` — no funcionan para ventas POS pagadas por transferencia; muestran LEGACY.

## Scope

### In Scope
- Capturar `pagoId` de cada leg en un array indexado paralelo (`pagoIdsPorPago[]`) en Paso 5, sin reordenar nada existente.
- Insertar 1 fila puente por leg de método directo en Paso 8 (dentro del guard `depositoDirecto===1` ya existente), usando el monto REAL insertado en `pagos` (capeado), no el recalculado de Paso 8.
- Todo dentro de la misma `db.writeTransaction` ya existente.

### Out of Scope
- **Capa SAF-overflow** (`discrepancy.mode==='SAF'` con `invoiceAssignments`, fan-out hacia otras facturas vía `aplicarPagoFacturaEnTx(skipBankAndAccounting:true)`): requiere cambiar la firma de `aplicarPagoFacturaEnTx` para exponer `pagoId`; mayor radio de impacto. Diferido (engram `sdd/reverso-abono-tesoreria/deuda-tecnica-diferida-venta` #5732). Estos ingresos quedan LEGACY.
- **Bug `ventas.tipo` en reverso**: `reversarPagoEnTx` nunca actualiza `ventas.tipo`; una venta CONTADO reversada queda con `saldo_pend_usd>0` pero `tipo='CONTADO'`. Es bug del reverso, no del wiring. Diferido.
- Bug cosmético de formato Bs/$ en `ReversoModal`.
- Sin backfill: INGRESOS VENTA existentes quedan LEGACY (data de prueba).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `tesoreria-trazabilidad-ingreso-pagos`: extiende el requisito "caso simple, 1 pago, 1 fila puente" para cubrir también INGRESOS creados desde `crearVenta` (origen POS), no solo desde CxC.

## Approach

Solo en `src/features/ventas/hooks/use-ventas.ts`, aditivo:
1. **Paso 5** (~L838-911): junto al `pagoId=uuidv4()` existente (L841), empujar `{pagoId, montoUsd: pagoMontoUsd}` a `pagoIdsPorPago[]` indexado por el mismo índice del loop.
2. **Paso 8** (~L1709-1835), dentro del guard `depositoDirecto===1`, inmediatamente después del INSERT a `movimientos_bancarios` (L1768-1783) que genera `movBancoId`: INSERT a `movimientos_bancarios_pagos` con `ingreso_id=movBancoId`, `pago_id` y `monto_aplicado_usd` desde `pagoIdsPorPago[i]`, `empresa_id`, `created_at`, `created_by`.
3. Mixed payment (N legs): hasta N filas puente, solo para legs directos — legs en efectivo no generan fila.

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `src/features/ventas/hooks/use-ventas.ts` | Modified | Paso 5 (~L838-911) captura `pagoIdsPorPago[]`; Paso 8 (~L1709-1835) INSERT puente |
| `src/features/ventas/hooks/__tests__/*.test.ts` | New | Casos: 1 pago directo, mixto directo+efectivo, 100% efectivo (0 filas), regresión de `crearVenta` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tocar `crearVenta`, función financiera crítica (1526 líneas, 1 tx) | Medium | Solo INSERTs/push aditivos; cero reorder; cobertura Vitest de regresión obligatoria |
| Usar el monto recalculado de Paso 8 en vez del capeado de Paso 5 | Low | Test explícito que asertа `monto_aplicado_usd` == `pagoMontoUsd` capeado, no `montoUsd` de Paso 8 |
| Confundir capa simple con SAF-overflow y cablear parcial | Medium | Guard existente `depositoDirecto===1` ya excluye SAF del bridge por diseño; SAF documentado como deferred |

## Rollback Plan

Revertir el commit de wiring: el `pagoIdsPorPago[]` y los INSERT puente son 100% aditivos, los writes existentes de `pagos`/`movimientos_bancarios` quedan intactos. La tabla puente simplemente deja de poblarse para este camino; sin pérdida de datos.

## Dependencies

- Requiere `migrations/0117_movimientos_bancarios_pagos.sql` (ya mergeada).
- Construye sobre engram `sdd/reverso-abono-tesoreria/explore-brecha-trazabilidad-venta` (#5730) y `deuda-tecnica-diferida-venta` (#5732).

## Effort Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~40-70 (wiring) + ~80-120 (tests) |
| Chained PRs recommended | No — 1 PR, stacked a main |
| 400-line budget risk | Low |
| Decision needed before apply | Recomendado: spec liviana (escenarios del wiring) + design corto (forma exacta de `pagoIdsPorPago[]` y puntos de inserción) antes de tasks, por la sutileza de correlación entre los dos loops y por ser `crearVenta` ruta crítica |

## Verification Plan

- `yarn test:run` (Vitest, TDD estricto): bridge rows correctas para pago directo simple; mixto (1 fila por leg directo, 0 para efectivo); comportamiento existente de `crearVenta` sin cambios.
- QA manual en staging: venta POS nueva pagada por transferencia → verificar fila en `movimientos_bancarios_pagos` → preview de reverso muestra la factura (no LEGACY).

## Success Criteria

- [ ] Todo INGRESO `doc_origen_tipo='VENTA'` de método directo tiene exactamente 1 fila puente con `monto_aplicado_usd` = monto real del pago
- [ ] Pago mixto (directo + efectivo) genera 1 fila puente solo para el leg directo
- [ ] `yarn test:run` y `yarn type-check:test` pasan sin errores
- [ ] Preview "facturas afectadas" deja de mostrar LEGACY para ventas POS nuevas pagadas por transferencia
