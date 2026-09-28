# Exploration: compras-gastos-datatable-restyle

## Current State

Reference pattern (PR #167, commit `b55c7e8`, on `develop`, merged) is captured in `openspec/changes/datatable-referencia-unificado/` and Engram `#4308`. It establishes: `DataTable` (`src/components/data-table/`) with `rounded-xl border shadow-md` cards, `bg-muted/40` header; `SegmentedTabs` (Kardex-style, `self-start` gotcha inside flex parents); `DateRangeField`/`DatePickerField` (`src/components/data-table/date-range-field.tsx`) using `parseISO`/`format` (never `toISOString`, VET UTC-4 gotcha, documented inline); `BottomSheet` (`src/components/shared/bottom-sheet.tsx`, `bg-card` system-wide) replacing `Dialog` on mobile via `useMobile(1024)`, with a shared `cuerpo` built once and branched — concrete precedent in `src/features/ventas/components/consulta-factura-modal.tsx`.

Three target files read in full:

1. **`src/features/inventario/components/compras/compra-list.tsx`** (327 lines). `rounded-2xl bg-card shadow-lg p-4` filter card (native `<input type="date">` Desde/Hasta + client-side `MAX_RANGE_DAYS=62` validation + Consultar/Registrar compra buttons). Content: hand-rolled `<table>` (L217-277, desktop `hidden md:block`) + hand-rolled card list (L280-312, mobile `md:hidden`) — both `onClick={() => setDetalleId(compra.id)}` opening the shared modal. No tabs.

2. **`src/features/contabilidad/components/gastos-dashboard.tsx`** (976 lines, monolithic). Filter bar (L446-605) OUTSIDE the `<Tabs>`, shared by both tabs: Criterio (TODAS/GRUPO/CUENTA) + conditional Grupo/Cuenta `<select>` + Intervalo 3-way toggle (custom pill buttons, NOT `SegmentedTabs` — this is a data filter, not page navigation) + date inputs whose *type* changes per intervalo (`date`/`month`/none) + 3 action buttons (Crear cuenta/Imprimir/Agregar gasto). shadcn `<Tabs>` (L608-914: `dashboard` + `libro`).
   - **Dashboard tab** (L615-805): stats+pie card and bar chart card (`rounded-2xl bg-card shadow-lg`, L630/702) — pure Recharts, safe restyle target. Below them, a "Detalle de registros" table (L732-803) that is **not a flat table** — it's a recursive grupo→subgrupo→cuenta→registro tree rendered as flat `<tr>` with `colSpan` group-header rows and `collapsedGroups`/`expandedCuentas` `Set` state driving conditional row injection (`renderGrupoFilaTabla`/`renderGrupoHijosFilaTabla`, L375-436).
   - **Libro tab** (L808-913): flat chronological `<table>` (all `gastosFiltrados` sorted desc), straightforward `DataTable` candidate. Contains a **second copy** of the exact same 3 action buttons (L811-837) — confirmed byte-for-byte duplicate of L576-602, same handlers (`setCuentaModalOpen`, `handleImprimir`, `setFormOpen`), same JSX, same icons. Real bug, not just style debt: since the button bar (L446-605) sits *outside* `<Tabs>`, it is already visible on both tabs — the Libro-tab copy is 100% dead weight.

3. **`src/features/compras/components/factura-proveedor-modal.tsx`** (977 lines). Single `Dialog`, no internal tabs, polymorphic on `tipo: 'COMPRA' | 'GASTO'`. `DialogHeader` carries title + type `Badge` + (GASTO-only) inline Anular confirm/cancel `Button` pair with local state (`confirmandoAnular`, `anulando`). Body: encabezado card, detalle table (COMPRA: articulos comprados; GASTO: cuenta/descripcion block), totales card (Decimal.js-derived `amounts`, bimonetario), historial de pagos table (with per-row Reversar confirm flow, permission-gated). Footer: Cerrar + conditional Diferencial cambiario / Registrar Pago. **Two sub-modals** (`PagoCxPModal`, `PagoGastoCxpModal`) render as siblings *outside* the `Dialog`, unaffected by any Dialog↔BottomSheet branching inside this file.

Fiscal/financial logic that MUST NOT change (restyle is classes/structure only): `amounts` `useMemo` (Decimal.js tasa/tasaInterna/usaParalela/totalContableUsd math, L208-258), `totalAbonadoProveedor`/`totalAbonadoContable` reduction (L262-273), `deriveGastoTotales`, `reversarAbonoCxP`/`registrarDiferencialCxP`/`anularGasto`/`reversarPagoGasto` calls, and every `formatUsd`/`formatBs`/`Decimal` computation in both target screens and the modal. None of these need to move — only their container markup does.

**Test coverage**: zero component/UI tests exist for any of the 3 target files (only `vi.mock('../factura-proveedor-modal', ...)` in an unrelated CxP page test). Hook/lib-level tests DO exist and cover the business logic that feeds these screens (`use-gastos.test.ts`, `gasto-montos.test.ts`, `use-compras.test.ts`, `compra-lineas-cargo.test.ts`, `compra-precio-gating.test.ts`) — those are untouched by a pure restyle. This mirrors the precedent in `datatable-referencia-unificado/design.md`, which explicitly delegated layout/DOM regression checks to "Manual QA... documented in PR description" because no layer renders the real `DataTable`/`ScrollArea`/flex chain in tests today.

## Affected Areas

- `src/features/inventario/components/compras/compra-list.tsx` — DataTable + `renderMobileCard` + `toolbarSlot`/`DateRangeField` migration.
- `src/features/contabilidad/components/gastos-dashboard.tsx` — button dedupe, Libro-tab DataTable migration, Tabs→SegmentedTabs, Dashboard-tab container class restyle (NOT its grouped table).
- `src/features/compras/components/factura-proveedor-modal.tsx` — Dialog↔BottomSheet branch via `useMobile(1024)`, shared body extraction.
- `src/components/data-table/date-range-field.tsx`, `src/components/shared/segmented-tabs.tsx`, `src/components/shared/bottom-sheet.tsx` — consumed as-is, no changes expected.
- `src/features/compras/components/pago-cxp-modal.tsx`, `src/features/contabilidad/components/pago-gasto-cxp-modal.tsx` — explicitly OUT OF SCOPE (sub-modals of the shared modal; task only asks to convert the outer modal).

## Approaches

1. **Original 4-slice split (A/B/C/D as briefed) as-is**
   - Pros: matches briefing directly, simplest mental model.
   - Cons: Slice C conflates 3 different-risk changes (trivial dedupe, real DataTable migration, Tabs swap) into one review unit; Slice D's boundary against the Dashboard tab's *grouped* detail table is ambiguous and risks someone trying to force that recursive table into `DataTable` (which does not cleanly support it without `getGroupedRowModel` rework — out of scope for a restyle).
   - Effort: Medium, but with a correctness trap in C/D boundary.

2. **5-slice split (recommended): C1 dedupe / B modal / A compras / C2 libro-tab / D dashboard-tab restyle-only** — see Recommendation.
   - Pros: each slice is independently mergeable, single-concern, and safely under the 400-line budget; isolates the one real *bug fix* (duplicate buttons) from pure style work so it can ship first/fastest; explicitly fences off the grouped table from DataTable conversion, preventing scope creep into a TanStack `getGroupedRowModel` redesign that isn't what was asked for.
   - Cons: one more PR to review than briefed.
   - Effort: Low-Medium per slice.

## Recommendation

Adopt the 5-slice split, in this order:

| Slice | Scope | Est. changed lines | Budget risk |
|---|---|---|---|
| **C1** | `gastos-dashboard.tsx`: delete duplicated button block (L811-837), no visual/behavior change (buttons already visible on both tabs from L576-602) | ~30 | Low |
| **B** | `factura-proveedor-modal.tsx`: `useMobile(1024)` branch, Dialog vs `BottomSheet`, single shared `cuerpo`, following `consulta-factura-modal.tsx` pattern exactly | ~120-160 | Low |
| **A** | `compra-list.tsx`: `DataTable` migration — `toolbarSlot` with `DateRangeField` (preserving the existing `MAX_RANGE_DAYS` validation as a layer on top, not lost), `renderMobileCard` replacing the hand-rolled mobile card list, drop the manual `<table>` | ~180-250 | Low-Medium |
| **C2** | `gastos-dashboard.tsx` Libro tab: flat table → `DataTable`; `<Tabs>` → `SegmentedTabs` (watch `self-start` in the flex filter-bar parent) | ~150-200 | Low-Medium |
| **D** | `gastos-dashboard.tsx` Dashboard tab: `rounded-2xl shadow-lg` → `rounded-xl shadow-md`, header `bg-muted/50`/`bg-muted/40` normalization on chart cards AND the grouped detail-table's own wrapper/header (container classes only — the recursive grupo/subgrupo/cuenta row-rendering logic is explicitly NOT migrated to `DataTable`) | ~40-70 | Low |

No structural dependency forces a strict order between A/C2 and B: the modal keeps its exact external contract (`tipo`, `id`, `isOpen`, `onClose`), so callers don't change when B ships. Recommended order is C1 first (it is a genuine dedup bug fix, valuable standalone and zero restyle risk), then B (isolated, benefits both A and C2's mobile experience for free once merged), then A and C2 in either order (independent of each other), then D last (purely cosmetic, no urgency).

