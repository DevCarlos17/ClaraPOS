# ventas Specification

_Change: venta-saldo-pend-single-write-p0001 | Type: New Capability_

## Purpose

`crearVenta` (`src/features/ventas/hooks/use-ventas.ts`) es el punto atómico único de creación de facturas: una sola `writeTransaction` que inserta venta, pagos, kardex, CxC y asientos contables. Esta capability documenta las invariantes de ORDEN DE ESCRITURA de esa transacción — no el cálculo de negocio (`calcularCierreVentaConSaf`, fuera de scope) — necesarias para que un reintento de batch de PowerSync no dispare el trigger de inmutabilidad `trg_venta_protect`.

## Requirements

### Requirement: Escritura única de `saldo_pend_usd` y `tipo` en el INSERT

`crearVenta` MUST calcular `cierre` (`calcularCierreVentaConSaf`) ANTES del INSERT de `ventas` y MUST escribir `cierre.saldoPendUsd`/`cierre.tipo` directamente en ese INSERT, salvo las dos excepciones de `ABSORBER`/`DIFERENCIAL_FALTANTE` descritas abajo. `crearVenta` MUST NOT emitir un `UPDATE ventas SET saldo_pend_usd=...` ni `SET tipo=...` posterior, en NINGÚN modo (incluyendo `ABSORBER`/`DIFERENCIAL_FALTANTE`). EXCEPCIÓN DE `tipo`: en `ABSORBER`/`DIFERENCIAL_FALTANTE`, el `tipo` escrito MUST ser el original de la venta, no `cierre.tipo`. EXCEPCIÓN DE `saldo_pend_usd`: en `ABSORBER`/`DIFERENCIAL_FALTANTE`, el `saldo_pend_usd` escrito en el INSERT MUST ser `'0.00'` fijo (el negocio absorbe o el diferencial cubre el faltante en su totalidad), no `cierre.saldoPendUsd`.
(Previously: la excepción de `saldo_pend_usd` no existía — estos 2 modos escribían `cierre.saldoPendUsd` en el INSERT y luego un `UPDATE ventas SET saldo_pend_usd='0.00'` posterior forzado, quedando fuera del invariante de escritura única.)

#### Scenario: Un solo write a `ventas` por factura

- GIVEN cualquier creación de factura vía `crearVenta`
- WHEN se ejecuta la `writeTransaction`
- THEN exactamente un INSERT toca `saldo_pend_usd`/`tipo`, cero `UPDATE` posteriores los modifican

#### Scenario: 100% contado

- GIVEN pagos que cubren el 100% del total
- WHEN se calcula `cierre` antes del INSERT
- THEN el INSERT escribe `saldo_pend_usd = 0`

#### Scenario: 100% crédito

- GIVEN venta sin pagos, o pago tendido menor al total sin abono adicional
- WHEN se calcula `cierre`
- THEN el INSERT escribe `saldo_pend_usd = totalUsd`

#### Scenario: Pago mixto

- GIVEN total $1.00 con $0.40 efectivo y $0.60 crédito
- WHEN se calcula `cierre`
- THEN el INSERT escribe `saldo_pend_usd = 0.60`

#### Scenario: Con SAF aplicado

- GIVEN un `safEntry` que reduce el remanente vía saldo a favor
- WHEN se calcula `cierre` con SAF
- THEN el INSERT escribe `saldo_pend_usd = cierre.saldoPendUsd`, ya neto del SAF

#### Scenario: `tipo` excluido en ABSORBER/DIFERENCIAL_FALTANTE

- GIVEN `discrepancy.mode` igual a `ABSORBER` o `DIFERENCIAL_FALTANTE`
- WHEN se calcula `cierre`
- THEN el INSERT escribe el `tipo` original, no `cierre.tipo`

#### Scenario: `saldo_pend_usd` fijo en `ABSORBER`

- GIVEN `discrepancy.mode = 'ABSORBER'` con un faltante mayor al umbral de auto-absorción
- WHEN se ejecuta el INSERT de `ventas`
- THEN `saldo_pend_usd = '0.00'` queda escrito en ese INSERT, sin `UPDATE ventas SET saldo_pend_usd` posterior

#### Scenario: `saldo_pend_usd` fijo en `DIFERENCIAL_FALTANTE`

- GIVEN `discrepancy.mode = 'DIFERENCIAL_FALTANTE'` con un faltante de pequeña denominación
- WHEN se ejecuta el INSERT de `ventas`
- THEN `saldo_pend_usd = '0.00'` queda escrito en ese INSERT, sin `UPDATE ventas SET saldo_pend_usd` posterior

### Requirement: Registro atómico del gasto compensatorio en ABSORBER/DIFERENCIAL_FALTANTE

