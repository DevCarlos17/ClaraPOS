# Proposal: DataTable como Componente de Referencia Unificado

## Intent

`src/components/data-table/` es el unico wrapper TanStack-Table del proyecto pero hoy solo tiene un consumidor real (`FacturasEmpresaTable`, 4 sitios de render), y ese consumidor renderiza con `showToolbar={false} showPagination={false}` porque el pager no cabe visualmente, la paginacion interna no esta cableada (faltan `getFilteredRowModel`/`getPaginationRowModel`/`getSortedRowModel`), los filtros propios (Desde/Hasta/Buscar) viven en una card separada, y no existe forma de contener la altura de la tabla sin que la pagina entera se desborde. Este cambio corrige el `DataTable` compartido para que sea de verdad el componente de referencia y migra "Facturas emitidas" como primer consumidor real. Ademas, hoy `DataTable` renderiza siempre `<Table>` sin importar el viewport: en mobile las columnas se comprimen o desbordan horizontalmente, y no hay forma de mostrar solo los datos identificatorios de una fila. Se agrega vista mobile en cards como parte del contrato del componente de referencia.

## Scope

### In Scope
- Registrar `getFilteredRowModel`/`getPaginationRowModel`/`getSortedRowModel` en la instancia interna de `useReactTable` (bug funcional, hoy cosmetico-no-funcional).
- Rediseñar `DataTablePagination`: paginas `[10,25,50,100]`, pager compacto `‹ N/M ›` centrado + selector "Filas [N]" a la derecha (reemplaza el pager numerado actual).
- Nuevo prop additive `toolbarSlot?: React.ReactNode` en `DataTableToolbar`/`DataTable` para controles custom (fecha, busqueda propia) junto al buscador y "Columnas".
- Contener la altura: `ScrollArea` (shadcn, ya instalado) en el cuerpo de la tabla; cadena flex/`min-h-0` desde `_app/route.tsx` (`<main>`) -> wrapper de pagina -> contenido de tab, para que solo el body de la tabla scrollee y el footer quede siempre visible.
- Soporte dual de paginacion: modo interno (default, cliente) + modo controlado/manual (`pageCount`, `onPaginationChange`) para futuros consumidores server-side, sin romper el contrato interno.
- Migrar `FacturasEmpresaTab`: activar toolbar+pagination, mover Desde/Hasta/Buscar a `toolbarSlot`, eliminar la card de filtros separada, adosar `SegmentedTabs` a la card de la tabla via `containerClassName` (esquinas superiores planas).
- Vista mobile en cards (`< lg`): nuevo prop additive `renderMobileCard?: (row: TData) => React.ReactNode` en `DataTable`. Si se provee, mobile renderiza cards via ese render-prop; si se omite, cae a un fallback GENERICO que apila las columnas visibles como pares label/valor dentro de un shadcn `Card`. Desktop (`lg+`) no cambia. Tap en cualquier parte de la card dispara el `onRowClick` existente (misma prop, sin API nueva).
- `FacturasEmpresaTable` define su propio `renderMobileCard` minimo: N° factura + cliente + total USD/Bs + fecha + badges de estado/reverso. El boton "Aplicar nota de credito" se reubica dentro de la card (con el mismo `e.stopPropagation()` que ya usa en desktop) para no desaparecer en mobile.
- Tests unitarios de logica pura: modelo de paginacion (page-size options, calculo de paginas), composicion de filtros, extraccion de pares label/valor para el fallback generico de mobile.

### Out of Scope
- Migrar `ProductoList`, `TraspasoList`, `ExistenciasPorDeposito` u otras listas hand-rolled (seguira en cambios separados).
- Reemplazar `SegmentedTabs` por shadcn `Tabs`.
- Tocar logica de negocio, queries SQL o filtros `empresa_id`.
- Server-side pagination real para `useFacturasEmpresa` (no tiene LIMIT/OFFSET hoy; el escape hatch queda listo pero sin consumidor).

## Capabilities

### New Capabilities
- None (extiende una capability existente, no introduce dominio nuevo).

### Modified Capabilities
- `data-table` (componente compartido `src/components/data-table/`): contrato de paginacion, toolbar, layout y vista mobile (cards) cambia (additive).

## Approach

Extender el `DataTable` existente con props additive (`toolbarSlot`, paginacion controlada opcional, `renderMobileCard`) en vez de crear un segundo componente o reescribir a render-props. Los 4 sitios de render actuales (todos con toolbar/pagination deshabilitados) no se ven afectados salvo `FacturasEmpresaTab`, que se migra explicitamente. `SegmentedTabs` se mantiene sin cambios de API; solo se usa el `containerClassName` ya existente en `DataTable` para el look "adosado".

