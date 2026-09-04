# Tasks: notas-credito-ui-pos

Test runner (sdd-init cache, strict_tdd: true): `yarn test:run` (CI single-run,
Vitest), `yarn type-check` (app, `tsc --noEmit`), `yarn type-check:test`
(`tsc --noEmit --project tsconfig.test.json`). No ESLint instalado. Toda
función pura y toda pieza de mapeo cantidad→`lineas` es RED→GREEN antes de
tocar el componente que la consume — precedente: `notas-credito-fiscal.ts`,
`notas-credito-pin-gating.ts` (mismo patrón, mismo repo, Change 1 merged).

## Aggregate Review Workload Forecast (top-level)

| Field | Value |
|---|---|
| Total estimated changed lines (4 PRs) | ~900–1100 |
| Per-slice estimate | Slice 1: ~250–300 · Slice 2: ~200–250 · Slice 3: ~350–400 · Slice 4: ~100–150 |
| Slices exceeding 400 lines alone | None — Slice 3 is closest to budget (350–400), monitor, do not add scope |
| Chained PRs recommended | **Yes** |
| Recommended PR sequencing | 1 → 2 → 3 → 4 (strict dependency order — see Depende-de por slice) |
| Delivery strategy | ask-on-risk |
| Chain strategy | **pending** — not chosen this session. Orchestrator MUST ask the user (stacked-to-main vs feature-branch-chain) before `sdd-apply` starts Slice 1 |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

**Nota de troceo (Design §Slice Plan)**: Slice 1 es standalone y revertible
(nadie lo consume aún). Slice 2 depende de Slice 1 pero preserva el flujo de
confirmación TOTAL actual sin cambios (solo lista/buscador/badges/rename).
Slice 3 es la cirugía mayor — reemplaza el drill-down actual por el layout de
dos columnas (lista + `FacturaDetallePanel`) y agrega PARCIAL — es el slice
con mayor riesgo de tamaño, monitorear antes de abrir el PR. Slice 4 es el
más chico y el único sin dependencia de datos nuevos (solo UI + gating).

## Slice 1 — Queries extendidas + funciones puras + `FacturaDetallePanel` (Design §Decisión 2/3/4/5/6)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~250–300 |
| 400-line budget risk | Low |
| Chained PRs | No — single PR, depende solo de Change 1 (merged) |
| Rollback | Revertible solo — el modal viejo no consume nada de este slice todavía |

