# Apply Progress: nc-admin-saldo-disponible-sesion

**Mode**: Strict TDD
**Status**: 14/14 tasks complete. Ready for sdd-verify.

## Completed Tasks

- [x] 1.1 RED — `excedeSaldoDisponible` tests (4 casos: excede, igual, por debajo, precision 6 decimales)
- [x] 1.2 GREEN — `excedeSaldoDisponible(montoNativo, saldoDisponible): boolean` en `notas-credito-refund.ts`
- [x] 2.1 RED (setup mocks) — mock `useSaldoSesionCaja` agregado con default ALTO (999999) para no romper tests existentes con montos 100/4000
- [x] 2.2 GREEN (extracción) — `LineaEgresoRefund` extraido del `.map` inline, MOVE puro, cero cambio de comportamiento
- [x] 3.1 RED — 3 escenarios nuevos: label con saldo, exceso deshabilita Confirmar, límite exacto rehabilita
- [x] 3.2 GREEN (hijo) — `useSaldoSesionCaja` en `LineaEgresoRefund`, labels con saldo, calculo `excede`, `useEffect` de reporte
- [x] 3.3 GREEN (padre) — `excedePorLinea` state, `handleExcedeSaldoSesionChange` con guard no-op, `puedeConfirmar` extendido, mensaje `text-destructive`
- [x] 3.4 Verificación final — suite completa + type-check

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-1.2 | `notas-credito-refund.test.ts` | Unit | ✅ 8/8 (baseline) | ✅ Written (import fallaba a compilar) | ✅ 12/12 passed | ✅ 4 casos (excede/igual/debajo/precision 6 decimales) | ➖ None needed (funcion ya sigue patron exacto del archivo) |
| 2.1-2.2 | `refund-tesoreria-form.test.tsx` | Component/Integration | ✅ 28/28 (baseline tras mock setup) | N/A — refactor de aprobacion (approval tests = los 28 tests existentes, cero asserts nuevos) | ✅ 28/28 passed tras extraccion | ➖ N/A (MOVE puro, sin logica nueva que triangular) | ✅ Comentarios preservados, componente aislado |
| 3.1-3.3 | `refund-tesoreria-form.test.tsx` | Integration (RTL, userEvent) | ✅ 31/31 (28 previos + 3 nuevos en RED) | ✅ Written (3 escenarios fallaban: label sin saldo, boton no deshabilitado x2) | ✅ 31/31 passed | ✅ 3 escenarios (label con saldo, excede bloquea, limite exacto rehabilita) | ✅ Guard no-op en `handleExcedeSaldoSesionChange`, `isLoading` gatea solo la validacion (no el label) |

### Test Summary
- **Total tests written**: 8 (4 en `notas-credito-refund.test.ts` + 3 escenarios + 1 mock setup en `refund-tesoreria-form.test.tsx`)
- **Total tests passing**: 12 (utils) + 31 (component) = 43 en los archivos tocados
- **Layers used**: Unit (4 nuevos), Integration/RTL (3 nuevos)
- **Approval tests**: 28 tests existentes de `refund-tesoreria-form.test.tsx` usados como approval tests durante la extraccion (commit 2) — pasaron sin tocar sus asserts, confirmando MOVE sin cambio de comportamiento
- **Pure functions created**: 1 (`excedeSaldoDisponible`)

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `src/features/ventas/utils/notas-credito-refund.ts` | Modified | +12/-0. Agregada `excedeSaldoDisponible(montoNativo, saldoDisponible): boolean`, hermana de `nativoAUsd`/`calcularRemanenteRefund`. |
| `src/features/ventas/utils/__tests__/notas-credito-refund.test.ts` | Modified | +20/-1. Describe `excedeSaldoDisponible` con 4 casos. |
| `src/features/ventas/components/refund-tesoreria-form.tsx` | Modified | +351/-217 (neto). MOVE del JSX de linea a `LineaEgresoRefund` (componente de modulo, no exportado); `useSaldoSesionCaja` en el hijo; labels de saldo en Select 2 rama Sesion; `excedePorLinea` + `handleExcedeSaldoSesionChange` en el padre; mensaje `text-destructive` nuevo; `puedeConfirmar` extendido. |
| `src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` | Modified | +54/-9. Mock `useSaldoSesionCaja` agregado (default alto); 3 escenarios nuevos de saldo/tope. |

