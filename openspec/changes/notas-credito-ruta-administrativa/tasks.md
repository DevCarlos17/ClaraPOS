# Tasks: notas-credito-ruta-administrativa

Test runner (sdd-init cache, strict_tdd: true): `yarn test:run` (Vitest,
single-run), `yarn type-check` (app), `yarn type-check:test`
(`tsconfig.test.json`). `yarn` — nunca `npm`. Toda función pura es
RED→GREEN antes de tocar el componente/hook que la consume — precedente:
`notas-credito-ui.ts`, `notas-credito-fiscal.ts` (change `notas-credito-ui-pos`,
merged).

## Aggregate Review Workload Forecast (top-level)

| Field | Value |
|---|---|
| Total estimated changed lines (4 PRs) | ~1350–1650 |
| Per-slice estimate | A: ~250–320 · B: ~270–340 · C: ~450–550 · D: ~350–450 |
| Slices exceeding 400 lines alone | C y D — monitorear, no agregar scope; C es candidato a sub-split (C1 shell+sidebar, C2 tab Facturas, C3 tab NC+cleanup) si al aplicar excede significativamente, mismo patrón que Slice 3→3a/3b del change `notas-credito-ui-pos` |
| Chained PRs recommended | **Yes** |
| Recommended PR sequencing | A → B → C → D (dependencia estricta: C consume A+B; D consume A vía tipos compartidos y cierra el flujo con C) |
| Delivery strategy | ask-on-risk |
| Chain strategy | **feature-branch-chain** (cacheado en sesión) — tracker `feat/notas-credito-admin` (draft, sin merge); A → `feat/notas-credito-admin-s1` (base=tracker); B → `-s2` (base=s1); C → `-s3` (base=s2); D → `-s4` (base=s3) |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

**Nota de troceo**: A y B son standalone/bajo riesgo (funciones puras + un
hook nuevo, nadie los consume aún fuera de sus tests). C es la cirugía de UI
(sidebar + 2 tabs nuevos) — mayor riesgo de tamaño. D reescribe
`crear-ncr-modal.tsx` reusando la capa pura de `notas-credito-ui-pos`
(`FacturaDetallePanel`, `SeleccionLineasNc`) — **NO toca**
`nota-credito-pos-modal.tsx` ni `crearNotaCredito` (Design Decision 2,
FROZEN).

## Slice A — Filtros puros + rango de mes actual (Design §Decisión 3/4)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~250–320 |
| 400-line budget risk | Low |
| Chained PRs | No — single PR, sin dependencias nuevas |
| Rollback | Revertible solo — nada lo consume todavía |

Capa: función pura, sin DB, sin UI.

- [x] A.1 RED: nuevo `src/features/ventas/utils/__tests__/notas-credito-admin-filters.test.ts` — `rangoMesActual()` retorna `{ fechaDesde: startOfMonth(), fechaHasta: todayStr() }` (fijar reloj con `vi.setSystemTime`). **RED confirmado**: `yarn test:run` sobre el archivo nuevo falló con `Failed to resolve import "../notas-credito-admin-filters"` (módulo aún no existía).
- [x] A.2 GREEN: crear `src/features/ventas/utils/notas-credito-admin-filters.ts` — `rangoMesActual()` compone `startOfMonth()`/`todayStr()` de `@/lib/dates` (reuso, sin fórmula paralela). **GREEN confirmado**: 21/21 tests del archivo pasan.
- [x] A.3 RED (mismo archivo): `buildFacturasEmpresaFiltro(f: FiltroFacturasEmpresa)` — sin filtros opcionales (solo `empresa_id`+rango fecha); cada filtro opcional (`nroFactura`/`clienteNombre`/`clienteIdentificacion`) aislado; combinados; strings vacíos/whitespace ignorados; `params` SIEMPRE parametrizados (nunca interpolación de string). [Design §Decisión 3] Escrito en el mismo ciclo RED que A.1 (mismo archivo, mismo comando falló por el mismo import faltante).
- [x] A.4 GREEN: implementar `buildFacturasEmpresaFiltro` — SQL exacto de Design §Decisión 3, mismo shape que `FacturaParaAnular` (incluye `status`, `tiene_reverso_total`/`tiene_reverso_parcial` vía `EXISTS`, `total_igtf_usd` — mismo patrón que `use-facturas-sesion-activa.ts`, sin filtro de sesión). Rango de fecha implementado con el patrón `datetime(col) >= datetime(? || 'T00:00:00' || VE_OFFSET)` de `kardex-sql.ts` (comparación robusta al offset guardado, no string directo).
- [x] A.5 RED: `buildNotasCreditoFiltro(f)` — mismos casos que A.3 + filtro `tipo` (`'TOTAL' | 'PARCIAL'` | omitido). [Design §Decisión 4] Mismo ciclo RED que A.1/A.3.
- [x] A.6 GREEN: implementar `buildNotasCreditoFiltro`. Preserva el JOIN/columnas exactas del `useNotasCredito()` sin filtros actual (comportamiento byte-a-byte para Slice B).
- [x] A.7 Verify: `yarn test:run` + `yarn type-check:test` verdes. Confirmado cero I/O en el archivo (funciones puras, sin `useQuery`/`db`).

