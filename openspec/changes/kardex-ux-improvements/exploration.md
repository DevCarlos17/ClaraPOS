# Exploration: kardex-ux-improvements

**Date**: 2026-06-29
**Change**: Five UX improvements to the Kardex (inventory movements) module
**Explorer model**: anthropic/claude-sonnet-4-6

---

## Current State

### 1. Preload at entry — `kardex-list.tsx`

The component holds two parallel filter sets:

- **Draft filters** (`fechaDesde`, `fechaHasta`, `busqueda`, `filtroDepto`, `filtroTipo`, `filtroTipoSalida`) — updated by the UI controls in real time.
- **Applied filters** (`filtrosAplicados` object) + `aplicado: boolean` (default `false`) — only updated when the user presses "Consultar".

```tsx
const [aplicado, setAplicado] = useState(false)       // ← gates the table
const [filtrosAplicados, setFiltrosAplicados] = useState({ desde: startOfMonth(), hasta: todayStr(), ... })

const { movimientos } = useMovimientosFiltrados(filtrosAplicados.desde, filtrosAplicados.hasta)

const movimientosFiltrados = useMemo(() => {
  if (!aplicado) return []   // ← empty until Consultar is pressed
  ...
}, [movimientos, aplicado, filtrosAplicados])
```

The `useMovimientosFiltrados` reactive query already fires on mount with `startOfMonth()` + today (because state initializers run). The problem is only that `!aplicado` short-circuits the memo to `[]`. The data is already being fetched — it's just suppressed.

**Also available**: `useMovimientos(limit = 50)` in `use-kardex.ts` (lines 31–40) — returns the last N records with no date range filter, but does **NOT** JOIN with `productos` for `prod_nombre`/`prod_codigo`/`departamento_id`. The table needs those columns for display and client-side filtering.

---

### 2. Filtro de Causa — current implementation

After `kardex-salidas-tipificadas` was implemented, the `tipo_salida` column exists on `movimientos_inventario` with a CHECK constraint: `('MERMA', 'EXTRAVIO', 'CONSUMO_INTERNO')`.

**VEN origin movements** (POS sales) set `tipo_salida = NULL` — they were created before `tipo_salida` existed and are never typed because the sales flow does not call `registrarMovimiento` with a `tipoSalida` param. The `origen` column reliably identifies them as `'VEN'`.

**Current filter UI** (kardex-list.tsx lines 158–170):

```tsx
<select value={filtroTipoSalida} onChange={...}>
  <option value="">Todas</option>
  <option value="MERMA">Merma</option>
  <option value="EXTRAVIO">Extravío</option>
  <option value="CONSUMO_INTERNO">Consumo Interno</option>
</select>
```

The filter logic (line 42): `if (filtrosAplicados.tipoSalida && m.tipo_salida !== filtrosAplicados.tipoSalida) return false`

**Issue A — FACTURACION missing**: Selecting a causa of "Facturación" cannot be expressed by filtering `tipo_salida`, because VEN exits have `tipo_salida = NULL`. It must be expressed as `m.origen === 'VEN'`. This is a synthetic cause — it maps to an `origen` value, not a `tipo_salida` value.

**Issue B — Always-visible**: The causa `<select>` is always rendered regardless of `filtroTipo`. When the user selects "Entradas", the causa options (MERMA, EXTRAVIO, CONSUMO_INTERNO, FACTURACION) are all for exits and make no sense.

---

### 3. Print button — current state

No print button exists in `kardex-list.tsx`. The "Nuevo Movimiento" and "Consultar" buttons are the only action buttons.

**Existing print patterns in the project**:

| Location | Technique | Pattern |
|----------|-----------|---------|
| `ajuste-masivo.tsx` L300–337 | `window.open('', '_blank')` + `window.print()` | Inline HTML table, plain CSS `@media print` |
| `ventas-reportes-pdf.tsx` | `jsPDF` + `jspdf-autotable` | Full PDF with header, autoTable, multi-page |
| `cuadre-imprimir.tsx` | `window.print()` on a dedicated print view | Hidden div revealed by media query |

`ajuste-masivo.tsx` has an almost identical use case (tabular inventory data, date/filter context in header) and uses the simplest pattern. It renders a full HTML document in a new tab then calls `window.print()`.

---

### 4. Product search autocomplete — current state

`kardex-list.tsx` uses a plain `<input type="text">` for product search (lines 119–128). It requires the user to type and press "Consultar" — no live dropdown.

