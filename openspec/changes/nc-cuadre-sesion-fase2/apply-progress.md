# Apply Progress: NC en Cuadre — Fase 2 (egreso real de NC admin a sesión activa)

**Mode**: Strict TDD
**Batch**: 2 (Slice 2 sobre progreso previo de Slice 1 — mergeado, nada se pierde)

## Slice 1 — Motor (`use-notas-credito.ts`) — COMPLETO

- [x] 1.1 RED — fixture `sesionesCaja?: Record<string,{status,empresa_id}>` en `NcrTxFixtures` + rama `SELECT status FROM sesiones_caja WHERE id = ? AND empresa_id = ?` en `mockCrearNcrTx`. Nuevo `describe` "crearNotaCredito — Slice 1 (nc-cuadre-sesion-fase2: destino SESION_CAJA, egreso real a sesion de caja activa)" con 4 tests.
- [x] 1.2 GREEN — `EgresoTesoreriaLinea` reemplazado por unión discriminada: `{destino:'BANCO'|'CAJA_FUERTE', cuentaId, montoEnMonedaCuenta, referencia?}` | `{destino:'SESION_CAJA', sesionCajaId, metodoCobroId, moneda:'USD'|'BS', montoEnMonedaCuenta, referencia?}`.
- [x] 1.3 GREEN — `escribirEgresoSesionCajaEnTx(tx, linea, ncrId, nroNcr, empresa_id, usuario_id, now)` agregada tras `escribirEgresoTesoreriaEnTx`: guard `SELECT status FROM sesiones_caja WHERE id = ? AND empresa_id = ?` (throw si no existe o `status !== 'ABIERTA'`) → `INSERT INTO movimientos_metodo_cobro` (`tipo='EGRESO'`, `origen='NCR'`, `saldo_anterior=0`, `saldo_nuevo=0`, `metodo_cobro_id=linea.metodoCobroId`, `sesion_caja_id=linea.sesionCajaId`).
- [x] 1.4 GREEN — branch `REFUND_TESORERIA`: dispatcher de moneda (`esCuentaBs = linea.destino==='SESION_CAJA' ? linea.moneda==='BS' : (await leerCuentaTesoreriaEnTx(...)).esCuentaBs`) antes del loop de tope; dispatcher de escritura (`SESION_CAJA` → `escribirEgresoSesionCajaEnTx`, resto → `escribirEgresoTesoreriaEnTx` sin cambios) en el loop de escritura.
- [x] 1.5 REFACTOR — `yarn test:run` completo en verde (salvo 3 flakes preexistentes de PowerSync worker, no relacionados). Sin duplicación entre los dos dispatchers (un ternario + un if/else, cada uno de 1 línea de decisión).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.4 | `src/features/ventas/hooks/__tests__/use-notas-credito.test.ts` | Unit | ✅ 64/64 (baseline pre-cambio) | ✅ Escrito (3/4 tests fallaron por la razón correcta tras ajustar 1 regex débil; el 4to — "guard sesión inexistente" — coincidía por casualidad con el mensaje genérico de `leerCuentaTesoreriaEnTx`, corregido a un match específico antes de implementar) | ✅ 68/68 pasan tras implementar tipo + función + dispatcher | ✅ 4 casos: INSERT feliz, guard sesión inexistente, guard sesión no ABIERTA, cross-session (venta sesión A / egreso sesión B) | ✅ Sin duplicación nueva; dispatchers de 1 línea reusan 100% el tope/remanente/SAFC existente |

### Test Summary
- **Total tests nuevos**: 4
- **Total tests del archivo pasando**: 68/68 (era 64/64 antes del batch)
- **Total suite completa**: 1602/1605 (3 fallos preexistentes, no relacionados — PowerSync worker flakes en `cliente-detalle.test.tsx` y `cxc-cliente-detalle.test.tsx`)
- **Layers usados**: Unit (4)
- **Approval tests**: N/A — no hubo refactor de comportamiento existente, solo extensión aditiva
- **Pure functions creadas**: 0 (la resolución de moneda es un ternario trivial, tal como anticipaba `design.md`)

### Deviations from Design
Ninguna — implementación coincide con `design.md` §Interfaces/§3/§Data Flow byte a byte. Único ajuste fue en el TEST (no en producción): el regex de la aserción "guard sesión inexistente" se endureció de `/no encontrada/i` a `/sesion de caja no encontrada/i` porque el mensaje genérico de `leerCuentaTesoreriaEnTx` ("Cuenta de tesoreria no encontrada") coincidía por casualidad con el regex débil original, dando un falso GREEN antes de implementar el guard real.

