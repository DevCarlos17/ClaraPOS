# Proposal: Fix doble conteo de `clientes.saldo_pendiente_usd` en reverso de abono (REV)

## Intent

QA confirmo en staging que reversar un abono DUPLICA el incremento de deuda del cliente en vez de restaurarla al valor pre-abono. Casos reales: CLIENTE TEST 2 (factura C01-000024, $50 → abono $2 → deuda $48 → reverso → deuda **$52** en vez de **$50**) y CLIENTE TEST 3 (C01-000022, $50 → abono → $32 → reverso → **$52** en vez de **$50**). El bug afecta **unicamente** `clientes.saldo_pendiente_usd` (deuda agregada del cliente, materializada en `cxc-ledger-saldos-redesign`); `ventas.saldo_pend_usd` (saldo de la factura individual) muestra el valor correcto en ambos casos — confirmado en la exploracion previa.

## Causa raiz (ver exploracion `sdd/cxc-ledger-saldos-redesign/explore-fix-reverso-doble-conteo`, #5550)

El mecanismo es de **orden de escritura**, no de tipo de movimiento. `registrarReversoAbono` (`use-cxc.ts`, rama normal sin SAF-lote, ~L1985-2028) ejecuta `UPDATE clientes SET saldo_pendiente_usd = <valor literal>` **antes** del `INSERT INTO movimientos_cuenta` (tipo REV). El trigger Postgres `actualizar_saldo_cliente()` (migration 0110) hace un incremento RELATIVO (`+= NEW.monto`) disparado por ese INSERT. Como PowerSync sube las operaciones del batch en orden estricto, el UPDATE literal aterriza primero y el trigger suma `monto` OTRA VEZ encima. Es el **unico** sitio de los 15 auditados que hace UPDATE-antes-de-INSERT con un literal; los otros 14 (incl. `reversarPagoSafEnTx`, `aplicarPagoFacturaEnTx`, el import CxC) hacen INSERT-antes-de-UPDATE con un valor que ya coincide con lo que el trigger calcula — idempotente, sin fuga.

`saldo_actual`/`saf_disponible` ya estan protegidos: el connector los stripea del PATCH subido (`TRIGGER_MANAGED_PATCH_COLUMNS.clientes`, `connector.ts:128`), dejando al trigger como unica autoridad server-side. `saldo_pendiente_usd` nunca recibio ese mismo tratamiento — ahi esta el hueco.

## Scope

### In Scope
- Agregar `'saldo_pendiente_usd'` a `TRIGGER_MANAGED_PATCH_COLUMNS.clientes` en `src/core/db/powersync/connector.ts:128` (de `['saldo_actual', 'saf_disponible']` a `['saldo_actual', 'saf_disponible', 'saldo_pendiente_usd']`), con su comentario explicativo.
- Nuevo test `src/core/db/__tests__/connector-saldo-pendiente-patch-strip.test.ts`, espejo exacto de `connector-saf-disponible-patch-strip.test.ts`, verificando que el PATCH subido a Supabase excluye `saldo_pendiente_usd` mientras la escritura local en SQLite lo conserva (UI reactiva intacta).

### Out of Scope
- Cualquier cambio en `use-cxc.ts` (ningun write-site se toca; la escritura local optimista se mantiene igual para los 15 sitios).
- Migraciones SQL — el trigger `actualizar_saldo_cliente()` (0110) ya es correcto; el bug es puramente del connector.
- Tests existentes (`use-cxc.test.ts`, `reversa-pago-saf.test.ts`) — mockean `tx.execute()` local, insensibles al cambio de connector; cero modificacion.
- Inconsistencia detectada en la exploracion entre el import de CxC (`use-importar-cxc.ts`, movimiento SAL) y `ventas.saldo_pend_usd` — **posible issue separado, no se toca aqui**.

## Capabilities

**New**: None. **Modified**: None — fix interno de infraestructura de sync (connector), no cambia ningun requisito de negocio ya especificado en `cxc-ledger-saldos-redesign`. El comportamiento correcto (reverso restaura la deuda exacta pre-abono) ya es el contrato implicito de esa spec; esto solo corrige una implementacion que lo viola.

## Approach

Opcion B (decidida en exploracion, no se reabre): hacer que el trigger Postgres sea la unica autoridad server-side para `saldo_pendiente_usd`, igual que ya es para `saldo_actual`/`saf_disponible`. El PATCH subido al servidor excluye la columna; la escritura local optimista sigue yendo a SQLite para que la UI no muestre un valor stale hasta el proximo sync-down. Precedente directo: migration 0115 (fix SAFV) demostro que un fix solo-del-lado-app (Opcion A) es fragil si el trigger server-side sigue en desacuerdo — aqui se corrige en el unico lugar que importa (el PATCH), sin tocar la logica JS de ningun write-site.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/core/db/powersync/connector.ts:128` | Modified | Agrega `saldo_pendiente_usd` al stripeo de PATCH para `clientes` |
| `src/core/db/__tests__/connector-saldo-pendiente-patch-strip.test.ts` | New | Test espejo de `connector-saf-disponible-patch-strip.test.ts` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Perder informacion en algun write-site que SI dependa del PATCH literal | Resuelto | Exploracion audito los 15 sitios; los 14 restantes hacen INSERT-antes-de-UPDATE con valor ya idempotente — cero perdida (incl. import CxC confirmado explicitamente) |
| Regresion en tests existentes de `use-cxc`/`reversa-pago-saf` | Low | Mockean `tx.execute()` local unicamente, no el connector — insensibles al cambio por diseño |
| Fix insuficiente si aparece un 16vo write-site futuro con el mismo patron UPDATE-antes-de-INSERT | Low | El trigger ahora es la unica autoridad; cualquier futuro write-site con ese orden ya no puede duplicar el conteo, sin importar el orden que elija |

## Rollback Plan

Revertir el commit restaura el array `['saldo_actual', 'saf_disponible']` y elimina el test nuevo. Sin cambios de schema, sin cambios de datos, sin migraciones — reversible de forma trivial y sin efectos colaterales.

## Dependencies

- Depende de `cxc-ledger-saldos-redesign` (ya mergeado) — este es un fix de seguimiento sobre la materializacion de `saldo_pendiente_usd` introducida ahi.
- Depende de migration 0110 (`actualizar_saldo_cliente()`) ya aplicada en produccion/staging — no requiere nueva migracion.

## Testing

`yarn test:run` (Vitest 3.2, TDD estricto activo en este proyecto) — nuevo test en GREEN para el stripeo del PATCH. Validacion manual adicional en staging: reversar el abono exacto de CLIENTE TEST 2 (C01-000024) y CLIENTE TEST 3 (C01-000022) y confirmar que la deuda vuelve a $30 y $50 respectivamente (no $32/$52). El usuario corre migraciones y QA manual en staging; no hay credenciales de Postgres en esta sesion.

## Success Criteria

- [ ] `TRIGGER_MANAGED_PATCH_COLUMNS.clientes` incluye `saldo_pendiente_usd`
- [ ] Nuevo test `connector-saldo-pendiente-patch-strip.test.ts` en GREEN
- [ ] `yarn test:run` completo en GREEN, sin regresiones en `use-cxc.test.ts` ni `reversa-pago-saf.test.ts`
- [ ] QA manual en staging: reverso de abono en CLIENTE TEST 2 y CLIENTE TEST 3 restaura la deuda exacta pre-abono
