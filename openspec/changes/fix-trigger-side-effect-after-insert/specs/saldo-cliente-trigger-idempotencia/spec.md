# Saldo de Cliente — Idempotencia del Trigger ante Reenvío de Sync Specification

## Purpose

`actualizar_saldo_cliente()` (trigger `BEFORE INSERT` sobre
`movimientos_cuenta`, lineage `migrations/0119`/`0120`) mezcla el cálculo de
auditoría de `NEW.saldo_nuevo` con un efecto secundario
`UPDATE clientes SET saldo_actual, saldo_pendiente_usd, saf_disponible...`
en el mismo `BEFORE`. CONFIRMADO EN VIVO (obs #6079): PowerSync reenvía la
misma fila `movimientos_cuenta` (mismo `id`) en transacciones Postgres
separadas tras un retry de upload; `ON CONFLICT(id) DO NOTHING` descarta la
fila duplicada en el ledger, pero Postgres dispara el trigger `BEFORE` para
CADA reenvío antes de evaluar el conflicto — el `UPDATE clientes` se
re-aplica N veces (N fires = saldo inflado $N). Esta spec define la
garantía de idempotencia que el trigger debe cumplir, sin cambiar ninguna
fórmula de saldo existente.

## Requirements

### Requirement: Idempotencia del saldo ante reenvío de la misma fila

El sistema MUST aplicar el efecto de un `movimientos_cuenta.id` sobre
`clientes.saldo_actual`, `saldo_pendiente_usd` y `saf_disponible`
EXACTAMENTE UNA VEZ, sin importar cuántas veces PowerSync reenvíe el mismo
INSERT en transacciones Postgres separadas.

#### Scenario: Reenvío de una factura a crédito no duplica el saldo

- GIVEN una fila `movimientos_cuenta` tipo `FAC` de $1 a crédito, cuyo `id`
  es reenviado 3 veces en transacciones Postgres distintas (repro
  confirmado: txid 6231, 6232, 6242)
- WHEN las 3 transacciones se procesan contra la base de datos
- THEN `clientes.saldo_pendiente_usd` queda en $1 (no $3)
- AND `movimientos_cuenta` conserva una sola fila con ese `id`

#### Scenario: Reverso de un abono que afecta 2 facturas no duplica el saldo

- GIVEN un reverso de abono directo desde tesorería que inserta 2 filas
  `REV` (una por factura) dentro de una sola transacción, y esa transacción
  completa es reenviada por PowerSync tras un retry
- WHEN la transacción reenviada se procesa
- THEN el `saldo_actual` del cliente sube exactamente el monto de las 2
  facturas reabiertas (no el doble)

### Requirement: Comportamiento idéntico para INSERT único (sin regresión)

El sistema MUST producir, para un INSERT único (no reenviado) de cada tipo
de movimiento (`FAC`, `NDB`, `PAG`, `NCR`, `SAF`, `SAFV`, `SAFC`, `SAFR`,
`SAL`, `REV`), exactamente el mismo delta de saldo que la función vigente
hoy.

#### Scenario: INSERT único de cada tipo de movimiento

- GIVEN un INSERT único (no duplicado) en `movimientos_cuenta` de cualquier
  tipo soportado
- WHEN el trigger procesa el INSERT
- THEN el delta resultante en `saldo_actual`/`saldo_pendiente_usd`/
  `saf_disponible` es idéntico al que produce la función actual (0120)

### Requirement: Disparo único por fila durable, inmutabilidad preservada

El sistema MUST calcular `NEW.saldo_nuevo` en un trigger `BEFORE INSERT`, y
MUST aplicar el `UPDATE clientes` únicamente en un trigger `AFTER INSERT`
separado, que Postgres no dispara para filas descartadas por
`ON CONFLICT DO NOTHING`. `clientes.saldo_actual` MUST NOT mutarse fuera de
este mecanismo de trigger.

#### Scenario: Fila descartada por conflicto no dispara la actualización de saldo

- GIVEN una fila con `id` ya existente en `movimientos_cuenta`
- WHEN PowerSync reenvía el mismo INSERT y Postgres lo descarta vía
  `ON CONFLICT(id) DO NOTHING`
- THEN el trigger `AFTER INSERT` no se ejecuta para esa fila
- AND `clientes.saldo_actual` no cambia como resultado de ese reenvío

### Requirement: Bypass de contexto válido en el trigger AFTER

El sistema MUST autorizar, vía `set_config('clarapos.trigger_context', ...)`,
el `UPDATE clientes` ejecutado desde el nuevo trigger `AFTER INSERT`, de
forma que `validate_cliente_update` no lo bloquee.

#### Scenario: El UPDATE del trigger AFTER no es bloqueado por el guard de clientes

- GIVEN un INSERT válido en `movimientos_cuenta` procesado vía el camino de
  sync
- WHEN el trigger `AFTER INSERT` ejecuta `UPDATE clientes`
- THEN la actualización se completa sin error de `validate_cliente_update`
</content>
