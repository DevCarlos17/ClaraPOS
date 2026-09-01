# Design: Cuadre de Caja — Rediseño de Layout

## Technical Approach

Surgically refactor `cuadre-page.tsx` (1013 lines) into a thin orchestrator that delegates to extracted child components arranged in a two-column CSS Grid. The left column holds the new prominent `CuadreNetoEsperado` card, existing KPI cards, diferencial cambiario, and a split arqueo section (physical | theoretical). The right column holds the payment methods list (`PagosResumen`) with each row opening the existing `CuadreMetodoModal` with two-tab drill-down. No data layer changes — all hooks from `use-cuadre.ts` remain as-is.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Layout system | CSS Grid `grid-cols-1 lg:grid-cols-2` | Flexbox columns | Grid gives equal-width columns with clean responsive collapse; matches existing pattern at line 524 of `cuadre-page.tsx` |
| Scroll strategy | Single page scroll, no per-column overflow | Independent column scrolls | Avoids scroll-sync issues (proposal risk #2); `CuadreNetoEsperado` is small enough to stay above fold without sticky tricks |
| Drill-down mechanism | Reuse existing `CuadreMetodoModal` (dialog) with added tabs | Inline panel replacing right column | Dialog is already built, tested, and accessible (uses `<dialog>`); inline panel would require complex state to swap columns and break mobile flow |
| Arqueo split | Two sub-columns inside left column via `grid-cols-1 md:grid-cols-2` | Separate cards stacked vertically | Side-by-side comparison at `md+` matches the PDF spec's visual intent; stacks naturally on mobile |
| Neto card component | New `CuadreNetoEsperado` as extracted component | Inline in page | Keeps page as thin orchestrator; reusable for print layout later |
| Teorico card component | New `CuadreArqueoTeorico` | Add formula to `CuadreConteoFisico` | Separation of concerns — physical count manages its own state; theoretical is pure display from hooks |
| KPI cards source | Use existing `CuadreKpiCards` component (already exists but unused in page) | Keep inline KPIs from page lines 466-509 | `cuadre-kpi-cards.tsx` already encapsulates this; removes ~40 lines from page |

## Data Flow

```
cuadre-page.tsx (orchestrator)
  │
  ├─ [filters, consulted, activeFilters] ← local state
  ├─ useSesionesPorCajaYFecha()
  ├─ useTasaDelDia()
  │
  ├─ Left Column
  │   ├─ CuadreNetoEsperado ← {saldoContadoUsd, cobrosAnterioresUsd, diferencialCambiarioUsd, tasaCambio}
  │   │    (pure display — parent computes from usePagosPorMetodo, useCobrosViaPOS, useTotalesFiscales)
  │   │
  │   ├─ CuadreKpiCards ← {filters, onClickVentas, onClickCxc}
  │   │    └─ useVentasDelDia(), useCxcDelDia()
  │   │
  │   ├─ CuadreTotalesFiscales ← {filters}
  │   │
  │   └─ Arqueo Split (grid-cols-1 md:grid-cols-2)
  │       ├─ CuadreConteoFisico ← {filters, tasaDelDia, verified, callbacks, onTotalChange}
  │       │    └─ usePagosPorMetodo(), useSaldoEfectivoBimonetario()
  │       └─ CuadreArqueoTeorico ← {fondoAperturaUsd, ventasEfectivoUsd, ingresosEfectivoUsd, egresosUsd, conteoFisicoUsd, tasaCambio}
  │            (pure display — parent computes from useSesionApertura, usePagosPorMetodo,
  │             useMovimientosManualesDia, useSaldoEfectivoBimonetario)
  │
  ├─ Right Column
  │   ├─ CuadreSaldoCaja ← {filters}
  │   ├─ PagosResumen ← {filters, tasaDelDia, onMetodoClick, ...}
  │   │    → onClick → setMetodoModal(nombre)
  │   ├─ CuadreDetallePagos ← {filters, onVerifiedChange, resetKey}
  │   └─ CuadreDetalleFacturas ← {filters}
  │
  └─ Modals (unchanged)
      ├─ CuadreMetodoModal ← {filters, metodoNombre} (add tabs)
      ├─ AuditModal, CxcModal, SafDetalleModal
      └─ Finalizar / Resumen / PrintSettings (unchanged)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/reportes/components/cuadre-neto-esperado.tsx` | Create | Prominent header card: Total Caja Neto Esperado with formula display |
| `src/features/reportes/components/cuadre-arqueo-teorico.tsx` | Create | Theoretical arqueo formula card (FONDO + VENTA + INGRESOS - EGRESOS) |
| `src/features/reportes/components/cuadre-page.tsx` | Modify | Restructure content section (lines 519-553) into two-column grid; replace inline KPIs (lines 466-509) with `CuadreKpiCards`; move components into left/right columns |
| `src/features/reportes/components/cuadre-metodo-modal.tsx` | Modify | Add two-tab view using shadcn Tabs: "Ventas del dia" (existing `useFacturasPorMetodo`) and "Cobros CxC" (filter from `useCobrosViaPOS` by metodoNombre) |
| `src/features/reportes/components/cuadre-conteo-fisico.tsx` | Modify | Remove summary row at bottom (lines 342-393) — that data moves to `CuadreNetoEsperado`; keep inputs and per-method diff display |
| `src/features/reportes/components/pagos-resumen.tsx` | Modify | Remove diferencial cambiario section (lines 231-258) — moves to `CuadreNetoEsperado`; keep method list and totals |
| `src/features/reportes/components/cuadre-kpi-cards.tsx` | Modify | No code changes needed; already exists — just wire it in `cuadre-page.tsx` |

## Interfaces / Contracts

```typescript
// cuadre-neto-esperado.tsx — pure display, parent computes all values
interface CuadreNetoEsperadoProps {
  saldoContadoUsd: number       // efectivo contado del día (de usePagosPorMetodo)
  cobrosAnterioresUsd: number   // cobros vía POS de días previos (de useCobrosViaPOS)
  diferencialCambiarioUsd: number // positivo o negativo (de useTotalesFiscales)
  tasaCambio: number            // para convertir a Bs
}

// cuadre-arqueo-teorico.tsx — pure display, parent computes all values
interface CuadreArqueoTeoricoProps {
  fondoAperturaUsd: number      // fondo con que abrió la caja (useSesionApertura)
  ventasEfectivoUsd: number     // ventas cobradas en efectivo (usePagosPorMetodo, tipo=EFECTIVO)
  ingresosEfectivoUsd: number   // ingresos manuales (useMovimientosManualesDia)
  egresosUsd: number            // egresos/retiros de la sesión
  conteoFisicoUsd: number       // total del conteo físico (via onTotalChange callback)
  tasaCambio: number
}
// Displays formula: FONDO + VENTA + INGRESOS − EGRESOS = teórico
// Shows diferencia = conteoFisico − teórico (green=ok, red=faltante)

// cuadre-conteo-fisico.tsx — new prop added
// onTotalChange?: (totalUsd: number) => void
// Fires via useEffect whenever the physical count total changes

// cuadre-metodo-modal.tsx — updated props
interface CuadreMetodoModalProps {
  isOpen: boolean
  onClose: () => void
  filters: CuadreFilters
  metodoNombre: string
  cobrosPos?: CobroViaPOS[]     // cobros del método, pre-filtered by parent
}
// Tabs:
//   "Ventas del dia" → existing useFacturasPorMetodo table
//   "Cobros desde POS" → renders cobrosPos prop (filtered by metodoNombre in parent)

// pagos-resumen.tsx — new props added
// selectedMetodoId?: string | null  (uses m.nombre as identifier, not UUID)
// onMetodoClick?: (metodoNombre: string) => void
// Rows: button with onClick + bg-primary/10 border-l-2 border-primary when selected
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Visual | Two-column layout at 1280px, single-column at 375px | Manual browser test at both widths |
| Smoke | Neto Esperado formula matches existing diferencial/totals | Compare values before/after refactor on same dataset |
| Regression | Finalizar Cuadre flow still works end-to-end | Manual test: open session → consult → count → finalize |
| Component | CuadreMetodoModal tabs render both data sources | Manual: click method → verify both tabs show data |

## Migration / Rollout

No data migration required. All changes are presentation-only within `src/features/reportes/components/`. Strategy:

1. **Extract first**: Create `CuadreNetoEsperado` and `CuadreArqueoTeorico` as standalone components
2. **Wire in page**: Restructure `cuadre-page.tsx` content section to two-column grid, swap in new components
3. **Update modal**: Add tabs to `CuadreMetodoModal`
4. **Clean up**: Remove duplicated diferencial/summary from `PagosResumen` and `CuadreConteoFisico`
5. **Verify**: Visual check at 1280px and 375px; verify Finalizar Cuadre flow

Rollback = `git revert` on affected files. No downstream effects.

## Open Questions

- [x] Whether to use `Sheet` (slide-in) or `Dialog` (centered) for drill-down → **Decision: keep existing `<dialog>` in CuadreMetodoModal** — already accessible, no new dependency
- [x] Should `CuadreConteoFisico` summary row (total sistema / total fisico / diferencia) be fully removed or kept as a compact version? → **Kept intact** (visual change deferred; `onTotalChange` callback covers the data need). The "Ajuste por redondeo cambiario" block in `PagosResumen` was removed (W1 fix) since `CuadreNetoEsperado` covers the same information.
