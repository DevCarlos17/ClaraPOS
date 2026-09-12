# Spec: cxp-lista-deudores-corta

## Requirement: Nuevo buscador de proveedores con deuda, filtrado por empresa_id

El sistema SHALL exponer un nuevo hook `useBuscarProveedoresDeuda(query)` en
`src/features/compras/hooks/use-cxp.ts`, que replica el patron exacto de
`useBuscarClientesDeuda` (CxC):
- SHALL activarse (`shouldSearch`) solo cuando `query.trim().length >= 2`.
- SHALL filtrar por `p.razon_social LIKE ? OR p.rif LIKE ?` con patron
  `%term%` SIN escapar wildcards del usuario (replica EXACTA del gap
  preexistente de CxC — no es un bug nuevo a corregir aqui).
- SHALL filtrar obligatoriamente por `empresa_id` (via `useCurrentUser()`),
  igual que `useProveedoresConDeuda`.
- SHALL retornar filas con la misma forma que `ProveedorConDeuda`
  (id, rif, razon_social, saldo_actual, facturas_pendientes), calculadas
  sobre la misma union de `facturas_compra` + `gastos` pendientes que usa
  `useProveedoresConDeuda`.
- SHALL ordenar `ORDER BY razon_social ASC LIMIT 20` (igual que CxC ordena
  por nombre ASC con LIMIT 20).

## Requirement: Panel izquierdo de CxP con buscador y top-N deudores

`CxpPage` SHALL incorporar un input de busqueda (mismo patron UX que el de
`CxcList`: icono lupa, placeholder, mismo estilo Tailwind) sobre el panel
izquierdo. Cuando el buscador esta vacio, el panel SHALL renderizar
unicamente los primeros 5 proveedores del arreglo ya ordenado DESC por
`saldo_actual` (fuente: `useProveedoresConDeuda`).

Igual que en CxC, el recorte a 5 SHALL aplicarse SOLO al arreglo
renderizado en el panel. Los KPIs (`Deuda Total`, `Proveedores con Deuda`,
`Mayor Deuda`) y el resumen del pie (`Total`) SHALL seguir calculandose
sobre el arreglo COMPLETO de `useProveedoresConDeuda`, sin recortar.

Seleccionar un proveedor (de la lista corta o de busqueda) SHALL seguir
mostrando `DetallePanel` (facturas + gastos) exactamente como hoy. El
filtro por `empresa_id` SHALL permanecer sin cambios en todos los hooks
involucrados.

### Scenario: Nuevo hook filtra por empresa_id y termino de busqueda

- **GIVEN** un usuario con `empresa_id = 'emp-1'`
- **WHEN** se invoca `useBuscarProveedoresDeuda('acme')`
- **THEN** la query SHALL incluir `WHERE p.empresa_id = ?` con `'emp-1'`
  como parametro
- **AND** SHALL incluir `p.razon_social LIKE ?` y/o `p.rif LIKE ?` con
  patron `%acme%`

### Scenario: Busqueda con menos de 2 caracteres no dispara query

- **GIVEN** el usuario escribe "a" (1 caracter) en el buscador de CxP
- **WHEN** se invoca `useBuscarProveedoresDeuda('a')`
- **THEN** `shouldSearch` SHALL ser `false` y NO SHALL ejecutarse ninguna
  query SQL (mismo comportamiento que `useBuscarClientesDeuda`)

### Scenario: Busqueda vacia muestra solo 5 proveedores

- **GIVEN** `useProveedoresConDeuda` retorna 10 proveedores ordenados DESC
  por `saldo_actual`
- **AND** el buscador esta vacio
- **WHEN** `CxpPage` renderiza el panel izquierdo
- **THEN** el panel SHALL mostrar exactamente 5 filas (los primeros 5)
- **AND** los KPIs y el total del pie SHALL reflejar los 10 proveedores
  completos

### Scenario: Buscar filtra los resultados sin limite adicional a 5

- **GIVEN** el usuario escribe "distribuidora" (>= 2 caracteres)
- **WHEN** `useBuscarProveedoresDeuda('distribuidora')` retorna 7
  resultados
- **THEN** el panel izquierdo SHALL mostrar los 7 resultados, no recortados
  a 5

### Scenario: Seleccionar un proveedor de la lista corta sigue funcionando

- **GIVEN** la lista corta muestra 5 proveedores (busqueda vacia)
- **WHEN** el usuario hace click en el proveedor en la posicion 2
- **THEN** el panel derecho SHALL mostrar `DetallePanel` con las facturas y
  gastos de ese proveedor (mismo comportamiento que antes del cambio)
