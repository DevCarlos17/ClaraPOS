# notas-credito-admin Specification

## Purpose

Ruta administrativa de "Facturas emitidas" (`/ventas/facturas-emitidas`): consulta empresa-wide de facturas y notas de crédito (sin depender de sesión de caja) más generación de NC reutilizando el motor `crearNotaCredito` (entryPoint `TRADICIONAL` + modalidad `AJUSTE_CXC`). Complementa `notas-credito-pos` (alcance de sesión activa, con PIN); no la modifica ni la reemplaza.

**Diferido a un change futuro (NO cubierto aquí, no debe marcarse como gap):** cableado de cuadre de caja (NC del día, ventas netas, métodos de pago en devoluciones, tabla de NC de sesión), sub-opción "Sesión de caja activa" para "Devolver dinero" (permanece deshabilitada — `nc-refund-tesoreria` solo habilitó la sub-opción "Tesorería"), reembolso vía tesorería registrado como nueva CxC cuando excede el monto de la NC ("excedente como nueva CxC"), regla de sobregiro bancario (por usuario o por cuenta) para egresos de tesorería, badge "vía administración", impresión/compartir NC. Persistencia de flag `entry_point`/`via_administracion` en schema también diferida.

**Resuelto por `nc-refund-tesoreria`:** el comportamiento real de "Devolver dinero" → sub-opción "Tesorería" (modalidad `REFUND_TESORERIA`) — ver requisito "Selector 'Devolver dinero' / 'Crédito a favor' — con sub-opciones de tesorería" más abajo. El modal de consulta de detalle de factura (`ConsultaFacturaModal`) y su sección de evolución (textos de reverso, abonos, saldo a favor) fueron resueltos por un change posterior (`consulta-factura-evolucion`) y extendidos por `nc-refund-tesoreria` para mostrar también qué cuenta(s) de tesorería pagaron cada reembolso.

## Requirements

### Requirement: Sección "Facturas emitidas" con pestañas

El ítem del sidebar antes rotulado "Nota de Crédito" MUST estar rotulado "Facturas emitidas", en la ruta `/ventas/facturas-emitidas` (renombrada desde `/ventas/notas-credito`). La ruta MUST presentar dos pestañas: **Facturas** (primaria, activa por defecto) y **Notas de crédito** (secundaria). El acceso a la ruta completa MUST estar gated únicamente por `PERMISSIONS.SALES_VOID` — sin PIN adicional ni permiso separado (no requiere `SALES_NOTA_CREDITO`).

#### Scenario: Usuario sin permiso no accede

- GIVEN un usuario sin `PERMISSIONS.SALES_VOID`
- WHEN intenta navegar a la ruta "Facturas emitidas"
- THEN no ve el ítem en el sidebar ni puede acceder a ninguna pestaña

#### Scenario: Pestaña por defecto es Facturas

- GIVEN un usuario con `SALES_VOID` que entra a la ruta
- WHEN la página carga
- THEN la pestaña activa es "Facturas"

#### Scenario: Cambio entre pestañas

- GIVEN la ruta abierta en la pestaña Facturas
- WHEN el usuario selecciona "Notas de crédito"
- THEN el contenido cambia a esa pestaña y puede volver a Facturas sin perder acceso

### Requirement: Pestaña Facturas — listado empresa-wide con búsqueda unificada y estado foldeado

La pestaña Facturas MUST listar ventas de **toda la empresa** (filtro `empresa_id`), sin restricción por `sesion_caja_id`. MUST proveer rango de fechas (default mes en curso) y UN ÚNICO campo de búsqueda de texto libre — no campos separados por `nro_factura`/cliente/RIF. Ese campo MUST filtrar por coincidencia (OR) contra `nro_factura`, nombre de cliente y RIF de cliente, y ADEMÁS MUST detectar, como coincidencia EXACTA de palabra clave (no substring, insensible a mayúsculas y a tildes), los términos `contado`, `credito`/`crédito`, `abonada`, `reverso parcial` y `reverso total`; al detectar una de esas palabras clave MUST agregar la cláusula de estado correspondiente como una rama MÁS del mismo OR (nunca en reemplazo del match por texto). `abonada` MUST usar el mismo criterio que `derivarEstadoPago` (`saldo_pend_usd > 0.005 AND saldo_pend_usd < total_usd - 0.005`). No existe un `<select>` de Estado separado. Cada fila MUST exponer la acción "Aplicar nota de crédito" que abre el modal compartido, deshabilitada cuando la factura ya tiene reverso total. ADEMÁS, cada fila MUST abrir `ConsultaFacturaModal` (detalle fiscal + evolución) al hacer click en cualquier punto de la fila que no sea el botón "Aplicar nota de crédito"; ambas interacciones (row-click y botón) MUST ser mutuamente excluyentes en el mismo click (el botón llama `e.stopPropagation()`).

