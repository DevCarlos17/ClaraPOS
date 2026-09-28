# Design: Compras/Gastos DataTable Restyle

## Technical Approach

Reuse existing primitives (`DataTable`, `SegmentedTabs`, `DateRangeField`, `BottomSheet`) as-is — zero changes to those files. Each of the 5 slices is a classes/structure-only refactor of one legacy screen or tab, executed as an independent PR. Order: **C1 → B → A/C2 (either order) → D**. No slice blocks another structurally; B's external contract (`tipo/id/isOpen/onClose`) is unchanged, so A and C2 don't need to wait for it, but doing B early lets both benefit from the mobile improvement sooner.

## Architecture Decisions

### Decision: Modal header — Badge + Anular placement in BottomSheet (resolved)

**Choice**: Build THREE shared `ReactNode`s once per render (not just `cuerpo`), reused by both surfaces:
- `titulo` = `"Detalle de Compra/Gasto"` + `Badge` (tipo). Passed to `DialogTitle` verbatim and as `BottomSheet`'s `title` prop.
- `cuerpo` = the Anular confirm/cancel block (if `tipo==='GASTO' && !esAnulado && puedeAnular`) **as the first row**, then encabezado card, detalle, totales, historial — identical on both surfaces.
- `footer` = Cerrar (`variant=secondary`) + conditional Diferencial cambiario / Registrar Pago (`h-11 rounded-xl text-base`). Rendered inline inside `DialogContent` for desktop, passed to `BottomSheet`'s `footer` prop for mobile.

**Alternatives considered**:
1. Anular inside the title slot (mirrors current desktop header) — rejected: `BottomSheet.title` is meant for a static label (`ConsultaFacturaModal` precedent uses a plain string); cramming a stateful 2-button confirm/cancel pair into a `SheetTitle` breaks that contract and is illegible at mobile width next to a Badge.
2. Anular inside the sheet footer next to Cerrar/Registrar Pago — rejected: footer is reserved for the two universal, high-frequency money actions; mixing a rare, destructive, tipo-conditional confirm toggle there raises mis-tap risk.

**Rationale**: Body-top placement is visible immediately under the title (same proximity as today) on both surfaces, needs zero duplication of the stateful JSX (`confirmandoAnular`/`anulando`/`handleAnularGasto` stay exactly as-is), and keeps title/footer reserved for their established roles. **Side effect (accepted)**: desktop's Anular button moves from header-right to body-top — purely cosmetic reposition, same click behavior, flagged here so it isn't mistaken for scope creep during review.

### Decision: "rounded-xl border shadow-md" target reinterpreted for Slice D

**Choice**: For top-level list/dashboard **containers**, the real target is `rounded-2xl bg-card border shadow-lg` (i.e. add the missing `border` class), not `rounded-xl`/`shadow-md`.

**Alternatives considered**: Apply proposal's literal text (`rounded-xl border shadow-md`) to Dashboard-tab cards.

**Rationale**: Grepped the codebase — `rounded-2xl bg-card shadow-lg` is used 100+ times app-wide, and `DataTable`'s own shipped container (`data-table.tsx:147`) is `rounded-2xl bg-card border shadow-lg`. No file uses `rounded-xl border shadow-md` as a top-level container class; that combo in Engram #4308 describes **nested presentational cards** inside a detail panel (e.g. totales card), not list/dashboard wrappers. Applying the literal proposal text would make Gastos Dashboard visually inconsistent with every other list screen. This also shrinks Slice D from ~40-70 to ~15-20 lines (5-6 divs gain `border`; headers already use `bg-muted/40`).

### Decision: Gastos filter bar — only the DIARIO date pair becomes `DateRangeField`

**Choice**: The outer filter bar (shared by both tabs, L446-605) has 3 mutually-exclusive date shapes gated by `Intervalo`: DIARIO (two `<input type="date">`), MENSUAL (two `<input type="month">`), ULTIMOS_7 (no input, text only). Only the DIARIO branch's native inputs become `DateRangeField`. MENSUAL/ULTIMOS_7 branches are untouched (no shared component supports month-granularity).

**Rationale**: `DateRangeField` value shape is `{desde,hasta}: 'yyyy-MM-dd'`, matching DIARIO exactly; forcing MENSUAL into it would require a new component, out of scope (classes-only change).

### Decision: SegmentedTabs `self-start` gotcha — verified not applicable

**Choice**: Do not add `self-start`; use `SegmentedTabs` at its default classes.

**Rationale**: The gotcha triggers when the immediate parent is `flex`. Here `SegmentedTabs` becomes a direct child of the root `<div className="space-y-4">` (block layout, confirmed at gastos-dashboard.tsx:443) — `align-items:stretch` never applies. Downgrades exploration's "Medium" risk to **None**.

## File Changes