Diff total (3 commits, vs `develop`): 437 líneas (303 add + 134 del) — dentro del rango forecast (~380-430), levemente por encima por redondeo de la extraccion; aceptado como PR unico de 3 commits estructurados por decision explicita del pedido original (no requiere `size:exception` adicional — el forecast de `sdd-tasks` ya anticipaba y aprobo este rango con `Delivery strategy: ask-always` resuelto a "Single PR, 3 structured commits" antes del apply).

## Deviations from Design

None — implementación matches design.md exactamente (interfaz de `LineaEgresoRefundProps`, labels espejo de `formatEnMonedaCuenta`, guard de `isLoading` solo en VALIDATE no en DISPLAY, lift-state via `useEffect` + callback con no-op guard).

## Issues Found

None. `useSaldoSesionCaja` sin filtro `empresa_id` queda como deuda documentada explícita (fuera de alcance, ver design.md "Empresa_id defense-in-depth").

## Commits (work-unit-commits, 3 unidades en un solo PR)

1. `b9dd069` — `feat(ventas/utils): agrega excedeSaldoDisponible para tope de saldo por moneda` — función pura + tests, aislado, revisable en segundos.
2. `b942f02` — `refactor(ventas): extrae LineaEgresoRefund del map inline en RefundTesoreriaForm` — MOVE puro, tests en verde antes y después, cero asserts nuevos.
3. `fdb1644` — `feat(ventas): muestra saldo disponible de sesion y bloquea reembolso que lo excede` — lógica de negocio nueva real (saldo por moneda + validación + wiring del padre).

## Verification

- `yarn test:run` (archivos del change): 12/12 (`notas-credito-refund.test.ts`) + 31/31 (`refund-tesoreria-form.test.tsx`) = 43/43 passed.
- `yarn test:run` (suite completa): 1620/1623 passed. 3 failed = flakes conocidos de PowerSync worker (`cliente-detalle.test.tsx`, `cxc-cliente-detalle.test.tsx`, `cxc-list.test.tsx` — `ReferenceError: Worker is not defined`), no relacionados con este change (no se tocaron esos archivos ni sus dependencias).
- `yarn type-check:test` (tsconfig.test.json, config correcta para globals de vitest): cero errores en los 4 archivos de este change. Los 3 errores restantes (`producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`) son preexistentes en `develop` (confirmado via `git stash`).
- `yarn type-check` (tsconfig.json principal, sin globals de vitest): reporta errores `Cannot find name 'vi'/'describe'/'expect'` en TODOS los archivos `*.test.ts(x)` del repo (patrón preexistente confirmado en baseline — el proyecto usa `type-check:test` para tests, no `type-check`).

## Workload / PR Boundary

- Mode: single PR, 3 work-unit commits (decisión ya resuelta por el orquestador antes de este apply, ver prompt: "ask-always" resuelto a "Single PR, 3 structured commits")
- Current work unit: N/A — las 3 unidades completas
- Boundary: PR único desde `develop`, branch `feat/nc-admin-saldo-disponible-sesion`, 3 commits (`b9dd069`, `b942f02`, `fdb1644`)
- Estimated review budget impact: ~437 líneas totales, levemente sobre el budget de 400 pero dentro del forecast de tasks.md (~380-430); mitigado por la estructura de 3 commits (el commit de extracción es revisable como MOVE puro sin lógica nueva)

## Deuda documentada (fuera de alcance, confirmada por design.md/tasks.md)

`useSaldoSesionCaja` (`use-sesiones-caja.ts:200-304`) no filtra por `empresa_id` en sus 3 queries — hoy es seguro porque `sesionCajaId` llega pre-filtrado desde `useSesionesActivas()`. Refactor transversal que afecta 3 componentes productivos adicionales (`prestamo-modal`, `avance-modal`, `ingreso-retiro-modal`) — merece change propio.

---

## Ajustes UX post-QA (continuacion sobre PR #140, misma branch)

