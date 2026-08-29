# Delta for Traspasos Inventario

## ADDED Requirements

### Requirement: Exclusión Mutua entre Depósito Origen y Destino

El formulario MUST excluir el depósito ya seleccionado en un select de las opciones del otro. El sistema (schema + hook + trigger DB) MUST rechazar además cualquier traspaso con `origen == destino`, con error en español.

#### Scenario: Elegir origen excluye esa opción del destino
- GIVEN depósitos activos A y B
- WHEN el usuario selecciona A como origen
- THEN el select de destino ya no muestra A

#### Scenario: Elegir destino excluye esa opción del origen
- GIVEN B ya seleccionado como destino
- WHEN el usuario abre el select de origen
- THEN B no aparece entre las opciones

#### Scenario: Origen igual a destino es rechazado por el sistema
- GIVEN una llamada a `crearTraspaso` con `origen_id == destino_id`
- WHEN se intenta procesar
- THEN se rechaza antes de escribir movimientos, con error en español

### Requirement: Búsqueda de Productos Limitada al Origen y Bloqueo de Selección

El buscador MUST listar solo productos con stock > 0 en el depósito ORIGEN. El select de origen MUST bloquearse con al menos un artículo en la lista (incluida carga de plantilla), y desbloquearse al vaciar la tabla.

#### Scenario: Búsqueda solo devuelve productos con stock en origen
- GIVEN origen con P1 (stock 5) y P2 (stock 0)
- WHEN el usuario busca productos
- THEN solo P1 aparece en los resultados

#### Scenario: Agregar el primer artículo bloquea el select de origen
- GIVEN formulario sin artículos, origen habilitado
- WHEN se agrega el primer artículo
- THEN el select de origen queda deshabilitado

#### Scenario: Cargar plantilla bloquea el select de origen
- GIVEN formulario sin artículos
- WHEN se carga una plantilla con líneas
- THEN el select de origen queda deshabilitado

#### Scenario: Vaciar la tabla desbloquea el select de origen
- GIVEN formulario con artículos y origen bloqueado
- WHEN se eliminan todos los artículos
- THEN el select de origen vuelve a habilitarse

### Requirement: Límite de Cantidad Disponible y Habilitación Condicional del Botón

Ninguna línea MUST exceder el stock disponible en origen. La cantidad disponible MUST reaccionar en tiempo real a ventas concurrentes (consulta reactiva PowerSync existente); si el stock cae bajo la cantidad seleccionada, el input MUST resaltarse en rojo. El botón "Registrar Traspaso" MUST deshabilitarse si: (a) origen == destino, (b) falta origen o destino, (c) alguna línea excede el stock en origen, o (d) alguna línea referencia un producto ausente en origen o inexistente en BD.

#### Scenario: Cantidad mayor al disponible resalta el input y desactiva el botón
- GIVEN línea con producto P, stock disponible 5
- WHEN se ingresa cantidad 8
- THEN el input se resalta en rojo y el botón permanece deshabilitado

#### Scenario: Venta concurrente reduce el stock bajo la cantidad seleccionada
- GIVEN línea con cantidad 10 y stock disponible 10
- WHEN sincroniza una venta concurrente dejando el disponible en 9
- THEN el input se resalta en rojo y el botón se deshabilita

#### Scenario: Cantidades válidas habilitan el botón
- GIVEN origen y destino distintos, todas las líneas con cantidad <= disponible
- WHEN no hay otros errores
- THEN el botón "Registrar Traspaso" está habilitado

#### Scenario: Falta origen o destino deshabilita el botón
- GIVEN líneas válidas pero sin origen o destino seleccionado
- WHEN se revisa el formulario
- THEN el botón permanece deshabilitado

#### Scenario: Producto ausente en origen o inexistente en BD deshabilita el botón
- GIVEN una línea sin stock registrado en origen o sin producto en BD
- WHEN se revisa el formulario
- THEN el botón permanece deshabilitado

### Requirement: El Modal No Se Cierra ante Errores de Validación

Ante error de validación o de envío, el modal MUST permanecer abierto, mostrar el error, y permitir corregir y reintentar sin perder los datos ingresados.

#### Scenario: Envío con línea inválida mantiene el modal abierto
- GIVEN línea con cantidad que excede el stock
- WHEN el usuario intenta registrar el traspaso
- THEN el modal permanece abierto con el error visible, y el resto del formulario se conserva

### Requirement: Aislamiento Multi-tenant en Lectura de Stock por Depósito

`leerStockDeposito` MUST filtrar por `empresa_id` además de `producto_id` y `deposito_id`, consistente con `upsertStockDeposito`.

#### Scenario: Lectura de stock aislada por empresa
- GIVEN dos empresas con estructura equivalente de productos/depósitos
- WHEN se lee el stock disponible para un traspaso de la empresa A
- THEN solo se consideran registros de `inventario_stock` de la empresa A
