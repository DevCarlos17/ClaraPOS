# Desconciliar desde Histórico de Tesorería Specification

## Purpose

`reversarAbonoDirectoDesdeTesoreria` + `ReversoModal` (capacidad `tesoreria-reverso-abono-directo`, ya mergeada) hoy solo son alcanzables desde el botón "Rechazar" de la pestaña Pendientes. Un ingreso `TRANSFERENCIA_CLIENTE` ya conciliado (`validado=1`) que se detecta erróneo en Histórico no tiene ninguna acción disponible en esa pestaña. Esta spec define el entry point "Desconciliar" en Histórico: wiring de UI puro, cero mutación nueva. El orquestador, `reversarPagoEnTx`, el hook de preview y `reverso-modal.tsx` se **reutilizan sin cambios** — ver `tesoreria-reverso-abono-directo`.

**Fuera de alcance**: cualquier cambio al orquestador o al modal; epic saldo-disponible-vs-en-tránsito; `window.prompt` de reverso en Traspasos; caso SAF (ya bloqueado por la capacidad reutilizada); strikethrough literal (se mantiene `opacity-50`).

## Requirements

### Requirement: Visibilidad de la acción "Desconciliar" gateada por estado

El sistema MUST mostrar la acción "Desconciliar" en una fila de `HistoricoRow` ÚNICAMENTE cuando `validado=1 AND reversado=0`. El sistema MUST NOT mostrar la acción cuando el movimiento ya está reversado, incluso si Histórico (que no filtra por estado a nivel de query) renderiza esa fila.

#### Scenario: Ingreso conciliado y no reversado muestra el botón

- GIVEN una fila de Histórico con `validado=1` y `reversado=0`
- WHEN la fila se renderiza
- THEN se muestra la acción "Desconciliar"

#### Scenario: Ingreso pendiente (no conciliado) no muestra el botón

- GIVEN una fila de Histórico con `validado=0` (pendiente, visible en Histórico por caer dentro del rango de fechas)
- WHEN la fila se renderiza
- THEN NO se muestra "Desconciliar" — ese movimiento solo se gestiona desde "Rechazar" en Pendientes

#### Scenario: Guard de reverso-de-reverso (crítico)

- GIVEN una fila de Histórico con `reversado=1`
- WHEN la fila se renderiza
- THEN NO se muestra ni habilita "Desconciliar" — este guard de UI es la ÚNICA protección contra un doble reverso desde Histórico, porque su query incluye todos los estados

### Requirement: "Desconciliar" abre el `ReversoModal` existente con el movimiento correcto

El sistema MUST, al hacer clic en "Desconciliar", invocar un handler espejo de `handleReversarMov` (incluyendo detección de origen vía `findTraspasoByMovId` sobre los result-sets de Histórico) que fija el movimiento objetivo y abre el `ReversoModal` ya existente — el mismo componente, preview, gate de PIN/`CXC_REVERSE` y bloqueo SAF usados hoy por "Rechazar" en Pendientes, sin ninguna rama de código nueva dentro del modal.

#### Scenario: Click en Desconciliar abre el modal con el ingreso correcto

- GIVEN un ingreso con `validado=1 AND reversado=0` en Histórico
- WHEN el usuario hace clic en "Desconciliar"
- THEN se abre `ReversoModal` vinculado a ESE movimiento, con el mismo panel de preview de facturas afectadas y el mismo gate de `CXC_REVERSE`/PIN de supervisor que aplica desde Pendientes

### Requirement: El efecto de confirmar reutiliza el comportamiento ya especificado (sin re-especificar)

Al confirmar el reverso desde el entry point de Histórico, el sistema MUST producir exactamente el mismo efecto que confirmar desde Pendientes, descrito en la capacidad `tesoreria-reverso-abono-directo`: egreso bancario contraparte, reapertura de factura(s) en CxC, registro de reverso en el historial de abonos y `reversado=1` en el ingreso, con la fila resultante atenuada vía `opacity-50`. Esta spec NO redefine esa mutación.

#### Scenario: Confirmar desde Histórico produce el mismo efecto que confirmar desde Pendientes

- GIVEN el `ReversoModal` abierto desde "Desconciliar" sobre un ingreso válido
- WHEN el usuario confirma el reverso (autorizado)
- THEN el ingreso queda `reversado=1`, la fila se atenúa con `opacity-50`, y se aplican los efectos de CxC/banco ya definidos por `tesoreria-reverso-abono-directo` — sin lógica de egreso adicional ni distinta a la de Pendientes

### Requirement: Gate de origen — solo abonos directos (`TRANSFERENCIA_CLIENTE`)

La acción "Desconciliar" MUST aplicar exclusivamente a ingresos con `origen='TRANSFERENCIA_CLIENTE'`, consistente con el gate `esTransferenciaCliente` ya implementado en `reverso-modal.tsx`. Filas de Histórico con otro origen no reciben la ruta de reverso de abono directo.

#### Scenario: Ingreso con origen distinto no usa la ruta de abono directo

- GIVEN una fila de Histórico con `validado=1 AND reversado=0` cuyo `origen` no es `TRANSFERENCIA_CLIENTE`
- WHEN se abre `ReversoModal` desde esa fila
- THEN el modal NO activa la rama `esReversoDirecto`/preview de abono directo — se comporta igual que hoy para ese origen desde Pendientes
