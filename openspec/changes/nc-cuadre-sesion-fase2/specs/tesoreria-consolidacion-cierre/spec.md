# Delta for tesoreria-consolidacion-cierre

## ADDED Requirements

### Requirement: EgresoTesoreriaLinea admite destino SESION_CAJA

`EgresoTesoreriaLinea.destino` MUST aceptar un tercer valor `'SESION_CAJA'` (además de `'BANCO'`/`'CAJA_FUERTE'`), apuntando a un `sesiones_caja.id` elegido por quien liquida la NC. Escribir una línea `SESION_CAJA` MUST insertar una fila `EGRESO` en `movimientos_metodo_cobro` (nunca en `movimientos_bancarios`/`mov_caja_fuerte`) dentro de la MISMA transacción `REFUND_TESORERIA` que el resto de la liquidación, convirtiendo el monto ingresado a USD con `notas_credito.tasa_historica` (decimal.js, nunca la tasa vigente del sistema ni aritmética float). Esta línea MUST reusar sin modificar el tope existente (suma de líneas vs. monto de la NC) y el mecanismo de remanente-a-SAFC.

#### Scenario: Egreso a sesión de caja se registra correctamente

- GIVEN una línea `destino: 'SESION_CAJA'` con `sesion_caja_id` y monto válidos
- WHEN se liquida la NC
- THEN se inserta un `movimientos_metodo_cobro` tipo `EGRESO` en esa sesión, dentro de la misma transacción que el resto de la liquidación

#### Scenario: Conversión con tasa histórica, no tasa vigente

- GIVEN una NC con `tasa_historica` conocida y una línea `SESION_CAJA` en Bs
- WHEN se calcula el equivalente USD
- THEN se usa `tasa_historica` vía decimal.js, nunca la tasa vigente del sistema ni `parseFloat`

#### Scenario: Tope y remanente reusados sin duplicar lógica

- GIVEN líneas combinando `BANCO`/`CAJA_FUERTE`/`SESION_CAJA` cuya suma no cubre el monto de la NC
- WHEN se liquida
- THEN el remanente se registra como SAFC exactamente igual que hoy para `REFUND_TESORERIA`

#### Scenario: Egreso es inmutable (append-only)

- GIVEN un egreso `SESION_CAJA` ya registrado
- WHEN se busca alguna vía de edición o borrado
- THEN el sistema no expone ninguna UI ni función para hacerlo — el registro persiste tal como fue escrito

### Requirement: Guard cliente — sesión destino debe seguir ABIERTA al momento de escribir

El trigger Postgres `fn_validate_sesion_abierta` (migración 0041), que rechaza INSERTs en `movimientos_metodo_cobro` contra sesiones no `ABIERTA`, NO existe en el schema PowerSync/SQLite local. Antes de insertar la línea `SESION_CAJA`, el sistema MUST re-verificar dentro de la misma transacción que la sesión elegida sigue con `status='ABIERTA'`; si no, MUST abortar toda la operación (incluida la NC) sin escribir ningún registro parcial, sin depender exclusivamente de un rechazo remoto/asíncrono de Supabase.

#### Scenario: Sesión sigue abierta

- GIVEN una sesión `ABIERTA` re-verificada dentro de la transacción
- WHEN se inserta el egreso
- THEN la operación completa (NC + egreso) se confirma

#### Scenario: Sesión ya no está abierta

- GIVEN una sesión que cambió a `CERRADA` entre la selección en UI y la confirmación
- WHEN se re-verifica su estado dentro de la transacción
- THEN toda la operación se aborta antes de cualquier INSERT local, sin depender de un rechazo tardío al sincronizar con Supabase