### Files Changed
| File | Action | What Was Done |
|------|--------|----------------|
| `src/features/ventas/hooks/use-notas-credito.ts` | Modified | Unión discriminada `EgresoTesoreriaLinea` (+destino `SESION_CAJA`); nueva función `escribirEgresoSesionCajaEnTx`; narrowing de `leerCuentaTesoreriaEnTx`/`escribirEgresoTesoreriaEnTx` a `Extract<..., 'BANCO'\|'CAJA_FUERTE'>`; dispatcher de moneda + dispatcher de escritura en el branch `REFUND_TESORERIA` de `crearNotaCredito` |
| `src/features/ventas/hooks/__tests__/use-notas-credito.test.ts` | Modified | Fixture `sesionesCaja` + rama de mock para `SELECT status FROM sesiones_caja`; nuevo `describe` con 4 tests (INSERT feliz, guard inexistente, guard no-ABIERTA, cross-session) |

**Nota de tamaño**: el diff final es ~285 líneas (149 producción + 155 test, con solapamiento de contexto), por encima del estimado ~110-150 de `tasks.md` para PR1. La diferencia es casi enteramente JSDoc explicando las decisiones de diseño (convención ya establecida en el resto del archivo — cada función similar en este mismo módulo tiene un bloque de comentario equivalente). No se tocó código fuera del alcance de Slice 1.

## Slice 2 — Unificación de cuadre (`use-sesiones-caja.ts`) — COMPLETO

- [x] 2.1 RED — Creado `src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts` (no existía). 5 tests nuevos en 2 `describe`: `cerrarSesionCaja` (2 tests: total del sistema resta NCR, `sesiones_caja_detalle` por método resta NCR) y `useSaldoSesionCaja` (3 tests: resta NCR en USD/Bs, floor en 0 cuando el egreso excede la apertura, la query incluye `'NCR'` en el WHERE).
- [x] 2.2 GREEN — L757-758 y L785-786 (`movsManualUsdResult`/`movsManualBsResult` en `cerrarSesionCaja`): agregado `'NCR'` al `IN (...)`. El `else` genérico ya acumulaba como egreso — sin cambios de lógica adicionales.
- [x] 2.3 GREEN — L863-864 (`movsManualPorMetodoResult`): agregado `'NCR'` al `IN (...)`.
- [x] 2.4 GREEN — `useSaldoSesionCaja` L232-233 (WHERE del `movsData`): agregado `'NCR'`. Nueva extracción `egrNcrUsd`/`egrNcrBs` = `movsMap.get('NCR')?.usd/bs ?? new Decimal(0)` (mismo patrón que las demás variables por origen) y resta explícita en `saldoUsdD`/`saldoBsD` — a diferencia de las otras 3 ediciones (whitelists puras), esta requería la extracción manual porque el hook usa variables nombradas por origen, no un bucket genérico.
- [x] 2.5 REFACTOR — Confirmado: `useSaldoEfectivoBimonetario` (`use-cuadre.ts`) NO se tocó — su lista negra (L916, L934) ya no excluye `'NCR'`, así que cualquier egreso `origen='NCR'` en cualquier sesión ya se restaba de `saldoEsperadoUsd/Bs` antes de este batch. Verificado por lectura de código (sin test nuevo, sin cambios — confirma el diseño §2 de `design.md`).

### TDD Cycle Evidence (Slice 2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1–2.4 | `src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts` | Unit | N/A (archivo nuevo) | ✅ Escrito — 5/5 tests fallan por valor de aserción incorrecto (no por excepción), confirmado por ejecución antes de tocar producción | ✅ 5/5 pasan tras las 4 ediciones de una línea + extracción en `useSaldoSesionCaja` | ✅ Triangulación en `useSaldoSesionCaja`: caso normal (resta parcial) + caso edge (floor en 0 cuando NCR excede apertura) + assertion directa sobre el string SQL del WHERE | ✅ Sin duplicación nueva; edición #4 documentada inline (comentario) explicando por qué difiere del patrón de las otras 3 |

**Nota de diseño de test (mock de `tx.execute`/`useQuery`)**: a diferencia de un mock que devuelve fixtures fijos, el harness de este archivo (`mockCerrarSesionTx`, `setupSaldo`) **filtra las filas del fixture según si el string SQL real contiene el literal `'ORIGEN'`** (p.ej. `sql.includes("'NCR'")`). Esto simula el filtrado real de un `WHERE origen IN (...)` sin motor SQL real — es lo único que hace que el test falle genuinamente en RED (SQL sin `'NCR'` filtra la fila) y pase en GREEN (SQL con `'NCR'` la incluye). Un mock que ignorara el contenido del SQL y devolviera siempre la fila NCR habría dado un falso GREEN incluso contra el código pre-fix, porque el loop JS de `cerrarSesionCaja` categoriza CUALQUIER fila no `INGRESO_MANUAL`/`INGRESO_TESORERIA` como egreso (el filtrado real ocurre 100% en el WHERE SQL, no en JS).