**Status**: 3/3 ajustes completos. Ready for re-review de PR #140 (no requiere nuevo PR).

Feedback de QA del usuario sobre el formulario ya implementado (`RefundTesoreriaForm` +
`LineaEgresoRefund`), aplicado en la MISMA branch `feat/nc-admin-saldo-disponible-sesion`.

### Ajuste 1 — Nombre de usuario en el select "Origen"

El label de cada sesion en "Origen" ahora incluye el nombre del usuario que la abrio, para
desambiguar entre varias sesiones de la misma caja: `Sesion CAJA 1 — Maria Perez`.

- `usuario_apertura_nombre` YA estaba disponible sin agregar una query nueva: se extendio la
  query EXISTENTE de `useSesionesActivas()` con un `LEFT JOIN usuarios u ON u.id =
  s.usuario_apertura_id` (mismo patron ya usado en `useSesionesCajaHistorial`, que ya hacia
  exactamente ese JOIN para `cajero_nombre`). Cero query adicional, cero impacto de
  performance.
- `formatSesionOrigenLabel(s)` (funcion de modulo en `refund-tesoreria-form.tsx`): `Sesion
  {caja_nombre} — {usuario_apertura_nombre}`, cae a `Sesion {caja_nombre}` sin guion colgante
  si el usuario no resuelve (`null`, ej. usuario eliminado).

### Ajuste 2 — Mensajes de validacion pegados al input Monto

Los mensajes "excede el pendiente por reembolsar" / "excede el saldo disponible de la
sesion/cuenta elegida" vivian al pie del formulario (lejos del campo Monto que los disparaba).
Se movieron DENTRO de `LineaEgresoRefund`, inmediatamente debajo del input Monto de esa linea
especifica (`text-destructive`, mismo estilo). El bloque de "excede tope" agregado (NC-level)
que vivia al pie del `RefundTesoreriaForm` se elimino del DISPLAY (la variable `excedeTope`
sigue gateando `puedeConfirmar`, solo cambio DONDE se explica el motivo al usuario) — el
motivo por-linea (`excedePendiente`) es matematicamente un superset: si ninguna linea excede
su propio tope de pendiente, la suma agregada tampoco puede excederlo.

### Ajuste 3 — Tope de monto con rechazo de keystroke (Opcion A, sin clamping)

El input Monto ahora RECHAZA cualquier digito que dejaria el campo por ENCIMA de su tope
efectivo — nunca reemplaza/clampea en silencio el valor ya escrito por el usuario. Tope
efectivo de una linea = `MIN(pendiente restante de la NC para esa linea, saldo disponible del
origen elegido)`:

- **Pendiente por linea** (nuevo): antes solo existia un tope AGREGADO (`excedeTope`, suma de
  TODAS las lineas contra el monto disponible de la NC). Ahora cada linea tiene su propio tope
  de pendiente = monto disponible de la NC menos lo que YA consumen las OTRAS lineas
  (`pendienteRestanteLineaUsd`) — se recalcula en vivo al agregar/editar cualquier otra linea.
