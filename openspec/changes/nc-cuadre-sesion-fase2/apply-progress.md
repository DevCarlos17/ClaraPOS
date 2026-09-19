# Apply Progress: NC en Cuadre — Fase 2 (egreso real de NC admin a sesión activa)

**Mode**: Strict TDD
**Batch**: 1 (primera pasada — sin progreso previo)

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

## Slice 2 — Unificación de cuadre (`use-sesiones-caja.ts`) — PENDIENTE

- [ ] 2.1 RED — Crear `use-sesiones-caja.test.ts` (no existe hoy).
- [ ] 2.2 GREEN — `movsManualUsdResult`/`movsManualBsResult`: agregar `'NCR'` al `IN (...)`.
- [ ] 2.3 GREEN — `movsManualPorMetodoResult`: agregar `'NCR'` al `IN (...)`.
- [ ] 2.4 GREEN — `useSaldoSesionCaja`: agregar `'NCR'` al WHERE + extraer y restar `movsMap.get('NCR')`.
- [ ] 2.5 REFACTOR — Confirmar convergencia con `useSaldoEfectivoBimonetario` (sin cambios) en el fixture cross-sesión.

## Slice 3 — UI (`refund-tesoreria-form.tsx`) — PENDIENTE

- [ ] 3.1 RED — Mockear `useMetodosPagoActivos`; casos: opción de sesión habilitada, "Cuenta" muestra Efectivo USD/Bs, `onConfirm` recibe `{destino:'SESION_CAJA', ...}`, ausencia de método EFECTIVO oculta la opción.
- [ ] 3.2 GREEN — Importar y llamar `useMetodosPagoActivos`.
- [ ] 3.3 GREEN — Extender `OrigenEgreso`/`LineaFormState`.
- [ ] 3.4 GREEN — Habilitar la opción "Sesión de caja activa" en el select "Origen".
- [ ] 3.5 GREEN — Select "Cuenta": branch Efectivo USD/Bs para origen-sesión.
- [ ] 3.6 GREEN — `lineasUsd`/`handleConfirm`: resolver `esCuentaBs`/`destino`/`sesionCajaId`/`metodoCobroId` desde el discriminador.
- [ ] 3.7 REFACTOR — Confirmar regresión cero en líneas `TESORERIA`.

## Status
5/17 tareas completas (Slice 1 de 3). Listo para sdd-verify de Slice 1 o para continuar con Slice 2 en un batch separado (Slice 2 es independiente de Slice 1 — puede ir en paralelo).
