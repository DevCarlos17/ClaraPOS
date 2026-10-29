# Delta for Reverso de Abono Directo desde Tesorería

## MODIFIED Requirements

### Requirement: `FacturaDetalleCxc` enruta por tipo de pago; `reversarPagoEnTx` preserva comportamiento para no-directos

El sistema MUST extraer la lógica interna de `registrarReversoAbono` a un helper `reversarPagoEnTx(tx, params)` que acepta la `tx` del llamador sin abrir su propia `db.writeTransaction`. Para el pago seleccionado en `FacturaDetalleCxc`, el sistema MUST resolver primero si el pago es DIRECTO (fila en `movimientos_bancarios_pagos`): si lo es, MUST enrutar a `reversarAbonoDirectoDesdeTesoreria` (con egreso bancario); si NO lo es, MUST seguir llamando `registrarReversoAbono` sin cambios en su comportamiento.

(Previously: la lógica se extraía solo para preservar `registrarReversoAbono` como único camino; el requisito asumía que `FacturaDetalleCxc` SIEMPRE llama `registrarReversoAbono` sin importar el tipo de pago. Esto dejaba `bancos_empresa.saldo_actual` inflado en pagos directos, por no crear nunca el egreso contraparte — bug ya en producción que este cambio corrige.)

#### Scenario: Reverso standalone de un pago NO-directo desde CxC sin cambios observables

- GIVEN un pago sin fila en el puente, con `venta_id` no-NULL y sin cadena SAF
- WHEN se invoca `registrarReversoAbono` desde `FacturaDetalleCxc`
- THEN la factura reabre `saldo_pend_usd`, el cliente actualiza `saldo_actual`, se inserta un movimiento `REV`, `pagos.is_reversed=1` — idéntico al comportamiento previo a este cambio

#### Scenario: `reversarPagoEnTx` nunca anida transacciones

- GIVEN un llamador con una `tx` ya abierta
- WHEN invoca `reversarPagoEnTx(tx, params)`
- THEN no se abre ninguna `db.writeTransaction` adicional

#### Scenario: `FacturaDetalleCxc` enruta un pago DIRECTO al orquestador de tesorería

- GIVEN un pago con fila en el puente (`movimientos_bancarios_pagos`), sin cadena SAF
- WHEN el usuario confirma "Reversar" en `FacturaDetalleCxc`
- THEN el sistema resuelve `ingreso_id` y llama `reversarAbonoDirectoDesdeTesoreria` en vez de `registrarReversoAbono`
- AND se crea el egreso bancario y `bancos_empresa.saldo_actual` decrementa por el monto reversado

#### Scenario: Corrección del bug de saldo bancario inflado en pagos directos

- GIVEN el comportamiento previo a este cambio (siempre `registrarReversoAbono`, sin egreso en pagos directos)
- WHEN se reversa un pago directo con el nuevo enrutamiento desde `FacturaDetalleCxc`
- THEN `bancos_empresa.saldo_actual` queda igual que si el mismo reverso se hubiera hecho desde `ReversoModal`, sin inflación residual