**Resultado real vs forecast**: forecast ~250–320 líneas cambiadas, riesgo Low. Real: 1 archivo nuevo (`notas-credito-admin-filters.ts`, 148 líneas) + 1 archivo de test nuevo (`notas-credito-admin-filters.test.ts`, 21 tests, 205 líneas) = ~353 líneas totales (test incluido) / ~148 líneas de código de producción — dentro del rango esperado considerando que el forecast agrega tests+código. Sin desviaciones del Design. `yarn test:run` completo: 89 archivos / 1073 tests pasando (suite completa, no solo el archivo nuevo). `yarn type-check:test` limpio. Diff de los 4 archivos FROZEN (`use-notas-credito.ts`, `nota-credito-pos-modal.tsx`, `supervisor-pin-dialog.tsx`, `use-ventas.ts`) confirmado vacío (`git diff --stat` sin salida).

## Slice B — Hook empresa-wide + extensión de filtros en NC list (Design §Decisión 3/4)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~270–340 |
| 400-line budget risk | Low–Medium |
| Chained PRs | Yes — depende de Slice A |
| Rollback | `useFacturasEmpresa` sin consumidores aún; `useNotasCredito` sigue 100% compatible sin filtros — revertible sin romper `notas-credito-page.tsx` actual |

Capa: hook (`useQuery` PowerSync). `useBuscarFacturaParaAnular` **NO** se
toca en este slice (sigue siendo el único consumidor de la vista actual
hasta que Slice C reemplace la página — Design §Decisión 7).

- [x] B.1 RED: nuevo `src/features/ventas/hooks/__tests__/use-facturas-empresa.test.ts` — retorna facturas de OTRAS sesiones/días dentro del rango (fixture 2+ sesiones distintas, a diferencia de `useFacturasSesionActiva`); sin `filtros`, usa `rangoMesActual()` por defecto; el SQL ejecutado siempre incluye `empresa_id = ?`. **RED confirmado**: `yarn test:run` sobre el archivo nuevo falló con `Failed to resolve import "../use-facturas-empresa"` (módulo aún no existía).
- [x] B.2 GREEN: crear `src/features/ventas/hooks/use-facturas-empresa.ts` — `useFacturasEmpresa(filtros?)`, hermano de `use-facturas-sesion-activa.ts`, delega SQL a `buildFacturasEmpresaFiltro` (Slice A), `empresaId` vía `useCurrentUser()`, default fecha = `rangoMesActual()` cuando se omite. **GREEN confirmado**: 7/7 tests del archivo pasan.
- [x] B.3 RED: extender `src/features/ventas/hooks/__tests__/use-notas-credito.test.ts` — `useNotasCredito()` (sin args) preserva el comportamiento actual byte-a-byte (smoke, consumidores no migrados); `useNotasCredito(filtros)` con fecha/`nroNcr`/`tipo`/cliente/RIF filtra correctamente; filtros combinables. [Design Testing Strategy] **RED confirmado**: 5/6 tests nuevos fallaron (params/sql sin el rango de fecha ni los filtros nuevos aplicados); el smoke test "sin args" ya pasaba (preserva comportamiento no migrado, correcto no-RED para ese caso puntual).
- [x] B.4 GREEN: extender `useNotasCredito(filtros?)` en `use-notas-credito.ts` — delega a `buildNotasCreditoFiltro` cuando `filtros` está presente; sin `filtros`, cae al query actual sin cambios. **GREEN confirmado**: 45/45 tests del archivo pasan (40 preexistentes + 5 nuevos, ninguno de los preexistentes se rompió).
- [x] B.5 Verify: `yarn test:run` + `yarn type-check` + `yarn type-check:test` verdes; `git diff --stat` sobre `crearNotaCredito` (mismo archivo) confirma CERO líneas cambiadas. **Verificado**: suite completa 90 archivos/1087 tests verdes; `yarn type-check:test` limpio; `yarn type-check` (app) solo reporta errores preexistentes no relacionados (archivos `src/lib/__tests__/*` y `traspasos.test.tsx` sin globals de test en el tsconfig de app — no tocados por este slice); `git diff` de `use-notas-credito.ts` confinado a `useNotasCredito` (grep de `crearNotaCredito` sobre el diff: 0 matches) — `crearNotaCredito` byte-idéntica.