- [x] 1.1 RED: nuevo `src/features/ventas/utils/__tests__/notas-credito-ui.test.ts` — tabla de verdad `derivarEstadoPago({total_usd, saldo_pend_usd})`: CONTADO (`saldo<=0.005`), CREDITO (`saldo>=total-0.005`), ABONADA (caso intermedio), casos límite exactos en el épsilon `0.005`. [Design §Decisión 4]
- [x] 1.2 GREEN: crear `src/features/ventas/utils/notas-credito-ui.ts` — `export type EstadoPago = 'CONTADO'|'CREDITO'|'ABONADA'` + `derivarEstadoPago` con la fórmula exacta del design (`pagado = total_usd - saldo_pend_usd`, Decimal, épsilon `0.005` — mismo umbral que `vencimientos_cobrar`). NUNCA suma `pagos.monto_usd` independientemente.
- [x] 1.3 RED: mismo archivo — `huboAfectacionCxc(cantidadMovimientos: number)`: `0` → `false`; `>0` → `true`. [Design §Decisión 6]
- [x] 1.4 GREEN: implementar `huboAfectacionCxc` en `notas-credito-ui.ts`.
- [x] 1.5 Modificar `src/features/ventas/hooks/use-facturas-sesion-activa.ts`: quitar el filtro `AND v.status != 'ANULADA'` (bug respecto a la spec, no comportamiento a preservar); agregar `v.status` y las subqueries `EXISTS(...) as tiene_reverso_total` / `tiene_reverso_parcial` del SQL exacto de Design §Decisión 2. Mantener filtro `empresa_id` + `sesion_caja_id`.
- [x] 1.6 RED primero: extender `src/features/ventas/hooks/__tests__/use-facturas-sesion-activa.test.ts` — una factura `status='ANULADA'` de la sesión activa YA NO se excluye del resultado; nuevas columnas `tiene_reverso_total`/`tiene_reverso_parcial` presentes y correctas para una venta con NC TOTAL vs PARCIAL vs sin NC. Confirmar RED antes de 1.5, GREEN después.
- [x] 1.7 Extender `FacturaParaAnular`/tipo de retorno del hook con `status: string`, `tiene_reverso_total: number`, `tiene_reverso_parcial: number` (PowerSync booleans-as-integer). **Deviación**: los 3 campos se agregaron como opcionales (`status?`, `tiene_reverso_total?`, `tiene_reverso_parcial?`) — `FacturaParaAnular` es un tipo COMPARTIDO con `useBuscarFacturaParaAnular` (Tradicional), que no trae estas columnas; marcarlos requeridos hubiera roto la compilación de los fixtures existentes en `crear-ncr-modal.test.tsx`/`nota-credito-pos-modal.test.tsx` (Slice 2/3, fuera de este slice). Ver apply-progress para detalle.
- [x] 1.8 Modificar `src/features/cxc/hooks/use-cxc.ts::useDetalleFactura` (líneas 227-240): JOIN `ventas v ON vd.venta_id = v.id` + `LEFT JOIN unidades u ON p.unidad_base_id = u.id`; agregar `u.es_decimal` y `ROUND(CAST(vd.precio_unitario_usd AS REAL) * CAST(v.tasa AS REAL), 2) as precio_unitario_bs` al SELECT (SQL exacto Design §Decisión 3). Extender `DetalleFacturaCxc` con `es_decimal: number | null` y `precio_unitario_bs: string`.
- [x] 1.9 Verificar que la extensión es 100% aditiva: `venta-exitosa-modal.tsx`, `factura-detalle-cxc.tsx`, y el re-export en `use-notas-credito.ts::useDetalleFactura` (consumido por `crear-ncr-modal.tsx`, `ventas-consultas-modal.tsx`) siguen pasando sin cambios de aserciones — correr sus test suites existentes y confirmar cero regresiones (smoke test, Design §Decisión 3 lista de consumidores verificados).
- [x] 1.10 RED: nuevo `src/features/ventas/components/__tests__/factura-detalle-panel.test.tsx` — sin `recibo` (null) el panel no muestra datos de factura; con un `ReciboData` fixture (via `buildReciboData` real, no mock) muestra artículos (cantidad, precio Bs/USD), subtotal, exento, base imponible, IVA por alícuota, total, IGTF cuando `igtfUsd` no es null, desglose de pagos; con `afectoCxc=true`/`false` muestra el texto correspondiente. [Spec notas-credito-pos: Panel de detalle fiscal — todos los scenarios]
- [x] 1.11 GREEN: crear `src/features/ventas/components/factura-detalle-panel.tsx` — `FacturaDetallePanel({ recibo: ReciboData | null, afectoCxc: boolean | null })`, componente de PRESENTACIÓN puro: recibe `ReciboData` ya construido (Design §Decisión 5, mismo patrón que `venta-exitosa-modal.tsx`) — MUST NOT llamar `buildReciboData` ni hacer fetch dentro. Usa `construirFilasTotales(recibo.totales, recibo.monedaPresentacion)` para la sección de totales (reuso, no reimplementación).
- [x] 1.12 Verify: `yarn test:run` + `yarn type-check` + `yarn type-check:test` verdes; grep diff en `venta-exitosa-modal.tsx`/`factura-detalle-cxc.tsx` confirma cero líneas cambiadas (solo se tocan `use-cxc.ts`, `use-facturas-sesion-activa.ts`, y los 2 archivos nuevos).

**Resultado real vs. forecast**: 468 líneas cambiadas (463 inserciones + 5 eliminaciones, `git diff --stat`) vs. forecast ~250-300 — excede el budget de 400. Ver apply-progress (`sdd/notas-credito-ui-pos/apply-progress`) para el desglose y la recomendación al orquestador.

