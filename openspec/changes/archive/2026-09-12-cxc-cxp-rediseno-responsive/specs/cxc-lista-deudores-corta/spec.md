# Spec: cxc-lista-deudores-corta

## Requirement: Panel izquierdo de CxC muestra top-N deudores sin busqueda activa

Cuando el campo de busqueda esta vacio (o con menos de 2 caracteres, el
umbral existente de `useBuscarClientesDeuda`), el panel izquierdo de
`CxcList` SHALL renderizar unicamente los primeros 5 clientes del arreglo
ya ordenado DESC por `deuda_usd` (fuente: `useClientesConDeuda`), en lugar
de la lista completa.

El recorte a 5 SHALL aplicarse SOLO al arreglo usado para renderizar filas
en el panel izquierdo. Los KPIs superiores (`Deuda Total`, `Saldo a Favor`,
`Clientes con Deuda`, `Facturas Pendientes`) y el resumen del pie
(`totalDeuda`, `totalSAF`) SHALL seguir calculandose sobre el arreglo
COMPLETO sin recortar (`allClientes`), sin cambio de comportamiento.

Cuando el usuario escribe 2+ caracteres en el buscador, el comportamiento
existente de `useBuscarClientesDeuda` (query SQL propia, `LIMIT 20`,
`ORDER BY nombre ASC`) SHALL aplicarse sin cambios — no hay recorte
adicional a 5 sobre los resultados de busqueda.

Seleccionar un cliente de la lista (corta o de busqueda) SHALL seguir
mostrando el panel derecho (`CxcClienteDetalle`) exactamente como hoy. El
filtro por `empresa_id` (ya presente en ambos hooks via `useCurrentUser`)
SHALL permanecer sin cambios.

### Scenario: Busqueda vacia muestra solo 5 deudores

- **GIVEN** `useClientesConDeuda` retorna 8 clientes ordenados DESC por
  `deuda_usd`
- **AND** el campo de busqueda esta vacio
- **WHEN** `CxcList` renderiza el panel izquierdo
- **THEN** el panel SHALL mostrar exactamente 5 filas (los primeros 5 del
  arreglo, mismo orden)
- **AND** los KPIs superiores y el resumen del pie SHALL reflejar los 8
  clientes completos (no solo los 5 visibles)

### Scenario: Busqueda con texto muestra resultados filtrados sin limite adicional a 5

- **GIVEN** el usuario escribe "mar" en el buscador (>= 2 caracteres)
- **WHEN** `useBuscarClientesDeuda('mar')` retorna 12 resultados
- **THEN** el panel izquierdo SHALL mostrar los 12 resultados (comportamiento
  existente sin cambio), no recortados a 5

### Scenario: Seleccionar un cliente de la lista corta sigue funcionando

- **GIVEN** la lista corta muestra 5 clientes (busqueda vacia)
- **WHEN** el usuario hace click en el cliente en la posicion 3
- **THEN** el panel derecho SHALL mostrar `CxcClienteDetalle` para ese
  cliente (mismo comportamiento que antes del cambio)

### Scenario: Con menos de 5 deudores no hay cambio visual

- **GIVEN** `useClientesConDeuda` retorna 3 clientes
- **WHEN** la busqueda esta vacia
- **THEN** el panel izquierdo SHALL mostrar los 3 clientes (el recorte a 5
  es un tope maximo, no un minimo forzado)
