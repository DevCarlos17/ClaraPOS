# Verification Report

**Change**: `nc-cuadre-sesion-fase2` (Slices 1+2+3, change COMPLETO)
**Version**: N/A
**Mode**: Strict TDD
**Branch verificado**: `feat/nc-cuadre-sesion-fase2-pr3-ui` (tip de la cadena; Slices 1+2 committeados, Slice 3 en working tree)

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 17 |
| Tasks complete (código real) | 17/17 |
| Tasks complete (checkbox en `tasks.md`) | 12/17 |
| Tasks incomplete | 0 funcional / 5 de tracking (ver WARNING) |

## Build & Tests Execution

**Build**: No ejecutado (fuera de alcance del prompt — solo test/type-check).

**Tests (suite completa)**: ⚠️ 1613 passed / 3 failed / 1616 total
```text
yarn test:run
FAIL src/features/clientes/components/__tests__/cliente-detalle.test.tsx
  > ClienteDetalle — seccion Facturas > con facturas, renderiza la tabla con mostrarAcciones=false
  (Unhandled Rejection: ReferenceError: Worker is not defined — PowerSync/wa-sqlite worker, entorno Vitest sin Worker global)
FAIL src/features/cxc/components/__tests__/cxc-list.test.tsx
  > CxcList - modal de detalle en mobile > tocar un deudor abre el modal con el detalle de ese cliente
  > CxcList - modal de detalle en mobile > cerrar el modal vuelve a ocultarlo y la lista de clientes sigue visible
  (mismo flake: getByRole('dialog') no se monta — dependencia indirecta del worker PowerSync)

Test Files  2 failed | 131 passed (133)
     Tests  3 failed | 1613 passed (1616)
```
Los 3 fallos son el flake preexistente de PowerSync/`wa-sqlite` Worker documentado en `apply-progress.md` de los 3 slices ("3 fallos preexistentes, no relacionados"). Un `Unhandled Rejection` adicional del mismo tipo aparece también en `cxc-cliente-detalle.test.tsx`, pero ese archivo no queda en la lista de `FAIL` (no afecta su resultado final). **Ninguno de los 3 fallos toca los 3 archivos nuevos/modificados de este change.**

**Tests (3 archivos del change, aislados)**: ✅ 101 passed / 0 failed
```text
yarn test:run src/features/ventas/hooks/__tests__/use-notas-credito.test.ts \
  src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts \
  src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx

✓ use-notas-credito.test.ts        (68 tests)
✓ use-sesiones-caja.test.ts        (5 tests)
✓ refund-tesoreria-form.test.tsx   (28 tests)
Test Files  3 passed (3)
     Tests  101 passed (101)
```

**Type-check**: ⚠️ Ruido esperado, sin regresión propia del change
```text
yarn type-check
6816 errores totales — TODOS en archivos *.test.ts/*.test.tsx (TS2304/TS2593 "Cannot find name describe/it/expect/vi")
→ ruido conocido de tsconfig.json (no incluye tipos de Vitest globalmente), preexistente, no relacionado.

Único error en archivo NO-test: src/hooks/use-pwa-update.ts(8,20) TS6133 'swUrl' declared but never read
→ archivo NO tocado por este change (no aparece en ningún File Changes de design.md/apply-progress.md), preexistente.

CERO errores de tipo en use-notas-credito.ts, use-sesiones-caja.ts, refund-tesoreria-form.tsx
(ni en sus archivos de test correspondientes, más allá del ruido genérico describe/it/expect).
```

**Coverage**: ➖ No disponible (sin comando `--coverage` configurado en el proyecto).

---

## Spec Compliance Matrix

### `specs/caja/spec.md` — Las 3 estrategias reconocen el egreso NC admin cross-sesión