## Slice 2 — Lista rediseñada del modal (badges, buscador, rename botón) (Spec notas-credito-pos: Alcance limitado a la sesión activa, Badges, Renombrar botón)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~200–250 |
| 400-line budget risk | Low |
| Chained PRs | Yes — depende de Slice 1 |
| Rollback | Modal cae de vuelta a la lista simple actual (sin badges/buscador) |

**Límite explícito de este slice (Design §Slice Plan: "SIN panel montado aún")**: el drill-down actual de `nota-credito-pos-modal.tsx` (click factura → vista de confirmación con modalidad/depósito/motivo/PIN, líneas 200-339 del archivo actual) NO se toca ni se reemplaza todavía — sigue funcionando exactamente igual para NC TOTAL. Este slice solo interviene la VISTA DE LISTADO (líneas 168-199 actuales): agrega badges, buscador y renombra el botón de acceso. El layout de dos columnas y el montaje real de `FacturaDetallePanel` son Slice 3.

- [x] 2.1 RED: extender `src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` — el listado muestra badge Contado/Crédito/Abonada por fila (usando `derivarEstadoPago` sobre `facturas` mockeadas); una factura con `tiene_reverso_total=1` muestra badge "Reverso Total"; `tiene_reverso_parcial=1` muestra "Reverso Parcial"; una factura Abonada + `tiene_reverso_parcial=1` muestra AMBOS badges simultáneamente. [Spec: Badges — todos los scenarios]
- [x] 2.2 RED: mismo archivo — buscador filtra client-side por `nro_factura` (substring), por `cliente_nombre` (substring, case-insensitive), y por texto de badge/estado; sesión sin facturas muestra el estado vacío existente sin error; una factura `status='ANULADA'` (reversada) de la sesión sigue apareciendo en el listado con su badge. [Spec: Alcance limitado a la sesión activa — todos los scenarios de buscador]. **Extra (no forzado por tasks.md, TDD-consistente)**: se agregaron RED/GREEN dedicados para la función pura `facturaCoincideBusqueda` en `notas-credito-ui.test.ts`/`.ts` ANTES de wiring el componente (Extract-Before-Mock Rule) — incluye normalización de acentos (`normalizarBusqueda`) descubierta como necesaria durante TRIANGULATE (buscar "credito" sin tilde debe matchear el badge "Crédito").
- [x] 2.3 GREEN: `nota-credito-pos-modal.tsx` — agregar estado `searchQuery`, input de búsqueda sobre la vista de listado, y un filtro derivado (`useMemo`, sin nueva query) que usa `facturaCoincideBusqueda` (`notas-credito-ui.ts`) contra `searchQuery`.
- [x] 2.4 GREEN: renderizar badges por fila via nuevo componente `FacturaBadges` usando `derivarEstadoPago(f)` + `f.tiene_reverso_total`/`tiene_reverso_parcial` (shadcn `Badge`, variant outline con colores Tailwind, sin nueva dependencia de UI); fecha/hora via `formatDateTime` (ya importado).
- [x] 2.5 GREEN: `pos-terminal.tsx` — renombrado el botón desktop (hoy "Nota de Credito") a "Facturas de caja"; renombrado el botón mobile (hoy "NC") a "Fact.". Cero cambios de lógica: mismo `onClick={() => setShowNotaCreditoModal(true)}`, mismo estado `showNotaCreditoModal`. Comentarios inline actualizados. Triangulation skipped (tarea puramente estructural, sin archivo de test para `pos-terminal.tsx`, salida única posible). [Spec: Renombrar el botón de acceso a NC del POS]
- [x] 2.6 Verify: `yarn test:run` (951/951 verdes) + `yarn type-check` (ruido preexistente de vitest-globals que afecta a TODA la suite de tests bajo el tsconfig de la app —no 3 archivos puntuales—, cero errores nuevos introducidos por este change; `type-check:test` es la fuente autoritativa para archivos de test) + `yarn type-check:test` (limpio) verdes; flujo TOTAL existente (click factura → modalidad → motivo → confirmar → PIN si aplica) NO se toco — 0 cambios de logica en ese bloque JSX, solo se agrego `disabled`/badges/busqueda en el bloque de LISTADO que lo precede.