**Resultado real vs forecast**: forecast ~270–340 líneas, riesgo Low–Medium. Real: 1 archivo nuevo (`use-facturas-empresa.ts`, 46 líneas) + 1 archivo de test nuevo (`use-facturas-empresa.test.ts`, 7 tests, 119 líneas) + extensión de `use-notas-credito.ts` (+51/-4 líneas) + extensión de su test (+79 líneas) ≈ 295 líneas — dentro del rango esperado. Sin desviaciones del Design (Decision 3/4 aplicadas tal cual). `useBuscarFacturaParaAnular` NO se tocó (confirmado, sigue siendo el único consumidor de `notas-credito-page.tsx` hasta Slice C). Diff FROZEN confirmado vacío para `nota-credito-pos-modal.tsx`, `supervisor-pin-dialog.tsx`, `use-ventas.ts` (`git diff --stat` sin salida).

## Slice C — Sidebar + 2 tabs + filtros UI (Design §Decisión 1, File Changes)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~450–550 (monitorear — candidato a sub-split C1/C2/C3 si excede significativamente al aplicar) |
| 400-line budget risk | **High** |
| Chained PRs | Yes — depende de Slice A y B |
| Rollback | Sidebar/página caen a la versión actual (búsqueda simple + tabla NC, sin tabs); `crear-ncr-modal.tsx` viejo sigue siendo el único modal hasta Slice D |

Capa: component-integration, reusa hooks ya testeados de A/B — sin tests
dedicados nuevos más allá de smoke manual (Design Testing Strategy no pide
tests de componente para las tabs, solo para `CrearNcrModal` en Slice D).

- [ ] C.1 `src/components/layout/sidebar.tsx:85` — rename `'Nota de Credito'` → `'Facturas emitidas'` (label únicamente; `url`/`icon`/`requiredPermission: SALES_VOID` sin cambios).
- [ ] C.2 Crear `src/features/ventas/components/facturas-empresa-tab.tsx` — filtros (rango de fecha default mes actual, `nro_factura`, cliente, RIF) + `DataTable` genérico (`@/components/data-table/data-table.tsx`) sobre `useFacturasEmpresa(filtros)`; acción "Aplicar nota de crédito" por fila (abre modal, wiring real en Slice D — en este slice el botón puede quedar con estado local `facturaSeleccionada`/`modalOpen` sin montar aún `CrearNcrModal`); estado vacío sin error. [Spec: listado empresa-wide — todos los scenarios]
- [ ] C.3 Crear `src/features/ventas/components/notas-credito-tab.tsx` — extrae la tabla NC + buscador YA existentes de `notas-credito-page.tsx` (sin cambio de comportamiento) + filtros nuevos (fecha default mes actual, `nro` NC, `tipo`, cliente, RIF, vía `useNotasCredito(filtros)`) + botón "Ver todo el historial" que limpia el rango de fecha sin tope. [Spec: pestaña Notas de crédito — todos los scenarios]
- [ ] C.4 Reescribir `src/features/ventas/components/notas-credito-page.tsx` — `Tabs` shadcn + `useState` local (patrón `traspasos.tsx`/`gastos-dashboard.tsx`/`horarios-staff-page.tsx`, sin rutas anidadas ni search param); `PageHeader` renombrado a "Facturas emitidas"; tab "Facturas" primaria/default, tab "Notas de crédito" secundaria; delega a C.2/C.3. [Design §Decisión 1, Spec: sección con pestañas]
- [ ] C.5 Eliminar `useBuscarFacturaParaAnular` (dead code, Design §Decisión 7) de `use-notas-credito.ts` — confirmar con grep que `notas-credito-page.tsx` (ya reescrito en C.4) era el único consumidor antes de borrar; limpiar su test en `use-notas-credito.test.ts`.
- [ ] C.6 Verify: `yarn test:run` + `yarn type-check` + `yarn type-check:test` verdes; confirmar `src/routes/_app/ventas/notas-credito.tsx` sin cambios (el path y el gate `SALES_VOID` ya son suficientes, sin permiso nuevo); smoke manual: usuario sin `SALES_VOID` no ve el ítem ni accede; tab por defecto es Facturas; cambio de tab preserva acceso.

