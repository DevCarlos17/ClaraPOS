# Tasks: Saldo disponible de sesión en refund a Sesión de caja activa

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (additions+deletions) | ~380-430 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR, 3 structured commits (see Work Units) |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

**Nota sobre el estimado del design.md**: el design estima "~90-120 líneas
netas" — eso es el delta NETO de tamaño de archivo, no el diff que ve un
reviewer. La extracción de `LineaEgresoRefund` MUEVE ~126 líneas de JSX
(L232-358 de `refund-tesoreria-form.tsx`) a un nuevo componente hermano; en
`git diff --stat` eso cuenta como ~115 eliminaciones + ~150 adiciones (el
bloque reaparece con otra indentación y otro nombre de props), NO como "0
líneas cambiadas" aunque el comportamiento sea idéntico. Sumando la lógica
nueva (~35-45 líneas) y ambos test files (~65-95 líneas), el diff real ronda
380-430 líneas — cerca del budget de 400, no "bien por debajo" como dice el
design. Se mantiene como PR único (extracción y feature están acopladas: el
cambio de label ocurre exactamente donde ocurre la extracción, partirlo
rompería el estado intermedio), pero estructurado en 3 commits para que el
reviewer pueda revisar el commit de extracción como un MOVE puro (tests en
verde antes y después, cero lógica nueva) separado del commit que agrega
saldo+validación real.

### Suggested Work Units (commits dentro del mismo PR)

| Unit | Goal | Commit type | Notes |
|------|------|--------------|-------|
| 1 | `excedeSaldoDisponible()` pura + tests | `feat(ventas/utils)` | Aislado, TDD puro, sin React — revisable en segundos. |
| 2 | Extraer `LineaEgresoRefund` (sin cambio de comportamiento) | `refactor(ventas)` | MOVE puro del JSX de línea; tests existentes deben seguir en verde sin tocar sus asserts. |
| 3 | Saldo por moneda + validación + wiring del padre | `feat(ventas)` | Único commit con lógica de negocio nueva real; diff pequeño porque el MOVE ya pasó en el commit 2. |

## Phase 1: Función pura `excedeSaldoDisponible` (RED → GREEN)

- [x] 1.1 **RED** — En `src/features/ventas/utils/__tests__/notas-credito-refund.test.ts`, agregar `describe('excedeSaldoDisponible — tope de saldo disponible por moneda (Design §Interfaces)', ...)` con casos: excede (monto > saldo → `true`), igual al tope (monto === saldo → `false`, no-estricto), por debajo (monto < saldo → `false`), y precisión con strings de más de 2 decimales (p. ej. `'100.123456'` vs `'100.123455'`). Import de `excedeSaldoDisponible` debe fallar a compilar (no existe aún) — confirma RED.
  Verify: `yarn test:run src/features/ventas/utils/__tests__/notas-credito-refund.test.ts` (falla).
- [x] 1.2 **GREEN** — En `src/features/ventas/utils/notas-credito-refund.ts`, agregar `export function excedeSaldoDisponible(montoNativo: DecimalInput, saldoDisponible: DecimalInput): boolean` usando `new Decimal(montoNativo).greaterThan(new Decimal(saldoDisponible))` (hermana de `nativoAUsd`/`calcularRemanenteRefund`, mismo bloque de imports ya presente).
  Verify: `yarn test:run src/features/ventas/utils/__tests__/notas-credito-refund.test.ts` (verde).

## Phase 2: Extraer `LineaEgresoRefund` — MOVE sin cambio de comportamiento (RED → GREEN)

- [x] 2.1 **RED (setup de mocks)** — En `src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx`, extender el mock existente `vi.mock('@/features/caja/hooks/use-sesiones-caja', ...)` para incluir `useSaldoSesionCaja: vi.fn()`; en `beforeEach`, mockear `mockedUseSaldoSesionCaja.mockReturnValue({ saldoUsd: 999999, saldoBs: 999999, isLoading: false })`.
  **Gotcha crítico**: el default DEBE ser un saldo alto (no `0`) — los tests existentes del describe `'Sesion de caja activa...'` (L268-383) ya escriben montos como `'100'`/`'4000'` en líneas de Sesión; un default de `0` los rompe con el nuevo guard de validación (Phase 3) antes de que esos tests siquiera lleguen a ejecutarse.
  Verify: `yarn test:run src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` (debe seguir en verde con el mock agregado, sin más cambios todavía — confirma que el setup no rompió nada antes de tocar el componente).