**WARNING #2 de Slice 1 (obs #2877) — RESUELTO en este slice**: las filas cuya `status === 'ANULADA'` (reverso TOTAL ya emitido) ahora quedan visualmente deshabilitadas (`opacity-60 cursor-not-allowed`, atributo `disabled`) y NO navegan al flujo de confirmación — el botón "Confirmar Anulacion" jamás se renderiza para esas facturas porque `onClick` nunca dispara sobre un `<button disabled>`. El badge "Reverso Total" sigue visible. Facturas con `tiene_reverso_parcial=1` pero `status` activo permanecen clickeables (pueden recibir otra NC parcial dentro del tope que valida el backend).

**Resultado real vs. forecast**: 314 inserciones + 39 eliminaciones = 353 líneas cambiadas (`git diff --stat` sobre los 5 archivos del slice) vs. forecast ~200-250 — por encima del estimado pero DENTRO del budget de 400 (clasificación "Low" del forecast se mantiene válida, a diferencia de Slice 1). Sin exception necesaria.

## Slice 3 — Panel de detalle montado + selección PARCIAL + wiring a `crearNotaCredito` (Design §Decisión 5/6/7/8, Spec notas-credito-pos: Panel de detalle fiscal, Selección TOTAL/PARCIAL, Invariante de tasa histórica)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~350–400 |
| 400-line budget risk | **Medium — cerca del budget, no agregar scope** |
| Chained PRs | Yes — depende de Slice 1 y 2 |
| Rollback | Botón "Nota de crédito" cae a solo TOTAL (comportamiento pre-slice, ya reversible sin tocar `crearNotaCredito`) |

**BIMONETARY INVARIANT — tratamiento especial**: el preview de Bs en PARCIAL
MUST derivarse SIEMPRE de `factura.tasa` (histórica), NUNCA de la tasa
vigente del sistema. Esto tiene su propio test RED dedicado (3.5) antes de
cualquier wiring — no se implementa "de paso" dentro de otra tarea.

**Sub-troceo 3a/3b (obs `sdd/notas-credito-ui-pos/apply-progress`, precedente Change 1 Slice 5a-2a/5a-2b)**: Slice 3 se dividio en dos batches de apply — 3a (panel montado + funciones puras, este batch) y 3b (SeleccionLineasNc + wiring PARCIAL completo). `feat/notas-credito-ui-pos-s3a` → `feat/notas-credito-ui-pos-s2`; 3b encadenara sobre 3a.

