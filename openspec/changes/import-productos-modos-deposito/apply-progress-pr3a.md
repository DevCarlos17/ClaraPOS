# Apply Progress — PR3a (import-productos-modos-deposito)

Alcance: **PR3a unicamente** — nucleo de clasificacion de 3 modos, merge-then-validate
de precios, y tx mixta INSERT+UPDATE. Columna `deposito` en el import, warning de
`stock_inicial` ignorado, y wiring del batch de stock por-fila quedan para **PR3b**
(NO implementados en este batch, deliberadamente).

Branch: `feat/import-productos-3modos-nucleo` (encadenada sobre PR2).
Modo: **Strict TDD**.

## Tasks completadas (tasks-pr3.md, Fase 3a)

- [x] 1. RED — `clasificarAccionFila` (SC1-SC3)
- [x] 2. GREEN — `import-productos-logic.ts` con `clasificarAccionFila`
- [x] 3. RED — `mergearProductoParaUpdate` + `validarPreciosMergeados` (SC5-SC10 + triangulacion)
- [x] 4. GREEN — implementacion de merge + validacion de precios (R7/R8)
- [x] 5. Integrar — selector de modo + clasificacion en `validateRow`/`handleFileChange`
- [x] 6. Integrar — fix de precision decimal (R5/R13) + fase maestro mixta INSERT+UPDATE (R14)
- [x] 7. Verificacion 3a — `yarn test:run`, `yarn type-check`, `yarn type-check:test`

Tasks 8-14 (Fase 3b — columna `deposito`, `debeIgnorarStockInicial`, extension de
`stock-deposito.ts` a deposito por-fila, warning de `stock_inicial`) **NO tocadas**.

## Desviacion deliberada respecto al split de tasks-pr3.md

`tasks-pr3.md` ubica la columna "Accion" del preview (R16) en la tarea 13 (Fase 3b).
El prompt de esta sesion incluyo explicitamente el item "Preview action column" dentro
del alcance de PR3a (item 7). Se implemento en 3a porque:
- `ParsedRow.accion` ya se computa en 3a (tarea 5) — mostrarlo en el preview es
  renderizado puro, no requiere la prop `depositos` ni ninguna logica de 3b.
- No introduce ninguna dependencia de la columna `deposito` ni del batch por-fila.

Esto agrego ~90 lineas extra sobre el subtotal estimado de 3a (ver "Lineas" abajo).

## Nucleo puro (`import-productos-logic.ts`)

- `ModoImportacion`, `AccionFila`, `ColumnasPresentes` (tipos)
- `clasificarAccionFila(codigoExiste, modo)` — tabla de verdad completa (R2)
- `detectarColumnasPresentes(headerRow)` — Set de columnas desde el header, una vez
  por archivo (R3)
- `mergearProductoParaUpdate(row, columnasPresentes, productoExistente)` — merge de
  costo/venta/mayor: columna ausente O celda vacia = usa valor existente (R7)
- `validarPreciosMergeados(merged, columnasPresentes)` — regla #7 sobre el estado
  fusionado, mensajes que nombran el campo tocado y sugieren el campo a incluir (R8,
  LOCKED)

## Wiring (`import-productos-modal.tsx`)

- Selector de modo (radio: Solo agregar / Solo actualizar / Agregar y actualizar),
  `'crear'` por defecto, en el paso `instrucciones` (R1)
- `validateRow` refactorizado en dispatcher (`validateRowCrear` / `validateRowActualizar`)
  por `accion`; `OMITIR` salta toda validacion de campos (R4)
- `validateRowActualizar`: valida nombre/departamento/stock_minimo/unidad/tipo_impuesto
  SOLO si la columna esta tocada (presente + celda no vacia); fusiona precios y valida
  con `validarPreciosMergeados`; incluye guard de formato numerico (isNaN) en los 3
  campos de precio tocados ANTES de fusionar (fix agregado durante el apply — sin el
  guard, una celda no numerica producia NaN y las comparaciones de
  `validarPreciosMergeados` eran siempre `false`, dejando pasar la fila invalidamente)
- `handleImportar`: UNA sola `db.writeTransaction` con INSERT (filas CREAR) + UPDATE
  (filas ACTUALIZAR) mezclados, todo-o-nada (R14). `codigo` nunca aparece en el UPDATE
  (regla #5). Paso 2 (stock inicial) sigue alimentandose SOLO de `filasCrear` (R11/R12
  respetadas por omision — el wiring explicito de `debeIgnorarStockInicial` es 3b)
