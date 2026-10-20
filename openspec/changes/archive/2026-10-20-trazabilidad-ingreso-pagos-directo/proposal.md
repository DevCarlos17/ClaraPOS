# Proposal: Trazabilidad Ingreso de Tesorería ↔ Pagos Reales (camino Directo)

> Change: `trazabilidad-ingreso-pagos-directo` | Phase: propose | Project: clarapos

## Intent

Hoy, un `movimientos_bancarios` INGRESO `origen='TRANSFERENCIA_CLIENTE'` (abono de cliente posteado en el momento, método `deposito_directo=1`) **no tiene FK formal hacia el/los `pago_id` reales que representa**:

- **Caso FIFO multi-factura (`registrarAbonoGlobal`, `use-cxc.ts` ~L1438-1453)**: el INGRESO referencia `movId`, el id de UNA fila agregada `movimientos_cuenta` (tipo PAG). Esa fila no apunta a los N `pago_id` individuales creados en el loop FIFO (~L1120) ni al `pagoAnticipoId` del excedente (~L1206) — el único puente es heurístico (mismo cliente + método + `referencia` texto libre + ventana de tiempo), inaceptable para una operación financiera de reverso.
- **Caso simple (`aplicarPagoFacturaEnTx`, ~L703-745)**: el INGRESO referencia `venta_id`, nunca `pago_id`. Si la misma factura recibió 2+ abonos directos separados, hay ambigüedad para saber cuál `pago_id` exacto generó cuál INGRESO.

Esta brecha bloquea dos entregables futuros que requieren saber, con certeza, qué pago(s) real(es) representa un INGRESO: (1) un preview read-only de "facturas afectadas" por INGRESO, y (2) el futuro reverso de abono desde tesorería (contra-asiento + reapertura de facturas). Este change cierra solo la brecha de trazabilidad — no implementa preview ni reverso.

## Scope

### In Scope
- Tabla puente `movimientos_bancarios_pagos` (insert-only, mismo patrón que `pagos_aplicaciones`/`saf_creditos_aplicaciones`).
- Wiring de los 2 sitios de escritura, **solo para métodos DIRECTOS** (`deposito_directo=1`, `origen='TRANSFERENCIA_CLIENTE'`).
- Dos slices encadenados (0a-schema, 0a-wiring), entregados como 2 PRs individuales, stacked a main.

### Out of Scope
- **Sin backfill**: toda la data actual es de prueba y será purgada; no hay historial real que recuperar. Migración 100% DDL aditiva, cero DML — mismo precedente de `migrations/0112_pagos_aplicaciones.sql` (arranca vacía).
- **Camino BATCH/LOTE**: no requiere tabla nueva — el chain existente (`pago.sesion_caja_id`+`metodo_cobro_id` → `movimientos_metodo_cobro` origen=`EGRESO_TESORERIA` → `traspasos_tesoreria` → cuenta destino) ya cierra, porque el destino se resuelve de forma determinística por `metodo_cobro_id` antes del loop de consolidación. El read-helper futuro para ese camino es un concern separado (slice 0b, no entregado aquí).
- El reverso real de tesorería y la UI de preview "facturas afectadas" — changes futuros que leerán esta tabla.
- INGRESOS pre-migración quedan no-reversables desde tesorería (gap documentado, mismo precedente que 0112).

## Capabilities

### New Capabilities
- `tesoreria-trazabilidad-ingreso-pagos`: fan-in explícito y trazable desde un INGRESO bancario directo hacia los N `pago_id` reales que representa, con `monto_aplicado_usd` por vínculo.

### Modified Capabilities
None — ningún spec existente en `openspec/specs/` documenta hoy la relación `movimientos_bancarios` ↔ `pagos`; es terreno nuevo.

## Approach

