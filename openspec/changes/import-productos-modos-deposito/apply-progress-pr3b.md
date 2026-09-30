# Apply Progress — PR3b (import-productos-modos-deposito)

Alcance: **PR3b unicamente** — columna `deposito` en el import, warning no
bloqueante de `stock_inicial` ignorado en filas `ACTUALIZAR`, extension del
batch de stock inicial (`stock-deposito.ts`, PR1) a deposito **por-fila**, y
polish del preview. Depende de PR3a (`feat/import-productos-3modos-nucleo`),
ya mergeado en esta rama.

Branch: `feat/import-productos-deposito-fila` (encadenada sobre PR3a).
Modo: **Strict TDD**.

## Tasks completadas (tasks-pr3.md, Fase 3b)

- [x] 8. RED — `resolverDepositoFila` + `debeIgnorarStockInicial`
- [x] 9. GREEN — implementacion de ambas funciones puras
- [x] 10. RED — extension de `stock-deposito.ts` a deposito por-fila
- [x] 11. GREEN — `EntradaInicialImport`/`registrarEntradasInicialesBatch`/`ejecutarStockInicialImport`
- [x] 12. Integrar — columna `deposito` en parseo/validacion + prop `depositos`
- [x] 13. Integrar — columna "Accion" en preview (ya cubierta en 3a) + instrucciones actualizadas con `deposito`
- [x] 14. Verificacion final PR3 (3a+3b)

## Nucleo puro nuevo (`import-productos-logic.ts`)

- `DepositoParaResolucion`, `ResolverDepositoFilaResult` (tipos)
- `resolverDepositoFila(celda, accion, columnasPresentes, depositosActivos, principalId)`
  — resuelve la columna `deposito` (R9-R11): celda tocada con nombre exacto
  encontrado -> `{deposito_id}` (aplica a CREAR y ACTUALIZAR); celda tocada
  sin match -> error de fila; celda no tocada en CREAR -> fallback al
  principal (`{}` si no hay principal); celda no tocada en ACTUALIZAR ->
  `{}` (nunca toca el deposito_id existente). Reimplementa localmente la
  semantica de `resolveDepositoIngreso` (no importa `stock-deposito.ts` para
  no arrastrar el side-effect de PowerSync a nivel de modulo al archivo de
  tests puro — ver "Decision: no importar stock-deposito.ts" abajo).
- `debeIgnorarStockInicial(accion, stockInicialCell)` — `true` solo si
  `accion==='ACTUALIZAR'` y la celda parsea a un numero `>0` (R12).

## Extension de `stock-deposito.ts` (PR1 -> deposito por-fila)

- `EntradaInicialImport` gana `deposito_id?: string` (antes: unico
  `deposito_id` global en `RegistrarEntradasInicialesBatchParams`, ahora
  removido).
- `registrarEntradasInicialesBatch`: usa `entrada.deposito_id` por fila
  dentro de la MISMA `writeTransaction` (mantiene todo-o-nada). Lanza si una
  entrada llega sin `deposito_id` resuelto — invariante explicita: este
  helper NUNCA resuelve deposito por si mismo, es responsabilidad exclusiva
  del caller.
- `ejecutarStockInicialImport`: resuelve el deposito principal **UNA sola
  vez** SOLO si al menos una entrada llega sin `deposito_id` propio, y lo
  aplica como fallback UNICAMENTE a esas entradas (las que ya traen
  `deposito_id` — resueltas por el modal via `resolverDepositoFila` — lo
  conservan intacto). Si ninguna entrada lo necesita,
  `resolverDepositoPrincipalActivo` ni se invoca.
