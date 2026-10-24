# Delta for Desconciliar desde Histórico de Tesorería

> Corrige el comportamiento mergeado por PR #262: "Desconciliar" NO abre `ReversoModal` ni ejecuta reverso real. Es un flip de estado puro (`validado` 1→0), espejo inverso de "Conciliar". El reverso real pasa a vivir en la nueva capacidad `tesoreria-historico-reversar` (ver spec separada). Referencia, sin re-especificar: `tesoreria-reverso-abono-directo` (mutación de reverso) y `validarMovBancario`/`validarMovCajaFuerte`/`validarTraspaso` (patrón espejo).

## MODIFIED Requirements

### Requirement: Visibilidad de la acción "Desconciliar" gateada por estado, agnóstica de origen

El sistema MUST mostrar la acción "Desconciliar" en una fila de `HistoricoRow` ÚNICAMENTE cuando `validado=1 AND reversado=0`, SIN restricción de `origen` (espejo del gate de "Conciliar" en Pendientes). El sistema MUST NOT mostrar la acción cuando el movimiento ya está reversado, incluso si Histórico (que no filtra por estado a nivel de query) renderiza esa fila.
(Previously: el gate real de la feature quedaba restringido a `TRANSFERENCIA_CLIENTE` por el Requirement "Gate de origen" — ver REMOVED abajo)

#### Scenario: Ingreso conciliado y no reversado muestra el botón (cualquier origen)

- GIVEN una fila de Histórico con `validado=1`, `reversado=0` y `origen` distinto de `TRANSFERENCIA_CLIENTE` (p.ej. `CIERRE_CONSOLIDACION`, `DEPOSITO`)
- WHEN la fila se renderiza
- THEN se muestra la acción "Desconciliar"

#### Scenario: Ingreso pendiente (no conciliado) no muestra el botón

- GIVEN una fila de Histórico con `validado=0`
- WHEN la fila se renderiza
- THEN NO se muestra "Desconciliar" — ese movimiento solo se gestiona desde "Conciliar"/"Rechazar" en Pendientes

#### Scenario: Guard de reverso-de-reverso (crítico)

- GIVEN una fila de Histórico con `reversado=1`
- WHEN la fila se renderiza
- THEN NO se muestra ni habilita "Desconciliar" — este guard de UI es la ÚNICA protección contra operar sobre un movimiento ya reversado desde Histórico

### Requirement: "Desconciliar" ejecuta un flip de estado puro, sin modal

Al hacer clic en "Desconciliar", el sistema MUST invocar `desconciliarMovBancario`/`desconciliarMovCajaFuerte` (espejo inverso de `validarMovBancario`/`validarMovCajaFuerte`): `UPDATE ... SET validado=0, validado_por=NULL, validado_at=NULL WHERE id = ?`, en una sola `db.writeTransaction`, sin abrir `ReversoModal` ni ninguna confirmación por PIN (no es mutación financiera). El sistema MUST rechazar la operación con guard `reversado=1 → throw` y `validado=0 → throw` ("ya está desconciliado").
(Previously: invocaba un handler espejo de `handleReversarMov` que abría `ReversoModal`)

#### Scenario: Click en Desconciliar flipea el estado sin abrir modal

- GIVEN un ingreso `validado=1 AND reversado=0` en Histórico, origen `DEPOSITO`
- WHEN el usuario hace clic en "Desconciliar"
- THEN `validado` pasa a `0`, `validado_por`/`validado_at` quedan `NULL`, el `ReversoModal` NUNCA se abre, y la fila reaparece en Pendientes

#### Scenario: Doble-desconciliación rechazada

- GIVEN un movimiento con `validado=0`
- WHEN se invoca `desconciliarMovBancario`/`desconciliarMovCajaFuerte` sobre ese id
- THEN la operación lanza error sin mutar filas

### Requirement: "Desconciliar" nunca toca saldo, factura ni cliente

El sistema MUST NOT modificar `bancos_empresa.saldo_actual`, `caja_fuerte.saldo_actual`, ninguna factura, ni `cliente.saldo_actual`/`saldo_pendiente_usd` como efecto de "Desconciliar". El saldo se movió en el momento de crear el ingreso (fuera de alcance de esta acción); `validado` es solo una bandera de "conciliado contra extracto bancario".
(Previously: el requirement describía que confirmar reproducía el egreso + reapertura de factura + CxC definidos por `tesoreria-reverso-abono-directo`)

#### Scenario: Desconciliar no mueve saldo

- GIVEN un ingreso conciliado con `bancos_empresa.saldo_actual = $500`
- WHEN se hace clic en "Desconciliar"
- THEN `bancos_empresa.saldo_actual` permanece en `$500` y ninguna factura cambia `saldo_pend_usd`

## REMOVED Requirements

### Requirement: Gate de origen — solo abonos directos (`TRANSFERENCIA_CLIENTE`)

(Reason: ese gate pertenecía al reverso real mal etiquetado como "Desconciliar". El reverso real — con su gate `origen==='TRANSFERENCIA_CLIENTE'` — ahora vive correctamente bajo la nueva capacidad `tesoreria-historico-reversar`. "Desconciliar" es agnóstico de origen, salvo la rama `TRASPASO` descrita abajo)

## ADDED Requirements

### Requirement: Desconciliar sobre `TRASPASO` desconcilia ambos lados atómicamente

Cuando la fila de Histórico corresponde a un movimiento originado por un `TRASPASO`, el sistema MUST invocar `desvalidarTraspaso(traspasoId)` — espejo inverso de `validarTraspaso` — que, en UNA sola `db.writeTransaction`, flipea `validado=0` en AMBOS lados del par (origen y destino) que tengan columna `validado` (se omite `SESION_CAJA`, igual que `validarTraspaso`). El sistema MUST rechazar si el traspaso ya está `reversado=1`.

#### Scenario: Desconciliar un traspaso banco→caja fuerte desconcilia ambos lados

- GIVEN un `TRASPASO` conciliado con `mov_origen_id` en `movimientos_bancarios` y `mov_destino_id` en `mov_caja_fuerte`, ambos `validado=1`
- WHEN el usuario hace clic en "Desconciliar" sobre la fila origen (o destino) en Histórico
- THEN AMBOS movimientos quedan `validado=0` en la misma transacción — nunca queda un lado conciliado y el otro no

#### Scenario: Traspaso ya reversado rechaza el desconciliar

- GIVEN un `TRASPASO` con `reversado=1`
- WHEN se intenta desconciliar
- THEN la operación lanza error sin mutar ningún lado