- [x] 3.1 [3a] Reestructurar `nota-credito-pos-modal.tsx` a layout de dos columnas: lista (con búsqueda/badges de Slice 2) a la izquierda, `FacturaDetallePanel` (Slice 1) montado a la derecha — reemplaza el drill-down single-view actual. Ensanchar el `<dialog>` (`max-w-lg` → `max-w-4xl`). Al seleccionar una factura, el modal arma el `ReciboData` mapeando `useDetalleFactura` → `ReciboLineaInput` (mismo mapeo que `venta-exitosa-modal.tsx:94-101`, NO una fórmula nueva) y llama `buildReciboData(...)` con `discrepancy: null`, `saldoPendUsd: factura.saldo_pend_usd` (Design §Decisión 5). **Deviación aditiva**: se agregó `v.total_igtf_usd` al SELECT de `useFacturasSesionActiva` (+ campo opcional en `FacturaParaAnular`) — necesario para alimentar `igtfUsd` real del panel (spec "Factura con IGTF aplicado"), no estaba en el Design SQL original de Decision 2 pero es 100% aditivo sobre una columna ya persistida.
- [x] 3.2 [3a] Query mínima aditiva para "Afectación CxC": `SELECT COUNT(*) as n FROM movimientos_cuenta WHERE venta_id = ? AND empresa_id = ?` (Design §Decisión 6 — fuente correcta, NUNCA `construirCierreRecibo`/`discrepancy`), consumida por `huboAfectacionCxc(n)` (Slice 1) y pasada como prop `afectoCxc` a `FacturaDetallePanel`. Implementado como `useAfectacionCxc(ventaId, empresaId)` en `use-cxc.ts` (mismo archivo que `useDetalleFactura`, RED→GREEN con tests dedicados).
- [x] 3.3 [3a] RED: `nota-credito-pos-modal.test.tsx` — sin selección, el panel derecho no muestra datos (ya cubierto en 1.10, aquí se verifica integrado en el modal real); con selección, coincide con `buildReciboData` de esa venta (fixture con IGTF y con líneas exentas: linea gravada + linea exenta + `total_igtf_usd`). [Spec: Panel de detalle fiscal — scenarios de IGTF/exentos/selección]
- [x] 3.4 [3b] GREEN: botón "Nota de crédito" ahora pregunta TOTAL o PARCIAL antes de continuar (nuevo paso de UI, ej. dos botones o un toggle). TOTAL preserva la llamada EXACTA existente a `crearNotaCredito({ ..., tipo: TOTAL })` sin alterar el contrato. [Spec: Selección de tipo de NC — scenario "NC TOTAL reversa la factura completa"]
- [x] 3.5 [3a] RED (bimonetary invariant, test dedicado, ANTES del wiring): nuevo `previewMontoBsNc` en `src/features/ventas/utils/__tests__/notas-credito-ui.test.ts` — TOTAL usa `factura.total_bs` verbatim (sin cálculo); PARCIAL con `factura.tasa` (R1) distinta de una tasa vigente simulada R2 produce el monto calculado a R1, nunca a R2; fixture con líneas mixtas gravadas/exentas. [Design §Decisión 8, Spec: Invariante de tasa histórica — todos los scenarios]
- [x] 3.6 [3a] GREEN: implementar `previewMontoBsNc` en `notas-credito-ui.ts` — para PARCIAL, reusa `buildReciboData` sobre el subconjunto de líneas seleccionadas con `tasa: factura.tasa` (histórica, columna ya persistida) — CERO fórmula paralela nueva, estructuralmente igual a `calcularDesgloseLineaNC` del backend (misma `applyImpuesto`). El componente NUNCA lee la tasa vigente del sistema para este cálculo. [Design §Decisión 8, firma exacta en Design §Interfaces]
- [x] 3.7 [3a] RED: nuevo `src/features/ventas/utils/__tests__/notas-credito-ui.test.ts` (misma suite) — `derivarLineasNcParcial(facturaLineas, cantidadesUi)`: cantidad `>0` incluye la línea; cantidad `> cantidadFacturada` → error, línea excluida del resultado válido; `!esDecimal && !Number.isInteger(cantidad)` → error; todas las cantidades en 0 → `lineas: []` + al menos un error genérico ("selecciona al menos una línea"); mapeo correcto a `cantidadDevolver` como string. [Design §Decisión 7, firma exacta en Design §Interfaces; Spec: Selección TOTAL/PARCIAL — scenarios de tope/es_decimal/al-menos-una-línea]. **Deviación menor**: `cantidadDevolver` se formatea con `Decimal(cantidad).toFixed(3)` (3 decimales), no `toStorageString` (8 decimales) — consistente con el formato REAL usado en todo el resto del código de NC (`use-notas-credito.ts`, `notas-credito-fiscal.ts`, tests existentes: `"2.000"`), el texto literal del design ("toStorageString... 3 decimales") era auto-contradictorio.
- [x] 3.8 [3a] GREEN: implementar `derivarLineasNcParcial` en `notas-credito-ui.ts` con la firma exacta del design (`LineaFacturaParaNc`, `DerivarLineasNcResult`).
- [x] 3.9 [3b] RED (component): nuevo `src/features/ventas/components/__tests__/seleccion-lineas-nc.test.tsx` — botón "Confirmar" deshabilitado mientras todas las cantidades estén en 0; stepper respeta paso `0.001`/`1` según `es_decimal` de cada línea (mismo patrón que `linea-items.tsx:88-137`); no permite tecla decimal cuando `es_decimal=0`. [Spec: Selección TOTAL/PARCIAL — scenario "Cantidad respeta es_decimal"]
- [x] 3.10 [3b] GREEN: crear `src/features/ventas/components/seleccion-lineas-nc.tsx` — `SeleccionLineasNc`, componente de presentación, reusa el patrón de stepper de `linea-items.tsx` (no lo reimplementa desde cero — extraer el bloque de stepper a una función/sub-componente compartido si el reuso directo no es práctico, documentando la decisión inline).
- [x] 3.11 [3b] GREEN: wiring completo en `nota-credito-pos-modal.tsx` — PARCIAL elegido → muestra `SeleccionLineasNc` con las líneas de `useDetalleFactura`; cantidades ingresadas pasan por `derivarLineasNcParcial` (3.8, ya disponible); errores bloquean el botón "Confirmar"; preview de monto usa `previewMontoBsNc` (3.6, ya disponible); confirmar llama `crearNotaCredito({ ..., tipo: 'PARCIAL', lineas })` — el tope acumulado cross-NC (`validarTopeDobleCredito`) sigue siendo responsabilidad exclusiva del backend, la UI solo propaga el error del `catch` vía `toast` (Design §Decisión 7, última línea).
- [x] 3.12 [3b] Verify: `yarn test:run` + `yarn type-check` + `yarn type-check:test` verdes; confirmar `crearNotaCredito` (`use-notas-credito.ts`) tiene CERO líneas cambiadas (`git diff --stat` sobre ese archivo) — este slice solo llama la función existente, nunca la modifica.

