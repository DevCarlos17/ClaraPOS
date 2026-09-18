# Delta for notas-credito-liquidacion

## MODIFIED Requirements

### Requirement: Modalidad REFUND_TESORERIA (condicional)

`REFUND_TESORERIA` MUST insertar uno o más egresos en `movimientos_bancarios` y/o `mov_caja_fuerte`, cada uno con `validado=0` (pendiente de conciliación), reusando el patrón `validado`/`validado_por`/`reversado` existente, vinculado a la NC vía `doc_origen_id` (id de la NC) y `doc_origen_tipo`, y usando un valor nuevo del CHECK de `origen` (nombre exacto definido en `sdd-design`) que identifique semánticamente "reembolso de NC". MUST tener impacto `$0.00` sobre el cajón POS activo (Regla de Oro, ver `notas-credito-pos`). La suma de todas las líneas de egreso MUST NOT exceder el monto de la NC (ver requisito de tope).

(Previously: placeholder condicional sin comportamiento — `crearNotaCredito` rechazaba con `throw` antes de abrir transacción.)

#### Scenario: Egreso pendiente de conciliación

- GIVEN una NC liquidada como `REFUND_TESORERIA`
- WHEN se registra el egreso
- THEN cada línea queda con `validado=0`, `doc_origen_id` = id de la NC, visible en el flujo de conciliación existente

#### Scenario: Sin impacto en sesión POS activa

- GIVEN una sesión POS activa y una NC liquidada como `REFUND_TESORERIA` contra una factura histórica
- WHEN se liquida
- THEN el cuadre de la sesión activa no cambia ($0.00 de impacto)

### Requirement: Gate anti-fraude de no-desembolso

El sistema MUST bloquear a nivel de función (no solo de UI) el campo de salida de efectivo cuando la modalidad es `SALDO_FAVOR`, `COMPENSACION_VENTA` o `AJUSTE_CXC`. Solo `REFUND_TESORERIA` (o efectivo real bajo Regla de Oro en POS) MUST permitir un campo de salida de efectivo. Con `egresoParams` como ARRAY, un array VACÍO (`[]`) MUST tratarse como ausencia de egreso (NO dispara el gate) — la validación MUST usar `length > 0` explícito, no solo truthiness del array. Cuando la modalidad es `REFUND_TESORERIA` y la NC efectivamente reembolsa por tesorería, `egresoParams` MUST ser un array no vacío.

(Previously: no contemplaba forma array de `egresoParams`; el gate solo distinguía por modalidad, sin el gotcha de truthy-array.)

#### Scenario: Intento de forzar salida de efectivo en modalidad no-efectivo

- GIVEN una llamada directa a la función con modalidad `SALDO_FAVOR`/`COMPENSACION_VENTA`/`AJUSTE_CXC` y un monto de salida de efectivo distinto de cero
- WHEN se ejecuta la función
- THEN se rechaza — el bloqueo vive en la función, no solo en la UI

#### Scenario: Array vacío no dispara el gate en REFUND_TESORERIA

- GIVEN modalidad `REFUND_TESORERIA` con `egresoParams = []`
- WHEN se ejecuta la función
- THEN el gate NO la rechaza como si fuera un desembolso indebido (tratado como "sin egreso")

#### Scenario: Array no vacío requerido cuando hay reembolso real

- GIVEN modalidad `REFUND_TESORERIA` con un monto a reembolsar mayor a cero
- WHEN `egresoParams` está vacío o ausente
- THEN se rechaza — no puede haber reembolso de tesorería sin al menos una línea de egreso

## ADDED Requirements

### Requirement: Conversión a tasa histórica de la NC (multi-moneda)

El monto de cada línea de egreso MUST ingresarse en la moneda nativa de la cuenta de tesorería elegida (banco o caja fuerte) y convertirse a USD usando `notas_credito.tasa_historica` — NUNCA la tasa de cambio vigente del sistema.

#### Scenario: Cuenta bancaria en Bolívares

- GIVEN una NC con `tasa_historica` = 40.00 y una cuenta bancaria en Bs
- WHEN el usuario ingresa 4000 Bs como monto de refund
- THEN el sistema calcula 100.00 USD usando 40.00 (tasa_historica), no la tasa vigente

#### Scenario: Cuenta en USD

- GIVEN una NC con `tasa_historica` = 40.00 y una caja fuerte en USD
- WHEN el usuario ingresa 100.00 USD como monto de refund
- THEN el sistema usa 100.00 USD directamente (pass-through), sin conversión

### Requirement: Reembolso multi-fuente

Un mismo reembolso de NC MAY satisfacerse con un array de líneas de egreso a través de múltiples cuentas de tesorería (banco y/o caja fuerte combinados). La suma de las líneas (convertidas a USD) MUST reconciliar contra el monto total reembolsado de la NC.

#### Scenario: Refund dividido entre banco y caja fuerte

- GIVEN una NC con monto a reembolsar de 150.00 USD
- WHEN el usuario asigna 100.00 USD desde un banco y 50.00 USD desde caja fuerte
- THEN se insertan dos líneas de egreso (una por cuenta), ambas con el mismo `doc_origen_id`, y su suma en USD reconcilia con el monto reembolsado

### Requirement: Tope — el reembolso no puede exceder el monto de la NC

El sistema MUST NOT permitir que la suma de las líneas de egreso (en USD, a tasa histórica) exceda el monto total de la NC. La validación MUST vivir a nivel de función (`crearNotaCredito`), no solo en la UI.

#### Scenario: Intento de exceder el monto de la NC rechazado

- GIVEN una NC de 100.00 USD
- WHEN se intenta registrar egreso(s) cuya suma en USD es 120.00
- THEN la operación se rechaza antes de escribir cualquier registro, incluso si la llamada evita la UI

### Requirement: Remanente no reembolsado pasa a SAFC

Cuando el reembolso de tesorería es PARCIAL (suma de líneas menor al monto de la NC neto de Step A), el remanente MUST registrarse como SAFC reusando el mismo mecanismo de `SALDO_FAVOR` (`movimientos_cuenta` tipo `SAFC`, trazable a `nota_credito_id`), sin doble conteo respecto de lo ya cancelado en Step A.

#### Scenario: NC de 100, refund parcial de 60, resto a SAFC

- GIVEN una NC de 100.00 USD donde Step A ya canceló la deuda pendiente de la factura
- WHEN el usuario reembolsa 60.00 USD vía tesorería (una o varias cuentas)
- THEN se insertan las líneas de egreso por 60.00 USD y un `movimientos_cuenta` tipo `SAFC` por 40.00 USD, trazable a la NC, sin restar dos veces lo ya cancelado en Step A

### Requirement: Guard de saldo suficiente en caja fuerte

Un reembolso con origen caja fuerte MUST NOT exceder el saldo disponible de esa caja fuerte (reusa el guard existente, mismo patrón que traspasos de tesorería). Los bancos NO están sujetos a este guard en este change (fuera de alcance — la regla de sobregiro bancario es política futura de tesorería).

#### Scenario: Refund excede saldo de caja fuerte

- GIVEN una caja fuerte con saldo disponible de 50.00 USD
- WHEN se intenta reembolsar 80.00 USD desde esa caja fuerte
- THEN se rechaza antes de escribir el egreso

#### Scenario: Banco sin guard de sobregiro (no-goal explícito)

- GIVEN un banco con saldo disponible de 50.00 USD
- WHEN se reembolsan 80.00 USD desde ese banco
- THEN la operación NO es bloqueada por este change (idéntico al comportamiento actual de CxP/Gastos; la regla de sobregiro bancario queda fuera de alcance)