| Scenario | Test | Result |
|----------|------|--------|
| Aparece en Arqueo Teórico de la sesión destino | (ninguno — `use-cuadre.ts` no tiene suite de test en todo el repo) | ⚠️ UNTESTED (ver WARNING 1) |
| Aparece en la tabla "Salidas de Caja" | `cuadre-salidas-caja-model.test.ts` (Fase 1, preexistente) — `esSalidaCaja(origen='NCR') === true` | ⚠️ PARTIAL (cubre clasificación de origen, no el cross-sesión end-to-end; ver WARNING 1) |
| Consistente al cerrar la sesión destino | `use-sesiones-caja.test.ts > cerrarSesionCaja — Slice 2` (2 tests) | ✅ COMPLIANT |
| Aislamiento multi-tenant | (ninguno explícito — garantizado por construcción vía FK `sesion_caja_id`, no probado directamente) | ⚠️ UNTESTED (ver WARNING 1) |

### `specs/notas-credito-admin/spec.md` — Selector con sub-opciones de tesorería y sesión de caja

| Scenario | Test | Result |
|----------|------|--------|
| Ambas opciones visibles | `refund-tesoreria-form.test.tsx:95` | ✅ COMPLIANT |
| Devolver dinero revela ambas sub-opciones activas | `refund-tesoreria-form.test.tsx:95` | ✅ COMPLIANT |
| Sesión de caja activa revela el selector de sesiones | `refund-tesoreria-form.test.tsx:276` | ✅ COMPLIANT |
| Selección cross-sesión permitida | `use-notas-credito.test.ts:1310` "Scenario Cross-session" | ✅ COMPLIANT |
| Selector limitado a sesiones de la propia empresa | `useSesionesActivas()` filtra `empresa_id` (código, `use-sesiones-caja.ts:88`) — sin test directo del filtro en este change (hereda cobertura de `useSesionesActivas` preexistente) | ⚠️ PARTIAL |
| Confirmación usa la tasa histórica de la NC | `use-notas-credito.test.ts:1228` (líneas SESION_CAJA en USD, tasa no ejercida) + `nativoAUsd` compartido con caso Bs ya testeado para BANCO/CAJA_FUERTE (`:1154`) | ⚠️ PARTIAL (ver SUGGESTION 1) |
| Sesión pasa a cerrada entre selección y confirmación | `refund-tesoreria-form.test.tsx:362` (UI) — motor no tiene un escenario equivalente propio (usa el guard genérico de sesión no-ABIERTA) | ✅ COMPLIANT |
| Remanente no cubierto por la sesión pasa a SAFC | Reusa `calcularRemanenteRefund` + test genérico REFUND_TESORERIA `:1048` (sin caso SESION_CAJA dedicado) | ⚠️ PARTIAL (mecanismo compartido, cobertura indirecta) |
| Emisión vía Crédito a favor / Tesorería sin cambios | `use-notas-credito.test.ts` Slice 4 (regresión, sin cambios) + `refund-tesoreria-form.test.tsx:3.7` | ✅ COMPLIANT |

### `specs/tesoreria-consolidacion-cierre/spec.md` — `EgresoTesoreriaLinea` admite `SESION_CAJA` + Guard sesión ABIERTA

| Scenario | Test | Result |
|----------|------|--------|
| Egreso a sesión de caja se registra correctamente | `use-notas-credito.test.ts:1228` | ✅ COMPLIANT |
| Conversión con tasa histórica, no tasa vigente | Compartido con `nativoAUsd` (ver PARTIAL arriba) | ⚠️ PARTIAL |
| Tope y remanente reusados sin duplicar lógica | Test genérico REFUND_TESORERIA `:1020`, `:1048` (sin caso SESION_CAJA dedicado) | ⚠️ PARTIAL |
| Egreso es inmutable (append-only) | Sin UI/función de edición/borrado expuesta (verificado por lectura de código — no hay ruta de UPDATE/DELETE sobre `movimientos_metodo_cobro` para `origen='NCR'`) | ✅ COMPLIANT (evidencia estática) |
| Sesión sigue abierta | `use-notas-credito.test.ts:1228` (camino feliz con guard pasando) | ✅ COMPLIANT |
| Sesión ya no está abierta | `use-notas-credito.test.ts:1282` "Guard sesión no ABIERTA" | ✅ COMPLIANT |

