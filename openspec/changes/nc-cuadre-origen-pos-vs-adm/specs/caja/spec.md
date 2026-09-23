# Delta for caja

## ADDED Requirements

### Requirement: Clasificación de salidas NC por origen (POS vs Administración)

La función pura de clasificación MUST derivar el origen de cada salida de caja con `origen='NCR'` exclusivamente a partir de `notas_credito.liquidacion_modalidad` (nunca del texto de `concepto`). `liquidacion_modalidad === 'REFUND_TESORERIA'` MUST clasificar como **Admin**. Cualquier otro valor — incluyendo `EFECTIVO_REAL` y el caso `null`/`undefined` (join sin match, dato huérfano) — MUST clasificar como **POS**, preservando el comportamiento visual actual (badge único "NC") para todo lo que no sea explícitamente `REFUND_TESORERIA`.

#### Scenario: EFECTIVO_REAL clasifica como POS

- GIVEN una salida NCR con `liquidacion_modalidad = 'EFECTIVO_REAL'`
- WHEN se clasifica el origen
- THEN el resultado es `POS`

#### Scenario: REFUND_TESORERIA clasifica como Admin

- GIVEN una salida NCR con `liquidacion_modalidad = 'REFUND_TESORERIA'`
- WHEN se clasifica el origen
- THEN el resultado es `Admin`

#### Scenario: Modalidad ausente cae a POS (fallback seguro)

- GIVEN una salida NCR donde el JOIN a `notas_credito` no resuelve (`liquidacion_modalidad` es `null`)
- WHEN se clasifica el origen
- THEN el resultado es `POS`, igual que el comportamiento previo a este cambio

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

- GIVEN una sesión donde todas las salidas NC clasifican `POS` (ningún `REFUND_TESORERIA`)
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
