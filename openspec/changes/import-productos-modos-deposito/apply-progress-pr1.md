# Apply Progress — PR1: Batch de Stock Inicial + Fix de Plantilla

`import-productos-modos-deposito` — Alcance: SOLO PR1. Mode: **Strict TDD**.

## Tasks completadas (tasks-pr1.md)

- [x] 1. RED — `resolverDepositoPrincipalActivo` (3 casos: principal activo, fallback, sin depositos)
- [x] 2. RED — `registrarEntradasInicialesBatch` (SC1, SC2, SC3, SC4, SC7)
- [x] 3. RED — `ejecutarStockInicialImport` (SC5, SC6)
- [x] 4. GREEN — implementadas las 3 funciones en `stock-deposito.ts`
- [x] 5. RED — `buildPlantillaWorkbook` (SC9, SC10 + hoja Componentes Combos)
- [x] 6. GREEN — extraida `buildPlantillaWorkbook`, eliminada nota A6, texto movido a instrucciones
- [x] 7. Integrar — reemplazado el loop de `registrarMovimiento` por `ejecutarStockInicialImport` en `handleImportar`
- [x] 8. Verificacion final — `yarn test:run` (suite completa), `yarn type-check`, `yarn type-check:test`, revision manual de `productos-export.ts`/`producto-list.tsx` (no tocados)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1 (`resolverDepositoPrincipalActivo`) | `stock-deposito.test.ts` | Unit | ✅ 30/30 (archivo previo intacto) | ✅ Written | ✅ Passed | ✅ 3 casos (principal, fallback, ninguno) | ➖ None needed |
| 2 (`registrarEntradasInicialesBatch`) | `stock-deposito.test.ts` | Unit | ✅ 30/30 | ✅ Written | ✅ Passed | ✅ 5 casos (SC1, SC2, SC3, SC4, SC7) | ➖ None needed |
| 3 (`ejecutarStockInicialImport`) | `stock-deposito.test.ts` | Unit | ✅ 30/30 | ✅ Written | ✅ Passed | ✅ 2 casos (SC5, SC6) | ➖ None needed |
| 5/6 (`buildPlantillaWorkbook`) | `import-productos-modal.test.ts` (nuevo) | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 casos (SC9, SC10, hoja combos) | ➖ None needed |
| 7 (wiring `handleImportar`) | Cubierto indirectamente por tests de `ejecutarStockInicialImport` | — | ✅ 48 archivos/525 tests `inventario/` intactos | ➖ Sin RED propio (gap documentado en spec-pr1.md) | ✅ Verificado manualmente + suite completa en verde | ➖ N/A | ➖ None needed |

### Test Summary

- **Total tests nuevos escritos**: 13 (10 en `stock-deposito.test.ts` + 3 en `import-productos-modal.test.ts`)
- **Total tests pasando (suite completa)**: 1943/1946 (3 fallos **pre-existentes**, no relacionados — ver Riesgos)
- **Tests del feature `inventario/` (48 archivos)**: 525/525 pasando
- **Layers usados**: Unit (13 nuevos)
- **Approval tests** (refactoring): Ninguno — no hubo refactor de comportamiento existente fuera de lo especificado
- **Funciones puras creadas**: 4 (`resolverDepositoPrincipalActivo`, `registrarEntradasInicialesBatch`, `ejecutarStockInicialImport`, `buildPlantillaWorkbook`)

## Archivos modificados

| Archivo | Accion | Que se hizo |
|---|---|---|
| `src/features/inventario/lib/stock-deposito.ts` | Modificado | +3 funciones: `resolverDepositoPrincipalActivo`, `registrarEntradasInicialesBatch`, `ejecutarStockInicialImport` |
| `src/features/inventario/lib/__tests__/stock-deposito.test.ts` | Modificado | +3 `describe` nuevos, 10 tests (SC1-SC7 batch + resolucion de deposito) |
| `src/features/inventario/components/productos/import-productos-modal.tsx` | Modificado | Extraida `buildPlantillaWorkbook` (pura, exportada); eliminada nota A6; texto de unidades movido a instrucciones; `handleImportar` Paso 2 usa `ejecutarStockInicialImport` en vez de loop `registrarMovimiento` |
| `src/features/inventario/components/productos/__tests__/import-productos-modal.test.tsx` | Nuevo (renombrado de `.test.ts`, post-verify) | 3 tests para `buildPlantillaWorkbook` (SC9, SC10, hoja Componentes Combos) + 1 test nuevo de `ImportProductosModal` render completo para SC11 ("codigo ya existe") |

## Requirements verificados (spec-pr1.md)

| ID | Verificado como |
|---|---|
| R1 | `registrarEntradasInicialesBatch` usa 1 sola `db.writeTransaction` — SC1 |
| R2 | Forma de fila exacta (tipo=E, origen=MAN, stock_anterior=0.000, sin lote_id/tipo_salida/costo_unitario/tasa_cambio) — SC2 |
| R3 | `empresa_id` en cada INSERT — SC4 |
| R4 | Deposito resuelto 1 vez antes del batch (`ejecutarStockInicialImport`) — SC5 |
| R5 | Sin deposito: `{exitosos:0, sinDeposito:true}`, sin `writeTransaction` — SC6 |
| R6 | Entrada que lanza revierte el batch completo (promesa rechaza) — SC7 |
| R7 | Fases separadas (Paso 1 productos / Paso 2 stock); catch agregado en el modal para mostrar error claro si Paso 2 falla tras Paso 1 exitoso |
| R8 | `buildPlantillaWorkbook` pura, sin `sheet_add_aoa` en A6 — SC9, SC10 |
| R9 | `validateRow` sin cambios — regresion de "codigo ya existe" no tocada; cubierta ahora por test dedicado (SC11, ver Post-Verify Follow-up) |

