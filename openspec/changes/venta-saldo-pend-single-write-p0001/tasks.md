# Tasks: Escritura única de `ventas.saldo_pend_usd` en `crearVenta`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250-300 (Fases 1-3) + 100-140 (Fase 4, discrepancia) ≈ 350-440 total (110-140 en `use-ventas.ts`, 200-260 en el test) |
| Suggested split | PR único si el diff real queda ≤400; si no, Work Unit 2 sale como PR de seguimiento |
| Delivery strategy | single-pr-default |

Decision needed before apply: Yes (confirmar diff real de Fase 4 antes de mergear Unit 1+2 juntos)
Chained PRs recommended: Condicional — solo si el diff medido supera 400
Chain strategy: si se encadena, Unit 1 (Fases 1-3) primero, Unit 2 (Fase 4) como PR hijo sobre la misma rama
400-line budget risk: Medium (el rango estimado cruza el umbral de 400; la Fase 4 reduce su propio diff usando la técnica `try {` → `{` en la tarea 4.10 para evitar re-indentado masivo)

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Hoist + escritura única en `crearVenta` (Fases 1-3) | Un solo archivo de producción + su test, cero diff en migrations/connector |
| 2 | Saldo fijo + gasto atómico en ABSORBER/DIFERENCIAL_FALTANTE (Fase 4) | Mismos 2 archivos de Unit 1 (bloques distintos: `case 'ABSORBER'`/`case 'DIFERENCIAL_FALTANTE'`), cero diff en migrations/connector. Medir diff real de Unit 1 antes de decidir si Unit 2 va en el mismo PR o como PR hijo |

## Phase 1: Baseline + tests RED para invariante de escritura única

- [ ] 1.1 Baseline: `yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts` en GREEN antes de tocar código (characterization).
- [ ] 1.2 RED — 100% contado: nuevo test en `use-ventas.test.ts`; assert `INSERT INTO ventas` con `saldo_pend_usd='0.00...'`/`tipo` finales, `UPDATE ventas SET saldo_pend_usd`/`SET tipo` con longitud 0.
- [ ] 1.3 RED — 100% crédito: mismo patrón, `saldo_pend_usd = totalUsd` en el INSERT, cero UPDATE.
- [ ] 1.4 RED — mixto ($1.00: $0.40 efectivo/$0.60 crédito): INSERT con `saldo_pend_usd='0.60000000'`, cero UPDATE.
- [ ] 1.5 RED — SAF aplicado: extender test L456-499 (Paso B); `ventaSaldoUpdates` (L497) de `toHaveLength(1)` a `0`; assert INSERT ya lleva `saldo_pend_usd` neto de SAF.
- [ ] 1.6 RED — exclusión de `tipo` en ABSORBER/DIFERENCIAL_FALTANTE: extender tests L503/L541; assert INSERT con `tipo='CONTADO'` (original, no `cierre.tipo`), no solo `tipoUpdates.toHaveLength(0)`.
- [ ] 1.7 RED — idempotencia de replay: nuevo test, caso mixto; capturar `saldo_pend_usd` del INSERT y confirmar que es el valor final esperado (reintento simulado ⇒ `NEW == OLD`).
- [ ] 1.8 Verify: `yarn test:run` — los tests 1.2-1.7 fallan contra el código actual (INSERT con `totalUsd` provisional + UPDATE posterior).

## Phase 2: GREEN — hoist + escritura única en `use-ventas.ts`