Para mobile, se usa un breakpoint CSS puro (`hidden lg:block` para la tabla, `lg:hidden` para las cards) en vez de un breakpoint JS/`matchMedia`: es una SPA de Vite (sin SSR), asi que no hay riesgo de hydration mismatch, y CSS-only evita re-renders por resize. Nunca se montan ambas ramas activas a la vez a efectos visuales (Tailwind las oculta con `display:none`), pero SI se montan ambas en el DOM — es el patron estandar y mas simple para este caso; no justifica la complejidad de un hook de breakpoint solo para evitar un doble mount invisible.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/components/data-table/data-table.tsx` | Modified | Row models, `ScrollArea` en body, prop `toolbarSlot`, modo paginacion controlada, rama mobile (`renderMobileCard` + fallback generico via shadcn `Card`) |
| `src/components/data-table/pagination.tsx` | Modified | Pager compacto `‹ N/M ›`, page sizes `[10,25,50,100]` |
| `src/components/data-table/toolbar.tsx` | Modified | Render de `toolbarSlot` |
| `src/components/ui/card.tsx` | Verify | Ya existe en el repo (shadcn `Card`); se reusa tal cual, sin agregar dependencia nueva |
| `src/routes/_app/route.tsx` | Modified | `<main>` a `flex flex-col min-h-0` |
| `src/features/ventas/components/facturas-empresa-tab.tsx` | Modified | Filtros a `toolbarSlot`, quitar card separada, adosar `SegmentedTabs`, definir `renderMobileCard` (N° factura, cliente, totales, fecha, badges, boton "Aplicar nota de credito" reubicado) |
| `src/lib/utils.ts` | Modified | Eliminar `getPageNumbers` (dead code tras el nuevo pager) |
| `src/components/data-table/*.test.ts(x)` | New | Tests de modelo de paginacion, composicion de filtros, extraccion de pares label/valor del fallback mobile generico |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `rowClassName`/`rowProps` (`data-atenuada`) o `onRowClick` + `stopPropagation` se rompen al reestructurar markup | Low | Cambios acotados al wrapper de body/footer; no se toca la fila `<TableRow>` |
| Nadie prueba layout/altura hoy (tests mockean `FacturasEmpresaTable`) | Medium | QA manual explicito de altura/scroll en "Facturas emitidas"; TDD cubre solo logica pura |
| Diff EXCEDE el budget de 400 lineas (ver forecast abajo) | High | Dividir en 2 work units encadenados antes de `sdd-apply` — ver "Forecast de tamano" |
| `table` prop externo (usado por 0 consumidores hoy) deja de soportarse por descuido | Low | Mantener el escape hatch explicitamente en la implementacion |
| Mobile y desktop se desincronizan (la card muestra menos datos que la tabla, o el tap no dispara el mismo `onRowClick`) | Medium | La card reusa el MISMO `row.original` y el MISMO `onRowClick` que la fila desktop; ningun estado nuevo por rama |
| Overflow horizontal en mobile si el fallback generico apila muchas columnas visibles | Low | `FacturasEmpresaTable` define `renderMobileCard` explicito (no depende del fallback generico) |

## Rollback Plan

Cambios additive y acotados a 2 areas (componente compartido + un consumidor). Revertir es un solo commit: restaurar `data-table.tsx`/`pagination.tsx`/`toolbar.tsx` y `facturas-empresa-tab.tsx` a su version previa; `route.tsx` revierte la clase de `<main>`. Sin migraciones ni cambios de schema/queries.

## Dependencies

- Exploracion `sdd/datatable-referencia-unificado/explore` (root cause de altura, inventario de consumidores, decisiones de owner ya cerradas).

## Forecast de tamano y division en work units

Forecast previo (sin mobile card): ~280-380 lineas. Agregar `renderMobileCard` + fallback generico + tests de extraccion de pares label/valor en `data-table.tsx` suma ~60-100 lineas; definir `renderMobileCard` de facturas + reubicar el boton de accion en `facturas-empresa-tab.tsx` suma ~40-60 lineas mas.

**Nuevo total estimado: ~380-540 lineas (additions + deletions).**

**Veredicto de budget: EXCEDE el limite de 400 lineas (D1 confirmado por el owner)** en el escenario medio/alto. Se recomienda dividir en 2 work units encadenados antes de `sdd-apply`:

- **WU1 — DataTable core**: row models (`getFilteredRowModel`/`getPaginationRowModel`/`getSortedRowModel`), pager compacto, `ScrollArea` + cadena `min-h-0`, `toolbarSlot`, `renderMobileCard` + fallback generico. Solo toca `src/components/data-table/*` y `src/routes/_app/route.tsx`. Se puede probar en aislado con los 4 consumidores actuales (toolbar/pagination/mobile off por default = sin cambio visible).
- **WU2 — Migracion de Facturas emitidas**: activa `toolbarSlot` con Desde/Hasta/Buscar, adosa `SegmentedTabs`, elimina la card de filtros separada, define `renderMobileCard` propio. Depende de WU1 ya mergeado/apilado.

## Success Criteria

- [ ] "Facturas emitidas" muestra toolbar (buscador + Desde/Hasta + Columnas) y footer de paginacion `[10,25,50,100]` con pager `‹ N/M ›`, sin desbordar la pagina; solo el body de la tabla scrollea.
- [ ] `SegmentedTabs` queda visualmente adosado a la card de la tabla (sin card de filtros separada arriba).
- [ ] Los otros 3 sitios de render de `FacturasEmpresaTable` (`ClienteDetalle`, `VentasConsultasModal` x2) siguen renderizando igual (toolbar/pagination/mobile-card off por default).
- [ ] Paginacion interna (client-side) funciona de verdad (filtra/pagina/ordena), no solo cosmetica.
- [ ] En mobile (`< lg`), "Facturas emitidas" muestra cards identificatorias (N° factura, cliente, total, fecha, estado) en vez de la tabla; tap en la card abre `ConsultaFacturaModal` (mismo `onRowClick` que desktop); sin overflow horizontal; el footer de paginacion sigue contenido.
- [ ] `yarn type-check` y `yarn test:run` pasan; diff dividido en WU1/WU2 segun el forecast de arriba antes de `sdd-apply`.
