# Delta for notas-credito-admin

## MODIFIED Requirements

### Requirement: Pestaña Facturas — listado empresa-wide con búsqueda unificada y estado foldeado

La pestaña Facturas MUST listar ventas de **toda la empresa** (filtro
`empresa_id`), sin restricción por `sesion_caja_id`. MUST proveer rango de
fechas (default mes en curso) y UN ÚNICO campo de búsqueda de texto libre
— no campos separados por `nro_factura`/cliente/RIF. Ese campo MUST filtrar
por coincidencia (OR) contra `nro_factura`, nombre de cliente y RIF de
cliente, y ADEMÁS MUST detectar, como coincidencia EXACTA de palabra clave
(no substring, insensible a mayúsculas y a tildes), los términos
`contado`, `credito`/`crédito`, `abonada`, `reverso parcial` y
`reverso total`; al detectar una de esas palabras clave MUST agregar la
cláusula de estado correspondiente como una rama MÁS del mismo OR (nunca en
reemplazo del match por texto). `abonada` MUST usar el mismo criterio que
`derivarEstadoPago` (`saldo_pend_usd > 0.005 AND saldo_pend_usd < total_usd
- 0.005`). No existe un `<select>` de Estado separado. Cada fila MUST
exponer la acción "Aplicar nota de crédito" que abre el modal compartido,
deshabilitada cuando la factura ya tiene reverso total. ADEMÁS, cada fila
MUST abrir `ConsultaFacturaModal` (detalle fiscal + evolución) al hacer
click en cualquier punto de la fila que no sea el botón "Aplicar nota de
crédito"; ambas interacciones (row-click y botón) MUST ser mutuamente
excluyentes en el mismo click.
(Previously: no incluía la apertura de detalle por click en fila — quedaba
diferida, ver nota de la sección Purpose.)

#### Scenario: Carga por defecto limitada al mes en curso

- GIVEN un usuario con acceso que abre la pestaña Facturas
- WHEN no ha aplicado ningún filtro
- THEN el listado muestra solo facturas emitidas en el mes en curso

#### Scenario: Rango de fechas amplía el resultado

- GIVEN el listado en su carga por defecto
- WHEN el usuario aplica un rango de fechas que incluye meses anteriores
- THEN el listado incluye facturas fuera del mes en curso dentro de ese
  rango

#### Scenario: Búsqueda por número de factura, cliente o RIF

- GIVEN un listado con varias facturas de distintos clientes
- WHEN el usuario escribe un `nro_factura`, un nombre de cliente o un RIF
  en el buscador único
- THEN el listado muestra solo las facturas que coinciden con ese texto

#### Scenario: Búsqueda por palabra clave de estado

- GIVEN un listado con facturas en distintos estados (Contado, Crédito,
  Abonada, Reverso Total, Reverso Parcial)
- WHEN el usuario escribe exactamente `contado`, `credito`, `abonada`,
  `reverso parcial` o `reverso total` en el buscador (con o sin
  tildes/mayúsculas)
- THEN el listado muestra solo las facturas en ese estado, sin perder la
  posibilidad de match por texto normal

#### Scenario: Palabra suelta no exacta no dispara el filtro de estado

- GIVEN un cliente cuyo nombre contiene literalmente la palabra "Reverso"
- WHEN el usuario busca "reverso" (sin "parcial"/"total")
- THEN el sistema no aplica ninguna cláusula de estado — solo el match de
  texto normal, preservando ese resultado

#### Scenario: Sin resultados

- GIVEN filtros que no coinciden con ninguna factura
- WHEN el listado se renderiza
- THEN se muestra un estado vacío, sin error

#### Scenario: Acción disponible por fila

- GIVEN cualquier factura visible en el listado sin reverso total
- WHEN el usuario observa la fila
- THEN existe la acción "Aplicar nota de crédito", habilitada, que abre el
  modal compartido

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
