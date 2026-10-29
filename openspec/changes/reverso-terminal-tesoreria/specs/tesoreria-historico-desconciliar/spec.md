# Delta for tesoreria-historico-desconciliar

## MODIFIED Requirements

### Requirement: Visibilidad de la acción "Desconciliar" gateada por estado, con exclusión de reverso de abono

El sistema MUST mostrar la acción "Desconciliar" en una fila de `HistoricoRow` ÚNICAMENTE cuando `validado=1 AND reversado=0 AND origen !== 'REVERSO'`. El sistema MUST NOT mostrar la acción cuando el movimiento ya está reversado, incluso si Histórico (que no filtra por estado a nivel de query) renderiza esa fila. Un reverso de abono (`origen='REVERSO'` insertado por `reversarAbonoDirectoDesdeTesoreria`) aterriza en Histórico ya validado y es TERMINAL: no existe "reverso del reverso", por lo que nunca ofrece "Desconciliar".

(Previously: el gate era "SIN restricción de `origen`" — agnóstico, mostraba "Desconciliar" para cualquier origen incluyendo `REVERSO`. Este cambio REVIERTE explícitamente el comportamiento introducido por el commit `251a32a3` (2026-10-28), que había añadido "Desconciliar" a filas de reverso de abono.)

#### Scenario: Ingreso conciliado y no reversado muestra el botón (cualquier origen excepto REVERSO)

- GIVEN una fila de Histórico con `validado=1`, `reversado=0` y `origen` distinto de `REVERSO` (p.ej. `TRANSFERENCIA_CLIENTE`, `CIERRE_CONSOLIDACION`, `DEPOSITO`, `GASTO`, `TRASPASO`)
- WHEN la fila se renderiza
- THEN se muestra la acción "Desconciliar"

#### Scenario: Ingreso pendiente (no conciliado) no muestra el botón

- GIVEN una fila de Histórico con `validado=0` (pendiente, visible en Histórico por caer dentro del rango de fechas)
- WHEN la fila se renderiza
- THEN NO se muestra "Desconciliar" — ese movimiento solo se gestiona desde "Conciliar"/"Rechazar" en Pendientes

#### Scenario: Guard de reverso-de-reverso (crítico)

- GIVEN una fila de Histórico con `reversado=1`
- WHEN la fila se renderiza
- THEN NO se muestra ni habilita "Desconciliar" — este guard de UI es la ÚNICA protección contra operar sobre un movimiento ya reversado desde Histórico, porque su query incluye todos los estados

#### Scenario: Reverso de abono terminal nunca muestra "Desconciliar"

- GIVEN una fila de Histórico con `origen='REVERSO'`, `validado=1`, `reversado=0` (egreso-contraparte insertado por `reversarAbonoDirectoDesdeTesoreria`)
- WHEN la fila se renderiza
- THEN NO se muestra "Desconciliar" — la fila es terminal y queda de solo lectura, sin ninguna acción disponible para revertir su estado validado
