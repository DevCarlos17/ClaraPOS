# Delta for data-table

`data-table` nunca tuvo spec; todo ADDED. WU1: `src/components/data-table/*`. WU2: migracion Facturas emitidas.

## ADDED Requirements

### Requirement: Motor de tabla interna completo (WU1)

La instancia interna `useReactTable` (sin `table` externo) MUST registrar `getFilteredRowModel`, `getPaginationRowModel` y `getSortedRowModel`.

#### Scenario: Paginacion interna filtra y pagina de verdad
- GIVEN `DataTable` con `showPagination` activo y 25 filas
- WHEN el usuario cambia de pagina
- THEN solo las filas de esa pagina son visibles

### Requirement: Composicion de toolbar con `toolbarSlot` (WU1)

`DataTableToolbar`/`DataTable` MUST aceptar `toolbarSlot?` additive, junto al buscador y al boton "Vista" (columnas).

#### Scenario: Consumidor con filtros custom
- GIVEN un consumidor pasa `toolbarSlot`
- THEN buscador, `toolbarSlot` y "Vista" se ven en la misma fila

### Requirement: Footer de paginacion compacto (WU1)

`DataTablePagination` MUST mostrar pager `‹ N/M ›` centrado + selector "Filas" con `[10, 25, 50, 100]`. Cambiar el tamano MUST resetear a `pageIndex = 0`.

#### Scenario: Limites del pager (logica pura)
- GIVEN primera pagina
- THEN `‹` deshabilitado; en la ultima pagina `›` deshabilitado

#### Scenario: Cambio de tamano resetea pagina (logica pura)
- GIVEN pagina 3 con tamano 10
- WHEN cambia a tamano 50
- THEN vuelve a pagina 1

### Requirement: Contencion de altura — solo el body scrollea (WU1)

El body MUST usar `ScrollArea`; toolbar/footer `shrink-0`. `<main>` -> pagina -> tab MUST propagar `flex flex-col min-h-0`.

#### Scenario: Tabla mas alta que el viewport (QA manual/visual)
- GIVEN filas que exceden el alto visible
- WHEN el usuario scrollea
- THEN solo el body se desplaza; footer/toolbar visibles; la pagina no scrollea

### Requirement: Modo de paginacion controlada (manual) (WU1)

`DataTable` MUST soportar `manualPagination` + `pageCount` + `onPaginationChange` additive, sin romper el modo interno default.

#### Scenario: Consumidor server-side activa modo controlado
- GIVEN `manualPagination`, `pageCount`, `onPaginationChange` provistos
- THEN `DataTable` MUST NOT filtrar/paginar `data` — usa el `pageCount` dado y delega via `onPaginationChange`

### Requirement: Vista mobile en cards bajo `lg` (WU1)

La vista mobile en cards es OPT-IN: `DataTable` MUST renderizar `Card` por fila bajo `lg` (via el hook `useMobile(1024)`) SOLO cuando el consumidor provee `renderMobileCard?`. Sin `renderMobileCard`, `DataTable` MUST renderizar SIEMPRE la `<Table>` desktop, independientemente del viewport — comportamiento identico al previo al cambio (los 4 consumidores actuales no pasan `renderMobileCard`, por lo que su render NO cambia). Cuando `renderMobileCard` esta presente, tap sobre la card MUST disparar el mismo `onRowClick` que la fila desktop. La utilidad pura `derivarCamposMobile` (pares label/valor, omite headers no-string y valores vacios/`null`/`undefined`) queda disponible para que un consumidor arme su `renderMobileCard`, pero NO se aplica automaticamente como fallback.

#### Scenario: Sin `renderMobileCard` renderiza tabla desktop en cualquier viewport
- GIVEN un consumidor que NO provee `renderMobileCard`
- WHEN se renderiza bajo `lg` (viewport mobile)
- THEN `DataTable` muestra la `<Table>` desktop (sin cards), identico al comportamiento previo

#### Scenario: Con `renderMobileCard`, tap dispara `onRowClick` (interaccion)
- GIVEN `renderMobileCard` provisto y `onRowClick` definido, bajo `lg`
- WHEN el usuario toca la card (fuera de un boton con `stopPropagation`)
- THEN se renderiza la card del consumidor y `onRowClick` se invoca con `row.original`

### Requirement: Preservacion del contrato existente (WU1)

`rowClassName`/`rowProps` (`data-atenuada`), `onRowClick` desktop, `meta.className` por columna, skeleton (5 filas), `emptyMessage` y el `table` externo MUST seguir igual tras la reestructuracion.

#### Scenario: Fila atenuada y columna con `meta.className`
- GIVEN una fila con `data-atenuada` y una columna con `meta.className`
- THEN ambos siguen presentes sin cambio de comportamiento

### Requirement: Migracion Facturas — toolbar y filtrado (WU2)

`FacturasEmpresaTab` MUST mover Desde/Hasta/Buscar a `toolbarSlot` y eliminar la card de filtros separada. Desde/Hasta siguen el refetch server-side (`useFacturasEmpresa`); Buscar y paginacion usan el modo interno, sin `manualPagination`.

#### Scenario: Cambiar rango de fechas
- GIVEN cambia Desde/Hasta en `toolbarSlot`
- THEN dispara el mismo refetch server-side de hoy, sin card separada

### Requirement: Migracion Facturas — `SegmentedTabs` adosado (WU2)

`SegmentedTabs` MUST quedar adosado a la card de la tabla (esquinas planas via `containerClassName`), sin gap ni card intermedia.

#### Scenario: Vista "Facturas emitidas" (QA visual)
- GIVEN abre "Facturas emitidas"
- THEN tabs y card se ven como un solo bloque continuo

### Requirement: Migracion Facturas — card mobile propia (WU2)

`FacturasEmpresaTable` MUST definir `renderMobileCard` con solo datos identificatorios (N° factura, cliente, total USD/Bs, fecha, badges); "Aplicar nota de credito" sigue alcanzable via `e.stopPropagation()`.

#### Scenario: Card de factura en mobile
- GIVEN viewport `< lg`
- THEN la card muestra solo esos datos, sin overflow horizontal
- AND "Aplicar nota de credito" no dispara `onRowClick`
