# Delta for notas-credito-admin

## MODIFIED Requirements

### Requirement: Selector "Devolver dinero" / "Crédito a favor" — con sub-opciones de tesorería

El modal MUST mostrar un selector con dos opciones: "Devolver dinero" y "Crédito a favor". "Devolver dinero" MUST estar habilitada (solo entry point `TRADICIONAL`). Al seleccionarla, el modal MUST revelar dos sub-opciones: "Tesorería" (seleccionable) y "Sesión de caja activa" (visible pero deshabilitada, con indicación "Próximamente"). Seleccionar "Tesorería" MUST revelar el mini-formulario de cuenta(s)/monto (selector de cuenta con saldo disponible + monto en moneda de la cuenta + cálculo en vivo de pendiente por reembolsar). "Crédito a favor" MUST seguir resultando siempre en `AJUSTE_CXC`; confirmar la emisión con "Tesorería" seleccionada y datos válidos MUST invocar `crearNotaCredito` con modalidad `REFUND_TESORERIA`.

(Previously: "Devolver dinero" estaba completamente deshabilitada con tooltip "Próximamente"; solo "Crédito a favor" era seleccionable y toda emisión resultaba en `AJUSTE_CXC`.)

#### Scenario: Ambas opciones visibles

- GIVEN el modal abierto con una factura seleccionada
- WHEN el usuario observa el selector de origen de reverso
- THEN ve "Devolver dinero" y "Crédito a favor"

#### Scenario: Devolver dinero habilitada revela sub-opciones

- GIVEN el selector visible
- WHEN el usuario selecciona "Devolver dinero"
- THEN se revelan las sub-opciones "Tesorería" (activa) y "Sesión de caja activa" (deshabilitada, "Próximamente")

#### Scenario: Sesión de caja activa permanece deshabilitada

- GIVEN las sub-opciones visibles
- WHEN el usuario intenta seleccionar "Sesión de caja activa"
- THEN la opción no responde y muestra "Próximamente"

#### Scenario: Seleccionar Tesorería revela el mini-formulario

- GIVEN "Devolver dinero" seleccionada
- WHEN el usuario selecciona la sub-opción "Tesorería"
- THEN se revela el selector de cuenta(s) banco/caja fuerte con saldo disponible, el campo de monto en la moneda de la cuenta y el cálculo en vivo de "pendiente por reembolsar"

#### Scenario: Emisión vía Crédito a favor sigue siendo AJUSTE_CXC

- GIVEN "Crédito a favor" seleccionada
- WHEN el usuario confirma la emisión
- THEN la NC se genera vía `AJUSTE_CXC`, sin cambios respecto al comportamiento existente

#### Scenario: Emisión vía Tesorería invoca REFUND_TESORERIA

- GIVEN "Devolver dinero" → "Tesorería" con cuenta(s) y monto(s) válidos, sin exceder el monto de la NC
- WHEN el usuario confirma la emisión
- THEN se invoca `crearNotaCredito` con modalidad `REFUND_TESORERIA` y `egresoParams` construido como array desde el mini-formulario

## ADDED Requirements

### Requirement: Saldo disponible visible en el selector de cuenta de tesorería

El selector de cuenta(s) de la sub-opción "Tesorería" MUST mostrar, junto a cada banco/caja fuerte listado, su saldo disponible actual (reusando `useCuentasTesoreria()`), en la moneda nativa de la cuenta.

#### Scenario: Selector muestra saldo por cuenta

- GIVEN el mini-formulario de Tesorería abierto
- WHEN el usuario abre el selector de cuenta
- THEN cada opción de banco/caja fuerte muestra su saldo disponible actual junto al nombre, en su moneda nativa