## Deviations from Design

Ninguna. Implementacion sigue exactamente el diseno de `spec-pr1.md` y `exploration.md` (punto 2: batch dedicado, deposito resuelto fuera de la tx, no reutiliza `registrarMovimiento` en loop).

Una decision de implementacion no explicitada en el spec: se agrego un `try/catch` alrededor de la llamada a `ejecutarStockInicialImport` en el modal para cubrir R7 ("el usuario MUST ver un error claro" si el batch falla tras Paso 1 exitoso) — el spec no detallaba el texto exacto de ese caso residual (fuera de `sinDeposito`), se uso un toast generico coherente con el resto del modal.

## Issues Found

Ninguno nuevo introducido por este cambio.

## Riesgos

- **3 fallos de test pre-existentes, no relacionados**: `cxc-list.test.tsx` (1) y `cliente-detalle.test.tsx`/`cxc-cliente-detalle.test.tsx` (2, unhandled rejection "Worker is not defined"). Confirmado que reproducen identicamente ejecutando esos 3 archivos en aislamiento SIN los cambios de este PR (mismo error, mismo conteo) — no son una regresion introducida por PR1. Ningun archivo de `cxc`/`clientes` fue tocado (`git status` limpio en esas rutas).
- **Presupuesto de revision superado mas de lo estimado**: el diff final del scope PR1 es **590 lineas cambiadas** (547 adiciones + 43 eliminaciones), por encima del rango alto estimado en `tasks-pr1.md` (~360-480L). La sesion cache ya tenia aprobado un `size:exception` para "la menor sobrecarga sobre 400 lineas" — 590L es una sobrecarga mayor a la anticipada (~48% sobre el presupuesto de 400, no "menor"). Se reporta explicitamente para que el orquestador/usuario confirme si el `size:exception` ya aprobado cubre esta magnitud o si amerita revision antes de PR.
- **Gap de test conocido y documentado en spec-pr1.md**: el wiring de `handleImportar` (Paso 2 completo, incluyendo el nuevo `try/catch`) no tiene test de integracion propio — cubierto indirectamente por los tests unitarios de `ejecutarStockInicialImport` + verificacion manual + suite completa en verde. Cero tests de componente existen para `import-productos-modal.tsx` fuera del archivo nuevo de `buildPlantillaWorkbook` (mismo gap que ya existia antes de PR1).
- **SC11 (regla "codigo ya existe" en `validateRow`) — CERRADO post-verify**: el auditor de `sdd-verify` marco esta regla como el unico gap de cobertura NO declarado (sin test antes ni despues de PR1). `validateRow` no fue tocado por PR1 (confirmado por `git diff`), asi que el riesgo era casi nulo, pero se cerro igual con un test dedicado sin refactor de produccion: se renombro `import-productos-modal.test.ts` -> `.test.tsx` y se agrego un `describe` que renderiza `ImportProductosModal` completo (mismo patron que `deposito-form.test.tsx`), simula un upload real de `.xlsx` con `userEvent.upload`, y verifica que la fila con `codigo` duplicado contra `productos` queda invalida con "codigo ya existe" mientras que una fila con `codigo` nuevo queda sin errores. Commit `37cdb5c`.

## Workload / PR Boundary

- Mode: single PR con `size:exception` (segun session config), commits por work-unit
- Current work unit: PR1 completo (batch de stock inicial + fix de plantilla)
- Boundary: arranca en `fb31b00` (RED), termina en `446f765` (integracion) — 3 commits work-unit sobre la rama actual (`feat/sync-scope-s1-trimmed-spike`)
- Estimated review budget impact: 590 lineas cambiadas, por encima del presupuesto de 400 y del estimado alto de `tasks-pr1.md` (~480) — ver Riesgos

## Commits

| Hash | Mensaje | Contenido |
|---|---|---|
| `fb31b00` | `test(inventario): RED — tests para batch de stock inicial y fix de plantilla de import` | 2 archivos de test (nuevo + modificado), 339 inserciones |
| `c280f46` | `feat(inventario): GREEN — batch de stock inicial en 1 sola tx + fix de plantilla de import` | `stock-deposito.ts` (+155L) + extraccion de `buildPlantillaWorkbook`/fix A6 en el modal |
| `446f765` | `refactor(inventario): reemplaza el loop de registrarMovimiento por ejecutarStockInicialImport` | Wiring final de `handleImportar` Paso 2 |
| `37cdb5c` | `test(inventario): cubre regla codigo-ya-existe en validateRow (SC11)` | Post-verify: cierra el gap SC11/R9 sin tocar codigo de produccion (render completo del modal + upload simulado) |

No se hizo push ni se abrio PR — pendiente de `sdd-verify` y creacion de PR por el orquestador.

## Post-Verify Follow-up

- SC11 ("codigo ya existe" en `validateRow`) cerrado — ver Riesgos y tabla de Requirements (R9) arriba.

## Status

8/8 tasks completas + 1 gap de cobertura cerrado post-verify (SC11). **Ready for verify.**
