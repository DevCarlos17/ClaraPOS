# notas-credito-admin Specification

## Purpose

Ruta administrativa de "Facturas emitidas": consulta empresa-wide de facturas y notas de crédito (sin depender de sesión de caja) más generación de NC reutilizando el motor `crearNotaCredito` (entryPoint `TRADICIONAL` + modalidad `AJUSTE_CXC`). Complementa `notas-credito-pos` (alcance de sesión activa, con PIN); no la modifica ni la reemplaza.

**Diferido a un change futuro (NO cubierto aquí, no debe marcarse como gap):** cableado de cuadre de caja (NC del día, ventas netas, métodos de pago en devoluciones, tabla de NC de sesión), comportamiento real de "Devolver dinero" (sesión/tesorería), `REFUND_TESORERIA`, badge "vía administración", impresión/compartir NC. Persistencia de flag `entry_point`/`via_administracion` en schema también diferida.

## Requirements

### Requirement: Sección "Facturas emitidas" con pestañas

El ítem del sidebar antes rotulado "Nota de Crédito" MUST renombrarse a "Facturas emitidas". La ruta MUST presentar dos pestañas: **Facturas** (primaria, activa por defecto) y **Notas de crédito** (secundaria). El acceso a la ruta completa MUST estar gated únicamente por `PERMISSIONS.SALES_VOID` — sin PIN adicional ni permiso separado (no requiere `SALES_NOTA_CREDITO`).

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

### Requirement: Pestaña Facturas — listado empresa-wide

La pestaña Facturas MUST listar ventas de **toda la empresa** (filtro `empresa_id`), sin restricción por `sesion_caja_id`. MUST proveer filtros: rango de fechas, `nro_factura`, nombre de cliente, RIF de cliente. La carga inicial (sin filtros aplicados) MUST mostrar solo facturas del **mes en curso**. Cada fila MUST exponer la acción "Aplicar nota de crédito" que abre el modal compartido de generación de NC.

#### Scenario: Carga por defecto limitada al mes en curso

- GIVEN un usuario con acceso que abre la pestaña Facturas
- WHEN no ha aplicado ningún filtro
- THEN el listado muestra solo facturas emitidas en el mes en curso

#### Scenario: Rango de fechas amplía el resultado

- GIVEN el listado en su carga por defecto
- WHEN el usuario aplica un rango de fechas que incluye meses anteriores
- THEN el listado incluye facturas fuera del mes en curso dentro de ese rango

#### Scenario: Filtro por número de factura

- GIVEN un listado con varias facturas
- WHEN el usuario escribe un `nro_factura`
- THEN el listado muestra solo las facturas cuyo número coincide

#### Scenario: Filtro por cliente o RIF

- GIVEN un listado con facturas de distintos clientes
- WHEN el usuario escribe un nombre de cliente o un RIF
- THEN el listado muestra solo las facturas de ese cliente

#### Scenario: Sin resultados

- GIVEN filtros que no coinciden con ninguna factura
- WHEN el listado se renderiza
- THEN se muestra un estado vacío, sin error

#### Scenario: Acción disponible por fila

- GIVEN cualquier factura visible en el listado
- WHEN el usuario observa la fila
- THEN existe la acción "Aplicar nota de crédito" que abre el modal compartido

### Requirement: Pestaña Notas de crédito — filtros ampliados

La pestaña Notas de crédito MUST conservar la tabla y el buscador ya existentes de `notas-credito-page.tsx`, agregando filtros: rango de fechas, `nro` de NC, tipo (TOTAL/PARCIAL), nombre de cliente, RIF. La carga inicial MUST mostrar solo NC del **mes en curso**.

#### Scenario: Carga por defecto limitada al mes en curso

- GIVEN un usuario que abre la pestaña Notas de crédito
- WHEN no ha aplicado ningún filtro nuevo
- THEN el listado muestra solo NC emitidas en el mes en curso

#### Scenario: Filtro por tipo TOTAL o PARCIAL

- GIVEN un listado con NC de ambos tipos
- WHEN el usuario filtra por TOTAL o por PARCIAL
- THEN el listado muestra solo NC de ese tipo

#### Scenario: Filtros combinables

- GIVEN el listado de NC
- WHEN el usuario combina rango de fechas, cliente y tipo
- THEN el resultado respeta todos los filtros aplicados simultáneamente

#### Scenario: Buscador existente sigue funcionando

- GIVEN el buscador previo de `notas-credito-page.tsx`
- WHEN el usuario lo usa sin tocar los filtros nuevos
- THEN filtra el listado igual que antes de este change

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

### Requirement: Selector "Devolver dinero" / "Crédito a favor" como placeholder

El modal MUST mostrar un selector con dos opciones: "Devolver dinero" y "Crédito a favor". "Devolver dinero" MUST estar visible pero deshabilitada (no seleccionable), con indicación de que llega en una entrega futura. Solo "Crédito a favor" MUST ser seleccionable, y su confirmación siempre MUST resultar en el camino `AJUSTE_CXC` descrito arriba.

#### Scenario: Ambas opciones visibles

- GIVEN el modal abierto con una factura seleccionada
- WHEN el usuario observa el selector de origen de reverso
- THEN ve "Devolver dinero" y "Crédito a favor"

#### Scenario: "Devolver dinero" deshabilitada

- GIVEN el selector visible
- WHEN el usuario intenta seleccionar "Devolver dinero"
- THEN la opción no responde (deshabilitada) y muestra una indicación de "próximamente"

#### Scenario: Emisión siempre vía "Crédito a favor"

- GIVEN "Crédito a favor" como única opción seleccionable
- WHEN el usuario confirma la emisión
- THEN la NC se genera vía `AJUSTE_CXC`, igual que el requirement de generación de NC

### Requirement: Aislamiento multi-tenant en consultas nuevas

Toda consulta nueva introducida en este change (hook de facturas empresa-wide, filtros de la pestaña Notas de crédito) MUST filtrar por `empresa_id` del usuario autenticado (vía `useCurrentUser()`). Ninguna combinación de filtros MUST exponer datos de otra empresa.

#### Scenario: Aislamiento en pestaña Facturas

- GIVEN un usuario de la empresa A
- WHEN aplica cualquier combinación de filtros en la pestaña Facturas
- THEN nunca ve facturas de otra empresa

#### Scenario: Aislamiento en pestaña Notas de crédito

- GIVEN un usuario de la empresa A
- WHEN aplica cualquier combinación de filtros en la pestaña Notas de crédito
- THEN nunca ve NC de otra empresa

#### Scenario: Query del hook siempre incluye empresa_id

- GIVEN el nuevo hook de facturas empresa-wide
- WHEN se ejecuta con cualquier parámetro de filtro
- THEN su cláusula `WHERE` incluye `empresa_id = ?` sin excepción