**Compliance summary**: 10/18 scenarios ✅ COMPLIANT directo, 7/18 ⚠️ PARTIAL (mecanismo compartido/probado indirectamente, correcto por lectura de código pero sin test dedicado al caso SESION_CAJA), 2/18 ⚠️ UNTESTED (misma línea: `use-cuadre.ts` sin test suite en todo el repo).

---

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Bimonetario — tasa histórica, decimal.js | ✅ Implementado | `use-notas-credito.ts:1361` usa `nativoAUsd(linea.montoEnMonedaCuenta, esCuentaBs, venta.tasa)`, nunca tasa vigente; `Decimal`/`toStorageString` en todo el flujo |
| Inmutabilidad — `movimientos_metodo_cobro` append-only | ✅ Implementado | Solo INSERT en `escribirEgresoSesionCajaEnTx` (`:412-430`); ninguna UI/función de UPDATE/DELETE para `origen='NCR'` |
| Multi-tenant — escritura | ✅ Implementado | Guard `SELECT status FROM sesiones_caja WHERE id = ? AND empresa_id = ?` (`:396-399`) antes del INSERT; INSERT incluye `empresa_id` |
| Multi-tenant — selector de sesiones | ✅ Implementado | `useSesionesActivas()` filtra `empresa_id = ?` (`use-sesiones-caja.ts:88`) |
| Atomicidad — 1 sola `db.writeTransaction` | ✅ Implementado | Único `db.writeTransaction` en `use-notas-credito.ts:689` envuelve NC + detalle + egreso + SAFC; sin tx anidada |
| Guard sesión ABIERTA (espejo trigger 0041) | ✅ Implementado | `escribirEgresoSesionCajaEnTx` (`:396-408`) — throw antes del INSERT si no existe o `status !== 'ABIERTA'` |
| Guard UI — sesión se cierra entre selección y confirmación | ✅ Implementado | `haySesionYaNoActiva` (`refund-tesoreria-form.tsx:175-179`) — reactivo sobre `useSesionesActivas()` |
| `origen='NCR'` reusado sin migración nueva | ✅ Implementado | Confirmado en CHECK de `migrations/0091*` línea 103; sin migración nueva en el diff |
| `useSaldoEfectivoBimonetario` — blacklist no excluye NCR | ✅ Implementado (sin cambios) | `use-cuadre.ts:916,934` — blacklist es `NOT IN ('VENTA','COBRO','PROPINA')`, NCR nunca excluido; **sin test runtime, ver WARNING 1** |
| `cerrarSesionCaja` — 2 whitelists + `movsManualPorMetodoResult` | ✅ Implementado | `use-sesiones-caja.ts:757-758, 785-786, 863-864` — `'NCR'` agregado a los 3 `IN (...)` |
| `useSaldoSesionCaja` — resta explícita NCR | ✅ Implementado | `use-sesiones-caja.ts:232-233, 274-275, 287` |
| `metodo_cobro_id` — auto-resuelto vía `useMetodosPagoActivos` tipo=EFECTIVO | ✅ Implementado | `refund-tesoreria-form.tsx:132-133, 308-309` — mismo patrón que INGRESO_MANUAL/EGRESO_MANUAL/AVANCE/PRESTAMO |
| `crear-ncr-modal.tsx` sin cambios | ✅ Confirmado | `git status` no lo lista; solo reenvía `egresoParams` sin inspeccionar (`:191`) |
| `use-cuadre.ts` sin cambios | ✅ Confirmado | `git status` no lo lista |
| Sin migración SQL nueva | ✅ Confirmado | Carpeta `migrations/` no aparece en el diff |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| #1 `metodo_cobro_id` auto-resuelto vía `useMetodosPagoActivos()` | ✅ Yes | Sin selector manual adicional, `value` de la opción ES el id resuelto |
| #2 `origen` reusa `'NCR'` (CHECK 0091) | ✅ Yes | Sin CHECK nuevo, sin migración |
| #3 Guard sesión ABIERTA dentro de `escribirEgresoSesionCajaEnTx`, no centralizado antes del loop | ✅ Yes | Cada línea valida independientemente |
| #4 Bimonetario — `nativoAUsd` con tasa histórica de la NC | ✅ Yes | `venta.tasa`, nunca tasa vigente del sistema |
| #5 Un solo `db.writeTransaction`, sin tx anidada | ✅ Yes | Confirmado único `writeTransaction` en el archivo |
| #6 Reusar `useSesionesActivas()` (ya filtra `empresa_id`) | ✅ Yes | Sin hook nuevo |
| Slicing: `crear-ncr-modal.tsx` no cambia | ✅ Yes | Confirmado sin cambios |
| Slicing: `use-cuadre.ts` no cambia | ✅ Yes | Confirmado sin cambios |
| Testing Strategy — "Regresión: `useSaldoEfectivoBimonetario` sigue igual, test existente sin cambios" | ⚠️ Inexacto | No existe ningún test para `use-cuadre.ts` en todo el repo — el design asume un test preexistente que no existe (ver WARNING 1) |
| Open Question — guard de saldo suficiente en sesión destino | ✅ Explícitamente fuera de alcance (documentado, paridad con Regla de Oro) | Consistente con `tasks.md` "Fuera de alcance" |