**Resultado real 3a vs. forecast**: 798 líneas cambiadas (`git diff --stat`: 627 inserciones + 171 eliminaciones sobre 9 archivos) vs. forecast de sub-split ~300-350 — excede significativamente el budget de 400. Gran parte (272 líneas) es ruido de reindentación en `nota-credito-pos-modal.tsx` (el layout de 2 columnas añade un nivel de anidación que reindenta el bloque de listado existente sin cambiar su lógica — con `git diff --ignore-all-space` el total baja a 526 líneas). Ver apply-progress (`sdd/notas-credito-ui-pos/apply-progress`) para el desglose completo y la recomendación al orquestador. `crearNotaCredito` verificado en CERO líneas cambiadas.

**Resultado real 3b vs. forecast**: 587 líneas cambiadas (`git diff --stat`: 564 inserciones + 23 eliminaciones sobre 6 archivos; con `--ignore-all-space` baja a 557) vs. forecast de sub-split ~200-280 — excede el budget de 400. Desglose: `seleccion-lineas-nc.tsx` (181L, componente nuevo) + su test (122L) + wiring en `nota-credito-pos-modal.tsx` (147L, incluye el toggle Total/Parcial + memo de mapeo de líneas + refactor de `emitirNc`/gating PIN A para aceptar `lineasParcial`) + su test (95L) + guardrail de cantidad negativa en `derivarLineasNcParcial` (16L) + su test (26L). Sin scope creep — el exceso es 100% cobertura de test (RED-first, incluyendo el guard de cantidad negativa que 3a dejó pendiente) y presentación (tabla + stepper accesible), no lógica adicional no pedida. `crearNotaCredito` verificado en CERO líneas cambiadas (`git diff --stat` sobre `use-notas-credito.ts` vacío). Cierra el segmento [3] del ring — el flujo POS de NC queda funcional de punta a punta (TOTAL + PARCIAL).

## Slice 4 — Placeholder "Editar métodos de pago" + extensión de gating PIN A (Design §Decisión 9, Spec notas-credito-pos: Modelo de doble PIN, Botón placeholder)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~100–150 |
| 400-line budget risk | Low |
| Chained PRs | Yes — depende de Slice 2 (botón/gating existente), independiente de Slice 3 |
| Rollback | Botón oculto/removido sin romper NC TOTAL/PARCIAL |