- **Hardening defensivo**: `resolverDepositoPrincipalActivo` ahora usa
  `principalRes?.rows?.length` / `fallbackRes?.rows?.length` (antes
  `principalRes.rows?.length`, que asumia `principalRes` siempre definido).
  Necesario porque `handleFileChange` en el modal ahora llama a esta funcion
  en un punto donde el test de componente existente (`import-productos-modal.test.tsx`)
  mockea `db.execute` con `vi.fn()` sin `mockResolvedValue` — sin este
  hardening, ese test (que NO forma parte del alcance de este batch)
  hubiera roto con `TypeError: Cannot read properties of undefined (reading
  'rows')`. Comportamiento de producccion sin cambios cuando `db.execute`
  retorna la forma esperada.

## Wiring (`import-productos-modal.tsx`)

- `ParsedRow` gana `deposito: string` (celda parseada, mismo patron
  `.trim().toUpperCase()` que `unidad`), `depositoId?: string` (resuelto) y
  `stockInicialIgnorado: boolean`.
- Nueva prop `depositos?: Deposito[] = []` en `ImportProductosModalProps`
  (default vacio para no romper el test existente de PR3a que no la pasa).
- `handleFileChange`: resuelve el deposito **principal UNA sola vez por
  archivo** (`resolverDepositoPrincipalActivo(user.empresa_id)`, guardado
  antes del `.map()` de filas — nunca por fila, spec-pr3 R15). Por cada fila
  no-`OMITIR`, invoca `resolverDepositoFila` (agrega error de fila si
  corresponde, o fija `row.depositoId`) y, para `ACTUALIZAR`,
  `debeIgnorarStockInicial`.
- `handleImportar`:
  - Paso 1 (INSERT, filas CREAR): agrega `deposito_id` al objeto y a la
    columna del INSERT (antes de este cambio, los productos nuevos del
    import NUNCA fijaban `deposito_id` — quedaba `NULL` siempre).
  - Paso 1 (UPDATE, filas ACTUALIZAR): agrega `fields.deposito_id` SOLO
    cuando `row.depositoId` esta resuelto (celda tocada+valida) — mismo
    patron `if (condicion) fields.x = ...` que el resto de campos.
  - Paso 2 (batch de stock inicial): cada entrada lleva
    `deposito_id: row.depositoId` — SOLO alimentado por `filasCrear` (R11/R12
    intactas: `ACTUALIZAR` nunca llega a este batch).
- Preview: nueva columna "Deposito" (nombre resuelto via
  `depositoNombrePorId`, `'-'` si no aplica) y un icono de advertencia junto
  a "Stk. Ini." cuando `row.stockInicialIgnorado` (con `title` accesible
  explicando el motivo).
- Instrucciones (`step==='instrucciones'`): fila nueva en la tabla de
  columnas para `deposito` + notas actualizadas (stock_inicial ignorado en
  modo actualizar/upsert para productos existentes; semantica
  "vacio/ausente = no tocar" explicita para el modo actualizar).

`producto-list.tsx`: pasa `depositos={depositosActivos}` (ya obtenido via
`useDepositosActivos()` en ese archivo desde PR2 — sin query nueva, R17).

## Decision: no importar `stock-deposito.ts` en `import-productos-logic.ts`