---

## Issues Found

**CRITICAL**: None

**WARNING**:
1. **`caja/spec.md` Scenario "Aparece en Arqueo Teórico de la sesión destino" y "Aislamiento multi-tenant" no tienen test runtime que los cubra.** `use-cuadre.ts` (donde vive `useSaldoEfectivoBimonetario`) no tiene NINGÚN archivo de test en todo el repo — el `design.md` §Testing Strategy afirma "Test existente, sin cambios" para la fila de regresión, pero ese test no existe; solo hay tests de los componentes de presentación (`cuadre-arqueo-teorico.test.tsx`, que recibe el valor ya calculado por prop) y de funciones puras de clasificación (`cuadre-salidas-caja-model.test.ts`, heredado de Fase 1). La corrección del comportamiento SÍ está verificada por lectura estática (blacklist `NOT IN ('VENTA','COBRO','PROPINA')` en `use-cuadre.ts:916,934` nunca excluye `'NCR'`) y por composición de dos piezas SÍ testeadas (el ruteo `sesion_caja_id` correcto en Slice 1 + la clasificación de origen `NCR` de Fase 1), pero no hay un test que ejecute el hook real con un fixture cross-sesión y assert sobre `saldoEsperadoUsd/Bs`. Este es un gap heredado de Fase 1 (no introducido por este change), pero la spec delta de ESTE change lo declara como requisito `MUST` con Scenario propio — bajo Strict TDD, un Scenario sin test que pase en runtime es `UNTESTED`.
   → Recomendación: agregar un test de `useSaldoEfectivoBimonetario`/`useSaldoSesionCaja` (o al menos un test de integración del hook, no solo de sus consumidores de presentación) con fixture cross-sesión antes de dar por cerrada la deuda de spec, o documentar explícitamente la excepción en `tasks.md > Fuera de alcance`.