- [ ] 2.1 Mover `abonado_BsNativo`/`abonado_UsdNativo` (L883-884), `creditoDisponibleUsd` (L886-899) y `calcularCierreVentaConSaf` (L902-910) a después de `totalBs` (L429), antes de `nro_factura` (L431). Derivar `tipoFinal = (mode==='ABSORBER'||mode==='DIFERENCIAL_FALTANTE') ? tipo : cierre.tipo`.
- [ ] 2.2 En el INSERT (L483-508): reemplazar param `saldo_pend_usd` (`toStorageString(totalUsd)`, L500) por `toStorageString(cierre.saldoPendUsd)`; param `tipo` (L501) por `tipoFinal`.
- [ ] 2.3 En ~L873+: eliminar la llamada duplicada a `calcularCierreVentaConSaf` y sus dependencias hoisteadas; dejar solo `saldoPend`/`safAplicadoUsd`/`safAplicadoUsdResult`/`safFueCapeadoResult` referenciando el `cierre` ya calculado.
- [ ] 2.4 Eliminar `UPDATE ventas SET saldo_pend_usd` (L916-919) y el `UPDATE ventas SET tipo` condicional (L928-934) del camino normal. No tocar `ABSORBER`/`DIFERENCIAL_FALTANTE` (L1163-1248).
- [ ] 2.5 Verify: `git diff migrations/0006_ventas.sql src/core/db/powersync/connector.ts` sin salida (cero cambios, invariante #4).

## Phase 3: GREEN + regresión completa

- [ ] 3.1 `yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts` — tests 1.2-1.7 en GREEN.
- [ ] 3.2 Confirmar sin modificar: `saldoUpdates.at(-1)!.params[0]` del test ABSORBER (L531-532) sigue en `'0.00'` — ahora es la única actualización de saldo (la forzada de L1167).
- [ ] 3.3 Confirmar orden SAF: en el test de Paso B (L456-499), el índice del `INSERT INTO movimientos_cuenta` `'SAF'`/`'SAFC'` en `calls` sigue posterior al índice del `INSERT INTO ventas` (invariante `pos-aplicar-saf-checkout`).
- [ ] 3.4 Regresión total: `yarn test:run`, `yarn type-check`, `yarn type-check:test` — todo en GREEN, cero fallas nuevas.

## Phase 4: Saldo fijo y gasto atómico en ABSORBER/DIFERENCIAL_FALTANTE

- [ ] 4.1 Baseline: `yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts` en GREEN con las Fases 1-3 ya aplicadas (characterization antes de esta fase).
- [ ] 4.2 Fixture: extender `VentaTxFixtures` (test) con `cuentasConfig?: { gastos_generales?: string; PERDIDA_DIFERENCIAL_CAMBIARIO?: string }` (id de cuenta contable por clave); extender `mockCrearVentaTx` para responder a `SELECT cuenta_contable_id FROM cuentas_config WHERE ... clave = 'gastos_generales'` y `... clave = 'PERDIDA_DIFERENCIAL_CAMBIARIO'` con esos valores (fila vacía si la clave no está en el fixture, replicando el catch-all actual).
- [ ] 4.3 RED — actualizar los 2 tests existentes de "Defensa en profundidad" (L523 ABSORBER, L567 DIFERENCIAL_FALTANTE): agregar `cuentasConfig: { gastos_generales: 'cuenta-1' }` (o `PERDIDA_DIFERENCIAL_CAMBIARIO` según el modo) al fixture; reemplazar el assert `saldoUpdates.at(-1)!.params[0]` (deja de existir: ya no hay `UPDATE ventas SET saldo_pend_usd` en estos modos) por `saldoUpdates` con `toHaveLength(0)` + `ventaInsert!.params[14]` (índice `saldo_pend_usd`) igual a `'0.00'`.
- [ ] 4.4 RED — ABSORBER, gasto insertado atómicamente: nuevo test con `cuentasConfig` seedeado; assert `INSERT INTO ventas` con `saldo_pend_usd='0.00'` (índice 14), cero `UPDATE ventas SET saldo_pend_usd`, y `INSERT INTO gastos` presente con `descripcion='ABSORCION_DIFERENCIAL_POS'`.
- [ ] 4.5 RED — DIFERENCIAL_FALTANTE, gasto insertado atómicamente: mismo patrón; `INSERT INTO gastos` presente con `descripcion='DIFERENCIAL_CAMBIARIO_FALTANTE'`.
- [ ] 4.6 RED — rollback por cuenta ausente: nuevo test por modo (ABSORBER y DIFERENCIAL_FALTANTE), SIN `cuentasConfig` en el fixture; `await expect(crearVenta(...)).rejects.toThrow()`. Nota: la atomicidad real (que `ventas` nunca queda persistida) la garantiza `db.writeTransaction` sobre SQLite real — el test unitario contra el mock solo prueba que el callback rechaza/relanza el error, que es la señal de que `writeTransaction` aborta.
- [ ] 4.7 Verify: `yarn test:run` — los tests 4.3-4.6 fallan contra el código actual (INSERT con `cierre.saldoPendUsd` + `UPDATE ... SET saldo_pend_usd = '0.00'` forzado, `try/catch` que traga el error de `gastos`).
- [ ] 4.8 GREEN — derivar `saldoPendFinal` junto a `tipoFinal` (~L474-477 actual): `const saldoPendFinal = (discrepancy?.mode === 'ABSORBER' || discrepancy?.mode === 'DIFERENCIAL_FALTANTE') ? new Decimal(0) : cierre.saldoPendUsd`. Usar `toStorageString(saldoPendFinal)` en el param `saldo_pend_usd` del INSERT (reemplaza `toStorageString(cierre.saldoPendUsd)`).
- [ ] 4.9 GREEN — eliminar el `UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?` forzado en el caso `ABSORBER` (~L1167-1170 actual) y en `DIFERENCIAL_FALTANTE` (~L1246-1249 actual), junto con sus comentarios.
- [ ] 4.10 GREEN — en ambos casos, reemplazar `try {` por `{` (bloque plano, sin `try`) y eliminar el `catch { console.warn(...) }` dejando solo el `}` de cierre. Preserva la indentación interna intacta (diff mínimo, evita re-indentar ~60 líneas por bloque); ahora un error en cualquier `tx.execute` dentro del bloque (incluido el `INSERT INTO gastos`) se propaga y aborta la `writeTransaction`.
- [ ] 4.11 Verify: `yarn test:run` — 4.3-4.6 en GREEN.
- [ ] 4.12 Regresión total: `yarn test:run`, `yarn type-check`, `yarn type-check:test` — todo en GREEN, cero fallas nuevas (Fases 1-3 siguen en GREEN).
- [ ] 4.13 `git diff migrations/0006_ventas.sql src/core/db/powersync/connector.ts` sin salida (invariante #4 sigue sin tocar, aplica también a esta fase).
- [ ] 4.14 Medir diff real (`git diff --stat` en `use-ventas.ts` + su test para Fases 1-4 combinadas) y confirmar contra el forecast de 350-440 líneas; si supera 400, aplicar Work Unit 2 como PR hijo separado (ver Review Workload Forecast).