`crearVenta` MUST NOT capturar (swallow) errores del `INSERT INTO gastos` para los modos `ABSORBER` y `DIFERENCIAL_FALTANTE`. Si ese INSERT falla (p. ej. la cuenta contable `gastos_generales`/`PERDIDA_DIFERENCIAL_CAMBIARIO` no está configurada en `cuentas_config` para la empresa), el error MUST propagarse y provocar el rollback de toda la `writeTransaction`: la venta completa (INSERT de `ventas` incluido) MUST revertirse, sin dejar una factura con `saldo_pend_usd='0.00'` sin su gasto contable de respaldo.

#### Scenario: Gasto `ABSORCION_DIFERENCIAL_POS` insertado atómicamente

- GIVEN una venta con `discrepancy.mode = 'ABSORBER'` y la cuenta contable requerida configurada en `cuentas_config`
- WHEN se ejecuta `crearVenta`
- THEN el INSERT de `ventas` (`saldo_pend_usd='0.00'`) y el INSERT de `gastos` (`ABSORCION_DIFERENCIAL_POS`) se confirman juntos en la misma transacción

#### Scenario: Gasto `DIFERENCIAL_CAMBIARIO_FALTANTE` insertado atómicamente

- GIVEN una venta con `discrepancy.mode = 'DIFERENCIAL_FALTANTE'` y la cuenta contable requerida configurada
- WHEN se ejecuta `crearVenta`
- THEN el INSERT de `ventas` y el INSERT de `gastos` (`DIFERENCIAL_CAMBIARIO_FALTANTE`) se confirman juntos

#### Scenario: Cuenta contable ausente revierte toda la venta

- GIVEN `discrepancy.mode` es `ABSORBER` o `DIFERENCIAL_FALTANTE` y ninguna cuenta contable requerida existe en `cuentas_config` para esa empresa
- WHEN se ejecuta `crearVenta`
- THEN el `INSERT INTO gastos` lanza error, la `writeTransaction` aborta y NINGÚN cambio (incluido el INSERT de `ventas`) queda persistido

### Requirement: Orden de consumo de SAF preservado

Adelantar el CÁLCULO de `cierre` MUST NOT mover la escritura de consumo de SAF (`movimientos_cuenta tipo='SAF'`, invariante de `pos-aplicar-saf-checkout`): ese INSERT MUST seguir DESPUÉS del cálculo de `cierre`, misma transacción, sin estado intermedio SAF-unaware committeado.

#### Scenario: Consumo de SAF sigue el cálculo de cierre

- GIVEN una venta con `safEntry`
- WHEN se ejecuta la `writeTransaction`
- THEN el INSERT de `movimientos_cuenta tipo='SAF'` ocurre después de calcular `cierre`, mismo efecto neto en `clientes.saldo_actual` que antes del fix

### Requirement: Replay de PowerSync no dispara P0001

Como `ventas` se escribe una sola vez con el `saldo_pend_usd` final, un reintento de batch de PowerSync que reenvíe el mismo INSERT MUST NOT disparar `trg_venta_protect` (`P0001`, `migrations/0006_ventas.sql:222-223`): `NEW.saldo_pend_usd` MUST ser idéntico a `OLD.saldo_pend_usd` en cualquier reintento.

#### Scenario: Reintento de pago mixto no dispara P0001

- GIVEN una venta con pago mixto ya aceptada
- WHEN PowerSync reintenta el batch reenviando el mismo INSERT
- THEN `NEW.saldo_pend_usd == OLD.saldo_pend_usd` y el trigger no lanza `P0001`

#### Scenario: Reintento de venta ABSORBER/DIFERENCIAL_FALTANTE no dispara P0001

- GIVEN una venta `ABSORBER` o `DIFERENCIAL_FALTANTE` ya aceptada con `saldo_pend_usd='0.00'` escrito en el INSERT
- WHEN PowerSync reintenta el batch reenviando el mismo INSERT
- THEN `NEW.saldo_pend_usd == OLD.saldo_pend_usd` y el trigger no lanza `P0001` (cierra la exposición residual documentada en `design.md` §Open Questions)

### Requirement: Estado final en DB idéntico por modo y tipo de pago

Para cada combinación de tipo de pago (contado, crédito, mixto) por modo de discrepancia (SAF, VUELTO, ABSORBER, DIFERENCIAL_FALTANTE, CREDITO), el estado final en `ventas`, `pagos`, `movimientos_cuenta`, CxC y contabilidad MUST ser idéntico al de la implementación de doble escritura previa.

#### Scenario: Matriz completa sin regresión

- GIVEN la misma combinación de tipo de pago y modo, antes y después del fix
- WHEN se ejecuta `crearVenta`
- THEN el estado final persistido en todas las tablas afectadas es idéntico

### Requirement: Trigger y connector sin cambios

Esta capability MUST satisfacerse únicamente vía el orden de escritura de `crearVenta`. `trg_venta_protect` (`migrations/0006_ventas.sql`) y el connector (`src/core/db/powersync/connector.ts`) MUST NOT modificarse.

#### Scenario: Cero diff en trigger y connector

- GIVEN el fix aplicado dentro de `crearVenta`
- WHEN se revisa el diff del PR
- THEN `migrations/0006_ventas.sql` y `connector.ts` no muestran cambios