`resolverDepositoFila` necesita la misma semantica que
`resolveDepositoIngreso` (fallback a principal cuando no hay deposito
propio), pero **no** importa esa funcion de `stock-deposito.ts` — ese modulo
importa `@/core/db/powersync/db`, que construye una `PowerSyncDatabase` real
a nivel de modulo. Si `import-productos-logic.ts` importara
`stock-deposito.ts`, el archivo de test **puro** (`import-productos-logic.test.ts`,
sin ningun mock de PowerSync, diseñado deliberadamente asi en PR3a) hubiera
empezado a fallar con `Worker is not defined` al simplemente importar el
modulo bajo test. Se reimplemento la logica trivial
(`productoDepositoId ?? empresaPrincipalId`, aqui simplificado a
`principalId ? {deposito_id: principalId} : {}` porque el primer argumento
siempre es `null` en este call site) localmente, documentando la duplicacion
deliberada en el docstring de la funcion.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 8-9 (`resolverDepositoFila`) | `import-productos-logic.test.ts` | Unit | 35/35 (baseline PR3a) | Written — confirmado fallo de import (funcion no existe) | Passed | 7 casos (match exacto, sin match, CREAR vacio->principal, columna ausente->principal, ACTUALIZAR vacio->no tocar, sin principal->{}, ACTUALIZAR con celda valida->SI resuelve) | None needed |
| 8-9 (`debeIgnorarStockInicial`) | `import-productos-logic.test.ts` | Unit | (mismo baseline) | Written | Passed | 4 casos (ACTUALIZAR>0, ACTUALIZAR vacio, ACTUALIZAR="0", CREAR>0) | None needed |
| 10-11 (`registrarEntradasInicialesBatch`/`ejecutarStockInicialImport` por-fila) | `stock-deposito.test.ts` | Unit | 40/40 (baseline PR1, confirmado antes de tocar el archivo) | Written — confirmado fallo (firma vieja exige `deposito_id` global; params undefined al no pasarlo) | Passed | SC20a (2 deposito_id distintos, misma tx), invariante (lanza sin deposito_id), SC20 (mixto explicito+fallback, 1 sola resolucion), SC21 (contrato: sin filtro interno) | Hardening de `resolverDepositoPrincipalActivo` (optional chaining) — tests existentes siguen verdes sin cambios (mocks ya devuelven forma valida) |
| 12-13 (wiring modal + preview + instrucciones) | `import-productos-modal.test.tsx` | Integration (component, mocks PowerSync) | 4/4 pasando (baseline PR3a) | N/A — gap conocido documentado en tasks-pr3.md (mismo criterio PR1/PR2/PR3a) | — | — | Ninguno — el test existente de PR3a sigue verde sin modificarlo (confirma que la nueva columna "Deposito" no rompe el indice de la ultima celda "Errores" que ese test valida) |

### Test Summary
- **Total tests nuevos (PR3b)**: 15 (`import-productos-logic.test.ts`: 11;
  `stock-deposito.test.ts`: 4 — SC20a, invariante, SC20, SC21)
- **Tests ajustados (misma cobertura, firma nueva)**: 5 (`stock-deposito.test.ts`,
  SC1-SC4/SC7 de PR1 — remueven el parametro `deposito_id` global del batch,
  agregan `deposito_id` al helper `entrada()`)
- **Total suite tras PR3b**: 1999 tests, 1996 passing + 3 fallas preexistentes
  no relacionadas (`cxc-list.test.tsx` x2, `cliente-detalle.test.tsx` x1 —
  **identicas**, mismo texto de error, a las documentadas en
  `apply-progress-pr3a.md`; ningun archivo de `import-productos-*` ni
  `stock-deposito.ts` aparece en la lista de fallos). Una corrida adicional
  mostro ademas un fallo intermitente en `notas-credito-tab.test.tsx` que
  NO se repitio en la corrida siguiente — confirmado flaky/no relacionado
  (no se toco ningun archivo de notas de credito en este batch).
- **Pure functions creadas**: 2 (`resolverDepositoFila`, `debeIgnorarStockInicial`)
- **Funciones extendidas (firma)**: 2 (`registrarEntradasInicialesBatch`,
  `ejecutarStockInicialImport`) + 1 hardened (`resolverDepositoPrincipalActivo`)

## Verificacion

- `yarn test:run`: 1996/1999 pasando. Los 3 fallos
  (`cxc-list.test.tsx` x2, `cliente-detalle.test.tsx` x1) son preexistentes,
  idénticos a los documentados en PR3a, y confirmados no relacionados
  (ningun archivo tocado en este batch aparece en sus stacks). Un fallo
  intermitente adicional en `notas-credito-tab.test.tsx` en una corrida no
  se repitio en la siguiente — flaky, no relacionado.
- `yarn type-check`: sin errores en archivos de produccion propios
  (`import-productos-logic.ts`, `stock-deposito.ts`, `import-productos-modal.tsx`,
  `producto-list.tsx`). El ruido `describe`/`it`/`expect`/`vi` en `*.test.ts`/`*.test.tsx`
  es preexistente (falta de tipos vitest en `tsconfig.json` base, documentado
  desde PR1).
