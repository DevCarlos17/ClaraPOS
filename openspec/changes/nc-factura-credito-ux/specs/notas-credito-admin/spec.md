# Delta for notas-credito-admin

## MODIFIED Requirements

### Requirement: Selector "Devolver dinero" / "Crédito a favor" — condicional al remanente pendiente

Antes de renderizar el selector de origen del reverso, el modal MUST calcular el remanente disponible mediante una función pura en `notas-credito-ui.ts` (extensión de `calcularMontoDisponibleRefund`) que retorna `{ montoAplicadoADeuda, montoDisponible }` a partir de `totalUsdNc` (total de la factura en NC TOTAL; suma de las líneas seleccionadas en NC PARCIAL) y `saldoPendVenta` (saldo pendiente de la factura).

Cuando `montoDisponible` es exactamente `0`, el modal MUST NOT renderizar los botones "Devolver dinero" ni "Crédito a favor" — MUST mostrar únicamente el texto `Esta nota de crédito cancela {formatUsd(montoAplicadoADeuda)} de la deuda pendiente de la factura.` seguido del control de confirmación existente.

Cuando `montoDisponible` es mayor a `0`, el modal MUST mostrar el desglose `De {formatUsd(totalUsdNc)}: {formatUsd(montoAplicadoADeuda)} cancela deuda pendiente, {formatUsd(montoDisponible)} disponible` seguido de los dos botones "Devolver dinero" y "Crédito a favor" (comportamiento existente sin cambios, incluidas sus sub-opciones de tesorería). "Devolver dinero" MUST estar habilitada (solo entry point `TRADICIONAL`). Al seleccionarla, el modal MUST revelar dos sub-opciones: "Tesorería" (seleccionable) y "Sesión de caja activa" (visible pero deshabilitada, "Próximamente"). Seleccionar "Tesorería" MUST revelar el mini-formulario de cuenta(s)/monto (selector de cuenta con saldo disponible + monto en moneda de la cuenta + referencia opcional por línea + cálculo en vivo de pendiente por reembolsar). "Crédito a favor" MUST seguir resultando siempre en `SALDO_FAVOR`; confirmar con "Tesorería" y datos válidos MUST invocar `crearNotaCredito` con modalidad `REFUND_TESORERIA`.

El sistema MUST NOT ofrecer, en ningún caso, una opción de UI que resulte en `AJUSTE_CXC` cuando `montoDisponible > 0` — las únicas dos opciones cuando hay remanente siguen siendo "Devolver dinero" (→ Tesorería/`REFUND_TESORERIA`) y "Crédito a favor" (→ `SALDO_FAVOR`), igual que hoy. `crearNotaCredito` y el mapeo `resolverModalidadDesdeOrigen` NO se modifican.

> **Nota de desviación (heredada de `nc-refund-tesoreria`)**: "Crédito a favor" mapea a `SALDO_FAVOR`, no a `AJUSTE_CXC` — comportamiento pre-existente preservado deliberadamente, sin tests que respalden lo contrario.

(Previously: el selector siempre mostraba ambos botones incondicionalmente, sin calcular ni mostrar el remanente, y sin vista de solo-confirmación para el caso remanente=0.)

#### Scenario: Ambas opciones visibles cuando hay remanente

- GIVEN el modal abierto con `montoDisponible > 0`
- WHEN el usuario observa el selector
- THEN ve "Devolver dinero" y "Crédito a favor" junto al desglose

#### Scenario: Devolver dinero habilitada revela sub-opciones

- GIVEN remanente > 0 y el selector visible
- WHEN selecciona "Devolver dinero"
- THEN se revelan "Tesorería" (activa) y "Sesión de caja activa" (deshabilitada, "Próximamente")

#### Scenario: Sesión de caja activa permanece deshabilitada

- GIVEN las sub-opciones visibles
- WHEN el usuario intenta seleccionar "Sesión de caja activa"
- THEN la opción no responde y muestra "Próximamente"

#### Scenario: Seleccionar Tesorería revela el mini-formulario

- GIVEN "Devolver dinero" seleccionada
- WHEN el usuario selecciona "Tesorería"
- THEN se revela el selector de cuenta(s) con saldo disponible, monto y cálculo en vivo de pendiente por reembolsar

#### Scenario: Emisión vía Crédito a favor sigue siendo SALDO_FAVOR

- GIVEN "Crédito a favor" seleccionada con remanente > 0
- WHEN el usuario confirma
- THEN la NC se genera vía `SALDO_FAVOR`, sin cambios respecto al comportamiento existente

#### Scenario: Emisión vía Tesorería invoca REFUND_TESORERIA

- GIVEN "Devolver dinero" → "Tesorería" con cuenta(s)/monto(s) válidos
- WHEN el usuario confirma
- THEN se invoca `crearNotaCredito` con modalidad `REFUND_TESORERIA`

#### Scenario: Factura 100% contado, NC TOTAL

- GIVEN una factura con `saldo_pend_usd = 0.00` y `total_usd = 80.00`
- WHEN el usuario emite una NC TOTAL
- THEN el remanente calculado es 80.00 y el modal muestra el desglose completo + los dos botones

#### Scenario: Factura 100% crédito, NC TOTAL — solo confirmación

- GIVEN una factura con `saldo_pend_usd = 80.00` igual a su `total_usd`
- WHEN el usuario emite una NC TOTAL
- THEN el remanente es 0.00 y el modal muestra únicamente "Esta nota de crédito cancela $80.00 de la deuda pendiente de la factura.", sin botones

#### Scenario: Factura mixta, NC TOTAL — desglose con remanente

- GIVEN una factura con `total_usd = 100.00` y `saldo_pend_usd = 40.00` (60.00 ya pagados)
- WHEN el usuario emite una NC TOTAL
- THEN el modal muestra "De $100.00: $40.00 cancela deuda pendiente, $60.00 disponible" y los dos botones habilitados

#### Scenario: NC PARCIAL con líneas ≤ saldo pendiente — solo confirmación

- GIVEN una factura con `saldo_pend_usd = 50.00`
- WHEN el usuario selecciona líneas PARCIAL por un valor de 30.00
- THEN el remanente es 0.00 y el modal muestra solo la confirmación de cancelación de deuda

#### Scenario: NC PARCIAL con líneas > saldo pendiente — desglose

- GIVEN una factura con `saldo_pend_usd = 30.00`
- WHEN el usuario selecciona líneas PARCIAL por un valor de 50.00
- THEN el remanente es 20.00 y el modal muestra el desglose + los dos botones

#### Scenario: Boundary — remanente exactamente cero

- GIVEN un remanente cuyo valor Decimal es exactamente 0 (`Decimal.max(0, total.minus(montoAplicadoAPendiente))`)
- WHEN el modal decide qué renderizar
- THEN se trata como "sin remanente" — vista solo-confirmación, nunca desglose con botones

#### Scenario: Movimientos idénticos a hoy para la misma elección

- GIVEN cualquiera de los casos anteriores
- WHEN el usuario confirma la opción ofrecida (Crédito a favor, o Devolver dinero → Tesorería)
- THEN la modalidad pasada a `crearNotaCredito` y los `movimientos_metodo_cobro`/`movimientos_cuenta` resultantes son idénticos a los que se generaban antes de este change para la misma elección de usuario