Every slice individually stays well under the 400-line review budget. Risk only rises to Medium if slices are merged together into fewer PRs (e.g., A+B combined could approach 300-400+ lines).

## Risks

- **Fiscal calc leakage**: any refactor touching `amounts`, `totalAbonadoProveedor/Contable`, or `deriveGastoTotales` in the modal must be purely structural (wrapping, not rewriting) — this file's Decimal.js math is the same category of "computation must read full-precision source, never re-derive from display state" the project already burned itself on once (see `producto-form-mascara-decimales` precedent in CLAUDE.md).
- **Dashboard tab's grouped table is not a DataTable candidate**: forcing the `grupo→subgrupo→cuenta→registro` collapsible tree into `TanStack Table`'s row model would require `getGroupedRowModel`/custom expansion state, a real redesign — NOT covered by "restyle only". Proposal/design must explicitly descope this from Slice D or call out the extra effort if the owner wants it included.
- **SegmentedTabs `self-start` gotcha**: already documented inline in `segmented-tabs.tsx` — the filter-bar's parent in `gastos-dashboard.tsx` is a flex container (`<div className="space-y-4">` at top level is block, but the Tabs sit inside), needs verification when wiring in C2.
- **DateRangeField/date-fns timezone rule**: `compra-list.tsx`'s native `<input type="date">` migration to `DateRangeField` must reuse the shared component as-is (`parseISO`/`format`, never `toISOString`) — do not reimplement date parsing locally.
- **Modal header action placement in BottomSheet (Slice B)**: `ConsultaFacturaModal`'s precedent has a *static* title; `FacturaProveedorModal`'s header also carries a type `Badge` and a conditional Anular confirm/cancel `Button` pair with local state. `BottomSheet`'s `title` prop accepts `ReactNode` so this is feasible, but needs an explicit design decision (embed in `title` vs. render at the top of `cuerpo`) — flag for `sdd-design`, not decided here.
- **Zero existing component tests** for all 3 files: `strict_tdd=true` has no existing UI-test harness to extend for these specific files (only hook/lib tests, which are untouched by this change). Recommend following the reference change's precedent — manual QA gate for layout/DOM slices (A, B, C2, D) — but add/extend a lightweight test for **C1** (assert only one action-button set renders) since that slice is an actual behavior fix, not pure style.
- **Sub-modals out of scope**: `PagoCxPModal`/`PagoGastoCxpModal` must NOT be touched by Slice B; they continue rendering as `Dialog` regardless of viewport, per current behavior.

## Ready for Proposal

Yes. Recommend `sdd-propose` scope the change as the 5 slices above (not the original 4), with the Dashboard-tab grouped-table descoping and the modal-header BottomSheet placement flagged as open design questions for `sdd-design`.
