# Delta for notas-credito-pos

## ADDED Requirements

### Requirement: Selector "Devolver dinero" / "Crédito a favor" condicional al remanente pendiente

La entrada POS de NC MUST reutilizar el mismo componente `OrigenReversoSelector` y la misma función pura de desglose de `notas-credito-ui.ts` (extensión de `calcularMontoDisponibleRefund`, ver `notas-credito-admin`) para decidir qué renderizar antes de la confirmación de la NC — sin lógica de decisión propia ni duplicada.

Cuando el remanente calculado (`montoDisponible`) es exactamente `0`, el modal MUST NOT mostrar los botones "Devolver dinero"/"Crédito a favor" — MUST mostrar únicamente `Esta nota de crédito cancela {formatUsd(montoAplicadoADeuda)} de la deuda pendiente de la factura.` seguido de la confirmación existente. Cuando `montoDisponible > 0`, el modal MUST mostrar el desglose `De {formatUsd(totalUsdNc)}: {formatUsd(montoAplicadoADeuda)} cancela deuda pendiente, {formatUsd(montoDisponible)} disponible` seguido de los dos botones existentes, con el mismo mapeo de modalidad que hoy (`SALDO_FAVOR` / `REFUND_TESORERIA`). El sistema MUST NOT exponer ninguna opción que resulte en `AJUSTE_CXC` cuando `montoDisponible > 0`. `crearNotaCredito` no se modifica.

#### Scenario: Remanente cero muestra solo confirmación

- GIVEN una factura de la sesión activa con `saldo_pend_usd = total_usd` (100% crédito)
- WHEN el cajero emite una NC TOTAL en el POS
- THEN el remanente es 0.00 y el panel muestra únicamente "Esta nota de crédito cancela $X de la deuda pendiente de la factura.", sin los botones "Devolver dinero"/"Crédito a favor"

#### Scenario: Remanente positivo muestra desglose y opciones

- GIVEN una factura de la sesión activa con `saldo_pend_usd` menor a `total_usd`
- WHEN el cajero emite una NC TOTAL o PARCIAL cuyo monto excede el saldo pendiente
- THEN el panel muestra el desglose "De $TOTAL: $X cancela deuda pendiente, $Y disponible" y los dos botones habilitados

#### Scenario: Boundary — remanente exactamente cero

- GIVEN un remanente cuyo valor Decimal calculado es exactamente 0
- WHEN el panel decide qué renderizar
- THEN se aplica la vista solo-confirmación, igual que en `notas-credito-admin`

#### Scenario: Comportamiento idéntico a notas-credito-admin

- GIVEN la misma combinación de `total_usd`/`saldo_pend_usd`/tipo de NC en POS y en la ruta administrativa
- WHEN ambos flujos calculan el remanente
- THEN el resultado (vista solo-confirmación o desglose+opciones) es idéntico, por compartir el mismo componente y la misma función pura

#### Scenario: Movimientos idénticos a hoy para la misma elección

- GIVEN el cajero confirma la NC con la opción ofrecida (Crédito a favor, o Devolver dinero cuando esté disponible en POS)
- WHEN se ejecuta `crearNotaCredito`
- THEN la modalidad y los movimientos resultantes son idénticos a los que se generaban antes de este change para la misma elección, y el impacto en el cuadre de la sesión activa (Regla de Oro) no cambia