- `yarn type-check:test`: sin errores nuevos. Los 3 errores reportados
  (2x `producto-form-aviso-borrador.test.tsx`/`producto-form-edit-open-mask.test.tsx`,
  1x `use-pwa-update.ts`) son preexistentes, idénticos a los documentados en
  `apply-progress-pr3a.md`, no tocados por este cambio.

## Lineas cambiadas (add+del)

| Archivo | add+del |
|---|---|
| `import-productos-logic.ts` | 79 (solo inserciones) |
| `import-productos-logic.test.ts` | 84 (solo inserciones) |
| `stock-deposito.ts` | 71 (51 ins + 20 del aprox.) |
| `stock-deposito.test.ts` | 85 (75 ins + 10 del aprox.) |
| `import-productos-modal.tsx` | 78 (72 ins + 6 del aprox.) |
| `producto-list.tsx` | 1 (insercion) |
| **Total** | **398** (371 ins + 27 del) |

Estimado original (tasks-pr3.md, subtotal 3b): ~325-490. Real: 398 — dentro
del rango estimado, sin exception de presupuesto.

## Commits (no pusheados)

1. `9cc84b0` — `test(inventario): RED->GREEN — resolverDepositoFila + debeIgnorarStockInicial (PR3b)`
2. `758aae5` — `refactor(inventario): batch de stock inicial a deposito por-fila (PR3b)`
3. `32b6836` — `feat(inventario): GREEN — columna deposito en import + warning stock_inicial ignorado (PR3b)`

## Riesgos / Desviaciones

- **Cambio de firma en un helper con tests existentes** (`registrarEntradasInicialesBatch`,
  de PR1): se removio el parametro global `deposito_id` y se migro a
  `entrada.deposito_id` por fila. Los 5 tests existentes de PR1 (SC1-SC4, SC7)
  se ajustaron (no se debilito ninguna aserción — mismas verificaciones,
  solo el punto de entrada del dato `deposito_id` cambio de parametro global
  a campo del helper `entrada()`). Se agrego ademas un test de invariante
  nuevo (lanza si una entrada llega sin `deposito_id`) para que la
  invariante "el caller debe resolverlo antes" quede protegida por test, no
  solo por comentario.
- **Hardening no solicitado explicitamente en el prompt**: `resolverDepositoPrincipalActivo`
  ahora usa optional chaining sobre el resultado de `db.execute`. Esto fue
  necesario para no romper el test de componente existente de PR3a
  (`import-productos-modal.test.tsx`), que mockea `db.execute` de forma
  minima (`vi.fn()` sin `mockResolvedValue`) porque antes de este cambio
  `handleFileChange` nunca llamaba a ninguna funcion que usara `db.execute`.
  Es un cambio defensivo de bajo riesgo (no cambia el resultado cuando
  `db.execute` responde con la forma esperada, que es el unico camino
  ejercido por los tests de `stock-deposito.test.ts`).
- Ningun otro caller de `registrarEntradasInicialesBatch`/`ejecutarStockInicialImport`
  existe en el codebase fuera de `stock-deposito.ts` (tests) y
  `import-productos-modal.tsx` (confirmado via grep) — el cambio de firma
  no tiene superficie de impacto oculta.
- No se modifico `buildPlantillaWorkbook` (la plantilla descargable) para
  agregar una columna `deposito` de ejemplo — fuera del alcance explicito de
  esta sesion (solo se pidio documentar la columna en el bloque de
  instrucciones, no regenerar la plantilla). El import ya resuelve la
  columna `deposito` si el usuario la agrega manualmente o reimporta su
  propio export (PR2), que si la incluye.

## Status

14/14 tasks de `tasks-pr3.md` completas (Fase 3a + Fase 3b). PR3
(`import-productos-modos-deposito`) completo en esta rama. Listo para
`sdd-verify`.
