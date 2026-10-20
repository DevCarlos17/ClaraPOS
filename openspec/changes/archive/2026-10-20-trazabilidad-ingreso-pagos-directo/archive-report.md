# Archive Report: trazabilidad-ingreso-pagos-directo

**Archived**: 2026-10-20
**Verdict de verify**: PASS, ambos slices (ver `verify-report.md` en esta misma carpeta)
**PRs**: #254 (0a-schema, merge commit `2816441`) + #255 (0a-wiring, merge commit `6e03c78`), stacked a `develop`
**Migración**: `0117_movimientos_bancarios_pagos.sql` — ejecutada manualmente por el owner en Supabase, append-only confirmado

## Qué se envió (shipped)

Una tabla puente nueva + wiring que cierra la brecha de trazabilidad entre un INGRESO de tesorería de abono directo y el/los pago(s) real(es) que representa. Hasta este change, esa relación era heurística (mismo cliente + método + texto libre + ventana de tiempo) — inaceptable para una futura operación financiera de reverso.

| Pieza | Dónde |
|---|---|
| Tabla `movimientos_bancarios_pagos` | `migrations/0117_movimientos_bancarios_pagos.sql` — mirror exacto de `pagos_aplicaciones` (0112): append-only, RLS SELECT/INSERT vía `current_empresa_id()`, sin trigger, sin `cliente_id` denormalizado |
| Wiring caso simple | `aplicarPagoFacturaEnTx` (`use-cxc.ts`) — 1 fila puente por INGRESO, hoisteando `ingresoBancarioId` para capturar el id real |
| Wiring fan-in FIFO | `registrarAbonoGlobal` (`use-cxc.ts`) — N filas (una por factura del FIFO) o N+1 si hay excedente promovido a SAFC, acumuladas en `bridgeEntries[]` y flusheadas dentro del `if` de banco directo ya existente |
| Fix de paso | Gap preexistente en `backend/powersync-sync-rules.yaml`: `pagos_aplicaciones` (0112) nunca había sido agregada al archivo de sync rules — corregido en el mismo PR que agregó la línea de la tabla nueva |

## Decisiones de diseño clave

| Decisión | Alternativa rechazada | Por qué |
|---|---|---|
| Tabla join, no columna suelta | `pago_id` en `movimientos_bancarios` | El fan-in real (1 ingreso ↔ N pagos en FIFO) no cabe en una FK simple |
| Sin backfill, arranca vacía | Backfill heurístico por timestamp/venta_id | Data de prueba, mismo precedente que 0112/0105 — ingresos pre-migración quedan no-reversables (gap documentado y aceptado) |
| Solo camino directo (`deposito_directo=1`) | Cubrir también batch/lote | El camino batch ya cierra determinísticamente vía `metodo_cobro_id → movimientos_metodo_cobro → traspasos_tesoreria`; no necesita schema nuevo (ver slice 0b en Carried Forward) |
| RLS append-only sin trigger de inmutabilidad | Trigger estilo `trg_kardex_no_update` | Mirror de `pagos_aplicaciones`: auditoría app-trusted, sin policy UPDATE/DELETE ya bloquea mutación; PUT reintentado converge vía `ON CONFLICT DO NOTHING` al estar en `IMMUTABLE_TABLES` |
| Invariante de suma: Σ(monto_aplicado_usd) = monto del ingreso | — | Probado por construcción matemática, no por convención: `montoRestante` decrece exactamente lo que cada fila FIFO registra, el remanente final es la fila de anticipo |

## Verify: resultado

**PASS en ambos slices**, revisión adversarial independiente (no se confió en el self-report de apply):
- Slice 0a-schema: migración verificada byte-a-byte contra el template 0112, RLS/índices/publication correctos, TDD RED→GREEN reproducido, 0 regresiones en `src/core/db` (37 tests).
- Slice 0a-wiring: diff additive-only confirmado línea por línea (ningún statement existente reordenado/removido), ID-parity probada, invariante de suma probada por construcción, TDD RED→GREEN reproducido (3 tests caen al revertir), 0 regresiones en `src/features/cxc` (220/222 — los 2 fallos de `cxc-list.test.tsx` son pre-existentes en `develop`, confirmados idénticos con `git stash` del slice completo).

Ver `verify-report.md` en esta carpeta para el detalle completo por slice.

## Tarea cross-slice completada en este archive (F.1)

`migrations/README.md` tenía un gap: las filas `0115` y `0116` (ya mergeadas por otro trabajo) nunca se habían documentado, y la tarea F.1 de este change pedía agregar la fila `0117`. Se agregaron las 3 filas (0115, 0116, 0117) con la misma densidad/voz que las filas 0104-0114 — la tabla queda sin huecos de 0104 a 0117.