**The POS autocomplete component** (`producto-buscador.tsx`, 268 lines) is a fully-featured typeahead:
- `forwardRef` with `focus()` / `clear()` imperative handle
- Minimum 2-char threshold before showing dropdown
- `useLayoutEffect` for `fixed` positioning to escape `overflow-hidden` parents
- Keyboard navigation (ArrowUp/Down, Enter, Escape)
- Barcode scanner detection via inter-key timing (`SCANNER_THRESHOLD_MS = 50ms`)
- Displays price (USD + Bs), stock, service label in dropdown rows

**POS search hook** (`useBuscarProductosVenta`, use-ventas.ts lines 184–213):
- Queries `productos` with NFC normalization: `LOWER(nombre) LIKE ? OR codigo LIKE ? OR codigo_barras LIKE ?`
- Filters: `is_active = 1 AND (tipo = 'S' OR CAST(stock AS REAL) > 0)` — excludes out-of-stock products
- JOINs: `unidades`, `impuestos_ve` (for decimal and tax info)
- Returns: `id, codigo, tipo, nombre, precios x3, stock, es_decimal, codigo_barras, impuesto_pct`
- LIMIT 10

**For kardex**: the search is for any active product (including zero-stock), and does not need price/tax/level info. A simpler hook and a simplified dropdown row is appropriate. The POS component cannot be directly reused as-is (tasa + nivelActivo props, barcode scanner, price display are unwanted noise), but its dropdown UX and positioning logic are the model to follow.

---

### 5. Ajuste masivo — current flow

`ajuste-masivo.tsx` (795 lines). State relevant to the flow:

```tsx
const [depositoId, setDepositoId] = useState('')
const [filtroDepto, setFiltroDepto] = useState('')
```

**Current gate logic** (lines 505–512):

```tsx
{depositoId === '' || filtroDepto === '' ? (
  <EmptyState>
    {depositoId === '' ? 'Selecciona un deposito...' : 'Selecciona un departamento...'}
  </EmptyState>
) : isLoading ? (
  <Skeletons />
) : (
  <Table />
)}
```

The table renders **immediately** after both a deposito AND a departamento are selected — no confirmation step. The user complaint is that this is unintuitive: you can accidentally start editing while still deciding on scope.

**Proposed change**: add a `tablaMostrada: boolean` gate with a "Generar Tabla" button.

The existing query loads ALL products of type `'P'` for the company regardless of the filter state (lines 77–85); `productosFiltrados` is a client-side memo. So there's no query cost difference between showing/hiding the table — the data is already in SQLite.

**Multi-select analysis**: The request mentions "one, several, or all" for both deposito and departamento. The current query and state do not support multi-select. Implementing true multi-select would require:
- Replacing `useState<string>` with `useState<string[]>` for both
- Updating the SQL query to use `IN (?)` with multiple params (PowerSync supports array params)
- Updating the lot query similarly
- A multi-select UI component (not currently in shadcn/ui set)

This is medium complexity. The user's note says "the logic and table itself already work — only the flow/structure needs restructuring." Multi-select should be treated as a **separate, optional enhancement** outside this change.

---

## Affected Areas

| Path | Why affected | Improvements |
|------|-------------|-------------|
| `src/features/inventario/components/kardex/kardex-list.tsx` | Main component for all 5 improvements | #1, #2A, #2B, #3, #4 |
| `src/features/inventario/hooks/use-kardex.ts` | New hook for product autocomplete | #4 |
| `src/features/inventario/components/ajustes/ajuste-masivo.tsx` | Flow restructure | #5 |

No DB migrations, PowerSync schema changes, or other hooks are needed.

---

## Approaches by Improvement

---

### Improvement 1: Preload at entry

**Option A — Initialize `aplicado = true` (recommended)**
- Change `useState(false)` to `useState(true)` for `aplicado`
- The `useMovimientosFiltrados` query is already reactive and fires on mount with the current-month dates
- Result: page shows current month data immediately
- Pros: trivial change (1 character), zero hook changes, zero query cost (already fetched)
- Cons: none
- Effort: **Low**

**Option B — useEffect on mount**
- Keep `aplicado = false` as default but call `handleConsultar()` in `useEffect([], [])`
- Pros: explicit, intention-documenting
- Cons: extra render cycle, more code
- Effort: Low

**Recommendation**: Option A. It's simpler and the current month default is already set by the state initializer.

---

### Improvement 2A: Add "Facturación" to causa filter

**Approach**: Add `value="FACTURACION"` to the `<select>`, and in `handleConsultar` store it as `filtroTipoSalida: 'FACTURACION'`. In the `movimientosFiltrados` memo, add a branch:

```ts
if (filtrosAplicados.tipoSalida === 'FACTURACION') {
  if (m.origen !== 'VEN') return false
} else if (filtrosAplicados.tipoSalida) {
  if (m.tipo_salida !== filtrosAplicados.tipoSalida) return false
}
```

