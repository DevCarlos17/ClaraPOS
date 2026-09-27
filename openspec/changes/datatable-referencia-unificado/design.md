# Design: DataTable como Componente de Referencia Unificado

## Technical Approach

Extend `DataTable` with additive-only props (never a second component, never render-props rewrite). Two stacked work units: **WU1** fixes the internal engine (row models, pager, scroll containment, `toolbarSlot`, mobile cards) with zero visible change to the 4 existing call sites; **WU2** migrates `FacturasEmpresaTab` to actually turn the toolbar/pagination/mobile features on. The riskiest hidden issue found while reading the code: registering `getPaginationRowModel` unconditionally would silently truncate the 3 read-only consumers (`showPagination={false}` today means "no footer UI", not "no row slicing" — currently there's no row model at all, so nothing is sliced). Fixed via an `initialState.pagination.pageSize` guard (see §2).

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Row-model regression guard | `initialState.pagination.pageSize = showPagination ? DEFAULT_PAGE_SIZE : UNPAGINATED_PAGE_SIZE` (`Number.MAX_SAFE_INTEGER`) | Only register `getPaginationRowModel` when `showPagination` | Spec requires the row model ALWAYS registered (future default-props consumers need working pagination even before they explicitly pass data); silently omitting it for `showPagination=false` would leave the same bug for any future consumer that flips the flag without also fixing the table |
| Single search box for Facturas | DataTable's own toolbar search (via new `globalFilterFn` escape hatch), NOT a second custom input | Keep custom `Buscar` input inside `toolbarSlot` alongside DataTable's own search | Two search boxes in one toolbar row is confusing UX and contradicts spec "Buscar... usa el modo interno"; `globalFilterFn` lets Facturas keep multi-field + estado-keyword matching client-side without touching the SQL builder |
| Mobile click/atenuada ownership | DataTable's row wrapper owns `onClick`/`rowClassName`/`rowProps`; `renderMobileCard` returns ONLY visual content | `renderMobileCard` receives raw `row.original` and re-implements onClick/atenuada itself | Prevents desktop/mobile state divergence (proposal's Risk table); consumers can't forget to wire click or the atenuada marker on mobile since DataTable does it once for both branches |
| Manual pagination row model | When `manualPagination`, omit `getPaginationRowModel` entirely (table shows all of `data`, since `data` is already the server-sliced page) | Keep `getPaginationRowModel` and feed it `pageCount` | Standard TanStack manual-pagination recipe; avoids double-slicing an already-paginated array |
| SegmentedTabs cap | `FacturasEmpresaTable` gets an additive `containerClassName?` passthrough to `DataTable`; `FacturasEmpresaTab` passes `"rounded-t-none"` | Give `DataTable` tab-awareness | Keeps `DataTable` tab-agnostic (matches exploration's recommendation); zero new API on `DataTable` itself |

## File Changes

| File | WU | Action | Description |
|---|---|---|---|
| `src/components/data-table/data-table.tsx` | 1 | Modify | Row models + guard, `ScrollArea` body, `toolbarSlot`/`globalFilterFn`/`manualPagination` family, mobile branch |
| `src/components/data-table/pagination.tsx` | 1 | Modify | Compact `‹ N/M ›` + Filas select `[10,25,50,100]` |
| `src/components/data-table/toolbar.tsx` | 1 | Modify | Render `toolbarSlot` next to search |
| `src/components/data-table/pagination-utils.ts` | 1 | Create | `PAGE_SIZE_OPTIONS`, `canGoPrevious`, `canGoNext`, `formatPagerLabel` (pure) |
| `src/components/data-table/mobile-card-fallback.ts` | 1 | Create | `derivarCamposMobile` (pure) |
| `src/components/data-table/index.ts` | 1 | Modify | Export new pure helpers if consumers need them (optional) |
| `src/routes/_app/route.tsx` | 1 | Modify | `<main>` gains `flex flex-col` (additive, `overflow-y-auto` stays) |
| `src/lib/utils.ts` | 1 | Modify | Delete `getPageNumbers` (dead code) |
| `src/components/data-table/__tests__/pagination-utils.test.ts` | 1 | Create | Unit tests |
| `src/components/data-table/__tests__/mobile-card-fallback.test.ts` | 1 | Create | Unit tests |
| `src/features/ventas/components/facturas-empresa-tab.tsx` | 2 | Modify | Drop `FacturasEmpresaFiltros` card, add `toolbarSlot`/`renderMobileCard`/`containerClassName`/`globalFilterFn` wiring |
| `src/features/ventas/components/notas-credito-page.tsx` | 2 | Modify | `h-full flex flex-col min-h-0` chain |
| `src/features/ventas/utils/notas-credito-ui.ts` | 2 | Modify | Add `facturaCoincideBusqueda` (pure) |
| `src/features/ventas/components/__tests__/facturas-empresa-tab.test.tsx` | 2 | Modify | Update for toolbarSlot / removed filtros card |
| `src/features/ventas/utils/__tests__/notas-credito-ui.test.ts` | 2 | Modify | Add predicate tests |

`use-facturas-empresa.ts` / `notas-credito-admin-filters.ts` (SQL builder): **untouched**. `FacturasEmpresaTab` simply stops passing `busqueda` to the hook — the SQL `busqueda` branch becomes unused dead code for this caller only, not deleted (still a tested public builder).

## Interfaces / Contracts

```ts
interface DataTableProps<TData, TValue> {
  // ...existing props unchanged...
  /** Controles custom (ej. rango de fechas) en la misma fila del buscador, antes de "Vista". Default: nada renderizado. */
  toolbarSlot?: React.ReactNode
  /** Predicado custom para el buscador propio de DataTable (multi-campo / keywords). Default: filtro por substring de TanStack sobre columnas visibles. */
  globalFilterFn?: (row: TData, filterValue: string) => boolean
  /** Render-prop de card para viewport `< lg`. Default: fallback generico (pares label/valor de columnas visibles con header string). */
  renderMobileCard?: (row: TData) => React.ReactNode
  /** Activa modo controlado (server-side). Default `false` = paginacion cliente. */
  manualPagination?: boolean
  /** Requerido con `manualPagination`. Total de paginas segun el server. */
  pageCount?: number
  /** Requerido con `manualPagination`. Estado controlado por el consumidor. */
  pagination?: PaginationState
  /** Requerido con `manualPagination`. */
  onPaginationChange?: OnChangeFn<PaginationState>
}
```

Corrected internal engine:

```ts
const UNPAGINATED_PAGE_SIZE = Number.MAX_SAFE_INTEGER // guard: showPagination=false must not truncate rows

const internalTable = useReactTable({
  data,
  columns,
  ...(manualPagination
    ? { state: { pagination }, onPaginationChange, manualPagination: true, pageCount }
    : {}),
  globalFilterFn: globalFilterFn
    ? (row, _columnId, value) => globalFilterFn(row.original, value as string)
    : undefined,
  initialState: manualPagination
    ? undefined
    : { pagination: { pageSize: showPagination ? 10 : UNPAGINATED_PAGE_SIZE } },
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getSortedRowModel: getSortedRowModel(),
  ...(manualPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
})

const table = externalTable ?? internalTable
```

`externalTable` (unused by all 4 call sites today) keeps full precedence, unchanged.

Pure helpers (`pagination-utils.ts`):

```ts
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export function canGoPrevious(pageIndex: number): boolean
export function canGoNext(pageIndex: number, pageCount: number): boolean
export function formatPagerLabel(pageIndex: number, pageCount: number): string // "N/M", clamps M to >=1
```

`DataTablePagination` redesign: 3-column grid (`grid-cols-3`) so the pager stays visually centered regardless of the select's width — left cell empty, center cell holds `‹`/label/`›` (single-step only, first/last-page double-caret buttons removed), right cell holds "Filas" + `Select` bound to `PAGE_SIZE_OPTIONS`. `onValueChange` calls `table.setPageSize(n)` then `table.setPageIndex(0)` explicitly (spec: size change MUST reset to page 1). Bounds: buttons `disabled={!canGoPrevious(pageIndex)}` / `disabled={!canGoNext(pageIndex, pageCount)}`.

Height chain (only additive classes, `overflow-y-auto` on `<main>` stays as a safety net for pages that don't opt into the flex chain — no regression for other routes):

```
route.tsx <main>:        flex-1 min-h-0 overflow-y-auto ...  →  flex-1 min-h-0 flex flex-col overflow-y-auto ...
notas-credito-page.tsx:  <div className="space-y-6">          →  <div className="h-full flex flex-col min-h-0">
                         <div className="space-y-0">          →  <div className="flex-1 min-h-0 flex flex-col mt-6">
                         <div className="overflow-hidden">    →  <div className="flex-1 min-h-0 overflow-hidden">
                         (motion.div gets className="h-full")
facturas-empresa-tab.tsx: <div className="space-y-4">         →  <div className="h-full flex flex-col min-h-0">
data-table.tsx body:      <div className="overflow-hidden w-full flex-1"><Table>  →  <ScrollArea className="flex-1 min-h-0"><Table>
```

`PageHeader` has no `className` prop — wrap it: `<div className="shrink-0"><PageHeader .../></div>`. `SegmentedTabs`/toolbar/footer get `shrink-0` where needed so only the `ScrollArea` viewport scrolls.

Mobile branch in `data-table.tsx` (CSS-only, both branches mount — see rationale below):

```tsx
<div className="hidden lg:block"><Table>...</Table></div>
<div className="lg:hidden flex flex-col gap-3 p-4">
  {rows.map((row) => (
    <div key={row.id} onClick={() => onRowClick?.(row.original)}
         className={cn('cursor-pointer', resolveRowClassName(rowClassName, row.original))}
         {...rowProps?.(row.original)}>
      {renderMobileCard ? renderMobileCard(row.original) : <GenericMobileCard row={row} table={table} />}
    </div>
  ))}
</div>
```

`GenericMobileCard` renders a shadcn `Card` with `derivarCamposMobile(table.getVisibleLeafColumns(), row)` pairs (skips columns with non-string or empty `header`, e.g. `acciones`). `FacturasEmpresaTable`'s concrete `renderMobileCard` (WU2) returns a `Card` with: fecha (top-right, small), `#nro_factura` (top-left, mono), cliente nombre, `total_usd`/`total_bs` row, badges row (identical `resolverBadgesFactura` call reused from the desktop cell), and — only when `mostrarAcciones !== false` — the "Aplicar nota de credito" button with its own `e.stopPropagation()` (same guard as desktop).

**Mobile double-mount decision**: both `hidden lg:block` and `lg:hidden` branches mount in the DOM simultaneously (Tailwind toggles via `display:none`), per the locked decision and confirmed against the `css-layout` guidance (no SSR/hydration risk in this Vite SPA; `overflow: auto`/flex patterns favor CSS-only responsive branching over JS `matchMedia`). Cost analysis: table row counts here are bounded by pagination (max 100 rows/page after WU1's fix), so the extra inert DOM (either the `<Table>` rows or the card list, whichever is hidden) is small and paid once per page-size change, not per scroll/resize. A `useMediaQuery` gate would only pay off for lists in the thousands with no pagination — not this codebase's shape. **Recommendation: pure CSS, no JS breakpoint hook.**

`toolbarSlot` in `toolbar.tsx`: rendered as a sibling right after the search-input block, inside the same `flex flex-1 min-w-0 items-center gap-2` left group, so it flows next to search on `md+` and wraps below it on narrow screens (`flex-wrap`), staying left of the count/clear/facets/Vista group.

**Single search recommendation for Facturas emitidas**: remove the custom `Buscar` `Input` from `FacturasEmpresaFiltros` entirely. `toolbarSlot` carries ONLY the two `Desde`/`Hasta` date inputs (unchanged styling, wrapped in a small `FacturasEmpresaToolbarFiltros` component). DataTable's own search box becomes the ONE search input, wired via `globalFilterFn={(f, term) => facturaCoincideBusqueda(f, term)}` — a new pure function in `notas-credito-ui.ts` that OR-matches `nro_factura`/`cliente_nombre`/`cliente_identificacion` substrings plus the same estado-keyword branch as the SQL builder (`contado`/`credito`/`abonada`/`reverso parcial`/`reverso total`, reusing `derivarEstadoPago` + the existing reverso flags already on the row — never narrows, same OR semantics as the SQL version, empty term matches everything). `FacturasEmpresaTab`'s local `filtros` state keeps only `fechaDesde`/`fechaHasta` (still driving the server refetch via `useFacturasEmpresa`); `busqueda` state and the hook param are dropped — `useFacturasEmpresa`/`notas-credito-admin-filters.ts` need NO changes.

## Testing Strategy

| Layer | What | Cases |
|---|---|---|
| Unit (`pagination-utils.test.ts`) | `canGoPrevious`/`canGoNext`/`formatPagerLabel` | pageIndex 0 disables prev; last page disables next; pageCount 0 → "1/1"; mid-page normal case |
| Unit (`mobile-card-fallback.test.ts`) | `derivarCamposMobile` | string-header columns → pairs in column order; non-string/empty header (e.g. `acciones`) skipped; empty column list → `[]` |
| Unit (`notas-credito-ui.test.ts`) | `facturaCoincideBusqueda` | substring match per field; exact keyword (accent/case-insensitive) adds estado/reverso branch; "reverso" alone does NOT trigger the keyword branch; empty term → `true` |
| Manual QA | Height containment, SegmentedTabs seam, mobile card layout/no h-overflow, tap→`ConsultaFacturaModal`, NC button stopPropagation on mobile, 3 legacy consumers visually unchanged | Documented in PR description, run before `sdd-verify` |

Runner: `yarn test:run`. No layer renders the real `DataTable`/`ScrollArea`/flex chain today (existing tests mock `FacturasEmpresaTable`) — layout regressions stay manual-QA territory, consistent with the proposal's stated risk.

## Migration / Rollout

No data migration. WU1 ships first (mergeable alone, zero visible diff). WU2 depends on WU1 being merged. Rollback WU2: restore `facturas-empresa-tab.tsx`/`notas-credito-page.tsx`, drop `facturaCoincideBusqueda`. Rollback WU1 (only if done before WU2 exists): restore `data-table.tsx`/`pagination.tsx`/`toolbar.tsx`/`route.tsx`, delete the two new pure-helper files.

## Open Questions

- [ ] Should `facturaCoincideBusqueda`'s keyword map be extracted to a single shared source with the SQL builder's `ESTADO_FACTURA_POR_PALABRA_CLAVE`, or is the intentional duplication (SQL text vs JS predicate) acceptable long-term? Recommend accepting duplication now (both are small, independently tested); revisit only if a third consumer needs the same keyword search.