#### Scenario: Carga por defecto limitada al mes en curso

- GIVEN un usuario con acceso que abre la pestaña Facturas
- WHEN no ha aplicado ningún filtro
- THEN el listado muestra solo facturas emitidas en el mes en curso

#### Scenario: Rango de fechas amplía el resultado

- GIVEN el listado en su carga por defecto
- WHEN el usuario aplica un rango de fechas que incluye meses anteriores
- THEN el listado incluye facturas fuera del mes en curso dentro de ese rango

#### Scenario: Búsqueda por número de factura, cliente o RIF

- GIVEN un listado con varias facturas de distintos clientes
- WHEN el usuario escribe un `nro_factura`, un nombre de cliente o un RIF en el buscador único
- THEN el listado muestra solo las facturas que coinciden con ese texto

#### Scenario: Búsqueda por palabra clave de estado

- GIVEN un listado con facturas en distintos estados (Contado, Crédito, Abonada, Reverso Total, Reverso Parcial)
- WHEN el usuario escribe exactamente `contado`, `credito`, `abonada`, `reverso parcial` o `reverso total` en el buscador (con o sin tildes/mayúsculas)
- THEN el listado muestra solo las facturas en ese estado, sin perder la posibilidad de match por texto normal

#### Scenario: Palabra suelta no exacta no dispara el filtro de estado

- GIVEN un cliente cuyo nombre contiene literalmente la palabra "Reverso"
- WHEN el usuario busca "reverso" (sin "parcial"/"total")
- THEN el sistema no aplica ninguna cláusula de estado — solo el match de texto normal, preservando ese resultado

#### Scenario: Sin resultados

- GIVEN filtros que no coinciden con ninguna factura
- WHEN el listado se renderiza
- THEN se muestra un estado vacío, sin error

#### Scenario: Acción disponible por fila

- GIVEN cualquier factura visible en el listado sin reverso total
- WHEN el usuario observa la fila
- THEN existe la acción "Aplicar nota de crédito", habilitada, que abre el modal compartido

#### Scenario: Acción deshabilitada en factura con reverso total

- GIVEN una factura con `tiene_reverso_total = 1`
- WHEN el usuario observa la fila
- THEN la acción "Aplicar nota de crédito" aparece deshabilitada

#### Scenario: Click en fila abre el detalle de consulta

- GIVEN una fila visible en el listado
- WHEN el usuario hace click en la fila fuera del botón "Aplicar nota de
  crédito"
- THEN se abre `ConsultaFacturaModal` con el detalle fiscal completo y la
  evolución (reversos/abonos/saldo a favor) de esa factura

#### Scenario: Click en el botón de acción no abre el detalle de consulta

- GIVEN una fila visible en el listado con el botón "Aplicar nota de
  crédito" habilitado
- WHEN el usuario hace click en ese botón
- THEN se abre `CrearNcrModal` (comportamiento existente sin cambios) y
  `ConsultaFacturaModal` permanece cerrado

#### Scenario: Los dos modales de la fila son independientes

- GIVEN `ConsultaFacturaModal` abierto para la factura A
- WHEN el usuario lo cierra y luego hace click en "Aplicar nota de
  crédito" de la factura B
- THEN `CrearNcrModal` abre con B sin que quede ningún estado residual de
  la apertura anterior de `ConsultaFacturaModal`

### Requirement: Fila atenuada para facturas con reverso total

Toda fila del listado de la pestaña Facturas cuya factura tenga `tiene_reverso_total = 1` MUST mostrarse visualmente atenuada (color de texto tenue, heredable — nunca `opacity`, que atenuaría también el badge). El badge "Reverso Total" de esa fila MUST conservar su color explícito, sin verse afectado por la atenuación.

#### Scenario: Factura con reverso total aparece atenuada

- GIVEN una factura con `tiene_reverso_total = 1`
- WHEN se renderiza su fila en el listado
- THEN el texto de la fila se muestra atenuado, pero el badge "Reverso Total" mantiene su color normal