## Slice D — Modal admin delgado (rewrite) + wiring (Design §Decisión 2/5/6)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~350–450 |
| 400-line budget risk | Medium–High |
| Chained PRs | Yes — depende de Slice A (tipos) y C (tab Facturas monta el modal) |
| Rollback | `crear-ncr-modal.tsx` cae a su versión pre-slice (TOTAL-only, sin selector de líneas ni placeholder) — `crearNotaCredito` intocado en todo momento |

Capa: component (Testing Library), reusa fixtures/patrones de
`nota-credito-pos-modal.test.tsx` y `seleccion-lineas-nc.test.tsx` (ya
existentes, sin tests nuevos para la capa pura reusada).

- [ ] D.1 RED: reescribir `src/features/ventas/components/__tests__/crear-ncr-modal.test.tsx` — toggle TOTAL/PARCIAL (gating vía `puedeElegirTipoTotal`/`puedeEmitirNcAdicional`, mismos fixtures que POS); "Devolver dinero" SIEMPRE `disabled` con tooltip "Próximamente" y NUNCA dispara `crearNotaCredito`; botón PARCIAL disabled con todas las líneas en 0; el modal NUNCA monta `SupervisorPinDialog` (mock existente, reforzado); confirmar TOTAL llama `crearNotaCredito({ entryPoint:'TRADICIONAL', modalidad:'AJUSTE_CXC', tipo:'TOTAL' })`; confirmar PARCIAL llama con `tipo:'PARCIAL'` + `lineas`. [Spec: Generación de NC + Selector placeholder — todos los scenarios]
- [ ] D.2 GREEN: reescribir `src/features/ventas/components/crear-ncr-modal.tsx` como wrapper delgado — reusa `FacturaDetallePanel`, `SeleccionLineasNc`, `useDetalleFactura` (cxc) + `usePagosFactura` + `useCompany` → `buildReciboData`, `useReversosFactura` → `agruparReversosPorNc`/`calcularReversoPorLinea`/`puedeEmitirNcAdicional`/`puedeElegirTipoTotal`; selector TOTAL/PARCIAL duplicado (Decision 6, markup ~20 líneas, gating reusado sin cambios); selector "Crédito a favor" (fijo, único habilitado) / "Devolver dinero" (`disabled`, shell visual, Decision 5) — su estado NUNCA alimenta `modalidad`; SIN PIN, selector de depósito libre (preserva UX del modal actual); `onConfirm` llama `crearNotaCredito({ venta_id, motivo, usuario_id, empresa_id, entryPoint:'TRADICIONAL', modalidad:'AJUSTE_CXC', tipo, lineas?, depositoReingresoId })`.
- [ ] D.3 GREEN: wiring en `facturas-empresa-tab.tsx` (Slice C) — montar `CrearNcrModal` real, abrir con la factura de la fila clickeada, cerrar y dejar que las live-queries de PowerSync refresquen el listado sin invalidación manual.
- [ ] D.4 Verify: `yarn test:run` + `yarn type-check` + `yarn type-check:test` verdes; `git diff --stat` sobre `use-notas-credito.ts` (`crearNotaCredito`) y `nota-credito-pos-modal.tsx` confirma CERO líneas cambiadas; smoke manual TOTAL y PARCIAL end-to-end contra el motor real.

## Cross-cutting invariants (aplican a los 4 slices)

- `crearNotaCredito`, `nota-credito-pos-modal.tsx`, `SupervisorPinDialog` son CÓDIGO CONGELADO — ningún slice los modifica (Design Decision 2, FROZEN).
- Toda query NUEVA filtra `empresa_id` sin excepción (`useFacturasEmpresa`, filtros de `useNotasCredito`) — verificar en el `WHERE` real, no solo en el builder puro.
- No hay migración SQL en este change — sin columnas/tablas nuevas (constraint fijo, Design §Migration/Rollout).
- Inmutabilidad: la ruta admin solo AGREGA movimientos (kardex, CxC) vía `crearNotaCredito` existente — nunca edita/borra `ventas`/`movimientos_inventario` fuera de ese motor.
- Bimonetario: todo monto se muestra USD + Bs; `previewMontoBsNc`/`buildReciboData` SIEMPRE usan `factura.tasa` histórica, nunca la tasa vigente (invariante ya cubierta por tests de `notas-credito-ui-pos`, reusados sin cambios).
- decimal.js para todo cálculo monetario — nunca `float`/`Number` en lógica de negocio nueva (Slice A/B).
- "Devolver dinero" debe quedar verificablemente `disabled` en el DOM y su click NUNCA debe invocar `crearNotaCredito` — cubierto por test dedicado en D.1, no solo por inspección visual.
- Solo español en toda la UI. TypeScript estricto, sin `any`. `yarn` — nunca `npm`.
