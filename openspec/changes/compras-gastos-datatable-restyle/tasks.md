# Tasks: Compras/Gastos DataTable Restyle

## Review Workload Forecast

Estimated lines: C1 ~30, B ~140-180, A ~180-220, C2 ~140-180, D ~15-20. 5 independent PRs to `develop`, one per slice. Delivery strategy: ask-always.

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

- PR1 C1: dedupe Gastos buttons + test.
- PR2 B: modal Dialog/BottomSheet.
- PR3 A: `compra-list.tsx` → DataTable.
- PR4 C2: Libro tab → DataTable/SegmentedTabs.
- PR5 D: Dashboard card classes (after C2).

Each slice reverts independently; only D depends on C2's line state.

## Phase C1: Dedupe Gastos buttons

- [ ] C1.1 (RED) New `gastos-dashboard.test.tsx`: mock data hooks, stub sub-modals as `() => null` (per `cxp-page.test.tsx`). Click Libro tab, assert `getAllByRole('button', {name:/Agregar gasto/i})` length 1. Confirm fails today (2).
- [ ] C1.2 (GREEN) Delete duplicated button block (~L811-837); keep global set (~L576-602).
- [ ] C1.3 (VERIFY) `yarn test:run`, `yarn type-check` (ignore `*.test.ts` noise).

## Phase B: `factura-proveedor-modal.tsx` — Dialog ↔ BottomSheet

- [ ] B.1 Add `useMobile(1024)` branch (per `consulta-factura-modal.tsx`).
- [ ] B.2 Build `titulo` once (title + tipo `Badge`) → `DialogTitle`/`BottomSheet.title`.
- [ ] B.3 Build `cuerpo` once: Anular block first (unchanged), then encabezado/detalle/totales/historial.
- [ ] B.4 Build `footer` once: Cerrar (secondary) + Diferencial/Registrar Pago (`h-11 rounded-xl text-base`); desktop inline, mobile via `BottomSheet.footer`.
- [ ] B.5 Restyle buttons (primary `h-11 rounded-xl text-base`; secondary `h-10 rounded-xl gap-2.5`). `PagoCxPModal`/`PagoGastoCxpModal` stay `Dialog`-only.
- [ ] B.6 (MANUAL QA) Desktop `Dialog` / mobile `BottomSheet` (happy-dom locks 1024px); both `tipo`s, Anular, totals.
- [ ] B.7 (VERIFY) `yarn type-check`, `yarn test:run`.

## Phase A: `compra-list.tsx` — DataTable migration

- [ ] A.1 `columns` mirroring 12 `<th>`s (nro_factura, fecha, proveedor, badges, 4 USD amounts, total_bs, tasa, creado_por).
- [ ] A.2 Replace `<table>` with `DataTable`; keep `onRowClick={setDetalleId}`.
- [ ] A.3 `renderMobileCard` reusing badges, replacing L280-312.
- [ ] A.4 `toolbarSlot`: `DateRangeField` on staged `fechaDesde/fechaHasta`, keep `MAX_RANGE_DAYS=62`, Consultar/Registrar alongside.
- [ ] A.5 (MANUAL QA) Desktop/mobile parity; validation; row click; amounts unchanged.
- [ ] A.6 (VERIFY) `yarn type-check`, `yarn test:run`.

## Phase C2: Libro tab — DataTable + SegmentedTabs

- [ ] C2.1 Replace `<Tabs>` (~L608-612) with controlled `SegmentedTabs` + `TabActiva` state; `AnimatePresence`/`tabContentVariants` (Kardex pattern). No `self-start` (parent is block).
- [ ] C2.2 `columns` mirroring Libro `<th>`s (~L856-864).
- [ ] C2.3 Replace flat `<table>` (~L853-909) with `DataTable`; `onRowClick={setDetalleId}`; `emptyMessage="Sin gastos en el periodo"`.
- [ ] C2.4 Keep total row as footer `<div>`; keep client pagination default.
- [ ] C2.5 Convert only DIARIO date inputs (~L446-605) to `DateRangeField`; leave MENSUAL/ULTIMOS_7 untouched.
- [ ] C2.6 (MANUAL QA) Tab switch; DIARIO parity; MENSUAL/ULTIMOS_7 unaffected; mobile card check.
- [ ] C2.7 (VERIFY) `yarn type-check`, `yarn test:run` (C1 test still passes).

## Phase D: Dashboard tab — container classes only

- [ ] D.1 Add `border` to 5-6 containers (~L446/619/630/702/733 post-C2) → `rounded-2xl bg-card border shadow-lg` (headers already `bg-muted/40`).
- [ ] D.2 Don't touch `renderGrupoFilaTabla` or chart logic.
- [ ] D.3 (MANUAL QA) Visual diff only.
- [ ] D.4 (VERIFY) `yarn type-check`, `yarn test:run`.