#### Scenario: Factura sin reverso total no se atenúa

- GIVEN una factura sin reverso total (o solo con reverso parcial)
- WHEN se renderiza su fila en el listado
- THEN la fila no lleva ninguna marca de atenuación

### Requirement: Pestaña Notas de crédito — búsqueda unificada, sin filtro de estado ni tipo

La pestaña Notas de crédito MUST mostrar el listado de NC de la empresa con rango de fechas (default mes en curso) y UN ÚNICO campo de búsqueda de texto libre que filtre por coincidencia (OR) contra `nro_ncr`, nombre de cliente y RIF de cliente. Esta pestaña MUST NOT tener filtro de estado ni de tipo (TOTAL/PARCIAL) — ninguna de las dos variantes (select separado o palabra clave dentro del buscador) está disponible aquí, a diferencia de la pestaña Facturas. Esta pestaña MUST NOT tener ningún control de tipo "Ver todo el historial" — el rango de fechas es el único control de amplitud, sin escape hatch de historial completo. El buscador de facturas para reversar (`useBuscarFacturaParaAnular`, existente antes de este change) fue RETIRADO de esta pestaña: seleccionar una factura y aplicarle NC se hace exclusivamente desde la pestaña Facturas.

#### Scenario: Carga por defecto limitada al mes en curso

- GIVEN un usuario que abre la pestaña Notas de crédito
- WHEN no ha aplicado ningún filtro
- THEN el listado muestra solo NC emitidas en el mes en curso

#### Scenario: Búsqueda por número de NC, cliente o RIF

- GIVEN un listado con NC de distintos clientes
- WHEN el usuario escribe un `nro_ncr`, un nombre de cliente o un RIF en el buscador único
- THEN el listado muestra solo las NC que coinciden con ese texto

#### Scenario: Filtros combinables

- GIVEN el listado de NC
- WHEN el usuario combina rango de fechas y el buscador de texto
- THEN el resultado respeta ambos filtros aplicados simultáneamente

#### Scenario: Sin filtro de estado ni de tipo disponible

- GIVEN la pestaña Notas de crédito abierta
- WHEN el usuario busca algún control para filtrar por TOTAL/PARCIAL o por estado
- THEN no existe ningún `<select>` ni palabra clave reservada para ese propósito en esta pestaña

#### Scenario: Sin escape hatch de historial completo

- GIVEN la pestaña Notas de crédito abierta
- WHEN el usuario busca un botón para ver todo el historial sin límite de fecha
- THEN no existe ese control — el rango `Desde`/`Hasta` es el único mecanismo de amplitud

### Requirement: Generación de NC desde la ruta administrativa

El sistema MUST permitir reversar **cualquier factura de la empresa** (no solo de la sesión activa) desde la pestaña Facturas, **sin solicitar PIN**. El modal MUST reutilizar `FacturaDetallePanel` y `SeleccionLineasNc` sin alterar su lógica. La emisión MUST invocar `crearNotaCredito` con `entryPoint: 'TRADICIONAL'` y modalidad `AJUSTE_CXC`, respetando TOTAL/PARCIAL, límites de cantidad por línea y `unidades.es_decimal` (mismas reglas que `notas-credito-pos`). La emisión MUST escribir movimientos de reverso de kardex y el ajuste de CxC correspondiente, y MUST NOT crear ningún registro de sesión de caja, caja fuerte o `movimientos_metodo_cobro` en este change.

#### Scenario: Reversar factura fuera de la sesión activa

- GIVEN una factura de una sesión de caja ya cerrada
- WHEN el usuario la selecciona en la pestaña Facturas y aplica NC
- THEN el modal la acepta y permite continuar (a diferencia del flujo POS)

#### Scenario: Emisión sin solicitud de PIN

- GIVEN un usuario con `SALES_VOID` que abrió el modal
- WHEN confirma la emisión de la NC
- THEN el sistema no solicita ningún PIN en ningún punto del flujo

#### Scenario: NC TOTAL y PARCIAL soportadas

- GIVEN una factura seleccionada
- WHEN el usuario elige TOTAL o PARCIAL (con selección de líneas válida)
- THEN se invoca `crearNotaCredito` con `entryPoint: 'TRADICIONAL'` y `AJUSTE_CXC`, sin alterar la venta original

#### Scenario: Sin efecto en caja o sesión

