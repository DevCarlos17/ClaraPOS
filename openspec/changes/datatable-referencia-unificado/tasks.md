# Tasks: DataTable como Componente de Referencia Unificado

## Review Workload Forecast

| Field | Value |
|---|---|
| WU1 estimated changed lines | ~580-620 |
| WU2 estimated changed lines | ~220-260 |
| 400-line budget risk | High (WU1) / Low (WU2) |
| Chained PRs recommended | Yes |
| Chain strategy | stacked-to-main |
| Suggested split | WU1 own PR -> merges first; WU2 own PR, branches from develop with WU1 in |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Flag**: WU1 alone still exceeds 400 (full rewrite of `pagination.tsx` + 2 new pure files w/ tests + `data-table.tsx` engine changes). If strict budget compliance is required, split further:
- WU1a (pure, ~230 lines): `pagination-utils.ts` + `mobile-card-fallback.ts` + their tests. Zero wiring, safe standalone PR.
- WU1b (~350 lines): wire utils into `data-table.tsx`/`pagination.tsx`/`toolbar.tsx`, `route.tsx`, remove `lib/utils.ts` `getPageNumbers`.
Confirm before `sdd-apply`: keep WU1 as one PR (`size:exception`) or split into WU1a/WU1b. WU2 fits under 400 as-is.

## WU1 — DataTable core (own PR, merges first; zero visible change to the 4 existing consumers)

### Pure logic (TDD: RED -> GREEN)
- [ ] 1.1 [test] RED: `src/components/data-table/__tests__/pagination-utils.test.ts` — `canGoPrevious`/`canGoNext` bounds (first page, last page, `pageCount=0`), `formatPagerLabel`.
- [ ] 1.2 GREEN: `src/components/data-table/pagination-utils.ts` — `canGoPrevious`, `canGoNext`, `formatPagerLabel`, `PAGE_SIZE_OPTIONS=[10,25,50,100]`, `DEFAULT_PAGE_SIZE`, `UNPAGINATED_PAGE_SIZE=Number.MAX_SAFE_INTEGER`.
- [ ] 1.3 [test] RED: `src/components/data-table/__tests__/mobile-card-fallback.test.ts` — `derivarCamposMobile` skips non-string/empty headers, only visible columns.
- [ ] 1.4 GREEN: `src/components/data-table/mobile-card-fallback.ts` — `derivarCamposMobile`.

### Engine wiring
- [ ] 1.5 `data-table.tsx`: add `toolbarSlot?`, `globalFilterFn?`, `renderMobileCard?`, `manualPagination?`, `pageCount?`, `onPaginationChange?`, `pagination?`; register `getFilteredRowModel`+`getSortedRowModel` always; `getPaginationRowModel` only when `!manualPagination`; `initialState.pagination.pageSize = showPagination ? DEFAULT_PAGE_SIZE : UNPAGINATED_PAGE_SIZE` guard.
- [ ] 1.6 `data-table.tsx`: swap body `overflow-hidden` div for shadcn `ScrollArea`; toolbar/footer stay `shrink-0`.
- [ ] 1.7 `data-table.tsx`: add mobile branch — `hidden lg:block` Table (desktop) + `lg:hidden` Card list using `renderMobileCard ?? derivarCamposMobile` fallback; card owns `onClick`/`rowClassName`/`rowProps` identically to desktop row.
- [ ] 1.8 `toolbar.tsx`: accept `toolbarSlot?`, render inline with search input + "Vista" button in the same row.
- [ ] 1.9 `pagination.tsx`: rewrite to 3-col grid — "Filas" Select (`PAGE_SIZE_OPTIONS`, resets `pageIndex=0` on change) left, `‹ N/M ›` center via `canGoPrevious`/`canGoNext`/`formatPagerLabel`; remove double-caret first/last buttons and `getPageNumbers` usage.
- [ ] 1.10 `route.tsx`: add `flex flex-col` to `<main>`, keep `overflow-y-auto`.
- [ ] 1.11 `lib/utils.ts`: remove `getPageNumbers` (unused after 1.9); delete its tests in `lib/__tests__/utils.test.ts`.

### Preserve-contract (manual)
- [ ] 1.12 [manual-qa] Verify `onRowClick` (desktop row + mobile card), `rowClassName`, `rowProps` (`data-atenuada`), `meta.className` per column, skeleton (5 rows), `emptyMessage` unchanged across the 4 existing `DataTable` consumers.
- [ ] 1.13 [manual-qa] Verify the 3 read-only consumers (`showPagination=false`) still render ALL rows (no truncation) after the row-model change — `UNPAGINATED_PAGE_SIZE` guard working.

### Verify
- [ ] 1.14 Run `yarn type-check` and `yarn test:run`; all WU1 tests green, no regressions.

## WU2 — Facturas emitidas migration (own PR, branches from `develop` with WU1 merged)

- [ ] 2.1 [test] RED: extend `src/features/ventas/utils/__tests__/notas-credito-ui.test.ts` — `facturaCoincideBusqueda` matches `cliente_identificacion` substring.
- [ ] 2.2 GREEN: extend `FacturaBuscable`/`facturaCoincideBusqueda` in `notas-credito-ui.ts` with optional `cliente_identificacion?: string` in the haystack (function already exists — extend, do not duplicate); `nota-credito-pos-modal.tsx` caller stays unaffected (optional field).
- [ ] 2.3 `facturas-empresa-tab.tsx`: remove `FacturasEmpresaFiltros` card + custom "Buscar" `Input`; drop `busqueda` from `FiltrosFacturasEmpresaState` and the `useFacturasEmpresa` call.
- [ ] 2.4 `facturas-empresa-tab.tsx`: turn `showToolbar`/`showPagination` on for `FacturasEmpresaTable`; pass `toolbarSlot` with Desde/Hasta date inputs (still driving the existing server-side refetch); pass `globalFilterFn={(f, term) => facturaCoincideBusqueda(f, term)}`.
- [ ] 2.5 `facturas-empresa-tab.tsx`: define `renderMobileCard` (N° factura, cliente, total USD/Bs, fecha, badges only); keep "Aplicar nota de credito" button with `e.stopPropagation()`.
- [ ] 2.6 `facturas-empresa-tab.tsx`: pass `containerClassName="rounded-t-none"` through `FacturasEmpresaTable` -> `DataTable`.
- [ ] 2.7 `notas-credito-page.tsx`: remove gap between `SegmentedTabs` and the table card (adosado via 2.6's `containerClassName`); fix height chain (`h-full flex flex-col min-h-0`) so only the `DataTable` body scrolls.

### Preserve-contract / manual QA
- [ ] 2.8 [manual-qa] Height containment: table taller than viewport — only body scrolls, toolbar/footer stay visible, page itself does not scroll.
- [ ] 2.9 [manual-qa] `SegmentedTabs` seam: "Facturas emitidas" tabs + card render as one continuous block, no gap/intermediate card.
- [ ] 2.10 [manual-qa] Mobile card: viewport `< lg` shows only identificatory fields, no horizontal overflow; "Aplicar nota de credito" tap does not trigger `onRowClick`.
- [ ] 2.11 [manual-qa] Desde/Hasta still trigger the existing server-side refetch via `useFacturasEmpresa`; Buscar + pagination now run client-side via `DataTable`'s own toolbar — single search box only, no duplicate input.

### Verify
- [ ] 2.12 Run `yarn type-check` and `yarn test:run`; all WU2 tests green, no regressions in `facturas-empresa-tab.test.tsx` / `notas-credito-ui.test.ts`.
