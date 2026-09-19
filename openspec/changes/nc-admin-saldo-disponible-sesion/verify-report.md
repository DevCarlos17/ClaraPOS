## Verification Report

**Change**: nc-admin-saldo-disponible-sesion
**Version**: N/A (openspec, sin spec delta versionado — proposal/design/tasks)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 8 (1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4) |
| Tasks complete | 8 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build**: ➖ No solicitado (fuera de alcance del prompt — no se corrió `yarn build`)

**Tests**: ✅ 1620 passed / ❌ 3 failed / ⚠️ 0 skipped (suite completa, 1623 total)
```text
yarn test:run
Test Files  2 failed | 131 passed (133)
Tests       3 failed | 1620 passed (1623)
Fallos: cliente-detalle.test.tsx, cxc-cliente-detalle.test.tsx (ambos "ReferenceError: Worker is not defined",
PowerSync/wa-sqlite worker no soportado en JSDOM) + cxc-list.test.tsx (getByRole('dialog') no encontrado,
efecto colateral del mismo flake). Confirmado: NINGUNO de los 3 archivos tocados por este change
(notas-credito-refund.ts, notas-credito-refund.test.ts, refund-tesoreria-form.tsx, refund-tesoreria-form.test.tsx)
aparece en la lista de fallos. Coincide exactamente con lo reportado en apply-progress.md.
```

Archivos del change en aislado:
```text
yarn test:run src/features/ventas/utils/__tests__/notas-credito-refund.test.ts src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx
Test Files  2 passed (2)
Tests       43 passed (43)  →  12 (notas-credito-refund.test.ts) + 31 (refund-tesoreria-form.test.tsx)
```

**Type-check**: ✅ Cero errores en los 4 archivos del change.
```text
yarn type-check:test  →  3 errores preexistentes (producto-form-aviso-borrador.test.tsx,
producto-form-edit-open-mask.test.tsx, use-pwa-update.ts) — confirmado via `git diff develop -- <esos 3 archivos>`:
diff vacío, es decir esos archivos son IDÉNTICOS a `develop`, por lo tanto los errores son 100% preexistentes
y no relacionados con este change.
```
`yarn type-check` (tsconfig principal, sin globals de vitest) no se corrió por separado — ya está documentado como ruido conocido (falsos `Cannot find name 'vi'/'describe'`) en apply-progress.md y confirmado como patrón preexistente del repo.

**Coverage**: ➖ No disponible (no hay tool de coverage configurado en el proyecto)

### Correctness — Puntos específicos del prompt

