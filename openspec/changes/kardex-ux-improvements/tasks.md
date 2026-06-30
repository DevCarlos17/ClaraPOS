# Tasks: Kardex UX Improvements

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~270 (T1:35 · T2:90 · T3:40 · T4:55 · T5:20 · T6:30) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 6 tasks | PR 1 | Single PR; under 400-line budget |

---

## Phase 1: Foundation

- [x] **T1** — `useBuscarProductosKardex` hook
  - **File**: `src/features/inventario/hooks/use-kardex.ts`
  - **depends_on**: none
  - **~35 lines added**
  - Add `export function useBuscarProductosKardex(query: string)` after existing hooks. Use `useQuery` + PowerSync. Guard: empty/whitespace → `[]`; `'*'` → `LIMIT 50`; else → `WHERE (nombre LIKE ? OR codigo LIKE ?) LIMIT 15`. Always filter `empresa_id` via `useCurrentUser()`. Return `{ productos, isLoading }`.
  - **Accepts**: SC-10 (partial match), SC-11 (wildcard 50), SC-14 (empty → no results)

---

## Phase 2: New Component

- [x] **T2** — `KardexProductoBuscador` autocomplete component
  - **File**: `src/features/inventario/components/kardex/kardex-producto-buscador.tsx` *(create)*
  - **depends_on**: T1
  - **~90 lines**
  - Props: `{ value, onChange, onKeyDown?, placeholder?, className? }`. Internal state: `inputValue`, `debouncedQuery` (300ms `useEffect`), `open`. `containerRef` for click-outside (`mousedown` listener). Calls `useBuscarProductosKardex(debouncedQuery)`. Dropdown: only when `open && debouncedQuery && productos.length > 0`. Each item: `<span className="font-mono text-xs">{codigo}</span> {nombre}`. Click item → `onChange(nombre)`, close. Escape key → close. No dropdown on empty input.
  - **Accepts**: SC-10, SC-11, SC-12 (click closes), SC-13 (outside click), SC-14

---

## Phase 3: Core Logic — kardex-list

- [x] **T3** — kardex-list: preload + causa filter + Facturación
  - **File**: `src/features/inventario/components/kardex/kardex-list.tsx`
  - **depends_on**: none
  - **~40 lines changed**
  - Change `useState(false)` → `useState(true)` for `aplicado`. Add `useEffect(() => { if (filtroTipo === 'E') setFiltroTipoSalida('') }, [filtroTipo])`. In causa `<select>`: render only when `filtroTipo !== 'E'`; add `<option value="FACTURACION">Facturación</option>`. In `movimientosFiltrados` useMemo: branch `tipoSalida === 'FACTURACION'` → check `m.origen === 'VEN'`; else existing `tipo_salida` check.
  - **Accepts**: SC-01 (auto-load), SC-02 (re-query), SC-03 (Facturación filter), SC-04 (Merma unaffected), SC-05 (causa hidden/reset), SC-06, SC-07

- [x] **T4** — kardex-list: print button
  - **File**: `src/features/inventario/components/kardex/kardex-list.tsx`
  - **depends_on**: T3
  - **~55 lines added**
  - Import `{ Printer }` from `@phosphor-icons/react`. Add `tipoSalidaLabel` helper mapping DB values to display text. Add `handlePrint()` using `window.open` + inline HTML + `window.print()` (same pattern as `ajuste-masivo.tsx` `handleReporte`). Header: company name, date range, product, department, type, cause, timestamp. Table: 8 columns (Fecha, Producto, Tipo, Origen, Causa, Cantidad, Stock, Motivo). Add `<Button>` with `<Printer />` icon; `disabled={!aplicado || movimientosFiltrados.length === 0}`.
  - **Accepts**: SC-08 (disabled without results), SC-09 (correct data in print)

---

## Phase 4: Integration / Wiring

- [x] **T5** — kardex-list: wire autocomplete
  - **File**: `src/features/inventario/components/kardex/kardex-list.tsx`
  - **depends_on**: T2, T3
  - **~20 lines changed**
  - Import `KardexProductoBuscador`. Replace plain `<input>` for product search with `<KardexProductoBuscador value={busqueda} onChange={setBusqueda} onKeyDown={...} placeholder="Buscar producto..." />`. Remove any inline onChange logic that the component now handles internally.
  - **Accepts**: SC-10, SC-11, SC-12, SC-13, SC-14

- [x] **T6** — Ajuste masivo: flow gate
  - **File**: `src/features/inventario/components/ajustes/ajuste-masivo.tsx`
  - **depends_on**: none
  - **~30 lines changed**
  - Add `const [tablaMostrada, setTablaMostrada] = useState(false)`. Add `useEffect(() => { setTablaMostrada(false) }, [depositoId, filtroDepto])`. Add "Generar Planilla de Conteo" `<Button>` disabled when `!filtroDepto || !depositoId`; onClick sets `tablaMostrada = true`. Wrap existing table section (lines 505–670) in `{tablaMostrada && (...)}`. Show button in place of table when `!tablaMostrada`.
  - **Accepts**: SC-15 (initial hidden), SC-16 (dept enables button), SC-17 (click reveals table), SC-18 (scope change resets)
