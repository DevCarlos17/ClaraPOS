# Delta for Tesorería Reverso Abono Directo

## MODIFIED Requirements

### Requirement: Reverso simple (1 factura, sin SAF)

El sistema MUST reversar, en una única `db.writeTransaction`, un ingreso ligado vía el puente a 1 pago sobre 1 factura sin SAF: crea un egreso bancario (`origen='REVERSO'`, `reverso_de`, `bancos_empresa.saldo_actual` decrementado, ingreso marcado `reversado=1`, `validado=1`, `validado_por`=usuario que confirma el reverso, `validado_at`=ahora) y ejecuta `reversarPagoEnTx` para el pago.
(Previously: el egreso se insertaba con `validado=0`, `validado_por=NULL`, `validado_at=NULL`, cayendo en "Pendientes" con "Conciliar"/"Rechazar" disponibles.)

#### Scenario: Ingreso de $100 que paga 1 factura completa

- GIVEN un ingreso `TRANSFERENCIA_CLIENTE` de $100 ligado a 1 pago sobre la factura F1, sin SAF
- WHEN se reversa desde tesorería
- THEN se crea 1 egreso de $100 (banco baja $100) con `validado=1`, `validado_por` poblado con el usuario que confirma y `validado_at` poblado con la hora del reverso
- AND F1 reabre $100 de `saldo_pend_usd`, el cliente sube `saldo_actual` $100 y `pago.is_reversed=1`

#### Scenario: El egreso-reverso aterriza directo en Histórico como Validado, solo con Desconciliar

- GIVEN el egreso-contraparte recién insertado con `validado=1`, `reversado=0`, `origen='REVERSO'`
- WHEN la tabla de movimientos renderiza esa fila
- THEN la fila aparece en "Histórico" (nunca en "Pendientes", cuya query filtra `validado=0`) con badge "Validado" y ÚNICAMENTE la acción "Desconciliar"
- AND NUNCA muestra "Rechazar" (solo renderiza en Pendientes), "Conciliar" (gate exige `validado=0`) ni "Reversar" (gate exige `origen==='TRANSFERENCIA_CLIENTE'`, y este origen es `'REVERSO'`)

### Requirement: Reverso de abono global (N facturas, sin SAF)

El sistema MUST, para un ingreso ligado a N pagos sobre N facturas sin SAF, reversar las N facturas y marcar los N pagos `is_reversed=1` en la MISMA transacción, creando EXACTAMENTE UN egreso por el monto total con `validado=1`, `validado_por`=usuario que confirma el reverso, `validado_at`=ahora.
(Previously: el egreso único se insertaba con `validado=0`, `validado_por=NULL`, `validado_at=NULL`.)

#### Scenario: Ingreso 38201beb reversa 2 facturas con 1 solo egreso

- GIVEN el ingreso `38201beb` ($2) con 2 pagos de $1 sobre `8954d635` y `ab7d1bab`, sin SAF
- WHEN se reversa desde tesorería
- THEN ambas facturas reabren $1 cada una, ambos pagos quedan `is_reversed=1`, el cliente sube $2
- AND se crea exactamente 1 egreso de $2 con `validado=1`, `validado_por` y `validado_at` poblados (no `NULL`)