2. **`tasks.md` no refleja el estado real de Slice 1.** Las 5 tareas de Slice 1 (1.1–1.5) siguen con checkbox `- [ ]` (sin marcar) en `openspec/changes/nc-cuadre-sesion-fase2/tasks.md`, mientras que `apply-progress.md` las reporta como "COMPLETO" con evidencia TDD completa, y la verificación de código + 68/68 tests pasando en `use-notas-credito.test.ts` confirma que Slice 1 SÍ está implementado. Resultado: `tasks.md` marca 12/17 casillas mientras la realidad (código + tests + `apply-progress.md`) es 17/17. Es un problema de tracking/documentación, no un defecto funcional — pero rompe la fuente de verdad esperada por `sdd-verify` (Completeness table).
   → Recomendación: marcar `[x]` en las 5 tareas de Slice 1 en `tasks.md` para que coincida con `apply-progress.md` y con el estado real del código.

**SUGGESTION**:
1. Ninguno de los 4 tests de Slice 1 (`use-notas-credito.test.ts:1228-1339`) usa `moneda: 'BS'` — todos son `moneda: 'USD'`, `montoEnMonedaCuenta: '30.00'`. El scenario "Confirmación usa la tasa histórica de la NC" para líneas `SESION_CAJA` específicamente en Bolívares (que ejercitaría `nativoAUsd(monto, true, venta.tasa)` con `tasa=40` y validaría el redondeo real) no tiene un test dedicado a nivel de motor — se apoya en que `nativoAUsd` ya está testeado para el caso BANCO/CAJA_FUERTE en Bs (`:1154`, "Cuenta bancaria en Bolivares") y en que el dispatcher es un ternario de 1 línea. Riesgo bajo (lógica compartida, ya cubierta en otro contexto), pero triangulación incompleta para este caso específico.
   → Recomendación: agregar un 5to test a Slice 1 con `moneda: 'BS'` y `tasa` distinta de 1, asserteando el monto USD convertido correctamente.

2. En `refund-tesoreria-form.tsx`, el `<label>` del segundo select sigue diciendo siempre "Cuenta de tesorería" (línea 279-281) incluso cuando `Origen` es una sesión de caja y las opciones son "Efectivo USD"/"Efectivo Bs" (que no son cuentas de tesorería). No es un incumplimiento de ningún Scenario de spec (el `aria-label` fijo también dice "Cuenta de tesoreria"), pero es una inconsistencia menor de copy/UX que podría confundir en QA manual.
   → Recomendación: label dinámico ("Cuenta" a secas, o condicional "Método de efectivo" cuando `esOrigenSesion`).

3. El diff final de Slice 1 (~285 líneas) y de Slice 3 (~290 líneas) exceden el estimado de `tasks.md`/`design.md` (~110-150 c/u). `apply-progress.md` ya documenta y justifica ambas desviaciones (JSDoc extenso en Slice 1; guard `haySesionYaNoActiva` no presupuestado pero exigido por un `MUST` de spec en Slice 3) — no bloqueante, solo una nota para el próximo forecast de `sdd-tasks`.

---

## Verdict
**PASS WITH WARNINGS**

El motor (Slice 1), la unificación de cuadre (Slice 2) y la UI (Slice 3) están completos, atómicos, multi-tenant-aislados, bimonetarios con tasa histórica vía `decimal.js`, y coinciden byte-a-byte con `design.md`. Los 101 tests de los 3 archivos nuevos/modificados pasan en verde; los únicos 3 fallos de la suite completa son el flake preexistente de PowerSync Worker (no relacionado, no toca ningún archivo de este change); type-check no introduce errores nuevos en el código de producción tocado. Se otorga PASS WITH WARNINGS (no PASS limpio) por: (1) dos Scenarios de `caja/spec.md` sin test runtime que los cubra directamente (heredan corrección de lectura estática + composición de piezas testeadas, gap preexistente de Fase 1, no introducido por este change), y (2) `tasks.md` desincronizado del estado real de Slice 1 (documentación, no código). Ninguno de los dos hallazgos es CRITICAL: no hay evidencia de comportamiento incorrecto, solo de cobertura de test y tracking documental incompletos.