- Pros: no DB changes, works with existing data, `origen='VEN'` is reliable discriminator
- Cons: slight filter-state coupling (string 'FACTURACION' has special meaning)
- Effort: **Low**

---

### Improvement 2B: Dynamic causa filter visibility

**Approach**: Conditionally render the causa `<select>` based on `filtroTipo`:

```tsx
{(filtroTipo === '' || filtroTipo === 'S') && (
  <div className="flex items-center gap-2">
    <label>Causa:</label>
    <select ...>
      <option value="">Todas</option>
      <option value="MERMA">Merma</option>
      <option value="EXTRAVIO">Extravío</option>
      <option value="CONSUMO_INTERNO">Consumo Interno</option>
      <option value="FACTURACION">Facturación</option>
    </select>
  </div>
)}
```

When `filtroTipo` changes to `'E'`, also reset `filtroTipoSalida` to `''` (in the `onChange` handler of the tipo select).

- Pros: clean UX, no dead options
- Cons: none
- Effort: **Low**

---

### Improvement 3: Print button

**Approach**: Mirror the `ajuste-masivo.tsx` pattern — `window.open('', '_blank')` + `window.print()`. The function receives `movimientosFiltrados` and active filter labels as context.

Button placement: in the action bar next to "Consultar", only enabled when `aplicado && movimientosFiltrados.length > 0`.

```tsx
function handleImprimir() {
  const w = window.open('', '_blank')
  if (!w) return
  const filas = movimientosFiltrados.map((m) => `<tr>
    <td>${formatDateTime(m.fecha)}</td>
    <td>${m.prod_codigo ?? ''} - ${m.prod_nombre ?? m.producto_id}</td>
    <td>${m.tipo === 'E' ? 'ENTRADA' : 'SALIDA'}</td>
    <td>${origenLabel(m.origen)}</td>
    <td>${m.tipo_salida ?? '—'}</td>
    <td style="text-align:right">${parseFloat(m.cantidad).toFixed(3)}</td>
    <td style="text-align:right">${parseFloat(m.stock_nuevo).toFixed(3)}</td>
    <td>${m.motivo ?? '—'}</td>
  </tr>`).join('')
  w.document.write(`<!DOCTYPE html>...`) // HTML + CSS + table + filas
  w.document.close()
  w.print()
}
```

- Pros: zero new dependencies, consistent with existing pattern, works offline
- Cons: less polished than jsPDF (no pagination/headers per page)
- Effort: **Low**

**Alternative**: jsPDF + autoTable (already a dependency, used in ventas-reportes-pdf.tsx)
- Pros: multi-page, professional PDF output
- Cons: more code, async generation, dialog UX for options
- Effort: Medium

**Recommendation**: `window.print()` pattern for now — consistent with ajuste-masivo, zero new code, works offline.

---

### Improvement 4: Autocomplete dropdown

**Approach**: Create `KardexProductoBuscador` component + `useBuscarProductosKardex` hook.

**New hook** `useBuscarProductosKardex(query: string)` in `use-kardex.ts`:

```ts
export function useBuscarProductosKardex(query: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const searchTerm = query.trim().toLowerCase()
  const shouldSearch = searchTerm === '*' || searchTerm.length >= 2
  const pattern = searchTerm === '*' ? '%' : `%${searchTerm}%`

  const { data, isLoading } = useQuery(
    shouldSearch
      ? `SELECT p.id, p.codigo, p.nombre, p.departamento_id
         FROM productos p
         WHERE p.empresa_id = ? AND p.is_active = 1 AND p.tipo = 'P'
         AND (LOWER(p.nombre) LIKE ? OR p.codigo LIKE ?)
         ORDER BY p.nombre ASC LIMIT 15`
      : '',
    shouldSearch ? [empresaId, pattern, pattern] : []
  )
  return { productos: (data ?? []) as KardexProductoSugerencia[], isLoading }
}
```

**New component** `KardexProductoBuscador` (in kardex/ folder):
- Simplified version of `ProductoBuscador` without: price display, tasa prop, nivelActivo, barcode scanner
- Dropdown row: `codigo — nombre` only
- On select: sets `busqueda` state to the selected `codigo` (or the full product object reference)
- Keyboard nav: ArrowUp/Down, Enter, Escape
- Fixed dropdown positioning via `useLayoutEffect` (same as POS)
- `*` still accepted as "show all" by the existing consultar logic

When an item is selected from the autocomplete, it sets `busqueda` to the product `codigo` (or a display string) and calls `handleConsultar()` directly, so the result is immediate.