| # | Punto | Veredicto | Evidencia |
|---|-------|-----------|-----------|
| 1 | Decimal.js guard: `excedeSaldoDisponible` compara misma moneda, siempre via `new Decimal(...)`, nunca `number > number` | ✅ Correcto | `notas-credito-refund.ts:69-71`: `new Decimal(montoNativo).greaterThan(new Decimal(saldoDisponible))`. Llamador en `refund-tesoreria-form.tsx:382-385`: `excedeSaldoDisponible(linea.montoNativo \|\| '0', linea.moneda === 'BS' ? saldoBs : saldoUsd)` — selecciona `saldoBs`/`saldoUsd` según `linea.moneda`, sin cruzar monedas. `useSaldoSesionCaja` devuelve `saldoUsd`/`saldoBs` como `number` (`use-sesiones-caja.ts:303`, `.toNumber()`) pero `excedeSaldoDisponible` los re-envuelve en `Decimal` antes de comparar — nunca hay comparación `number > number` directa. Tests unitarios (`notas-credito-refund.test.ts:67-82`) cubren: excede (`150>100`→true), igual-al-tope (`100===100`→false, boundary no-estricto), por-debajo (`60<100`→false), y precisión de 6 decimales (`100.123456` vs `100.123455`→true). Las 4 categorías pedidas están cubiertas; NO hay un caso explícito etiquetado "BS" en los tests unitarios de `excedeSaldoDisponible` (la función es agnóstica de moneda — recibe solo números/strings), pero el enrutamiento por moneda SÍ está cubierto en el nivel de integración (`refund-tesoreria-form.test.tsx`, label `Efectivo Bs — Bs. 500,00 disponible`, línea 68 arriba). |
| 2 | `isLoading`: DISPLAY no gatea, VALIDATE gatea sin falso-positivo en mount | ✅ Correcto | DISPLAY (`refund-tesoreria-form.tsx:463-468`): las opciones `Efectivo USD/Bs` muestran `formatUsd(saldoUsd)`/`formatBs(saldoBs)` sin condicionar sobre `isLoadingSaldo` — igual que L458 (`formatEnMonedaCuenta`) no gatea sobre `cuentas` cargando. VALIDATE (`refund-tesoreria-form.tsx:382-385`): `excede = esOrigenSesion(...) && !isLoadingSaldo && excedeSaldoDisponible(...)` — el guard `!isLoadingSaldo` hace que `excede` sea `false` mientras carga, evitando bloquear "Confirmar" por un falso `saldoUsd/saldoBs=0` transitorio al montar el hook. |
| 3 | Rules of Hooks: `useSaldoSesionCaja` llamado incondicionalmente dentro de `LineaEgresoRefund`, NO en `.map()` del padre | ✅ Correcto | `refund-tesoreria-form.tsx:374-376`: la llamada al hook vive dentro del cuerpo de `LineaEgresoRefund` (componente de módulo, `function LineaEgresoRefund(...)` en L359), incondicional — solo el ARGUMENTO es condicional (`esOrigenSesion(linea.origen) ? sesionIdDeOrigen(linea.origen) : undefined`), patrón válido de Rules of Hooks. El padre (`RefundTesoreriaForm`) itera con `lineas.map((linea) => <LineaEgresoRefund key={linea.key} .../>)` (L242-255) — cero hooks llamados dentro del `.map` del padre. |
| 4 | MOVE-only (b942f02) behavior-preserving, 28 tests preexistentes sin tocar asserts | ✅ Correcto | `git diff b9dd069 b942f02 -- .../refund-tesoreria-form.test.tsx`: único cambio es el mock setup (agregar `useSaldoSesionCaja: vi.fn()` + `mockedUseSaldoSesionCaja.mockReturnValue({ saldoUsd: 999999, saldoBs: 999999, isLoading: false })` en `beforeEach`) — CERO asserts modificados. `git diff b9dd069 b942f02 -- .../refund-tesoreria-form.tsx`: el bloque JSX de la línea (Origen/Cuenta/Monto/Referencia/Quitar) se mueve verbatim del `.map` inline a `function LineaEgresoRefund(...)`, mismos handlers (`actualizarLinea`→`onActualizar`, `quitarLinea`→`onQuitar`), mismas clases, mismo texto de opciones — sin diferencia de comportamiento. `onExcedeSaldoSesionChange={() => {}}` es un no-op temporal en este commit (el hijo aún no llama `useSaldoSesionCaja` ni calcula `excede`, eso llega en fdb1644). Ejecución confirma: 31/31 tests pasan en el estado final del archivo (incluye los 28 preexistentes + 3 nuevos de Phase 3). |
| 5 | Lift-state: `useEffect` con deps correctas, `excedePorLinea` se agrega a `puedeConfirmar`, mensaje `text-destructive` presente | ✅ Correcto (con nota) | `refund-tesoreria-form.tsx:387-389`: `useEffect(() => { onExcedeSaldoSesionChange(linea.key, excede) }, [linea.key, excede, onExcedeSaldoSesionChange])` — deps exactas al diseño. Padre: `excedePorLinea` state (L131) + `handleExcedeSaldoSesionChange` con guard no-op (L157-159) + `excedeSaldoSesion = lineas.some((l) => excedePorLinea[l.key])` (L190) + `puedeConfirmar` extendido con `&& !excedeSaldoSesion` (L192) + mensaje `text-destructive` paralelo a `haySesionYaNoActiva` (L287-291). **Nota (no bug)**: al quitar una línea (`quitarLinea`), la entrada `excedePorLinea[key]` NO se borra explícitamente (no hay cleanup en el `useEffect` ni en `quitarLinea`) — pero es inofensivo porque `excedeSaldoSesion` solo itera sobre `lineas.some(l => excedePorLinea[l.key])`, es decir solo lee claves de líneas VIVAS; la entrada huérfana nunca se vuelve a leer. Cero riesgo funcional, solo un objeto `excedePorLinea` que crece sin liberar memoria mientras el formulario esté montado (ver SUGGESTION). |
| 6 | Sin regresión en rama Tesorería | ✅ Correcto | Rama Tesorería del Select 2 (`cuentas.map(...)`, L455-460) sin cambios de comportamiento en ningún commit. Para líneas `origen==='TESORERIA'`, `esOrigenSesion(linea.origen)` es `false` → `excede` se cortocircuita a `false` sin llamar `excedeSaldoDisponible` (L382-385) → nunca bloquea "Confirmar" ni renderiza el mensaje de exceso de sesión. Los 28 tests preexistentes de la suite completa (incluye escenarios de Tesorería) pasan sin modificación de asserts. |
| 7 | Deuda `empresa_id` en `useSaldoSesionCaja` documentada, no empeorada | ✅ Correcto | `design.md` sección "Empresa_id defense-in-depth (decisión NO tomada en este cambio)" (L173-182) y `tasks.md` sección "Empresa_id (deuda documentada, fuera de alcance)" (L81-86) documentan explícitamente que las 3 queries del hook (`use-sesiones-caja.ts:204, 210-219, 222-237`) no filtran por `empresa_id`, que hoy es seguro porque `sesionCajaId` llega pre-filtrado desde `useSesionesActivas()`, y que el fix transversal queda fuera de alcance (afecta 3 call sites productivos adicionales). Este change es un consumidor más del hook (4º call site) — no introduce ni agrava el gap, solo lo hereda tal cual estaba. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Extraer `LineaEgresoRefund` como componente hermano no exportado | ✅ Sí | `refund-tesoreria-form.tsx:359` — módulo-scope, no exportado, definido fuera del render del padre. |
| Lift-state vía callback + `useEffect` (no derivar en el padre, no `setState` directo en render) | ✅ Sí | Ver punto 5 arriba. |
| Guard `isLoading` asimétrico (DISPLAY no gatea, VALIDATE sí) | ✅ Sí | Ver punto 2 arriba. |
| Interfaz `LineaEgresoRefundProps` exacta al Design §Interfaces | ✅ Sí | 8 props: `linea, cuentas, sesionesActivas, efectivoUsd, efectivoBs, puedeQuitar, onActualizar, onQuitar, onExcedeSaldoSesionChange` — coincide 1:1 con `refund-tesoreria-form.tsx:335-345`. |
| Sin archivos nuevos | ✅ Sí | Solo 4 archivos modificados, confirmado por `git show --stat` en los 3 commits del change. |
| 3 work-unit commits (pura / MOVE / feature) | ✅ Sí | `b9dd069` (función pura + tests) → `b942f02` (MOVE puro) → `fdb1644` (feature real). |