| File | Action | Slice | Description |
|---|---|---|---|
| `src/features/contabilidad/components/gastos-dashboard.tsx` | Modify | C1 | Delete duplicated button block L811-837 (Libro tab); keep single set L576-602. |
| `src/features/contabilidad/components/gastos-dashboard.tsx` | Modify | C2 | Flat table (L853-909) → `DataTable`; `<Tabs>` (L608-612) → controlled `SegmentedTabs` + `AnimatePresence`/`tabContentVariants` (Kardex pattern); DIARIO date inputs → `DateRangeField`. |
| `src/features/contabilidad/components/gastos-dashboard.tsx` | Modify | D | Add `border` to containers L446, L619, L630, L702, L733 (post-C2 state). |
| `src/features/compras/components/factura-proveedor-modal.tsx` | Modify | B | `useMobile(1024)` branch: `Dialog` (desktop) vs `BottomSheet` (mobile); shared `titulo`/`cuerpo`/`footer`; button restyle. |
| `src/features/inventario/components/compras/compra-list.tsx` | Modify | A | Hand-rolled table+cards → `DataTable` + `renderMobileCard`; filter card → `toolbarSlot` with `DateRangeField` (staged `Consultar` flow preserved). |

## Interfaces / Contracts

No new interfaces. Reused as-is: `DataTableProps` (`columns`, `toolbarSlot`, `renderMobileCard`, `globalFilterFn`), `DateRangeFieldProps({desde,hasta})`, `BottomSheetProps({open,onOpenChange,title,children,footer})`, `TabItem<T>`. `gastos-dashboard.tsx` gains one local `TabActiva = 'dashboard' | 'libro'` union + `useState` (replaces uncontrolled `Tabs defaultValue`).

## Slice Detail

**A — `compra-list.tsx`** (~180-220 est.): Columns mirror the 12 existing `<th>`s (nro_factura, fecha, proveedor, TipoBadge, StatusBadge, 4 USD amounts, total_bs, tasa, creado_por). `toolbarSlot` = `DateRangeField` bound to staged `fechaDesde/fechaHasta` (NOT `consultaActiva`) + existing `MAX_RANGE_DAYS=62` validation + Consultar/Registrar buttons rendered alongside (DateRangeField doesn't replace the staged-commit pattern, only the two native inputs). `renderMobileCard` reuses `TipoBadge`/`StatusBadge` verbatim, replacing L280-312. `onRowClick={setDetalleId}` unchanged.

**C2 — Libro tab** (~140-180 est.): Columns mirror L856-864 (nro, fecha, cuenta, factura, proveedor, observaciones, costo+bs, StatusBadge). `onRowClick={setDetalleId}`. `emptyMessage="Sin gastos en el periodo"`. Total row (tfoot) has no `DataTable` slot — kept as a small footer `<div>` below the table (`showPagination` stays relevant only if row count grows; keep client pagination default).

**D** (~15-20 est.): Container class-only, no logic touched, grouped tree renderer untouched.

**Mobile strategy per screen**: A and C2 get `renderMobileCard` (opt-in cards, per `DataTable` contract). B gets full `Dialog`↔`BottomSheet` swap via `useMobile(1024)`. D has no mobile-specific change (chart/tree already responsive).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (new) | C1 regression | Mock `useGastos`/`useGruposGastoConSubcuentas`/`useCurrentUser`/`useCompany` (pattern from `cxp-page.test.tsx`), mock `GastoForm`/`CuentaGastoModal`/`FacturaProveedorModal` as `() => null`, render `GastosDashboard`, click "Libro de gastos" tab, assert `screen.getAllByRole('button', {name: /Agregar gasto/i})` has length 1 (fails today with 2). |
| Manual QA | A, B, C2, D | No component tests exist for these files today (matches `datatable-referencia-unificado` precedent) — visual/functional diff per slice PR: date filters, row click → modal, mobile viewport, Anular flow, fiscal totals unchanged. |
| Regression | All | `yarn type-check` (ignore pre-existing describe/it/expect noise), `yarn test:run` full suite green, `yarn lint`. |

## Migration / Rollout

No migration required. Each slice = one PR to `develop`, revertible independently via `git revert` (no cross-slice coupling; B's contract is stable so A/C2 never depend on B's internals).

## Per-Slice Line Estimate vs 400 Budget

| Slice | Est. lines | Budget risk |
|---|---|---|
| C1 | ~30 | Low |
| B | ~140-180 | Low |
| A | ~180-220 | Low-Medium |
| C2 | ~140-180 | Low-Medium |
| D | ~15-20 | Low |

All slices individually well under 400; no sub-split needed. Combining any two (e.g. A+B) would approach 320-400 — keep as 5 separate PRs.

## Open Questions

None blocking. Modal header/Badge/Anular placement resolved above.
