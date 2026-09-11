# clientes-detalle Specification

## Purpose

Pantalla dedicada de cliente (`/_app/clientes/gestion/$clienteId`): reemplaza el panel inline con saldo, estado de cuenta + reverso de abono, e historial de facturas via `FacturasEmpresaTable`.

## Requirements

### Requirement: Navegacion a pantalla dedicada

Click en fila, boton "Ver detalle" o menu contextual MUST invocar `navigate()` hacia `/clientes/gestion/$clienteId`. La lista MUST NOT usar grid-shrink ni ocultar columnas, y el panel inline (prop `onClose`) MUST NOT montarse mas.

#### Scenario: Click, "Ver detalle" o menu contextual navegan

- GIVEN una fila de cliente
- WHEN el usuario hace click, usa "Ver detalle" o el menu contextual
- THEN navega a `/clientes/gestion/$clienteId`, sin panel inline

#### Scenario: Lista mantiene ancho y volver funciona

- GIVEN el listado, o la pantalla de detalle abierta
- WHEN se visualiza la lista, o se navega hacia atras desde el detalle
- THEN la lista conserva columnas completas sin grid de 2 columnas, y volver regresa al listado

### Requirement: Resolucion de ruta y aislamiento por empresa_id

La ruta MUST resolver `clienteId` via route params, consultando SIEMPRE por `empresa_id` del usuario actual (Regla #11), con loading mientras resuelve. Un `clienteId` de otra empresa o inexistente MUST mostrar "no encontrado". Facturas y movimientos MUST filtrar tambien por `empresa_id`.

#### Scenario: clienteId valido resuelve, invalido no

- GIVEN un `clienteId` de la empresa actual, o inexistente/de otra empresa
- WHEN se navega a la ruta
- THEN el primero muestra loading y luego sus datos; el segundo muestra "no encontrado", sin datos ajenos

#### Scenario: Facturas y movimientos aislados

- GIVEN un cliente resuelto
- WHEN se cargan sus facturas y estado de cuenta
- THEN ambas consultas incluyen `empresa_id` en su `WHERE`

### Requirement: Historial de facturas con FacturasEmpresaTable

La seccion "Facturas" MUST reusar `FacturasEmpresaTable` filtrada al `clienteId` actual, con Total USD, Total Bs y badges de estado de pago (CONTADO/CREDITO/ABONADA) y reverso (TOTAL/PARCIAL) de `notas-credito-admin`. MUST mostrar estado vacio sin facturas. El tope de 50 filas de la query es limitacion CONOCIDA, no requirement nuevo.

#### Scenario: Facturas propias con badges correctos

- GIVEN un cliente con facturas en distintos estados
- WHEN se abre su pantalla
- THEN se listan solo sus facturas, con los badges correspondientes

#### Scenario: Cliente sin facturas

- GIVEN un cliente sin facturas
- WHEN se abre su pantalla
- THEN la seccion Facturas muestra estado vacio, sin error

### Requirement: Estado de cuenta y saldo con precision correcta

Saldo Actual MUST mostrarse con estilo de 3 estados (deuda/favor/neutral) desde el valor `NUMERIC` sin `parseFloat` intermedio (Regla #10). El filtro de "Estado de Cuenta" MUST tener por defecto el mes en curso. El contador del encabezado MUST coincidir siempre con las filas renderizadas.

#### Scenario: Rango de fechas por defecto es mes en curso

- GIVEN la pantalla recien abierta
- WHEN no se ha aplicado ningun filtro
- THEN el rango es el mes en curso

#### Scenario: Contador coincide con filas visibles

- GIVEN cualquier rango aplicado
- WHEN la tabla se renderiza
- THEN el numero del encabezado iguala las filas del cuerpo

#### Scenario: Saldo con estilo segun estado real

- GIVEN saldo deudor, a favor o neutral
- WHEN se muestra la card de Saldo Actual
- THEN el color corresponde al estado real, sin redondeo previo

### Requirement: Reverso de abono preservado

El flujo de reverso (PIN de supervisor sin `CXC_REVERSE`, dialog de razon obligatoria, permisos) MUST preservarse identico al panel anterior. `movimientos_cuenta`/pagos MUST seguir inmutables — el reverso MUST NOT editar ni borrar el original, solo crear el registro de reverso.

#### Scenario: Sin permiso pide PIN, con permiso lo salta

- GIVEN un usuario sin `CXC_REVERSE`
- WHEN intenta reversar un abono
- THEN se pide PIN antes del dialog de razon; con `CXC_REVERSE` pasa directo

#### Scenario: Razon obligatoria para confirmar

- GIVEN el dialog de razon abierto
- WHEN el campo esta vacio
- THEN el boton de confirmar permanece deshabilitado