### Assertion Quality
Escaneado `notas-credito-refund.test.ts` (12 tests) y `refund-tesoreria-form.test.tsx` (31 tests, foco en las 3 secciones nuevas de Phase 2/3):
- Sin tautologías (`expect(true).toBe(true)`).
- Sin loops sobre colecciones potencialmente vacías con asserts adentro.
- Los 3 escenarios nuevos de saldo/tope (`refund-tesoreria-form.test.tsx:390-434`) ejercitan producción real: `render()` + `userEvent.selectOptions/type` + asserts de comportamiento (texto de label, `toBeDisabled()`, presencia/ausencia del mensaje) — no son smoke tests.
- Los 4 tests de `excedeSaldoDisponible` triangulan con valores DISTINTOS (150/100→true, 100/100→false, 60/100→false, 100.123456/100.123455→true) — sin repetición de expectativa trivial.
- Mock/assertion ratio en la sección nueva: 1 mock (`mockedUseSaldoSesionCaja.mockReturnValue`, reusado en 3 tests vía `beforeEach`) vs ~7 asserts — no mock-heavy.

**Assertion quality**: ✅ Todas las aserciones verifican comportamiento real.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Tabla completa en `apply-progress.md` (3 filas de tareas agrupadas, RED/GREEN/TRIANGULATE/SAFETY NET/REFACTOR) |
| All tasks have tests | ✅ | 8/8 tareas tienen archivo de test asociado (`notas-credito-refund.test.ts` o `refund-tesoreria-form.test.tsx`) |
| RED confirmed (tests exist) | ✅ | Ambos test files existen y contienen los casos descritos |
| GREEN confirmed (tests pass) | ✅ | 43/43 passed en ejecución aislada de los 2 archivos del change |
| Triangulation adequate | ✅ | 4 casos para `excedeSaldoDisponible`, 3 escenarios nuevos de integración (label, exceso, límite exacto) |
| Safety Net for modified files | ✅ | 28/28 tests preexistentes usados como approval tests durante el MOVE (b942f02), confirmados en verde antes de agregar lógica nueva |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 12 (4 nuevos de `excedeSaldoDisponible` + 8 preexistentes) | 1 (`notas-credito-refund.test.ts`) | Vitest |
| Integration | 31 (3 nuevos + 28 preexistentes) | 1 (`refund-tesoreria-form.test.tsx`) | Vitest + Testing Library + `userEvent` |
| E2E | 0 | 0 | — |
| **Total** | **43** | **2** | |

### Quality Metrics
**Type Checker**: ✅ Cero errores en los 4 archivos del change (`yarn type-check:test`). Los 3 errores restantes en el repo son preexistentes, confirmados idénticos a `develop`.
**Linter**: ➖ No corrido (no solicitado explícitamente en el prompt; no es parte del contrato de este verify).

### Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
- `excedePorLinea` (`refund-tesoreria-form.tsx:131`) nunca purga entradas de líneas removidas (`quitarLinea` no llama `setExcedePorLinea` para borrar la clave). Es inofensivo hoy (`excedeSaldoSesion` solo lee claves de `lineas` vivas — ver punto 5), pero si el patrón se reutiliza en un formulario con ciclos de vida más largos o muchas líneas agregadas/quitadas repetidamente, vale la pena agregar un cleanup explícito (`setExcedePorLinea((prev) => { const { [key]: _, ...rest } = prev; return rest })` en `quitarLinea`) para evitar acumulación de estado muerto. No bloqueante para este change.
- No se cubrió explícitamente en test unitario un caso de `excedeSaldoDisponible` etiquetado como "moneda BS" a nivel de función pura (la función es agnóstica de moneda, así que no es estrictamente necesario) — la cobertura de enrutamiento BS vs USD vive en el test de integración (label `Efectivo Bs`). Aceptable, solo se documenta para trazabilidad.

### Verdict
PASS — Los 8 puntos de correctness verificados manualmente contra el código fuente coinciden con el diseño, los 3 commits mantienen la separación pura/MOVE/feature declarada, la suite completa solo tiene los 3 flakes conocidos de PowerSync (ninguno en los archivos del change), y type-check está limpio en los 4 archivos tocados.
</content>
