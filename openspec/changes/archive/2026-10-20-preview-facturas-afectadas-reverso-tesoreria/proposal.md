# Proposal: Preview "Facturas Afectadas" en Reverso de Tesorería (read-only)

> Change: `preview-facturas-afectadas-reverso-tesoreria` | Phase: propose | Project: clarapos

## Intent

Hoy, el modal de reverso de tesorería (`reverso-modal.tsx`) reversa un INGRESO bancario sin mostrar al usuario **qué facturas de cliente se verían afectadas**. El único aviso que existe (`esTransferenciaCliente`, L55-56) está muerto: compara `doc_origen_tipo === 'PAGO'`, pero el código real nunca escribe ese valor (siempre `'VENTA'` o `'PAGO_CXC'`) — el warning nunca dispara, confirmado en `sdd/reverso-abono-tesoreria/explore-preview-facturas-afectadas` (#5585) y en `explore-estado-actual` (#5561, hallazgo 6).

Esto deja al usuario reversando dinero de abonos de cliente a ciegas: no ve si el ingreso pagó 1 o 3 facturas directamente, ni si consumió un excedente que terminó aplicado via SAF a otras facturas. El puente `movimientos_bancarios_pagos` (change `trazabilidad-ingreso-pagos-directo`, ya en staging/merged) cierra el gap de datos que bloqueaba esto. Este slice consume ese puente para dar visibilidad — **no reversa nada todavía**.

## Scope

### In Scope
- Hook/función de lectura pura que, dado un `ingreso_id`, resuelve: facturas directas (A,B,C vía `pagos.venta_id`) + facturas vía SAF (D,E vía `detectarLoteSafDePago` reusado sin cambios).
- Fix de la condición muerta `esTransferenciaCliente` → `movimiento?.origen === 'TRANSFERENCIA_CLIENTE'`.
- Panel read-only en `reverso-modal.tsx` que renderiza las facturas afectadas en el mismo punto donde hoy vive el warning roto.
- Filtro `is_reversed = 0` (o NULL) en pagos, convención ya usada en 8+ sitios del repo.
- 2 slices encadenados (1a-hook, 1b-panel), 2 PRs individuales, stacked a main.

### Out of Scope
- El reverso real (contra-asiento, reapertura de facturas, desenredo SAF) — change futuro separado.
- El modal de consulta de factura en la pantalla de emisión — superficie distinta, slice futuro separado.
- El camino BATCH/LOTE (abonos consolidados al cierre) — su read-helper es slice 0b, no entregado aquí.
- Cualquier permiso nuevo: es un panel read-only, estrictamente menos riesgoso que el botón "Reversar" ya existente hoy sin gate (`TESORERIA_REVERSE` no existe en `use-permissions.ts`) — no se agrega aquí.
- Tema de redondeo de montos — fuera de alcance de este slice.

## Capabilities

### New Capabilities
- `tesoreria-preview-facturas-afectadas`: dado un `ingreso_id` de un abono directo de cliente, resuelve y expone (solo lectura) el conjunto de facturas que un reverso futuro afectaría — directas y vía SAF — con sus montos aplicados.

### Modified Capabilities
- `tesoreria-trazabilidad-ingreso-pagos`: no cambia su contrato (sigue siendo append-only, sin UPDATE/DELETE); este change es un *consumidor* de lectura, no agrega requisitos nuevos a esa capability. Se documenta aquí solo como dependencia, no como delta.

## Approach

**Slice 1a — hook de lectura** (`src/features/tesoreria/hooks/use-preview-facturas-afectadas.ts` o función pura equivalente):
- Join: `movimientos_bancarios_pagos.ingreso_id = ingresoId` → N `pago_id` → `pagos.venta_id` (no-NULL) = facturas directas. `pagos.venta_id` es autoritativo, no hace falta pasar por `pagos_aplicaciones` (confirmado: 1 pago = 1 venta_id o NULL, nunca split).
- Para TODOS los `pago_id` del bridge (sin pre-filtrar por NULL), llamar `detectarLoteSafDePago(empresaId, pagoId)` (reusado as-is de `src/features/cxc/hooks/reversa-pago-saf.ts`) — no-op barato para los que ya tienen venta_id, resuelve facturas D,E para los de anticipo/excedente.
- Filtrar `pagos.is_reversed = 0`/NULL antes de incluir cualquier pago en el resultado.
- 100% offline: `db.getAll` local (SQLite), sin round-trip a servidor — las 6 tablas necesarias ya están en `backend/powersync-sync-rules.yaml`. No usar `useQuery` reactivo: es un snapshot bajo demanda al abrir el modal, no una suscripción live.
- Vitest: caso 1 factura directa, caso N facturas directas, caso con excedente→SAF (D,E), caso pago ya reversado (excluido), caso ingreso no-`TRANSFERENCIA_CLIENTE` (sin preview).

**Slice 1b — panel UI** (`src/features/tesoreria/components/reverso-modal.tsx`):
- Fix: `esTransferenciaCliente = movimiento?.origen === 'TRANSFERENCIA_CLIENTE'` (quitar el check de `doc_origen_tipo`).
- Reemplazar/augmentar el banner roto (L161-169) con el panel real: lista de facturas directas + lista de facturas vía SAF, con monto aplicado por factura. Sin botones de acción — puramente informativo.
- Estados loading/empty: mientras resuelve el hook, y cuando el ingreso no es `TRANSFERENCIA_CLIENTE` (no aplica preview).

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `src/features/tesoreria/hooks/use-preview-facturas-afectadas.ts` | New | Hook/función de lectura pura, reusa `detectarLoteSafDePago` |
| `src/features/tesoreria/hooks/__tests__/*.test.ts` | New | Cobertura de los 5 casos del join |
| `src/features/tesoreria/components/reverso-modal.tsx` | Modified | Fix `esTransferenciaCliente` + panel read-only de facturas afectadas |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Confundir el panel informativo con una acción de reverso real (falsa sensación de seguridad) | Low | Sin botones de acción en el panel; copy explícito de que es solo informativo |
| Ingresos pre-migración del bridge (`trazabilidad-ingreso-pagos-directo`) sin filas puente muestran preview vacío, no un error | Known/Accepted | Mismo gap ya documentado en el change de trazabilidad; el panel debe distinguir "sin datos de trazabilidad" de "no afecta facturas" |
| Llamar `detectarLoteSafDePago` por cada `pago_id` del bridge en loop puede ser lento si un ingreso agrega muchos pagos (abono-global con muchas facturas) | Low | Operación bajo demanda (solo al abrir el modal, no reactiva); volumen esperado bajo (abonos directos, no lotes masivos) |

## Rollback Plan

Slice 1a: eliminar el hook y sus tests — ningún otro código lo consume todavía, cero impacto en producción. Slice 1b: revertir el fix de `esTransferenciaCliente` y el panel — el modal vuelve a su estado actual (warning muerto, sin preview); el reverso bancario real (`reversarMovBancario`) no se toca en ningún slice, por lo que no hay riesgo de regresión funcional al revertir.

## Dependencies

- Requiere `movimientos_bancarios_pagos` (change `trazabilidad-ingreso-pagos-directo`, ya merged/QA-passed en staging).
- Reusa `detectarLoteSafDePago` de `src/features/cxc/hooks/reversa-pago-saf.ts` sin modificarlo.
- Construye sobre las exploraciones Engram `sdd/reverso-abono-tesoreria/explore-estado-actual` (#5561) y `explore-preview-facturas-afectadas` (#5585).
- Precede al futuro change de reverso real (mutación de facturas/SAF/tesorería) — no lo implementa.

## Effort Forecast

### Review Workload Forecast
| Field | Value |
|---|---|
| Estimated changed lines | 1a: ~200-250 (hook + tests). 1b: ~100-150 (fix + panel UI) |
| Chained PRs recommended | Yes — PR1 = 1a (hook+tests), PR2 = 1b (panel, depende de 1a), stacked PR2→PR1→develop |
| 400-line budget risk | Low en ambos slices por separado |
| Decision needed before apply | No para el diseño del read-chain (100% locked por exploración, cero gaps de schema). Recomendado: spec liviana SÍ (es una superficie user-facing con escenarios concretos A,B,C directos + D,E vía SAF que conviene fijar como Given/When/Then antes de tasks); design formal probablemente innecesario/opcional — el chain de queries y el helper reusado ya están completamente especificados por la exploración |

## Verification Plan

- `yarn test:run` (Vitest, TDD estricto activo) para el hook de la slice 1a.
- QA manual en staging para la slice 1b: abrir el modal de reverso sobre un ingreso de abono directo simple (ej. el usado en QA de trazabilidad, ingreso `38201beb` con 2 facturas) y confirmar que ambas aparecen listadas; abrir sobre un ingreso de lote/batch y confirmar que el panel no muestra preview (no es `TRANSFERENCIA_CLIENTE`) en vez de fallar o mostrar datos incorrectos.

## Success Criteria

- [ ] El hook resuelve correctamente facturas directas (A,B,C) y vía SAF (D,E) para un ingreso directo, excluyendo pagos ya reversados
- [ ] `esTransferenciaCliente` ya no depende de `doc_origen_tipo` y refleja la realidad del código (`origen === 'TRANSFERENCIA_CLIENTE'`)
- [ ] El panel renderiza el preview sin botones de acción — ninguna mutación ocurre en este slice
- [ ] `yarn test:run` pasa sin errores para la slice 1a
- [ ] QA manual en staging confirma el panel correcto en caso directo (facturas listadas) y caso lote (sin preview, sin error)