- [ ] 4.1 RED: extender `nota-credito-pos-modal.test.tsx` — con permiso `PERMISSIONS.SALES_NOTA_CREDITO`, click en "Editar métodos de pago" dispara `toast.info` (función no implementada) y NUNCA llama `crearNotaCredito`; sin el permiso, click abre el MISMO `SupervisorPinDialog` de PIN A (mismo `requiredPermission`); tras autorizar, ejecuta la acción pendiente correcta y NO la de "Nota de crédito" (y viceversa — verificar que ambas acciones pendientes son independientes entre sí en la misma sesión del modal). [Spec: Modelo de doble PIN — "Permiso determina el PIN para ambas acciones"; Botón placeholder — scenario único]
- [ ] 4.2 GREEN: `nota-credito-pos-modal.tsx` — agregar botón "Editar métodos de pago" junto a "Nota de crédito" (mismo estilo/ubicación); estado `accionPendiente: 'NC' | 'EDITAR_PAGOS' | null`; `handleConfirmarClick` (línea 129-138 actual) se generaliza para setear `accionPendiente` antes de decidir PIN-vs-directo; `handleEditarPagosClick` espeja la misma lógica pero su rama "autorizado/sin PIN necesario" llama `toast.info('Función "Editar métodos de pago" aún no implementada')` — CERO mutación de datos. [Design §Decisión 9]
- [ ] 4.3 GREEN: el ÚNICO `SupervisorPinDialog` de PIN A existente pasa a un `onAuthorized` que despacha según `accionPendiente` (`emitirNc()` vs el no-op de 4.2). El `SupervisorPinDialog` de PIN B (`showPinDeposito`/`pinDepositoAutorizado`, líneas 66-69/247-273/332-339 actuales) NO se toca — sigue gateando únicamente el selector de depósito dentro del flujo de NC. [Design §Decisión 9, último párrafo]
- [ ] 4.4 Verify: `yarn test:run` + `yarn type-check` + `yarn type-check:test` verdes; confirmar que ningún test de Slice 1-3 quedó roto por el `accionPendiente` agregado (mismo comportamiento de emisión NC cuando `accionPendiente==='NC'`).

## Cross-cutting invariants (aplican a los 4 slices)

- `crearNotaCredito` (`use-notas-credito.ts`) es CÓDIGO CONGELADO — ningún slice lo modifica; todos lo LLAMAN sin alterar su firma ni lógica interna.
- Toda query NUEVA filtra `empresa_id` (`use-facturas-sesion-activa.ts`, query de afectación CxC del Slice 3). EXCEPCIÓN documentada: `use-cxc.ts::useDetalleFactura` NO filtra `empresa_id` (solo `WHERE vd.venta_id = ?`) — gap PREEXISTENTE, no introducido por este change. Riesgo práctico bajo porque el `venta_id` siempre proviene de una lista ya escopeada por `empresa_id`. DEUDA: agregar el filtro como defensa en profundidad en un fix aparte (toca un hook compartido con CxC, fuera del scope de este change). Verificado en review de Slice 1 (obs #2877).
- decimal.js para todo cálculo monetario — nunca `float`/`Number` para montos. Épsilon `0.005` en `derivarEstadoPago` (mismo umbral que `vencimientos_cobrar`).
- Invariante bimonetaria: NC MUST usar `venta.tasa`/`venta.total_bs` histórica, NUNCA la tasa vigente del sistema — verificado con test dedicado (3.5) antes del wiring (3.6).
- `FacturaDetallePanel` es un componente de PRESENTACIÓN puro — recibe `ReciboData` ya construido, NUNCA llama `buildReciboData` ni hace fetch internamente (Design §Decisión 5).
- "Afectación a CxC" se deriva de `COUNT(*) FROM movimientos_cuenta WHERE venta_id = ?` — NUNCA de `construirCierreRecibo`/`discrepancy` de `recibo-pagos.ts` (estado efímero de React, no persistido; Design §Decisión 6, hallazgo bloqueante resuelto).
- Reuso obligatorio, no reescritura: `buildReciboData`/`construirFilasTotales` (`factura-export.ts`) para el panel y el preview PARCIAL; el patrón de stepper de `linea-items.tsx:88-137` para `SeleccionLineasNc`; `SupervisorPinDialog` + `PERMISSIONS.SALES_NOTA_CREDITO` (gating existente, solo extendido en Slice 4).
- Solo español en toda la UI. TypeScript estricto, sin `any`. `yarn` — nunca `npm`.
- `useDetalleFactura` (cxc) se extiende de forma 100% aditiva — verificar en Slice 1 que los 3 consumidores existentes no rompen antes de avanzar a Slice 2.
