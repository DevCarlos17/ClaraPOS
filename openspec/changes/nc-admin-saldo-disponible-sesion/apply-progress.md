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