**Elección de fixtures para evitar la rama de consolidación a Tesorería** (steps 8-9 de `cerrarSesionCaja`, fuera de alcance de Slice 2): en el test de `sesiones_caja_detalle`, el método usado tiene `total_pagos: 0` deliberadamente, de modo que `totalSistemaD` (pagos - egreso NCR) sea `≤ 0` tanto pre-fix (0) como post-fix (-50) — nunca `> 0`, por lo que el método nunca entra en `metodosParaConsolidar` y no hace falta mockear `consolidarMetodoATesoreriaEnTx`, config de banco/caja fuerte, ni deducciones. En el test del total del sistema, el método NCR no tiene pagos asociados en absoluto (`metodosUsados: []`), evitando la rama por completo.

### Test Summary (Slice 2)
- **Total tests nuevos**: 5
- **Total tests del archivo**: 5/5
- **Total suite completa**: 1607/1610 (3 fallos preexistentes, no relacionados — mismos PowerSync worker flakes en `cliente-detalle.test.tsx`/`cxc-cliente-detalle.test.tsx` que en Slice 1)
- **Layers usados**: Unit (5)
- **Approval tests**: N/A — extensión aditiva, sin refactor de comportamiento existente
- **Pure functions creadas**: 0 (las 4 ediciones son whitelists de una línea + una extracción/resta que sigue el patrón ya establecido por las demás variables por origen)

### Deviations from Design (Slice 2)
Ninguna — las 4 ediciones coinciden con `design.md` §2/§Data Flow línea por línea. Único detalle no explícito en `design.md`: la elección de `total_pagos: 0` en el fixture de `sesiones_caja_detalle` para mantener el test aislado de la rama de consolidación a Tesorería (fuera de alcance de Slice 2, cubierta por lógica ya existente y no tocada).

### Files Changed (Slice 2)
| File | Action | What Was Done |
|------|--------|----------------|
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modified | 4 ediciones: `'NCR'` agregado a los `IN (...)` de `movsManualUsdResult`, `movsManualBsResult` y `movsManualPorMetodoResult` (dentro de `cerrarSesionCaja`); en `useSaldoSesionCaja`, `'NCR'` agregado al WHERE de `movsData` + nuevas variables `egrNcrUsd`/`egrNcrBs` restadas en `saldoUsdD`/`saldoBsD` |
| `src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts` | Created | 5 tests nuevos (2 `describe`: `cerrarSesionCaja`, `useSaldoSesionCaja`) con harness de mock que simula filtrado real de `WHERE origen IN (...)` inspeccionando el string SQL |

**Nota de bug detectado y corregido durante GREEN**: la primera pasada de la edición 2.4 introdujo una coma sobrante después del backtick de cierre en la rama truthy del ternario de `movsData` (`` `...GROUP BY mmc.origen`, `` en vez de `` `...GROUP BY mmc.origen` ``), rompiendo el parseo de esbuild (`Expected ":" but found ","`). Detectado inmediatamente por el propio test run (no llegó a GREEN falso) y corregido antes de continuar — no afecta el resultado final ni los demás archivos.

## Slice 3 — UI (`refund-tesoreria-form.tsx`) — PENDIENTE

- [ ] 3.1 RED — Mockear `useMetodosPagoActivos`; casos: opción de sesión habilitada, "Cuenta" muestra Efectivo USD/Bs, `onConfirm` recibe `{destino:'SESION_CAJA', ...}`, ausencia de método EFECTIVO oculta la opción.
- [ ] 3.2 GREEN — Importar y llamar `useMetodosPagoActivos`.
- [ ] 3.3 GREEN — Extender `OrigenEgreso`/`LineaFormState`.
- [ ] 3.4 GREEN — Habilitar la opción "Sesión de caja activa" en el select "Origen".
- [ ] 3.5 GREEN — Select "Cuenta": branch Efectivo USD/Bs para origen-sesión.
- [ ] 3.6 GREEN — `lineasUsd`/`handleConfirm`: resolver `esCuentaBs`/`destino`/`sesionCajaId`/`metodoCobroId` desde el discriminador.
- [ ] 3.7 REFACTOR — Confirmar regresión cero en líneas `TESORERIA`.

## Status
10/17 tareas completas (Slice 1 y 2 de 3). Listo para sdd-verify de Slices 1-2 o para continuar con Slice 3 (UI, `refund-tesoreria-form.tsx`) en un batch separado — depende del tipo `EgresoTesoreriaLinea` de Slice 1 (ya disponible en esta rama).