## Capabilities / specs

**New**: `tesoreria-trazabilidad-ingreso-pagos` — copiada completa (full spec, sin delta) a `openspec/specs/tesoreria-trazabilidad-ingreso-pagos/spec.md`. 7 requirements, 10 scenarios.
**Modified**: Ninguna — spec nueva, terreno no documentado previamente.

## Carried Forward (trabajo futuro — este change era el slice 0a, el desbloqueador)

Este change NO implementa preview ni reverso — solo la trazabilidad que los habilita. Lo que queda para changes futuros:

### 1. Slice 1 — Preview read-only "facturas afectadas"
Dado un INGRESO de tesorería directo, listar las facturas A, B, C que pagó más las facturas D, E consumidas vía SAF derivado de ese mismo pago. Ahora construible de forma confiable gracias a esta trazabilidad (antes era solo seguro para el caso 1-factura-1-pago).

### 2. Slice 0b — Read-helper para el camino lote/batch
`resolverDestinoTesoreriaDePago`: no requiere schema nuevo. El chain existente (`pago.sesion_caja_id` + `metodo_cobro_id` → `movimientos_metodo_cobro` origen=`EGRESO_TESORERIA` → `traspasos_tesoreria` → cuenta destino) ya cierra determinísticamente. Riesgo a vigilar: si la configuración del método de cobro cambió a mitad de sesión, el helper debe bloquear y preguntar, no asumir.

### 3. Slices de reversal flow
- Egreso espejo en tesorería (contra-asiento, nunca borrar).
- Reapertura de facturas afectadas.
- Unwind de SAF cuando el abono promovió excedente a crédito.
- Historial de abono reversado, visible en UI.
- **Bug de negocio a corregir en el camino**: hoy, reversar desde CxC (`registrarReversoAbono`/`reversarPagoSafEnTx`) NUNCA crea un egreso de tesorería — si el pago original fue por un método `deposito_directo=1`, el saldo del banco queda sobreestimado tras el reverso (el dinero "que ya entró" nunca sale). Confirmado en la exploración previa (`sdd/reverso-abono-tesoreria/explore-estado-actual` #5561).

### 4. Deuda técnica pre-existente (flaggeada, fuera de alcance — solo documentar)
- **movId-fantasma**: en `registrarAbonoGlobal`, cuando el abono es 100% excedente (sin facturas pendientes), el `movId` se genera pero el INSERT a `movimientos_cuenta` se salta — el INGRESO bancario sigue referenciando ese `movId` inexistente como `doc_origen_id`. Ortogonal a este change (el bridge usa `pago_id`, siempre real).
- **try/catch silencioso**: los bloques de banco directo en ambos sitios de wiring están envueltos en un `try/catch` preexistente que traga cualquier fallo de INSERT (incluyendo el nuevo INSERT bridge) sin exponer el error. No introducido por este change, pero ahora también cubre el bridge.
- **Gap de type-check a nivel de proyecto**: `yarn type-check` (tsconfig.json plano) tiene ~9974 errores preexistentes porque `include` arrastra todos los `*.test.ts(x)` pero `types` no lista globals de vitest — ruido masivo, no relacionado a ningún change puntual. `yarn type-check:test` (el comando real usado en verify) está limpio salvo 3 errores baseline.

## Fallas pre-existentes confirmadas como no relacionadas (correctamente no tocadas)

- `cxc-list.test.tsx` — 2 fallos `getByRole('dialog')` no encontrado tras interacción de click, reproducidos idénticos en `develop` sin este change.
- 3 errores de `yarn type-check:test`: 2x `producto-form` (mismatch de tipo `costo_factura_usd`), 1x `swUrl` sin usar en `use-pwa-update.ts`.

## Archivado

`openspec/changes/trazabilidad-ingreso-pagos-directo/` → `openspec/changes/archive/2026-10-20-trazabilidad-ingreso-pagos-directo/`, mismo patrón `YYYY-MM-DD-{change-name}` que `2026-10-20-fix-reverso-doble-conteo-saldo-pendiente` (referencia directa de formato). Contiene: `proposal.md`, `design.md`, `tasks.md`, `specs/tesoreria-trazabilidad-ingreso-pagos/spec.md`, `verify-report.md`, `archive-report.md` (este archivo).

## Lineage (Engram)

Observaciones completas bajo `sdd/reverso-abono-tesoreria/*`: `#5561` explore estado actual, `#5563` explore diseño del puente, `#5564` proposal, `#5565` spec, `#5566` design, `#5567` tasks, `#5568` apply-progress, `#5569` verify-report 0a-schema (PASS), `#5572` verify-report 0a-wiring (PASS). Este reporte de archive persiste en `sdd/reverso-abono-tesoreria/archive-report-trazabilidad-directo`.