**Slice 0a-schema** — `migrations/0117_movimientos_bancarios_pagos.sql`:
- Columnas: `id`, `empresa_id`, `ingreso_id` → `movimientos_bancarios(id)`, `pago_id` → `pagos(id)`, `monto_aplicado_usd NUMERIC(20,8) CHECK (> 0)`, `created_at`, `created_by`. Alternativas consideradas y rechazadas: (a) columna `pago_id` suelta en `movimientos_bancarios` — no resuelve el fan-in real de abono-global; (c) reusar `doc_origen_id` — rompería reportes existentes que asumen `doc_origen_id=venta_id`.
- Índices: `idx_mov_banc_pagos_ingreso`, `idx_mov_banc_pagos_pago`, `idx_mov_banc_pagos_empresa` (mirror `idx_pagos_aplic_*` de 0112).
- RLS: policies SELECT/INSERT via `current_empresa_id()`; sin UPDATE/DELETE (append-only, mismo precedente 0105/0112) — un PUT reintentado de PowerSync converge via `ON CONFLICT DO NOTHING`.
- `src/core/db/powersync/schema.ts`: registrar tabla (decimal como `column.text`, convención del repo).
- `src/core/db/powersync/connector.ts`: agregar `'movimientos_bancarios_pagos'` a `IMMUTABLE_TABLES` (~L177), mismo motivo documentado ahí para `pagos_aplicaciones`.
- `backend/powersync-sync-rules.yaml`: agregar `SELECT * FROM movimientos_bancarios_pagos WHERE empresa_id = bucket.empresa_id` bajo `# --- CAJA / TESORERIA ---` (junto a `movimientos_bancarios`, ~L129). Nota al margen (no corregido aquí): `pagos_aplicaciones` (0112) tampoco aparece en este archivo — gap preexistente, fuera de alcance.

**Slice 0a-wiring** — solo INSERTs aditivos en `src/features/cxc/hooks/use-cxc.ts`, sin reordenar ni tocar lógica existente:
- `aplicarPagoFacturaEnTx` (~L703-745): el `uuidv4()` del INGRESO hoy se genera inline y se descarta — capturarlo en `ingresoBancarioId` y, tras el INSERT a `movimientos_bancarios`, insertar 1 fila puente `(ingresoBancarioId, pagoId, montoUsd)` (`pagoId` ya está en scope de esta función).
- `registrarAbonoGlobal` (~L1106-1459): acumular `{pagoId, montoAplicar}` por cada iteración del loop FIFO (~L1120) y, cuando aplique, `{pagoAnticipoId, montoRestante}` del excedente (~L1206); luego, **dentro del `if` existente que ya guarda `deposito_directo===1`** (~L1413+), tras crear `movBancoAbonoId`, insertar una fila puente por cada entrada acumulada.
- Tests Vitest: 1 factura (1 fila), FIFO multi-factura (N filas), FIFO + excedente→SAF (N+1 filas), método no-directo (0 filas, sin escritura a la tabla).

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `migrations/0117_movimientos_bancarios_pagos.sql` | New | Tabla puente append-only, RLS SELECT/INSERT |
| `src/core/db/powersync/schema.ts` | Modified | Registrar tabla nueva |
| `src/core/db/powersync/connector.ts` | Modified | Agregar a `IMMUTABLE_TABLES` (~L177) |
| `backend/powersync-sync-rules.yaml` | Modified | Agregar bucket SELECT (mirror ~L129) |
| `src/features/cxc/hooks/use-cxc.ts` | Modified | `aplicarPagoFacturaEnTx` (~L703-745), `registrarAbonoGlobal` (~L1106-1459) |
| `src/features/cxc/hooks/__tests__/*.test.ts` | New | Cobertura de los 4 casos del bridge |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tocar 2 funciones financieras críticas (`aplicarPagoFacturaEnTx`, `registrarAbonoGlobal`) puede regresionar cobro/CxC en producción | Medium | Solo INSERTs aditivos, cero reorder/remoción de statements existentes; comportamiento byte-identico fuera de los nuevos INSERT; cobertura Vitest de regresión obligatoria antes de merge |
| Olvidar capturar `ingresoBancarioId` deja el bridge como código muerto silenciosamente (el `uuidv4()` inline nunca se reutiliza) | Medium | Test explícito que asertа `ingreso_id` de la fila puente == `movimientos_bancarios.id` real insertado en la misma tx |
| Métodos batch (no directos) terminan generando filas puente por error | Low | Protegido por la MISMA condición `deposito_directo===1` que ya envuelve el INSERT del INGRESO — no hay condición nueva que equivocar |
| INGRESOS históricos (pre-migración) quedan sin vínculo | Known/Accepted | Fuera de alcance documentado; mismo precedente que `migrations/0112` (sin backfill, data de prueba) |