- Precision: `costo_usd`/`precio_venta_usd`/`precio_mayor_usd` via
  `new Decimal(valor).toFixed(8)` en CREATE y UPDATE (regla #10, R5/R13) — antes
  `.toFixed(2)`
- Preview: columna "Accion" (CREAR/ACTUALIZAR/OMITIR/ERROR, con ERROR con prioridad
  visual si `row.errors.length>0`) + resumen de 4 conteos por accion (R16)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1-2 (`clasificarAccionFila`) | `import-productos-logic.test.ts` | Unit | N/A (new) | Written | Passed | 6/6 combinaciones | None needed |
| 3-4 (`mergearProductoParaUpdate`) | `import-productos-logic.test.ts` | Unit | N/A (new) | Written | Passed | 3 casos (ausente/vacio/presente) | None needed |
| 3-4 (`validarPreciosMergeados`) | `import-productos-logic.test.ts` | Unit | N/A (new) | Written | Passed | 8 casos (SC7-SC10 + simetrico + ambos-tocados valido/invalido) | None needed |
| 5-6 (wiring modal) | `import-productos-modal.test.tsx` | Integration (component, mocks PowerSync) | 4/4 pasando (baseline PR1) | N/A — gap conocido documentado en tasks-pr3.md (mismo criterio PR1/PR2) | — | — | Test SC11 de PR1 actualizado a nueva clasificacion OMITIR (approval-test update, cambio de comportamiento deliberado por R2/R4) |

### Test Summary
- **Total tests nuevos**: 18 (`import-productos-logic.test.ts`)
- **Tests actualizados**: 1 (`import-productos-modal.test.tsx`, SC11 de PR1 → OMITIR)
- **Total suite**: 1978 tests, 1975 passing + 3 fallas preexistentes no relacionadas
  (`cxc-list.test.tsx` x2, `cliente-detalle.test.tsx` x1 — confirmadas en 2 corridas
  independientes de `yarn test:run`)
- **Pure functions creadas**: 4 (`clasificarAccionFila`, `detectarColumnasPresentes`,
  `mergearProductoParaUpdate`, `validarPreciosMergeados`)

## Verificacion

- `yarn test:run`: 1975/1978 pasando. Los 3 fallos (`cxc-list.test.tsx` x2,
  `cliente-detalle.test.tsx` x1) son preexistentes y no relacionados — confirmados NO
  afectados por este cambio (ningun archivo de import-productos aparece en la lista de
  fallos). Una corrida adicional mostro 2 timeouts flaky en `producto-form-precio-*`
  (5000ms, no reproducibles en la segunda corrida) — atribuidos a contencion de recursos
  del entorno de test en paralelo, no a este cambio (no se toco `producto-form.tsx`).
- `yarn type-check`: sin errores en archivos de produccion propios (`import-productos-modal.tsx`,
  `import-productos-logic.ts`). El ruido `describe`/`it`/`expect` en `*.test.ts` es
  preexistente y esperado (falta de tipos vitest en `tsconfig.json` base).
- `yarn type-check:test`: sin errores nuevos. Los 3 errores reportados (2x
  `producto-form-aviso-borrador.test.tsx`/`producto-form-edit-open-mask.test.tsx`,
  1x `use-pwa-update.ts`) son preexistentes, no tocados por este cambio.

## Lineas cambiadas (add+del)

| Archivo | add+del |
|---|---|
| `import-productos-logic.ts` (nuevo) | 136 |
| `import-productos-logic.test.ts` (nuevo) | 144 |
| `import-productos-modal.tsx` | 278 (240 ins + 38 del) |
| `import-productos-modal.test.tsx` | 15 |
| **Total** | **573** |

Estimado original (tasks-pr3.md, subtotal 3a): ~380-540. Real: 573 (~6% sobre el techo
alto del rango). Causas: (1) columna "Accion" + resumen por-accion en el preview,
incluida deliberadamente en 3a por instruccion explicita de esta sesion (ver seccion
"Desviacion" arriba) — no estaba en el subtotal estimado de 3a en tasks-pr3.md; (2) el
guard defensivo de formato numerico agregado durante revision (18 lineas). No se
considera bloqueante: sigue siendo 1 branch con 3 commits work-unit, sin alcanzar el
techo de 400L por commit individual, y el chain strategy (3a → 3b) ya estaba decidido
por el usuario antes del apply.

## Commits (no pusheados)

1. `bb5fc9d` — `test(inventario): RED->GREEN — nucleo puro de clasificacion/merge/validacion de precios (PR3a)`
2. `188a6d9` — `feat(inventario): GREEN — selector de 3 modos + update parcial + tx mixta INSERT/UPDATE (PR3a)`
3. `deafe28` — `fix(inventario): valida formato numerico de precios tocados antes de fusionar (ACTUALIZAR)`

## Remaining Tasks (PR3b — NO iniciadas)

- [ ] 8. RED — `resolverDepositoFila` + `debeIgnorarStockInicial`
- [ ] 9. GREEN — implementacion
- [ ] 10. RED — extender `stock-deposito.ts` a deposito por-fila
- [ ] 11. GREEN — `EntradaInicialImport`/`registrarEntradasInicialesBatch`/`ejecutarStockInicialImport`
- [ ] 12. Integrar — columna `deposito` en parseo/validacion + prop `depositos`
- [ ] 13. Integrar — (ya cubierto parcialmente: columna Accion movida a 3a) — resta
      actualizar bloque de instrucciones con detalle de columna `deposito`
- [ ] 14. Verificacion final PR3 (3a+3b)

## Status

7/7 tasks de Fase 3a completas. Listo para `sdd-verify` de PR3a, o para continuar con
PR3b en una nueva rama encadenada (`feat/import-productos-3b-deposito` apuntando a
`feat/import-productos-3modos-nucleo`).
