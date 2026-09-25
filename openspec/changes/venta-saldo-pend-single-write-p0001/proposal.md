# Proposal: Escritura unica de `ventas.saldo_pend_usd` en `crearVenta` (fix P0001 en pago mixto)

## Intent

`crearVenta` (`src/features/ventas/hooks/use-ventas.ts`) escribe `ventas.saldo_pend_usd` DOS veces en la misma `writeTransaction`: INSERT (L482-508) con `totalUsd` provisional, UPDATE posterior (L916) con el valor real (`cierre.saldoPendUsd`). PowerSync genera una entrada CRUD por sentencia (PUT + PATCH), sin fusionarlas. Si CUALQUIER op posterior del batch (CxC, `clientes.saldo_actual`, `movimientos_bancarios`, `generarAsientosVenta`) falla de forma transitoria, el connector reintenta el batch COMPLETO desde la op #1, reenviando el PUT original con `saldo_pend_usd` stale. El trigger `trg_venta_protect` (`migrations/0006_ventas.sql:195-230`) ve `NEW.saldo_pend_usd > OLD.saldo_pend_usd` y lanza `P0001`, que esta en `FATAL_RESPONSE_CODES` → el connector descarta el batch entero, con perdida silenciosa de CxC, saldo de cliente y asientos contables ya pendientes de subir.

Solo el pago MIXTO reproduce el bug de forma confiable: 100%-credito tiene INSERT==UPDATE (no dispara el trigger); 100%-contado salta el bloque CxC (menos superficie). Mixto ejecuta INSERT≠UPDATE mas CxC+bancos+contabilidad completos. Misma familia que el fix de cierre de caja (`1d179cb`) y el doble-reverso de pagos (migracion `0096`): batch no-atomico + trigger de inmutabilidad + replay = perdida silenciosa.

## Scope

**In Scope**: escribir `ventas.saldo_pend_usd` y `tipo` UNA sola vez, en el INSERT, adelantando el calculo de `cierre` (`calcularCierreVentaConSaf`, L902-914) antes del INSERT; eliminar el UPDATE de saldo (L916) y el UPDATE condicional de `tipo` (L933) del camino normal.

**Out of Scope**: trigger `trg_venta_protect` y connector de PowerSync (sin cambios); UPDATE de `contabilidad_ok` (L1682, campo distinto, no gatilla el trigger); `calcularCierreVentaConSaf` o la logica de SAF en si misma.

## Capabilities

**New**: None. **Modified**: None — fix de implementacion interna (orden de escritura). El estado final en `ventas`/`movimientos_cuenta`/`clientes`/contabilidad no cambia para ningun escenario; solo deja de fallar en el replay de PowerSync.

## Approach

El bloque `cierre` (L873-934) ya es independiente del INSERT: `abonado_BsNativo`/`abonado_UsdNativo` (L883-884) derivan del parametro `pagos`; `creditoDisponibleUsd` (L886-899) lee `movimientos_cuenta` del CLIENTE, no de la venta recien creada. Por eso `cierre` puede calcularse antes del INSERT, que pasa a escribir `cierre.saldoPendUsd`/`cierre.tipo` directamente en vez de `totalUsd`/`tipo`.

**Restriccion critica (la trampa)**: el orden actual (INSERT → pagos → cierre → UPDATE) fue establecido DELIBERADAMENTE por `pos-aplicar-saf-checkout` (comentario L873-882) para que el consumo de SAF se escriba DESPUES de calcular el cierre SAF-aware, sin estado intermedio SAF-unaware committeado. Adelantar el CALCULO de `cierre` no debe mover el consumo de SAF (L983+): este sigue yendo despues del calculo, solo que el calculo ahora ocurre antes del INSERT.

**Superficie de regresion** (debe quedar identica): 100% contado/credito/mixto; aplicacion y consumo de SAF; los 4 modos de discrepancia (SAF, VUELTO, ABSORBER, DIFERENCIAL_FALTANTE, CREDITO); correccion de `tipo` (L928-934, excluye ABSORBER/DIFERENCIAL_FALTANTE); INSERT de `pagos`, `movimientos_metodo_cobro`, kardex, CxC, contabilidad.

## Invariantes duras

1. `ventas` se escribe UNA sola vez (el INSERT) — sin UPDATE posterior de `saldo_pend_usd` ni `tipo` en el camino normal. Elimina la exposicion al replay P0001.
2. Mismo estado final en DB que hoy para cada escenario de pago.
3. Orden de consumo de SAF (invariante `pos-aplicar-saf-checkout`) preservado.
4. Trigger y connector NO se modifican — el fix es solo el orden de escritura en `crearVenta`.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/hooks/use-ventas.ts` | Modified | Adelantar `cierre` antes del INSERT; INSERT usa `cierre.saldoPendUsd`/`tipo`; eliminar UPDATE L916 y L933 |
| Tests de `crearVenta` (pagos x SAF x discrepancia) | Modified/New | TDD cubriendo estado final identico en toda la matriz |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Re-romper el orden de consumo de SAF | Medium | TDD cubriendo SAF aplicado/capeado en los 3 tipos de pago antes de tocar el orden |
| Efecto no detectado en ABSORBER/DIFERENCIAL_FALTANTE | Low-Medium | Test explicito por modo vs. comportamiento actual |
| Regresion en contabilidad/CxC al reordenar | Low | Solo se mueve el CALCULO puro; los INSERT/UPDATE de CxC/contabilidad quedan en su posicion |

## Rollback Plan

Revertir el commit/PR restaura el doble-write actual. Sin cambios de schema ni de datos — reversible sin efectos colaterales.

## Dependencies

Depende del invariante de orden de `pos-aplicar-saf-checkout` (ya mergeado) — debe permanecer compatible con su `design.md` (Decision 1/2/3).

## Success Criteria

- [ ] `ventas` se escribe una sola vez por `crearVenta`
- [ ] Pago mixto con reintento simulado ya NO dispara `P0001`
- [ ] Estado final identico en 3 tipos de pago x SAF x 4 modos de discrepancia
- [ ] Orden de consumo de SAF preservado (test del invariante `pos-aplicar-saf-checkout`)
- [ ] `yarn test:run` de `src/features/ventas` en GREEN, con cobertura nueva
