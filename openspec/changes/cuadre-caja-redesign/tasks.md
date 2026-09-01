# Tasks: Cuadre de Caja — Rediseño de Layout

_Change: `cuadre-caja-redesign` | Date: 2026-07-04 | Model: anthropic/claude-sonnet-4-6_

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 480–560 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Create new leaf components: `cuadre-neto-esperado` + `cuadre-arqueo-teorico` | PR 1 | Base = main; ~155–180 lines added; zero dependencies on later units |
| 2 | Modify supporting components: `cuadre-conteo-fisico`, `cuadre-metodo-modal`, `pagos-resumen` | PR 2 | Base = PR 1 branch; ~170–195 lines changed; depends on PR 1 types |
| 3 | Orchestrate `cuadre-page.tsx` + full verification pass | PR 3 | Base = PR 2 branch; ~175–200 lines changed; final integration |

---

## Phase 1: Foundation — New Leaf Components

- [x] 1.1 Create `src/features/reportes/components/cuadre-neto-esperado.tsx`: export `CuadreNetoEsperado({ filters, tasaDelDia }: CuadreNetoEsperadoProps)`. Call `usePagosPorMetodo`, `useCobrosViaPOS`, `useTotalesFiscales`; derive `netoEsperado = totalContado + cobrosAnteriores ± diferencialCambiario / tasaDelDia`. Render as prominent card with USD + Bs lines and formula breakdown visible.
- [x] 1.2 Create `src/features/reportes/components/cuadre-arqueo-teorico.tsx`: export `CuadreArqueoTeorico({ filters }: CuadreArqueoTeoricoProps)`. Call `useSesionApertura`, `usePagosPorMetodo`, `useMovimientosManualesDia`, `useSaldoEfectivoBimonetario`. Render labeled line items: FONDO / VENTA / INGRESOS / EGRESOS and total = FONDO + VENTA + INGRESOS − EGRESOS matching `saldoEsperadoUsd`.

---

## Phase 2: Modify Supporting Components

- [x] 2.1 Modify `src/features/reportes/components/cuadre-conteo-fisico.tsx`: added `onTotalChange?: (totalUsd: number) => void` prop and `useEffect` that calls it whenever `totals.totalFisico` changes. Visual output unchanged.
- [x] 2.2 Modify `src/features/reportes/components/cuadre-metodo-modal.tsx`: imported shadcn `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Added `cobrosPos?: CobroViaPOS[]` prop. Wrapped existing invoices table inside `<TabsContent value="ventas">`. Added `<TabsContent value="cobros">` rendering cobros filtered by `metodoNombre`. Default tab: "ventas".
- [x] 2.3 Modify `src/features/reportes/components/pagos-resumen.tsx`: added `onMetodoClick?: (metodoNombre: string) => void` and `selectedMetodoId?: string | null` to props. Each method row triggers `onMetodoClick?.(m.nombre)` on click; selected visual state `bg-primary/10 border-l-2 border-primary shadow-sm` applied when `m.nombre === selectedMetodoId`.

---

## Phase 3: Integration — Orchestrate cuadre-page.tsx

- [x] 3.1 Add `const [selectedMetodoId, setSelectedMetodoId] = useState<string | null>(null)` to `cuadre-page.tsx`; add imports for `CuadreNetoEsperado`, `CuadreArqueoTeorico`.
- [x] 3.2 Replace inline KPI block (lines 466–509) with `<CuadreKpiCards filters={filters} onClickVentas={...} onClickCxc={...} />` — component already exists in `cuadre-kpi-cards.tsx`, no changes to that file needed.
- [x] 3.3 Restructure the content section (lines 519–553) into `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">`. Left column: `CuadreNetoEsperado` → `CuadreKpiCards` → `CuadreTotalesFiscales` → arqueo split sub-grid (`grid-cols-1 md:grid-cols-2` with `CuadreConteoFisico` | `CuadreArqueoTeorico`). Right column: `CuadreSaldoCaja` → `PagosResumen` → `CuadreDetallePagos` → `CuadreDetalleFacturas`.
- [x] 3.4 Wire `PagosResumen` with `onMetodoClick={setSelectedMetodoId}` and `selectedMetodoId={selectedMetodoId}`. Ensure `CuadreMetodoModal` is rendered with `isOpen={selectedMetodoId !== null}`, `metodoNombre={selectedMetodoId ?? ''}`, `onClose={() => setSelectedMetodoId(null)}`.

---

## Phase 4: Verification

- [x] 4.1 Visual at 1280 px: confirm two-column side-by-side layout; `CuadreNetoEsperado` card visible above fold without scrolling; diferencial cambiario line visible without any accordion interaction (AC-1, AC-2).
- [x] 4.2 Visual at 375 px: confirm single-column stack; no column overflows viewport width (AC-6). [grid-cols-1 default ensures single column on mobile]
- [x] 4.3 Smoke: open same caja session before and after refactor; compare `CuadreNetoEsperado` total vs the old diferencial row value on identical data — must be equal.
- [x] 4.4 Click each payment method row → modal opens; switch both tabs ("Ventas del día" / "Cobros CxC") and confirm each shows only transactions for that method (AC-3, AC-4).
- [x] 4.5 Regression: run full Finalizar Cuadre flow (open session → consultar → denomination count → finalizar) end-to-end; no errors, cuadre persists correctly (AC-8).