- [x] 2.2 **GREEN (extracción)** — En `src/features/ventas/components/refund-tesoreria-form.tsx`: mover el JSX de `lineas.map((linea) => {...})` (L232-358) a un nuevo componente de módulo `LineaEgresoRefund` (no exportado), debajo de `RefundTesoreriaForm`, con la interfaz exacta de Design §Interfaces (`linea`, `cuentas`, `sesionesActivas`, `efectivoUsd`, `efectivoBs`, `puedeQuitar`, `onActualizar`, `onQuitar`, `onExcedeSaldoSesionChange`). El padre reemplaza el `.map` inline por `lineas.map((linea) => <LineaEgresoRefund key={linea.key} linea={linea} cuentas={cuentas} sesionesActivas={sesionesActivas} efectivoUsd={efectivoUsd} efectivoBs={efectivoBs} puedeQuitar={lineas.length > 1} onActualizar={(patch) => actualizarLinea(linea.key, patch)} onQuitar={() => quitarLinea(linea.key)} onExcedeSaldoSesionChange={handleExcedeSaldoSesionChange} />)`. **Cero cambio de comportamiento en este paso** — el `onExcedeSaldoSesionChange` se pasa pero el hijo todavía no llama `useSaldoSesionCaja` ni calcula `excede` (eso es Phase 3); usar un no-op temporal o adelantar la firma vacía si el tipo lo exige.
  Verify: `yarn test:run src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` (mismos tests de antes, cero asserts nuevos, todo en verde — prueba que el MOVE no cambió comportamiento).

## Phase 3: Saldo por moneda + validación + wiring del padre (RED → GREEN)

- [x] 3.1 **RED** — En el mismo test file, agregar escenarios: (a) con Origen=Sesión, la opción "Efectivo USD"/"Efectivo Bs" del Select 2 muestra `formatUsd(saldoUsd)`/`formatBs(saldoBs)` + "disponible" (mockear `useSaldoSesionCaja` con saldo conocido, ej. `500`); (b) ingresar un monto MAYOR al saldo mockeado deshabilita "Confirmar" y muestra un mensaje `text-destructive` (paralelo a `haySesionYaNoActiva`); (c) bajar el monto al límite exacto (`monto === saldo`) rehabilita "Confirmar". Deben fallar porque el label/guard todavía no existen.
  Verify: `yarn test:run src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` (falla en los 3 escenarios nuevos).
- [x] 3.2 **GREEN (hijo)** — Dentro de `LineaEgresoRefund`: llamar `useSaldoSesionCaja(esOrigenSesion(linea.origen) ? sesionIdDeOrigen(linea.origen) : undefined)` de forma incondicional (argumento condicional, válido para Rules of Hooks); actualizar labels de Select 2 rama Sesión a `Efectivo USD — {formatUsd(saldoUsd)} disponible` / `Efectivo Bs — {formatBs(saldoBs)} disponible` (espejo de `formatEnMonedaCuenta`, L303) SIN gatear sobre `isLoading`; calcular `excede = !isLoading && excedeSaldoDisponible(linea.montoNativo || '0', linea.moneda === 'BS' ? saldoBs : saldoUsd)` (import `excedeSaldoDisponible` desde `notas-credito-refund.ts`); reportar con `useEffect(() => { onExcedeSaldoSesionChange(linea.key, excede) }, [linea.key, excede, onExcedeSaldoSesionChange])`.
  Verify: `yarn test:run src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` (escenario (a) label en verde; (b)/(c) aún dependen de 3.3).
- [x] 3.3 **GREEN (padre)** — En `RefundTesoreriaForm`: agregar `const [excedePorLinea, setExcedePorLinea] = useState<Record<string, boolean>>({})`; `const handleExcedeSaldoSesionChange = useCallback((key: string, excede: boolean) => setExcedePorLinea((prev) => (prev[key] === excede ? prev : { ...prev, [key]: excede })), [])`; `const excedeSaldoSesion = lineas.some((l) => excedePorLinea[l.key])`; extender `puedeConfirmar` con `&& !excedeSaldoSesion`; agregar el mensaje `text-destructive` paralelo a `haySesionYaNoActiva` (L385-389) cuando `excedeSaldoSesion` es `true`. Agregar imports faltantes: `useCallback`, `useEffect` (react), `useSaldoSesionCaja` (`@/features/caja/hooks/use-sesiones-caja`), `excedeSaldoDisponible` (`notas-credito-refund.ts`).
  Verify: `yarn test:run src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` (todos los escenarios nuevos en verde, cero regresión en los preexistentes).
- [x] 3.4 **Verificación final del change** — Correr suite completa y type-check.
  Verify: `yarn test:run` (completo) + `yarn type-check`.

## File Changes

| File | Action | Est. lines (add/del) |
|------|--------|------------------------|
| `src/features/ventas/utils/notas-credito-refund.ts` | Modify | +8 / -0 |
| `src/features/ventas/utils/__tests__/notas-credito-refund.test.ts` | Modify | +30 / -0 |
| `src/features/ventas/components/refund-tesoreria-form.tsx` | Modify | +150 / -115 (extracción) + +25 / -0 (wiring) |
| `src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` | Modify | +70 / -0 |

Sin archivos nuevos (confirmado por design.md — el componente extraído no se
exporta fuera del archivo).

## Empresa_id (deuda documentada, fuera de alcance)

`useSaldoSesionCaja` no filtra por `empresa_id` en sus 3 queries — no es una
tarea de este change (design.md lo deja explícito como deuda a resolver en
un change propio, por los 3 call sites productivos existentes que comparten
el hook).
