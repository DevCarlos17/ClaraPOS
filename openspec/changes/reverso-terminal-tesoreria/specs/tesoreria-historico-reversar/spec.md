# Delta for tesoreria-historico-reversar

## MODIFIED Requirements

### Requirement: Visibilidad de "Reversar" gateada por estado y origen `TRANSFERENCIA_CLIENTE`

El sistema MUST mostrar la acción "Reversar" en una fila de `HistoricoRow` ÚNICAMENTE cuando `validado=1 AND reversado=0 AND origen='TRANSFERENCIA_CLIENTE'`. El sistema MUST NOT mostrar "Reversar" para ningún otro origen, ni para filas no conciliadas, ni para filas ya reversadas.

(Previously: el gate ya era exclusivo a `TRANSFERENCIA_CLIENTE` y por construcción nunca exponía "Reversar" a filas `origen='REVERSO'`; esta revisión añade el caso explícito como guardia de regresión para este change, sin alterar la condición del gate.)

#### Scenario: Abono directo conciliado muestra "Reversar"

- GIVEN una fila de Histórico con `validado=1`, `reversado=0`, `origen='TRANSFERENCIA_CLIENTE'`
- WHEN la fila se renderiza
- THEN se muestra la acción "Reversar"

#### Scenario: Origen distinto no muestra "Reversar"

- GIVEN una fila de Histórico con `validado=1`, `reversado=0`, `origen='DEPOSITO'` (o `CIERRE_CONSOLIDACION`, `TRASPASO`, etc.)
- WHEN la fila se renderiza
- THEN NO se muestra "Reversar" — esos orígenes solo exponen "Desconciliar"

#### Scenario: No conciliado no muestra "Reversar"

- GIVEN una fila `TRANSFERENCIA_CLIENTE` con `validado=0`
- WHEN la fila se renderiza
- THEN NO se muestra "Reversar"

#### Scenario: Reverso-de-reverso (crítico)

- GIVEN una fila `TRANSFERENCIA_CLIENTE` con `reversado=1`
- WHEN la fila se renderiza
- THEN NO se muestra ni habilita "Reversar"

#### Scenario: REGRESSION GUARD — un reverso de abono nunca muestra "Reversar"

- GIVEN una fila de Histórico con `origen='REVERSO'`, `validado=1`, `reversado=0` (el propio egreso-contraparte generado al reversar un abono)
- WHEN la fila se renderiza
- THEN NO se muestra "Reversar" — el gate exige `origen==='TRANSFERENCIA_CLIENTE'` y este origen es `'REVERSO'`, confirmando que la fila es terminal: no existe "reverso del reverso"
