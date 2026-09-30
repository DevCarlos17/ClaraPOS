# Apply Progress — PR2 (Export: Columna Deposito + Hoja "Existencias por Deposito")

`import-productos-modos-deposito` — Alcance: SOLO PR2 (export). Strict TDD Mode activo.

## Estado

10/10 tareas de `tasks-pr2.md` completas. Listo para `sdd-verify`.

## Tareas completadas

- [x] 1. RED — `buildRows` con columna `deposito` (SC1, SC2, SC3)
- [x] 2. GREEN — Exportar `buildRows` + campo `deposito`
- [x] 3. RED — `buildExistenciasSheet` (SC5, SC6)
- [x] 4. GREEN — Implementar `buildExistenciasSheet`
- [x] 5. RED — `buildInventarioWorkbook` (SC7, SC8, SC9)
- [x] 6. GREEN — Extraer `buildInventarioWorkbook` + invariante de 3 hojas
- [x] 7. Integrar — `exportarProductosExcel` (nueva firma con `depositos` + `existencias`)
- [x] 8. RED+GREEN — `exportarProductosCsv` con seccion existencias (SC4, SC10)
- [x] 9. Integrar — `producto-list.tsx` (wiring `useDepositosActivos`, `useExistenciasPorDeposito`)
- [x] 10. Verificacion final (suite completa, type-check, revision manual de fuera-de-alcance)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1-2 (`buildRows`) | `productos-export.test.ts` | Unit | N/A (nuevo) | ✅ Written | ✅ Passed | ✅ 4 casos (SC1,SC2,SC3 + huerfano) | ➖ None needed |
| 3-4 (`buildExistenciasSheet`) | `productos-export.test.ts` | Unit | N/A (nuevo) | ✅ Written | ✅ Passed | ✅ 3 casos (SC5,SC6 + vacio) | ➖ None needed |
| 5-6 (`buildInventarioWorkbook`) | `productos-export.test.ts` | Unit | N/A (nuevo) | ✅ Written | ✅ Passed | ✅ 4 casos (SC7,SC8,SC9 + combos reales) | ➖ None needed |
| 7-8 (`exportarProductosCsv`/`Excel`) | `productos-export.test.ts` | Unit (smoke CSV) | ✅ 0/0 (funciones previas sin test propio) | ✅ Written | ✅ Passed | ✅ 2 casos (SC4, SC10) | ➖ None needed |
| 9 (`producto-list.tsx` wiring) | — | N/A (gap documentado, mismo criterio PR1) | N/A | N/A | N/A | N/A | N/A |

### Test Summary
- **Total tests escritos (archivo nuevo)**: 13
- **Total tests pasando**: 13/13 (archivo nuevo) — suite completa: 1957/1960 (3 fallas pre-existentes no relacionadas)
- **Layers usados**: Unit (13)
- **Approval tests**: None — no hubo tareas de refactoring puro de codigo existente (extraccion de `buildInventarioWorkbook` fue cubierta directamente por RED/GREEN del nuevo test)
- **Pure functions creadas**: 2 (`buildExistenciasSheet`, `buildInventarioWorkbook`) + 1 exportada que ya existia como interna (`buildRows`)

## Archivos modificados

| Archivo | Accion | Que se hizo |
|---|---|---|
| `src/features/inventario/utils/productos-export.ts` | Modificado | `buildRows` exportada + 3er param `depositos: Deposito[]` + campo `deposito` en `ExportRow`/`COLUMNAS`; nueva `buildExistenciasSheet` (pura); nueva `buildInventarioWorkbook` (pura, extrae la construccion del workbook con invariante de 3 hojas SIEMPRE); `exportarProductosCsv`/`exportarProductosExcel` con nueva firma `(productos, departamentos, depositos, recetas, productosMap, existencias)` |
| `src/features/inventario/utils/__tests__/productos-export.test.ts` | Nuevo | 13 tests: `buildRows` (SC1-SC3 + huerfano), `buildExistenciasSheet` (SC5-SC6 + vacio), `buildInventarioWorkbook` (SC7-SC9 + combos reales), `exportarProductosCsv` (SC4, SC10) |
| `src/features/inventario/components/productos/producto-list.tsx` | Modificado | +`useDepositosActivos()` +`useExistenciasPorDeposito()`; ambas llamadas a `exportarProductosCsv`/`exportarProductosExcel` pasan `depositos` + `{ rows: existenciasRows, depositosActivos }` |

**Lineas cambiadas (add+del) — medicion real post-commit**:
- `productos-export.ts`: 133+36 = 169
- `producto-list.tsx`: 12+3 = 15
- `productos-export.test.ts` (nuevo): 301+0 = 301
- **Total: 485**

## Desviaciones del forecast (`tasks-pr2.md` Review Workload Forecast)

El forecast original estimaba ~230-310 lineas totales con `400-line budget risk: Low`. La medicion real post-implementacion da **485 lineas** (add+del), por encima del presupuesto de 400. Causa principal: el archivo de test nuevo salio en 301 lineas (vs ~130-170 estimadas) porque se agregaron casos de triangulacion adicionales mas alla del minimo de las SC (deposito huerfano, hoja vacia solo-header, combos reales con datos) para cumplir la regla de TRIANGULATE obligatoria de Strict TDD y evitar asserts triviales. No se detecto esto antes de escribir el test — el forecast se hizo antes de conocer el numero real de casos de triangulacion necesarios.

No se partio en PRs adicionales porque:
1. `tasks-pr2.md` ya declara esta PR como la unidad de trabajo encadenada (PR2 de 3) definida en `proposal.md`, sin necesidad de split interno segun el forecast original.
2. Las 3 funciones puras (`buildRows`, `buildExistenciasSheet`, `buildInventarioWorkbook`) estan intrinsecamente acopladas por la invariante critica de round-trip (spec R6/SC9) — separarlas en distintos commits/PRs fragmentaria la verificacion atomica de esa invariante.
3. Los tests y la implementacion ya quedaron divididos en 2 commits de work-unit (RED / GREEN), siguiendo `work-unit-commits`.

**Se marca esta desviacion explicitamente para quien abra el PR**: considerar si 485 lineas amerita `size:exception` o si el reviewer prefiere revisar el archivo de test por separado del archivo de implementacion (ya estan en commits distintos, lo que facilita una revision por partes aunque el PR sea uno solo).

## Fuera de alcance — verificado por inspeccion (no tocado)

- `src/features/inventario/components/productos/import-productos-modal.tsx` — `git diff --stat` confirma 0 cambios.
- `src/features/inventario/lib/stock-deposito.ts` — `git diff --stat` confirma 0 cambios.
- `workbook.SheetNames[1]` en `import-productos-modal.tsx:263` sigue leyendo por indice sin cambios; `SheetNames[2]` ('Existencias por Deposito') no se referencia en ningun punto del archivo (grep confirmado).

## Issues encontrados

Ninguno. La implementacion coincide con `spec-pr2.md` y `tasks-pr2.md` sin necesidad de reinterpretar ningun requirement.

## Status

10/10 tareas completas. Suite completa: 1957/1960 tests pasando (3 fallas pre-existentes documentadas, no relacionadas a PR2). `yarn type-check` y `yarn type-check:test` sin errores nuevos en archivos de produccion. Listo para `sdd-verify`.
