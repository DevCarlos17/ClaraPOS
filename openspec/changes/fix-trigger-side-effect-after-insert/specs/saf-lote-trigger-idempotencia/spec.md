# Lote SAF — Idempotencia del Trigger ante Reenvío de Sync Specification

## Purpose

`consumir_saf_lote()` (trigger `BEFORE INSERT` sobre
`saf_creditos_aplicaciones`, `migrations/0105`) tiene la misma forma
defectuosa que `actualizar_saldo_cliente()`: mezcla el cálculo de auditoría
de `NEW` (`lote_saldo_antes_usd` / `lote_saldo_despues_usd`) con un efecto
secundario `UPDATE saf_creditos_lotes SET saldo_disponible_usd...` en el
mismo `BEFORE`. Es el bug gemelo confirmado por lectura en vivo de
`pg_get_functiondef`: latente, aún no reproducido con datos reales, pero
expuesto a la misma clase de reenvío de PowerSync que
`movimientos_cuenta`/`clientes`. Esta spec aplica la misma garantía de
idempotencia a `saf_creditos_lotes.saldo_disponible_usd`.

## Requirements

### Requirement: Idempotencia del consumo de lote SAF ante reenvío

El sistema MUST decrementar `saf_creditos_lotes.saldo_disponible_usd` por el
efecto de una fila `saf_creditos_aplicaciones.id` EXACTAMENTE UNA VEZ, sin
importar cuántas veces PowerSync reenvíe el mismo INSERT en transacciones
Postgres separadas.

#### Scenario: Reenvío de la misma aplicación SAF no duplica el consumo del lote

- GIVEN una fila `saf_creditos_aplicaciones` que consume $5 de un lote con
  `saldo_disponible_usd = $20`, cuyo `id` es reenviado 2 veces en
  transacciones Postgres distintas
- WHEN ambas transacciones se procesan contra la base de datos
- THEN `saf_creditos_lotes.saldo_disponible_usd` queda en $15 (no $10)
- AND `saf_creditos_aplicaciones` conserva una sola fila con ese `id`

### Requirement: Comportamiento idéntico para INSERT único (sin regresión)

El sistema MUST producir, para un INSERT único (no reenviado) en
`saf_creditos_aplicaciones`, exactamente el mismo decremento en
`saldo_disponible_usd` que la función vigente hoy.

#### Scenario: Consumo único de lote SAF

- GIVEN un INSERT único en `saf_creditos_aplicaciones`
- WHEN el trigger procesa el INSERT
- THEN el decremento resultante en `saldo_disponible_usd` es idéntico al que
  produce la función actual (0105)

### Requirement: Disparo único por fila durable, auditoría de lote preservada

El sistema MUST calcular `NEW.lote_saldo_antes_usd` y
`NEW.lote_saldo_despues_usd` en un trigger `BEFORE INSERT`, y MUST aplicar el
`UPDATE saf_creditos_lotes` únicamente en un trigger `AFTER INSERT`
separado, que Postgres no dispara para filas descartadas por
`ON CONFLICT DO NOTHING`. `saf_creditos_lotes.saldo_disponible_usd` MUST NOT
mutarse fuera de este mecanismo de trigger.

#### Scenario: Auditoría de lote se calcula sin efecto secundario

- GIVEN cualquier INSERT válido en `saf_creditos_aplicaciones`
- WHEN el trigger `BEFORE INSERT` se ejecuta
- THEN `NEW.lote_saldo_antes_usd` y `NEW.lote_saldo_despues_usd` quedan
  calculados
- AND ningún `UPDATE saf_creditos_lotes` ocurre todavía en ese punto

#### Scenario: Fila descartada por conflicto no dispara el consumo del lote

- GIVEN una fila con `id` ya existente en `saf_creditos_aplicaciones`
- WHEN PowerSync reenvía el mismo INSERT y Postgres lo descarta vía
  `ON CONFLICT(id) DO NOTHING`
- THEN el trigger `AFTER INSERT` no se ejecuta para esa fila
- AND `saf_creditos_lotes.saldo_disponible_usd` no cambia como resultado de
  ese reenvío
</content>