| Aspect | Detail |
|--------|--------|
| New hook | `useBuscarProductosKardex` in `use-kardex.ts` |
| New component | `kardex-producto-buscador.tsx` in kardex/ folder |
| Integration | Replace the text `<input>` in `kardex-list.tsx` with `<KardexProductoBuscador>` |
| Effort | **Medium** (hook + component + integration, ~150–200 lines net new) |

**Alternative**: Parameterize `ProductoBuscador` to accept a custom hook and row renderer. Reuse the core.
- Pros: DRY
- Cons: makes POS component more complex, coupling two different features
- Recommendation: separate component is cleaner

---

### Improvement 5: Ajuste masivo — protocolar flow

**Current**: table renders immediately when `depositoId !== '' && filtroDepto !== ''`.

**Proposed**: add a `tablaMostrada: boolean` gate.

```tsx
const [tablaMostrada, setTablaMostrada] = useState(false)

// Reset gate when selections change
useEffect(() => { setTablaMostrada(false) }, [depositoId, filtroDepto])

// In render: show "Generar" button when scope is selected but table not yet shown
{depositoId !== '' && filtroDepto !== '' && !tablaMostrada && (
  <div className="text-center py-8 border border-dashed rounded-2xl">
    <p className="text-sm text-muted-foreground mb-3">
      {productosFiltrados.length} producto(s) seleccionados. Presiona para iniciar el conteo.
    </p>
    <button onClick={() => setTablaMostrada(true)} className="...">
      <ClipboardText size={16} />
      Generar Planilla de Conteo
    </button>
  </div>
)}

{tablaMostrada && /* existing table JSX */}
```

- Pros: minimal change, no logic refactor needed, the data is already loaded (SQLite query fired)
- Cons: slight extra click; `tablaMostrada` resets when user changes filters mid-edit (intentional)
- Effort: **Low-Medium** (state + useEffect + button + conditional render)

**Multi-select scope (deferred)**:
- Out of scope for this change — requires query changes, multi-select UI, state as arrays
- Should be its own separate SDD change

---

## Gap Analysis

| # | Improvement | Type | Hook changes? | Complexity | Files affected |
|---|-------------|------|---------------|------------|----------------|
| 1 | Preload at entry | UI-only | No | **Low** | `kardex-list.tsx` |
| 2A | Facturación cause | UI-only | No | **Low** | `kardex-list.tsx` |
| 2B | Dynamic cause filter | UI-only | No | **Low** | `kardex-list.tsx` |
| 3 | Print button | UI-only | No | **Low** | `kardex-list.tsx` |
| 4 | Autocomplete dropdown | UI + hook | Yes (new hook) | **Medium** | `kardex-list.tsx`, `use-kardex.ts`, new `kardex-producto-buscador.tsx` |
| 5 | Masivo flow | UI-only | No | **Low-Medium** | `ajuste-masivo.tsx` |

---

## Risks

- **Preload (#1)**: With `aplicado = true` on mount, the current-month query fires immediately. If the empresa has very high movement volume, `LIMIT 500` guards performance. No additional risk.

- **FACTURACION filter (#2A)**: The `origen = 'VEN'` discriminator is reliable — all POS exits use `'VEN'`. Anulaciones use `'ANU'`. No false positives expected. The string `'FACTURACION'` used as a synthetic `filtroTipoSalida` value must never collide with a real `tipo_salida` DB value (the CHECK constraint prevents `'FACTURACION'` from being stored — safe).

- **Autocomplete (#4)**: `useQuery` is reactive — each keystroke fires a new SQLite query. With `LIMIT 15` and indexed `empresa_id` + `is_active` columns, performance should be acceptable offline. Debounce may be needed if typing feels laggy on large catalogs (500+ products). The POS buscador does not debounce and works fine.

- **Masivo flow (#5)**: `useEffect` resetting `tablaMostrada` on filter change means the user loses the "generated" state if they accidentally change the deposito dropdown. This is intentional (prevents stale scope) but should be communicated clearly in UI (a warning or confirmation before resetting). Low risk for data integrity since no writes have occurred yet.

- **Print (#3)**: `window.open` can be blocked by browser popup blockers if not called in a direct user event handler. Since `handleImprimir` will be called from a button `onClick`, this is a synchronous user event and will not be blocked. Safe.

---

## Recommendation

Implement all 5 improvements in a single change. Suggested order:

1. **#1 + #2A + #2B + #3** — all pure `kardex-list.tsx` changes; implement atomically in one task
2. **#5** — `ajuste-masivo.tsx` flow gate; independent, low risk
3. **#4** — autocomplete; separate task (new hook + new component)

This grouping keeps the kardex-list changes reviewable together and isolates the new component work.

---

## Ready for Proposal

**Yes.** All 5 improvements are scoped, the affected files are identified, and no DB migrations are needed. The orchestrator may proceed to `sdd-propose`.
