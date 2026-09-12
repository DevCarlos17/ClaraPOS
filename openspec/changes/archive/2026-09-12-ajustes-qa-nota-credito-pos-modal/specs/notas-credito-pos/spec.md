# Delta for notas-credito-pos

## MODIFIED Requirements

### Requirement: Alcance limitado a la sesión activa

La entrada POS de NC MUST listar TODAS las facturas (`ventas`) creadas dentro de la `sesion_caja_id` actualmente activa del cajero — reversadas o no — consultadas localmente vía `useFacturasSesionActiva` (offline-first, PowerSync). MUST proveer un buscador que filtre el listado por número de factura, nombre de cliente o estado (badge). Cada fila MUST mostrar fecha y hora, número de factura, cliente, monto en USD y en Bs, la tasa de cambio histórica de esa factura (formateada a 4 decimales), y sus badges correspondientes.
(Previously: no exigía mostrar la tasa por fila.)

#### Scenario: Factura de la sesión actual visible

- GIVEN una venta creada en la sesión activa
- WHEN el cajero abre el flujo de NC en el POS
- THEN esa venta aparece en el listado

#### Scenario: Factura de sesión anterior no visible en POS

- GIVEN una venta de una sesión ya cerrada
- WHEN el cajero abre el flujo de NC en el POS
- THEN esa venta no aparece — debe usarse el módulo Tradicional

#### Scenario: Sesión activa sin facturas

- GIVEN una sesión de caja activa recién abierta, sin ventas registradas
- WHEN el cajero abre el flujo de NC en el POS
- THEN el listado se muestra vacío, sin error

#### Scenario: Buscador filtra por número de factura

- GIVEN un listado con varias facturas de la sesión activa
- WHEN el cajero escribe un número de factura en el buscador
- THEN el listado muestra solo las facturas cuyo número coincide

#### Scenario: Buscador filtra por nombre de cliente

- GIVEN un listado con facturas de distintos clientes
- WHEN el cajero escribe parte del nombre de un cliente en el buscador
- THEN el listado muestra solo las facturas de ese cliente

#### Scenario: Buscador filtra por estado

- GIVEN un listado con facturas en distintos estados (Contado, Crédito, Abonada, Reverso Total/Parcial)
- WHEN el cajero filtra por un estado específico
- THEN el listado muestra solo las facturas con ese estado

#### Scenario: Factura reversada permanece visible en el listado

- GIVEN una factura con una NC (total o parcial) ya emitida
- WHEN el cajero abre el listado
- THEN esa factura sigue apareciendo, con su badge de reverso correspondiente

#### Scenario: Cada tarjeta muestra su tasa histórica

- GIVEN un listado con varias facturas de la sesión activa, cada una con su propia tasa
- WHEN el cajero observa el listado
- THEN cada tarjeta muestra su tasa de cambio (4 decimales) debajo del monto en Bs, sin excepción — incluida la no seleccionada

### Requirement: Panel de detalle fiscal de la factura seleccionada

El panel derecho MUST permanecer vacío hasta que el cajero seleccione una factura del listado. Al seleccionar, MUST mostrar DIRECTAMENTE la tabla de artículos (cantidad, precio unitario en Bs y USD) — sin ningún encabezado previo de Cliente, Tasa o número de factura — seguida de subtotal, desglose de exento, base imponible, IVA por cada alícuota, total de la factura, IGTF si aplica, y desglose de métodos de pago utilizados. El desglose fiscal MUST reutilizar `buildReciboData`/`construirFilasTotales` — MUST NOT recalcular montos de forma independiente.
(Previously: mostraba un encabezado local Cliente/Tasa más el título "Factura" propio de `FacturaDetallePanel` antes de la tabla de artículos.)

> Nota de deuda heredada (no modificada por este delta): la sección de "afectación a CxC" y el desglose de métodos de pago siguen ocultos por la fuente SAF-cruzada no confiable (ver spec base, Slice 5d).

