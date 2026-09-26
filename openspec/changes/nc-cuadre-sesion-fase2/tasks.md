# Tasks: NC en Cuadre — Fase 2 (egreso real de NC admin a sesión activa)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~260-380 (PR1 ~110-150, PR2 ~50-70, PR3 ~110-160) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (motor) → PR 2 (cuadre) → PR 3 (UI) |
| Delivery strategy | ask-always |
| Chain strategy | pending (orchestrator/user decide) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

Recomendación: **feature-branch-chain** — PR2/PR3 dependen del tipo `EgresoTesoreriaLinea` nuevo de PR1; un revert único del tracker deshace toda la Fase 2. Decisión final la toma el orquestador/usuario.

### Suggested Work Units

| Unit | Goal | PR | Base |
|------|------|----|----|
| 1 | Motor: union `EgresoTesoreriaLinea`, `escribirEgresoSesionCajaEnTx`, guard, dispatcher | PR 1 | tracker/`develop` |
| 2 | Cuadre: 4 ediciones en `use-sesiones-caja.ts` + tests | PR 2 | PR 1 branch (o paralelo) |
| 3 | UI: habilitar selector en `refund-tesoreria-form.tsx` | PR 3 | PR 1 branch |

---

## Slice 1 — Motor (`use-notas-credito.ts`)

Inicio: tracker. Fin: `escribirEgresoSesionCajaEnTx` tipado + testeado, sin caller aún (código muerto seguro). Verificación: `yarn test:run src/features/ventas/hooks/__tests__/use-notas-credito.test.ts`. Rollback: revert del commit, cero impacto (sin caller).

- [x] 1.1 RED — En `use-notas-credito.test.ts`: agregar fixture `sesionesCaja?: Record<string,{status,empresa_id}>` a `NcrTxFixtures` + rama en `mockCrearNcrTx` para `SELECT status FROM sesiones_caja WHERE id = ? AND empresa_id = ?`. Nuevo `describe` con 4 tests: INSERT en `movimientos_metodo_cobro` (`origen='NCR'`, `sesion_caja_id`=el de la línea, no `venta.sesion_caja_id`); guard lanza si sesión no existe; guard lanza si `status!=='ABIERTA'`; escribe igual cross-session (venta sesión A, línea a sesión B).
- [x] 1.2 GREEN — Reemplazar `EgresoTesoreriaLinea` (L121-135) por unión discriminada (`design.md` §Interfaces): `{destino:'BANCO'|'CAJA_FUERTE',...}` | `{destino:'SESION_CAJA', sesionCajaId, metodoCobroId, moneda:'USD'|'BS', montoEnMonedaCuenta, referencia?}`.
- [x] 1.3 GREEN — Agregar `escribirEgresoSesionCajaEnTx(tx, linea, ncrId, nroNcr, empresa_id, usuario_id, now)` tras L335: guard `SELECT status ...` (throw si falta o no ABIERTA) → `INSERT INTO movimientos_metodo_cobro` (`EGRESO`,`NCR`, `saldo_anterior=0`,`saldo_nuevo=0`, `metodo_cobro_id=linea.metodoCobroId`, `sesion_caja_id=linea.sesionCajaId`) — mismo patrón que Regla de Oro L1091-1109.
- [x] 1.4 GREEN — En branch `REFUND_TESORERIA` (L1230-1272): loop de tope (L1256-1259) → dispatcher `esCuentaBs = linea.destino==='SESION_CAJA' ? linea.moneda==='BS' : (await leerCuentaTesoreriaEnTx(...)).esCuentaBs`; loop de escritura (L1270-1272) → despachar a `escribirEgresoSesionCajaEnTx` cuando `destino==='SESION_CAJA'`.
- [x] 1.5 REFACTOR — `yarn test:run` completo en verde; sin duplicación entre los dos dispatchers.

## Slice 2 — Unificación de cuadre (`use-sesiones-caja.ts`)