- GIVEN una NC emitida desde esta ruta
- WHEN se inspeccionan los registros creados
- THEN existen movimientos de kardex y de CxC, pero ningún registro de sesión de caja, caja fuerte o método de cobro

### Requirement: Selector "Devolver dinero" / "Crédito a favor" — con sub-opciones de tesorería

El modal MUST mostrar un selector con dos opciones: "Devolver dinero" y "Crédito a favor". "Devolver dinero" MUST estar habilitada (solo entry point `TRADICIONAL`). Al seleccionarla, el modal MUST revelar dos sub-opciones: "Tesorería" (seleccionable) y "Sesión de caja activa" (visible pero deshabilitada, con indicación "Próximamente"). Seleccionar "Tesorería" MUST revelar el mini-formulario de cuenta(s)/monto (selector de cuenta con saldo disponible + monto en moneda de la cuenta + referencia opcional por línea + cálculo en vivo de pendiente por reembolsar). "Crédito a favor" MUST seguir resultando siempre en `SALDO_FAVOR` (mapeo pre-existente sin cambios — ver nota de desviación abajo); confirmar la emisión con "Tesorería" seleccionada y datos válidos MUST invocar `crearNotaCredito` con modalidad `REFUND_TESORERIA`.

> **Nota de desviación (documentada en `nc-refund-tesoreria`, ver `verify-report.md`)**: el delta original de este change pedía que "Crédito a favor" resultara en `AJUSTE_CXC`. El código y los tests pre-existentes (no tocados por este change) siempre mapearon "Crédito a favor" a `SALDO_FAVOR`; ese comportamiento se preservó deliberadamente porque cambiarlo era ortogonal a `REFUND_TESORERIA` y no tenía tests que lo respaldaran. Se dejó como está y se flageó para el autor del spec — si `AJUSTE_CXC` era realmente la intención, requiere su propio change dedicado.

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

#### Scenario: Emisión vía Crédito a favor sigue siendo SALDO_FAVOR

- GIVEN "Crédito a favor" seleccionada
- WHEN el usuario confirma la emisión
- THEN la NC se genera vía `SALDO_FAVOR`, sin cambios respecto al comportamiento existente

#### Scenario: Emisión vía Tesorería invoca REFUND_TESORERIA

- GIVEN "Devolver dinero" → "Tesorería" con cuenta(s) y monto(s) válidos, sin exceder el monto de la NC
- WHEN el usuario confirma la emisión
- THEN se invoca `crearNotaCredito` con modalidad `REFUND_TESORERIA` y `egresoParams` construido como array desde el mini-formulario

### Requirement: Saldo disponible visible en el selector de cuenta de tesorería

El selector de cuenta(s) de la sub-opción "Tesorería" MUST mostrar, junto a cada banco/caja fuerte listado, su saldo disponible actual (reusando `useCuentasTesoreria()`), en la moneda nativa de la cuenta.

#### Scenario: Selector muestra saldo por cuenta

- GIVEN el mini-formulario de Tesorería abierto
- WHEN el usuario abre el selector de cuenta
- THEN cada opción de banco/caja fuerte muestra su saldo disponible actual junto al nombre, en su moneda nativa

### Requirement: Aislamiento multi-tenant en consultas nuevas

Toda consulta nueva introducida en este change (hook de facturas empresa-wide, filtros de la pestaña Notas de crédito, incluida la sub-cláusula de estado foldeada en la búsqueda de Facturas) MUST filtrar por `empresa_id` del usuario autenticado (vía `useCurrentUser()`) como primer parámetro/cláusula, sin excepción. Ninguna combinación de filtros MUST exponer datos de otra empresa.

#### Scenario: Aislamiento en pestaña Facturas

- GIVEN un usuario de la empresa A
- WHEN aplica cualquier combinación de filtros (incluida una palabra clave de estado) en la pestaña Facturas
- THEN nunca ve facturas de otra empresa

#### Scenario: Aislamiento en pestaña Notas de crédito

- GIVEN un usuario de la empresa A
- WHEN aplica cualquier combinación de filtros en la pestaña Notas de crédito
- THEN nunca ve NC de otra empresa

#### Scenario: Query del hook siempre incluye empresa_id

- GIVEN el nuevo hook de facturas empresa-wide
- WHEN se ejecuta con cualquier parámetro de filtro, incluida una búsqueda que dispare la cláusula de estado
- THEN su cláusula `WHERE` incluye `empresa_id = ?` como primer parámetro, sin excepción