#### Scenario: Panel vacío sin selección

- GIVEN el modal recién abierto sin ninguna factura seleccionada
- WHEN el cajero observa el panel derecho
- THEN el panel no muestra datos de factura alguna

#### Scenario: Selección muestra el desglose fiscal completo, sin encabezado duplicado

- GIVEN una factura seleccionada del listado
- WHEN el panel se renderiza
- THEN el primer elemento visible es la tabla de artículos — ni "Cliente:", ni "Tasa:", ni el número de factura aparecen antes de ella

#### Scenario: Factura con IGTF aplicado

- GIVEN una factura cuyo pago generó IGTF
- WHEN se selecciona en el listado
- THEN el panel muestra el monto de IGTF calculado por `buildReciboData`

### Requirement: Selección de tipo de nota de crédito (TOTAL o PARCIAL)

Al revelar la sección de emisión sobre una factura seleccionada, el sistema MUST NOT preseleccionar TOTAL ni PARCIAL — ninguna opción MUST quedar activa hasta que el cajero haga clic explícito en una de las dos. Esto aplica también a facturas con una NC parcial previa (ya no se infiere PARCIAL automáticamente). Una vez elegido TOTAL, MUST invocar `crearNotaCredito()` con `tipo=TOTAL` mediante un botón de confirmación dedicado DENTRO de la sección (no en el pie del modal), reutilizando el mismo handler existente sin alterar su lógica. PARCIAL MUST habilitar la columna de cantidad a devolver por línea, sin cambios respecto al comportamiento existente. Con ninguna opción elegida, el sistema MUST mostrar un estado neutro (sin alerta de TOTAL ni selector de líneas de PARCIAL).
(Previously: TOTAL era la selección por defecto — o PARCIAL si la factura ya tenía un reverso parcial — y su confirmación vivía en el pie del modal, en el mismo lugar físico que el botón de revelar la sección.)

#### Scenario: Ningún tipo preseleccionado al revelar

- GIVEN una factura seleccionada, con la sección de NC recién revelada
- WHEN el cajero observa la sección
- THEN ni "Total" ni "Parcial" aparecen activos, y no se muestra ningún botón de confirmación

#### Scenario: NC TOTAL reversa la factura completa

- GIVEN una factura seleccionada en el listado
- WHEN el cajero elige TOTAL y confirma con el botón dentro de la sección
- THEN se invoca `crearNotaCredito` con `tipo=TOTAL`, sin modificar su implementación

#### Scenario: NC PARCIAL habilita selección de líneas

- GIVEN una factura seleccionada con varias líneas
- WHEN el cajero elige PARCIAL
- THEN cada línea muestra un campo de cantidad a devolver, inicialmente en 0

#### Scenario: Factura con reverso parcial previo tampoco preselecciona

- GIVEN una factura que ya tiene una NC parcial aplicada
- WHEN el cajero revela la sección de NC
- THEN ninguna opción queda preseleccionada — debe elegir Parcial explícitamente

### Requirement: Pie del modal tras revelar la sección de NC

Una vez revelada la sección de emisión (botón "Emitir nota de crédito" presionado), el pie del modal MUST reducirse a `[Volver, Editar métodos de pago]` — el botón azul de revelar MUST desaparecer y NINGÚN botón de confirmación de NC (TOTAL ni PARCIAL) MUST aparecer en el pie; la confirmación vive exclusivamente dentro de la sección.
(Previously: el pie mostraba `[Volver, Editar métodos de pago, Confirmar Anulación]` cuando TOTAL estaba activo — el botón de confirmar ocupaba el mismo slot físico que el botón azul de revelar.)

#### Scenario: Pie reducido tras revelar

- GIVEN una factura seleccionada, sección de NC aún no revelada
- WHEN el cajero presiona "Emitir nota de crédito"
- THEN el pie pasa a mostrar solo "Volver" y "Editar métodos de pago" — sin botón de confirmación ni el botón azul original
