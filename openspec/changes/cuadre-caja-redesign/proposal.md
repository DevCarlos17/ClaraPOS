# Proposal: Cuadre de Caja — Rediseño de Layout

_Date: 2026-07-04 | Model: anthropic/claude-sonnet-4-6_

---

## Intent

The current cuadre de caja uses a vertical accordion that buries the "Total Caja Neto Esperado" and hides the differential cambiario behind scrolling. Cashiers must hunt for the number that closes their shift. The PDF spec ("estructura de cuadre clara pos") defines a two-column layout where the primary reconciliation total is always visible, payment methods are scannable at a glance, and each method is clickable to show its associated invoices. This is a pure presentation change — the data layer is already complete.

---

## Scope

### In Scope
- Restructure `cuadre-page.tsx` into a two-column orchestrator (summary left / payment methods right)
- Promote **Total Caja Neto Esperado** (Contado + Cobros Anteriores ± Diferencial Cambiario) to a prominent header card
- Make each payment method row clickable → modal showing ventas del día + cobros desde POS for that method
- Split arqueo section: left = physical count (`cuadre-conteo-fisico`), right = theoretical formula (FONDO + VENTA + INGRESOS − EGRESOS)
- Two separate invoice sections: **Ventas del día** | **Cobros desde POS** (currently mixed)
- Product detail per invoice within the drill-down view

### Out of Scope
- New PowerSync hooks or queries
- Schema migrations or Supabase changes
- Changes to `use-cuadre.ts` business logic
- PDF print layout (`cuadre-imprimir.tsx`)
- Other reportes tabs (CxC, Inventario, Ventas)

---

## Capabilities

> This section is the contract between proposal and specs phases.
> Research of `openspec/specs/` found: `caja/spec.md` (SAF-specific) and `prestamos/spec.md` — neither covers cuadre layout/interactivity.

### New Capabilities
- `cuadre-caja-layout`: Two-column cuadre layout with prominently displayed net total, clickable payment methods drill-down, and split arqueo (physical vs. theoretical)

### Modified Capabilities
- None — existing `caja` spec (CAP-1, CAP-2, CAP-3) is SAF-specific and remains unchanged

---

## Approach

1. **Two-column grid** in `cuadre-page.tsx`: `grid grid-cols-1 lg:grid-cols-[1fr_1fr]`. Left = summary totals + arqueo. Right = payment methods list.
2. **Summary column** (left): Net total card at top → KPI cards → diferencial cambiario card → arqueo split (two sub-columns on ≥ md: physical | theoretical formula).
3. **Payment methods column** (right): one card per method — name, total USD, total Bs. `onClick` → opens existing `cuadre-metodo-modal.tsx` (or a new `CuadreMetodoDrilldown` sheet) with two tabs: **Ventas del día** | **Cobros desde POS**.
4. **Drill-down state**: local `useState<string | null>(selectedMetodoId)` in `cuadre-page.tsx`. No Zustand store needed.
5. **Arqueo split**: `cuadre-conteo-fisico.tsx` becomes left panel; new `CuadreArqueoTeorico` displays the formula as labeled line items (FONDO + VENTA + INGRESOS − EGRESOS = Total Esperado).

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/reportes/components/cuadre-page.tsx` | Modified | Full layout restructure — becomes thin orchestrator |
| `src/features/reportes/components/cuadre-kpi-cards.tsx` | Modified | Moved into left summary column |
| `src/features/reportes/components/cuadre-metodo-modal.tsx` | Modified | Add two-tab view: Ventas del día / Cobros desde POS |
| `src/features/reportes/components/cuadre-conteo-fisico.tsx` | Modified | Extracted into arqueo left panel |
| `src/features/reportes/components/cuadre-saldo-caja.tsx` | Modified | Repositioned into summary column |
| `src/features/reportes/components/cuadre-arqueo-teorico.tsx` | New | Theoretical arqueo formula card (FONDO + VENTA + INGRESOS − EGRESOS) |
| `src/features/reportes/components/cuadre-neto-esperado.tsx` | New | Prominent header card: Contado + Cobros ± Diferencial |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Two columns break on mobile (320–768 px) | High | `grid-cols-1` on mobile; columns only activate at `lg` breakpoint. Test at 375 px. |
| Left column scroll vs right column scroll get out of sync | Medium | Use `overflow-y-auto` per column with fixed viewport height; or keep single scroll with sticky summary |
| `cuadre-metodo-modal.tsx` needs to accept two data sources simultaneously | Medium | Pass both `ventasDelDia` and `cobrosPosPOS` arrays as props; both already provided by existing hooks |
| Splitting arqueo view may require re-reading physical count state | Low | `cuadre-conteo-fisico` manages its own state; extract and lift only the total upward via callback |

---

## Rollback Plan

All changes are confined to `src/features/reportes/components/`. No data layer, no schema. Rollback = `git revert` on affected component files. No downstream effects on other modules.

---

## Dependencies

- All data already available via `use-cuadre.ts` hooks (`useSaldoEfectivoBimonetario`, `usePagosPorMetodo`, `useVentasDelDia`, `useCobrosViaPOS`, etc.)
- Tailwind CSS 4 responsive grid utilities (already in stack)
- shadcn/ui `Sheet` or `Dialog` for drill-down (already in stack)

---

## Success Criteria

- [ ] Total Caja Neto Esperado is visible above the fold on 1280 px desktop without scrolling
- [ ] Diferencial cambiario is visible without accordion expansion
- [ ] Each payment method row is clickable and opens a modal with two tabs: Ventas del día / Cobros desde POS
- [ ] Arqueo section shows formula: FONDO + VENTA + INGRESOS − EGRESOS = Total Esperado
- [ ] Two-column layout collapses to single column on mobile (< 1024 px)
- [ ] Existing SAF drill-down (caja spec CAP-2) continues to work unchanged