- **Disponible del origen**: para Sesion, el mismo saldo de efectivo ya validado en el change
  original (`useSaldoSesionCaja`). Para Tesoreria (**NUEVO** — antes NO habia ningun tope
  contra `cuenta.saldo_actual**, se podia reembolsar mas de lo que la cuenta/caja fuerte
  realmente tenia): ahora tambien topea contra el saldo real de la cuenta elegida.
- Conversion USD -> moneda nativa de la linea SIEMPRE via `tasa_historica` de la NC (nunca la
  tasa vigente), igual que el resto del modulo — `usdACapNativo`, inverso de `nativoAUsd`.
- Mecanismo de rechazo: el `onChange` del input llama `permiteIngresoMonto(nuevoValor,
  capNativo)` (Decimal, nunca number vs number); si rechaza, se fuerza `e.target.value =
  linea.montoNativo` (el navegador ya mutó el DOM nativamente antes del handler; sin este
  reset explicito, un input controlado sin cambio de `state` no vuelve a sincronizar el DOM).
  SIEMPRE permite estados intermedios de edicion (campo vacio, `"12."`, `"."` — decimal.js
  parseable a medias) para no atrapar al usuario ni romper la escritura de decimales con punto
  inicial.
- **Safety net preservado**: `aria-invalid` + el mensaje de exceso (Ajuste 2) + el bloqueo de
  "Confirmar" (`excedeAlgunTopePorLinea`, lift-state ampliado desde `excedePorLinea` /
  `onExcedeSaldoSesionChange` -> `excedeTopePorLinea` / `onExcedeTopeChange`) siguen existiendo
  para el caso en que el tope se reduzca por la edicion de OTRO campo DESPUES de escribir un
  monto ya valido (cambiar de Cuenta a una con menos saldo, agregar/editar otra linea, o el
  saldo de sesion bajando via la query reactiva) — verificado con tests que simulan esos 3
  escenarios exactos.

### TDD Cycle Evidence

| Ajuste | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|--------|-----------|-------|------------|-----|-------|-------------|----------|
| #3 (funciones puras) | `notas-credito-refund.test.ts` | Unit | ✅ 12/12 (baseline) | ✅ Written (import fallaba, 18 tests) | ✅ 30/30 passed | ✅ 4 funciones x 2-4 casos c/u (pendiente/disponible, Bs/USD, igual/menor/mayor, decimales largos, leading-dot) | ➖ None needed (funciones ya siguen el patron exacto del archivo hermano) |
| #1 (hook) | `use-sesiones-caja.test.ts` | Unit | ✅ 5/5 (baseline) | ✅ Written (assert de `JOIN usuarios` fallaba contra `SELECT *`) | ✅ 6/6 passed | ➖ Single (un solo escenario: JOIN presente + campo mapeado) | ➖ None needed |
| #1/#2/#3 (componente) | `refund-tesoreria-form.test.tsx` | Integration (RTL, userEvent) | ✅ 31/31 (baseline) | ✅ Written junto con la implementacion (ver Deviation abajo) | ✅ 37/37 passed | ✅ Multiples escenarios por ajuste: label con/sin usuario (2), tope pendiente NC por linea con rechazo + safety net (2), tope saldo sesion con rechazo + safety net (2), tope saldo CUENTA TESORERIA con rechazo + safety net (2, comportamiento nuevo) | ✅ 2 tests obsoletos del change original (`Scenario Tope de saldo disponible`, `bajar el monto al limite exacto`) reescritos para reflejar el nuevo comportamiento de rechazo-de-keystroke en vez de clamping-por-typing |

**Desviacion del proceso TDD estricto (honesta)**: para el archivo de componente
(`refund-tesoreria-form.tsx` + su test), las funciones RED (tests nuevos escritos primero) y
GREEN (implementacion) se aplicaron en el MISMO batch antes de correr la suite por primera vez
— a diferencia de las utils puras y el hook, donde se confirmo RED (tests fallando) ANTES de
escribir la implementacion. Motivo: el label, el plumbing del tope por linea y el
reposicionamiento de mensajes son partes fuertemente acopladas de un mismo cambio de UI que no
se pueden verificar de forma aislada sin el resto. Los 37 tests pasaron en el primer run
posterior a la implementacion (sin iteraciones de fix), lo cual es evidencia indirecta de que
el diseño previo (funciones puras ya verificadas en RED/GREEN por separado) era correcto.

### Test Summary

- **Total tests nuevos**: 18 (utils puras) + 1 (hook) + 6 (componente, incluye 2 reescrituras) = 25
- **Total tests passing en archivos tocados**: 30 (utils) + 6 (hook) + 37 (componente) = 73
- **Layers used**: Unit (19), Integration/RTL (6)
- **Pure functions created**: 4 (`pendienteRestanteLineaUsd`, `usdACapNativo`, `capMontoLinea`, `permiteIngresoMonto`)

## Files Changed (Ajustes UX post-QA)

| File | Action | What Was Done |
|------|--------|----------------|
| `src/features/ventas/utils/notas-credito-refund.ts` | Modified | +62/-0. 4 funciones puras nuevas para el tope de monto por linea. |
| `src/features/ventas/utils/__tests__/notas-credito-refund.test.ts` | Modified | +90/-0. 18 tests nuevos para las 4 funciones. |
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modified | +13/-3. JOIN a usuarios en `useSesionesActivas`, `usuario_apertura_nombre` en `SesionCajaConNombre`. |
| `src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts` | Modified | +36/-1. 1 test nuevo (verifica JOIN + campo mapeado). |
| `src/features/ventas/components/refund-tesoreria-form.tsx` | Modified | +197/-62 (neto, ver commit 3). `formatSesionOrigenLabel`, plumbing de `pendienteRestanteUsd`/`tasaHistorica` por linea, guard de `onChange` con `permiteIngresoMonto`, `aria-invalid`, mensajes movidos al input, renombres `excedePorLinea`→`excedeTopePorLinea`/`onExcedeSaldoSesionChange`→`onExcedeTopeChange`. |
| `src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` | Modified | +150/-56 (neto). 2 tests nuevos de Ajuste 1, 2 tests reescritos + 4 nuevos de Ajuste 3 (sesion + Tesoreria + safety nets), assertions de posicion (`within`) y `aria-invalid` para Ajuste 2. |

Diff total de los 3 commits: 504 insertions(+), 74 deletions(-) sobre 6 archivos — por ENCIMA
del presupuesto de 400 lineas de un PR nuevo, pero esta NO es una PR nueva: es una
continuacion de ajustes de QA sobre el PR #140 ya abierto y en revision, en la MISMA branch,
sin decision de `delivery_strategy` solicitada para este batch (el usuario pidio explicitamente
implementar los 3 ajustes en la branch existente). Se documenta como riesgo para quien revise
el diff acumulado de PR #140.

## Deviations from Design

Ninguna respecto al pedido explicito del usuario. Nota de diseño propia (no pedida
explicitamente pero necesaria para que Ajuste 3 sea coherente): el tope de saldo disponible se
extendio TAMBIEN a cuentas de Tesoreria (antes solo existia para sesiones de caja) porque el
pedido de "cap = MIN(pendiente, disponible del origen — sesion O CUENTA DE TESORERIA)" lo
requiere explicitamente ("OR the treasury account balance if origin is Tesorería").

## Issues Found

Ninguno nuevo. Reutiliza `excedeSaldoDisponible` (ya existente) para AMBOS chequeos de
disponible (sesion y Tesoreria) — cero duplicacion de logica de comparacion.

## Commits (work-unit-commits, 3 unidades adicionales en la misma branch/PR #140)

4. `e7a327a` — `feat(ventas/utils): agrega funciones puras de tope de monto por linea (Ajuste UX post-QA)` — 4 funciones puras + 18 tests, aislado, revisable en segundos.
5. `58e80a1` — `feat(caja): usuario_apertura_nombre en useSesionesActivas via JOIN (Ajuste UX post-QA)` — extension de query existente, cero query nueva.
6. `2f2d364` — `feat(ventas): ajustes UX post-QA en RefundTesoreriaForm (nombre de usuario, mensaje pegado al Monto, tope sin clamping)` — wiring de los 3 ajustes en el componente + reescritura de 2 tests obsoletos.

## Verification (Ajustes UX post-QA)

- `yarn test:run` (archivos de este batch): 30/30 (`notas-credito-refund.test.ts`) + 6/6 (`use-sesiones-caja.test.ts`) + 37/37 (`refund-tesoreria-form.test.tsx`) = 73/73 passed.
- `yarn test:run` (suite completa): 1645/1648 passed. 3 failed = MISMOS flakes conocidos de PowerSync worker (`cliente-detalle.test.tsx`, `cxc-cliente-detalle.test.tsx`, `cxc-list.test.tsx` — `ReferenceError: Worker is not defined`), no relacionados con este batch.
- `yarn type-check:test`: cero errores en los 6 archivos de este batch. Los 3 errores restantes (`producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`) son los MISMOS preexistentes ya documentados en el apply original (confirmados en `develop`).
- `yarn build`/`yarn deploy`: NO ejecutados (fuera de alcance de este batch, por instruccion explicita).
