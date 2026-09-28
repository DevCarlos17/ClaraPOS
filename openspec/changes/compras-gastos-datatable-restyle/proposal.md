# Proposal: Compras/Gastos DataTable Restyle

## Intent

Apply the established reference UI pattern (PR #167, `datatable-referencia-unificado`, Engram #4308) to the two legacy Compras/Gastos screens and their shared detail modal: `DataTable` elevated cards (`rounded-xl border shadow-md`, `bg-muted/40` header), `SegmentedTabs`, `DateRangeField`, and `BottomSheet`-on-mobile. This is **classes + structure only** — no fiscal/financial calculation logic moves or changes. Bonus: fix a real duplicate-buttons bug found during exploration.

## Scope

### In Scope (5 slices, execute in this order)

| # | Slice | File | Change | Est. lines |
|---|---|---|---|---|
| C1 | Bug fix | `contabilidad/components/gastos-dashboard.tsx` | Delete duplicated Crear cuenta/Imprimir/Agregar gasto button block (L811-837) inside Libro tab; keep the single working set at L576-602 (global bar, already outside `<Tabs>`). Add one regression test asserting a single button set renders. | ~30 |
| B | Modal | `compras/components/factura-proveedor-modal.tsx` | `useMobile(1024)` branch: `Dialog` (desktop) vs `BottomSheet` (mobile), single shared `cuerpo`, following `consulta-factura-modal.tsx` precedent exactly. | ~120-160 |
| A | Compras | `inventario/components/compras/compra-list.tsx` | Hand-rolled `<table>` + mobile card list → `DataTable` with `renderMobileCard`; filter card → toolbar with `DateRangeField` (keep existing `MAX_RANGE_DAYS=62` validation as a layer on top). | ~180-250 |
| C2 | Gastos Libro | `gastos-dashboard.tsx` (Libro tab) | Flat chronological `<table>` → `DataTable`; shadcn `<Tabs>` → `SegmentedTabs` (watch `self-start` gotcha in the flex filter-bar parent). | ~150-200 |
| D | Gastos Dashboard | `gastos-dashboard.tsx` (Dashboard tab) | Chart wrapper cards + grouped table's own container → `rounded-xl border shadow-md` / `bg-muted/40`. Container classes only. | ~40-70 |

### Out of Scope

- Fiscal/financial math: `amounts` Decimal.js `useMemo`, `totalAbonadoProveedor/Contable`, `deriveGastoTotales`, retenciones IVA/ISLR, any `formatUsd`/`formatBs` computation.
- `empresa_id` filtering and immutability rules (untouched, already correct).
- Dashboard tab's recursive grupo→subgrupo→cuenta→registro tree (`renderGrupoFilaTabla`) — **not** converted to `DataTable`'s row model; would require `getGroupedRowModel`/expansion-state redesign, out of scope for a restyle.
- `PagoCxPModal`, `PagoGastoCxpModal` (sub-modals of B) — continue rendering as `Dialog` regardless of viewport.

## Capabilities

### New Capabilities
None — pure UI restyle, no new business capability.

### Modified Capabilities
None — no spec-level requirement changes (C1 removes dead/duplicate UI, not a behavior requirement).

## Approach

Reuse existing primitives as-is (`src/components/data-table/`, `src/components/shared/segmented-tabs.tsx`, `bottom-sheet.tsx`, `date-range-field.tsx`) — zero changes expected to those files. No structural dependency forces order between A/C2 and B (modal's external contract `tipo/id/isOpen/onClose` is unchanged), but recommended order is **C1 → B → A/C2 (either order) → D**: C1 is a standalone bug fix with zero restyle risk; B is isolated and benefits both A and C2's mobile UX once merged; D is purely cosmetic, no urgency. Each slice ships as its own PR to `develop`; none is expected to individually exceed the 400-line review budget. Risk rises to Medium only if slices are merged together (e.g., A+B combined could approach 300-400+ lines) — keep them separate.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/inventario/components/compras/compra-list.tsx` | Modified | DataTable + DateRangeField migration (Slice A) |
| `src/features/contabilidad/components/gastos-dashboard.tsx` | Modified | Dedupe (C1), Libro DataTable + SegmentedTabs (C2), Dashboard card restyle (D) |
| `src/features/compras/components/factura-proveedor-modal.tsx` | Modified | Dialog↔BottomSheet branch (Slice B) |
| `src/components/data-table/`, `shared/segmented-tabs.tsx`, `shared/bottom-sheet.tsx`, `data-table/date-range-field.tsx` | Consumed only | No changes expected |
| `pago-cxp-modal.tsx`, `pago-gasto-cxp-modal.tsx` | Unaffected | Explicitly out of scope |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|--------------|
| Fiscal calc leakage while restructuring the 977-line modal | Med | Purely wrap/move JSX; never re-derive `amounts`/totals; same precedent as `producto-form-mascara-decimales` (never compute off display state) |
| Dashboard tab's grouped tree forced into `DataTable` | Low | Explicitly descoped in Slice D; container classes only |
| `SegmentedTabs` `self-start` gotcha in Gastos flex filter-bar (C2) | Med | Verify against documented gotcha in `segmented-tabs.tsx` before merging C2 |
| Date parsing regression in `compra-list.tsx` → `DateRangeField` (A) | Low | Reuse `DateRangeField` as-is (`parseISO`/`format`); never reimplement or use `toISOString` (VET UTC-4 gotcha) |
| Zero component/UI tests on all 3 target files | Med | Manual-QA gate per slice (same precedent as reference change); add one light regression test only for C1 (real behavior fix) |
| Modal header (Badge + Anular confirm flow) placement in BottomSheet (B) | Med | Open design decision — flagged for `sdd-design`, not resolved here |

## Rollback Plan

Each slice is an independent PR to `develop`; revert via `git revert` of that slice's merge commit with no cross-slice cascade (B's external contract is stable, so reverting A/C2 does not require reverting B). No DB migrations or data changes involved — rollback is code-only.

## Dependencies

- Reference primitives already merged/available: `DataTable`, `SegmentedTabs`, `DateRangeField`, `BottomSheet` (PR #167).
- `useMobile(1024)` hook (existing, used by `consulta-factura-modal.tsx` precedent).

## Non-Functional Constraints

- `yarn` only, never `npm`.
- UI copy stays 100% Spanish (no i18n).
- TypeScript strict — no `any`.
- Decimal.js for any money display value that passes through (read, don't recompute).
- Preserve `empresa_id` filtering already present in all data hooks feeding these screens (unchanged, but must not regress).

## Success Criteria

- [ ] All 5 slices merged to `develop`, each as a standalone PR under the 400-line review budget.
- [ ] C1: only one action-button set renders in Gastos (regression test passes).
- [ ] A & C2: `DataTable` renders desktop + mobile card view identically to prior UX; `MAX_RANGE_DAYS`/date filters still work.
- [ ] B: `FacturaProveedorModal` opens as `BottomSheet` <1024px and `Dialog` >=1024px, for both `tipo: COMPRA` and `GASTO`, sub-modals unaffected.
- [ ] D: Dashboard tab cards visually match `rounded-xl border shadow-md` / `bg-muted/40` pattern; chart logic and grouped tree untouched.
- [ ] No fiscal/financial calculation output changes (manual QA diff on totals/retenciones before/after).
- [ ] `yarn type-check` and `yarn test:run` pass on every slice.
