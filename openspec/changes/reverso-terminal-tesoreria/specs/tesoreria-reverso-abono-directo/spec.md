# Delta for tesoreria-reverso-abono-directo

## MODIFIED Requirements

### Requirement: Reverso simple (1 factura, sin SAF)

El sistema MUST reversar, en una única `db.writeTransaction`, un ingreso ligado vía el puente a 1 pago sobre 1 factura sin SAF: crea un egreso bancario (`origen='REVERSO'`, `reverso_de`, `bancos_empresa.saldo_actual` decrementado, ingreso marcado `reversado=1`, `validado=1`, `validado_por`=usuario que confirma el reverso, `validado_at`=ahora) y ejecuta `reversarPagoEnTx` para el pago. El egreso-contraparte aterriza en Histórico como TERMINAL: sin "Desconciliar", sin "Rechazar", sin "Reversar", sin "Conciliar" — no existe "reverso del reverso".

(Previously: el egreso-contraparte aterrizaba en Histórico mostrando ÚNICAMENTE "Desconciliar". Este cambio REVIERTE explícitamente esa decisión — ver `tesoreria-historico-desconciliar` MODIFIED en este mismo change — porque permitía un ciclo Desconciliar→Pendientes→Rechazar que reabría un reverso ya validado, confuso y no deseado por el owner.)

#### Scenario: Ingreso de $100 que paga 1 factura completa

- GIVEN un ingreso `TRANSFERENCIA_CLIENTE` de $100 ligado a 1 pago sobre la factura F1, sin SAF
- WHEN se reversa desde tesorería
- THEN se crea 1 egreso de $100 (banco baja $100) con `validado=1`, `validado_por` poblado con el usuario que confirma y `validado_at` poblado con la hora del reverso
- AND F1 reabre $100 de `saldo_pend_usd`, el cliente sube `saldo_actual` $100 y `pago.is_reversed=1`

#### Scenario: El egreso-reverso aterriza directo en Histórico como Validado y terminal, sin ninguna acción

- GIVEN el egreso-contraparte recién insertado con `validado=1`, `reversado=0`, `origen='REVERSO'`
- WHEN la tabla de movimientos renderiza esa fila
- THEN la fila aparece en "Histórico" (nunca en "Pendientes", cuya query filtra `validado=0`) con badge "Validado" y NINGUNA acción en la columna Acciones
- AND NUNCA muestra "Desconciliar" (gate excluye `origen==='REVERSO'`), "Rechazar" (solo renderiza en Pendientes), "Conciliar" (gate exige `validado=0`) ni "Reversar" (gate exige `origen==='TRANSFERENCIA_CLIENTE'`, y este origen es `'REVERSO'`)

#### Scenario: Defensa en profundidad — fila huérfana de reverso en Pendientes nunca muestra "Rechazar"

- GIVEN una fila con `origen='REVERSO'` y `validado=0` (huérfana: desconciliada durante la ventana 2026-10-23..29 antes de este fix, o cualquier estado futuro inesperado)
- WHEN la fila se renderiza en Pendientes
- THEN NO se muestra "Rechazar" — el gate excluye `origen==='REVERSO'` sin importar el estado `validado`, cerrando cualquier vía de "reverso del reverso"

#### Scenario: REGRESSION GUARD — reverso del mecanismo viejo sigue mostrando "Conciliar"

- GIVEN una fila con `origen='REVERSO'`, `validado=0`, `reverso_de` apuntando a un movimiento padre `GASTO`, `PAGO_PROVEEDOR`, `MANUAL` o `TRASPASO` (mecanismo `reversarMovBancario`, pre-existente y no relacionado a `reversarAbonoDirectoDesdeTesoreria`)
- WHEN la fila se renderiza en Pendientes
- THEN SÍ se muestra "Conciliar" — este gate permanece origin-agnostic y sin cambios; el mecanismo viejo sigue necesitando la confirmación manual de banco
