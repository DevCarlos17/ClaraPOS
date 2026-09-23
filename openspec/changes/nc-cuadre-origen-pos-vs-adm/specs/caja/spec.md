# Delta for caja

## ADDED Requirements

### Requirement: Clasificación de salidas NC por origen (POS vs Administración)

La función pura de clasificación MUST derivar el origen de cada salida de caja con `origen='NCR'` exclusivamente a partir de `notas_credito.sesion_caja_id` (nunca de `liquidacion_modalidad` ni del texto de `concepto`). `notas_credito.sesion_caja_id` es el discriminador real de punto de entrada: se escribe UNA sola vez al INSERT del header de la NC (`entryPoint === 'POS' ? sesionCajaActivaId ?? null : null`) y nunca se actualiza después. Un `sesion_caja_id` no nulo y no vacío MUST clasificar como **POS**. `null`, `undefined` o cadena vacía (join sin match, dato huérfano, o entry point Admin/Tradicional que nunca vincula sesión) MUST clasificar como **Admin**.

`liquidacion_modalidad` (EFECTIVO_REAL vs REFUND_TESORERIA) MUST NOT usarse como discriminador de origen: indica el MECANISMO de reembolso (cajón del cajero vs tesorería), no el PUNTO DE ENTRADA. Bug QA confirmado en la primera implementación de este cambio: el flujo POS "Devolver dinero" (`emitirNcRefund`) hardcodea `modalidad: 'REFUND_TESORERIA'` con `entryPoint: 'POS'`, por lo que clasificar por modalidad marcaba erróneamente esas NC-POS como Admin.

#### Scenario: NC con sesión de caja asociada clasifica como POS

- GIVEN una salida NCR donde `notas_credito.sesion_caja_id` no es `null` ni vacío
- WHEN se clasifica el origen
- THEN el resultado es `POS`

#### Scenario: NC sin sesión de caja asociada clasifica como Admin

- GIVEN una salida NCR donde `notas_credito.sesion_caja_id` es `null`
- WHEN se clasifica el origen
- THEN el resultado es `Admin`

#### Scenario: POS "devolver dinero" (REFUND_TESORERIA con entryPoint POS) clasifica como POS

- GIVEN una NC emitida desde el POS express vía "Devolver dinero" (`emitirNcRefund`, que hardcodea `modalidad: 'REFUND_TESORERIA'` con `entryPoint: 'POS'`), cuyo header persiste `sesion_caja_id = sesionCajaActivaId`
- WHEN se clasifica el origen
- THEN el resultado es `POS`, sin importar la modalidad de liquidación

#### Scenario: Admin REFUND_TESORERIA→SESION_CAJA clasifica como Admin aunque el egreso caiga en la sesión

- GIVEN una NC emitida desde el módulo Admin (Consulta de Factura) con modalidad `REFUND_TESORERIA` y destino `SESION_CAJA`, donde el egreso de `movimientos_metodo_cobro` se escribe con la `sesion_caja_id` elegida por el admin, pero el HEADER de la NC (`notas_credito.sesion_caja_id`) permanece `null` porque el entry point es Admin
- WHEN se clasifica el origen
- THEN el resultado es `Admin`, aunque el dinero aterrice en esa sesión de caja

### Requirement: Badge por fila refleja el origen de la salida NC

Cada fila de "Salidas de Caja" con `origen='NCR'` MUST mostrar un badge que distinga su origen: el badge existente (p. ej. `NC`) para clasificación `POS`, y una variante distinguible (p. ej. `NC · Adm`) para clasificación `Admin`. Ambas variantes MUST reutilizar el mismo patrón visual/tokens ya usados por los badges de Tesorería y CxP en la misma tabla — solo cambia el texto/color de acento, no el layout ni el tamaño de fila.

#### Scenario: Salida NC-POS muestra el badge original

- GIVEN una fila de salida clasificada `POS`
- WHEN se renderiza la tabla "Salidas de Caja"
- THEN la fila muestra el badge `NC` (idéntico al comportamiento anterior a este cambio)

#### Scenario: Salida NC-Admin muestra un badge distinguible

- GIVEN una fila de salida clasificada `Admin`
- WHEN se renderiza la tabla "Salidas de Caja"
- THEN la fila muestra un badge visualmente distinto que indica origen administrativo (p. ej. `NC · Adm`), reutilizando el mismo patrón de badge (tamaño, forma, tipografía) ya usado en la tabla

### Requirement: Subtotales por origen bajo "Salidas de Caja"

Cuando existan salidas NC de ambos orígenes en la sesión, la tabla MUST mostrar un subtotal separado por origen (POS y Admin), replicando el patrón de fila-subtotal ya existente en la tabla de cobranzas CxC. Cada subtotal MUST separar el monto por moneda nativa (USD vs Bs), sin convertir entre monedas — igual que ya hace `splitEgresosArqueo` para el total agregado de devoluciones NC. Si en la sesión solo existe un origen, el subtotal del origen ausente MUST NOT renderizarse (ni como fila vacía ni como $0.00).

#### Scenario: Sesión con NC de ambos orígenes

- GIVEN una sesión con salidas NC clasificadas `POS` y `Admin`
- WHEN se abre la tabla "Salidas de Caja"
- THEN se muestran dos subtotales — uno por origen — cada uno con su monto por moneda nativa

#### Scenario: Sesión con NC de un solo origen

- GIVEN una sesión donde todas las salidas NC tienen `notas_credito.sesion_caja_id` no nulo (todas clasifican `POS`)
- WHEN se abre la tabla "Salidas de Caja"
- THEN solo se muestra el subtotal `POS`; no aparece un subtotal `Admin` vacío o en cero

#### Scenario: Sesión sin salidas NC

- GIVEN una sesión sin movimientos `origen='NCR'`
- WHEN se abre la tabla "Salidas de Caja"
- THEN no se renderiza ningún subtotal por origen NC (comportamiento actual sin cambios)

#### Scenario: Subtotales con monedas mixtas

- GIVEN salidas NC del mismo origen en USD y en Bs dentro de la misma sesión
- WHEN se calcula el subtotal de ese origen
- THEN el subtotal reporta el monto USD y el monto Bs-nativo por separado, sin sumarlos entre sí

### Requirement: Invariante display-only — ningún total de arqueo cambia

El desglose por origen MUST ser puramente una re-agrupación visual de filas ya sumadas en el total existente de "Devoluciones (NC)". La suma del subtotal `POS` + subtotal `Admin` (por moneda) MUST ser exactamente igual al total de devoluciones NC ya mostrado hoy (`devolucionesNcUsd` / `devolucionesNcBsNativo`). Ningún valor de `egresosUsd`, `egresosBsNativo`, ni el invariante `retiros + devolucionesNc + vueltos == total egresos` MUST cambiar como resultado de este desglose.

#### Scenario: La suma de subtotales reconstruye el total existente

- GIVEN una sesión con salidas NC mixtas (POS y Admin) en USD y Bs
- WHEN se suman `subtotalPosUsd + subtotalAdminUsd` y `subtotalPosBsNativo + subtotalAdminBsNativo`
- THEN cada suma es exactamente igual a `devolucionesNcUsd` y `devolucionesNcBsNativo` respectivamente, sin diferencia de redondeo

#### Scenario: El arqueo teórico no cambia de valor

- GIVEN una sesión con salidas NC antes y después de activar el desglose visual
- WHEN se compara el Arqueo Teórico (`retiros`, `devolucionesNc`, `vueltos`, total egresos)
- THEN todos los valores son idénticos a los que mostraba el cuadre antes de este cambio
</content>
