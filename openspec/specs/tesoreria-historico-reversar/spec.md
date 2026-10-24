# Reversar desde Histórico de Tesorería Specification

## Purpose

El reverso real de un abono directo (`reversarAbonoDirectoDesdeTesoreria`: egreso bancario + reapertura de factura + CxC, capacidad ya especificada en `tesoreria-reverso-abono-directo`) necesita un entry point en la pestaña Histórico para ingresos `TRANSFERENCIA_CLIENTE` ya conciliados. PR #262 implementó exactamente esta mutación pero la etiquetó "Desconciliar" — error corregido por el cambio `split-desconciliar-reversar-historico` (PR #265). Esta capacidad define el botón "Reversar", que es ese mismo código (handler, guard, apertura de `ReversoModal`) re-expuesto con el nombre correcto. **Cero cambios** al `ReversoModal` ni al orquestador.

**Fuera de alcance**: cualquier cambio al orquestador o al modal; epic saldo-disponible-vs-en-tránsito; caso SAF (ya bloqueado por `tesoreria-reverso-abono-directo`); extender el gate a otros orígenes.

## Requirements

### Requirement: Visibilidad de "Reversar" gateada por estado y origen `TRANSFERENCIA_CLIENTE`

El sistema MUST mostrar la acción "Reversar" en una fila de `HistoricoRow` ÚNICAMENTE cuando `validado=1 AND reversado=0 AND origen='TRANSFERENCIA_CLIENTE'`. El sistema MUST NOT mostrar "Reversar" para ningún otro origen, ni para filas no conciliadas, ni para filas ya reversadas.

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

### Requirement: "Reversar" abre el `ReversoModal` existente con el movimiento correcto

El sistema MUST, al hacer clic en "Reversar", invocar el handler (detección de origen vía `findTraspasoByMovId` sobre los result-sets de Histórico incluida) que fija el movimiento objetivo y abre el `ReversoModal` ya existente — el mismo componente, preview de facturas afectadas, gate de `CXC_REVERSE`/PIN de supervisor y bloqueo SAF usados hoy por "Rechazar" en Pendientes, sin ninguna rama de código nueva dentro del modal.

#### Scenario: Click en Reversar abre el modal con el ingreso correcto

- GIVEN un ingreso `TRANSFERENCIA_CLIENTE` con `validado=1 AND reversado=0` en Histórico
- WHEN el usuario hace clic en "Reversar"
- THEN se abre `ReversoModal` vinculado a ESE movimiento, con el mismo panel de preview y el mismo gate de `CXC_REVERSE`/PIN aplicado desde Pendientes

### Requirement: Confirmar "Reversar" reutiliza el comportamiento ya especificado (sin re-especificar)

Al confirmar el reverso desde "Reversar", el sistema MUST producir exactamente el mismo efecto descrito en `tesoreria-reverso-abono-directo`: egreso bancario contraparte, reapertura de factura(s) en CxC, registro de reverso en el historial de abonos y `reversado=1` en el ingreso, con la fila resultante atenuada vía `opacity-50`. Esta spec NO redefine esa mutación.

#### Scenario: Confirmar "Reversar" produce el efecto completo

- GIVEN el `ReversoModal` abierto desde "Reversar" sobre un ingreso válido
- WHEN el usuario confirma el reverso (autorizado)
- THEN el ingreso queda `reversado=1`, la fila se atenúa con `opacity-50`, y se aplican los efectos de CxC/banco ya definidos por `tesoreria-reverso-abono-directo`

### Requirement: "Reversar" y "Desconciliar" coexisten como acciones independientes

Para una fila `TRANSFERENCIA_CLIENTE` con `validado=1 AND reversado=0`, el sistema MUST mostrar AMBOS botones ("Desconciliar" de `tesoreria-historico-desconciliar` y "Reversar" de esta capacidad) simultáneamente — son acciones independientes, sin exclusión mutua, y hacer clic en uno MUST NOT afectar al otro (ambos leen `validado`/`reversado` del mismo registro, pero actúan por rutas separadas: `desconciliarMovBancario`/`CajaFuerte` vs. `ReversoModal`).

#### Scenario: Ambos botones visibles en un abono directo conciliado

- GIVEN una fila `TRANSFERENCIA_CLIENTE` con `validado=1 AND reversado=0`
- WHEN la fila se renderiza
- THEN se muestran "Desconciliar" Y "Reversar" al mismo tiempo

#### Scenario: Matriz completa de visibilidad por origen y estado

- GIVEN filas de Histórico con las combinaciones: (a) `TRANSFERENCIA_CLIENTE` validado+no reversado, (b) otro origen validado+no reversado, (c) `TRASPASO` validado+no reversado, (d) cualquier origen con `reversado=1`
- WHEN cada fila se renderiza
- THEN (a) muestra ambos botones; (b) muestra solo "Desconciliar"; (c) muestra solo "Desconciliar" (ambos lados, vía `desvalidarTraspaso`); (d) no muestra ninguno