## Rollback Plan

Slice 0a-schema: `DROP TABLE IF EXISTS movimientos_bancarios_pagos;` + revertir las entradas en `schema.ts`/`connector.ts`/`powersync-sync-rules.yaml`. Slice 0a-wiring: revertir solo los INSERT agregados — los writes existentes de `pagos`/`movimientos_bancarios`/`movimientos_cuenta` quedan intactos, por lo que revertir el commit de wiring restaura el comportamiento exacto pre-change sin pérdida de datos (la tabla puente simplemente deja de poblarse).

## Dependencies

- Construye sobre `migrations/0112_pagos_aplicaciones.sql` (precedente estructural exacto) y las exploraciones Engram `sdd/reverso-abono-tesoreria/explore-estado-actual` (hallazgo del gap) y `sdd/reverso-abono-tesoreria/explore-diseno-puente` (veredicto de diseño: tabla join, alternativas rechazadas).
- Precede al futuro preview de "facturas afectadas" y al reverso de tesorería — ambos son changes SDD separados que leerán esta tabla, no se implementan aquí.

## Effort Forecast

### Review Workload Forecast
| Field | Value |
|---|---|
| Estimated changed lines | 0a-schema: ~100-150 (migración + schema.ts + connector.ts + sync-rules.yaml). 0a-wiring: ~100-150 (2 sitios de wiring + tests) |
| Chained PRs recommended | Yes — PR1 = 0a-schema, PR2 = 0a-wiring, stacked PR2→PR1→develop, merge a cargo del usuario |
| 400-line budget risk | Low en ambos slices por separado |
| Decision needed before apply | No para el diseño (ya locked por el humano: tabla join, sin backfill, alcance solo-directo). Sí recomendado: pasar por spec liviana + design corto antes de tasks, porque este change introduce una tabla NUEVA y toca 2 funciones financieras críticas — a diferencia del fix trivial de connector recién hecho |

## Verification Plan

- `yarn test:run` (Vitest 3.2, TDD estricto activo en el repo) — cobertura de los 4 casos del bridge.
- `yarn type-check:test` — **NO** `yarn lint` (eslint ausente del proyecto).
- La migración la corre manualmente el usuario en el SQL Editor de Supabase (sin credenciales de Postgres en esta sesión). El usuario purga la data de prueba antes/después según necesite.

## Success Criteria

- [ ] `movimientos_bancarios_pagos` existe, RLS append-only (SELECT/INSERT via `current_empresa_id()`, sin policy UPDATE/DELETE)
- [ ] Todo INGRESO directo creado por `aplicarPagoFacturaEnTx` tiene exactamente 1 fila puente apuntando a su `pago_id`
- [ ] Todo INGRESO directo creado por `registrarAbonoGlobal` tiene N filas puente (una por `pago_id` del FIFO, más 1 por el `pago_id` del excedente cuando aplica), que suman el `monto` del ingreso
- [ ] Métodos no-directos (batch) escriben cero filas puente — la tabla queda acotada al camino directo
- [ ] `yarn test:run` y `yarn type-check:test` pasan sin errores
- [ ] Migración `0117` aplicada manualmente por el usuario en Supabase antes de desplegar el slice 0a-wiring