Inicio: independiente de Slice 1. Fin: las 3 estrategias tratan `origen='NCR'` cross-sesión igual. Verificación: `yarn test:run src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts`. Rollback: revert; sin efecto visible hasta Slice 3.

- [x] 2.1 RED — Crear `use-sesiones-caja.test.ts` (no existe): fixture `movimientos_metodo_cobro` `origen='NCR'` en sesión destino (pago original en OTRA sesión). Tests que fallan: `cerrarSesionCaja` resta el NCR del total (`montoSistemaUsdFromDB`); `sesiones_caja_detalle` refleja el mismo monto; `useSaldoSesionCaja` resta el NCR de `saldoUsdD`/`saldoBsD`.
- [x] 2.2 GREEN — L749-750 y L777-778 (`movsManualUsdResult`/`movsManualBsResult`): agregar `'NCR'` a `IN (...)`. El `else` genérico (L764) ya acumula como egreso.
- [x] 2.3 GREEN — L855-856 (`movsManualPorMetodoResult`): agregar `'NCR'` a `IN (...)`.
- [x] 2.4 GREEN — `useSaldoSesionCaja` L232-233: agregar `'NCR'` al WHERE; extraer `movsMap.get('NCR')` (patrón L259-264) y restarlo en `saldoUsdD`/`saldoBsD` (L271-293).
- [x] 2.5 REFACTOR — Confirmar con el test existente de `useSaldoEfectivoBimonetario` (`use-cuadre.ts`, sin cambios) que las 3 estrategias convergen en el fixture cross-sesión.

## Slice 3 — UI (`refund-tesoreria-form.tsx`)

Inicio: depende del tipo de Slice 1. Fin: opción "Sesión de caja activa" habilitada, emite líneas `SESION_CAJA` válidas. Verificación: `yarn test:run src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx`. Rollback: volver a `disabled` (1 línea), sin tocar el motor.

- [x] 3.1 RED — Mockear `useMetodosPagoActivos` en el test; agregar casos que fallan hoy: opción de sesión ya no `disabled`; al elegirla, "Cuenta" muestra "Efectivo USD"/"Efectivo Bs" solo para métodos EFECTIVO activos; `onConfirm` recibe `{destino:'SESION_CAJA', sesionCajaId, metodoCobroId, moneda, montoEnMonedaCuenta, referencia?}`; sin método EFECTIVO en una moneda, esa opción no renderiza.
- [x] 3.2 GREEN — Importar y llamar `useMetodosPagoActivos` junto a L106-107.
- [x] 3.3 GREEN — Extender `OrigenEgreso` (L43) y `LineaFormState` (L45-52) para portar sesión elegida + `moneda?:'USD'|'BS'`.
- [x] 3.4 GREEN — Select "Origen" (L213-219): quitar `disabled`/"(Proximamente)" de las opciones de sesión.
- [x] 3.5 GREEN — Select "Cuenta" (L227-244): branch para origen-sesión con opciones "Efectivo USD"/"Efectivo Bs" desde `metodos.filter(tipo==='EFECTIVO')`; `value`=`metodoCobroId`. Reemplaza el `TODO` L240-242.
- [x] 3.6 GREEN — `lineasUsd` (L133-138) y `handleConfirm` (L149-162): resolver `esCuentaBs`/`destino`/`sesionCajaId`/`metodoCobroId` desde el nuevo discriminador (moneda desde selección, no desde `cuentaPorId`).
- [x] 3.7 REFACTOR — Confirmar que las líneas `TESORERIA` producen el mismo payload de siempre (regresión).

---

## Fuera de alcance (no bloqueante)

- Deuda de spec: `openspec/specs/caja/spec.md` (base, no archivada) aún no incluye "Devoluciones (NC)" de Fase 1 — seguimiento, no tarea de este change.
- Guard de saldo suficiente en sesión destino: fuera de alcance (Open Question de `design.md`), paridad con Regla de Oro POS.
