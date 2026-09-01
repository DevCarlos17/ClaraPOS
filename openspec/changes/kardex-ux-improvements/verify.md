# Verification Report: kardex-ux-improvements

> Change: `kardex-ux-improvements`
> Date: 2026-06-29
> Mode: Standard (strict_tdd: false — code review + static analysis)
> Model: anthropic/claude-sonnet-4-6

---

## Task Completeness

| Task | Description | Status |
|------|-------------|--------|
| T1 | `useBuscarProductosKardex` hook | ✅ Complete |
| T2 | `KardexProductoBuscador` autocomplete component | ✅ Complete |
| T3 | kardex-list: preload + causa filter + Facturación | ✅ Complete |
| T4 | kardex-list: print button | ✅ Complete |
| T5 | kardex-list: wire autocomplete | ✅ Complete |
| T6 | Ajuste masivo: flow gate | ✅ Complete |

**6 / 6 tasks complete.**

---

## Build / Type-Check Evidence

```
Command: yarn type-check
Exit code: 2 (pre-existing failures only)
```

Errors in changed files: **0**

Pre-existing errors (not introduced by this change):
- `src/lib/__tests__/*.test.ts` — missing test runner type definitions (`describe`, `it`, `expect` — pre-existing infra gap)
- `src/features/cxc/components/factura-detalle-cxc.tsx` — `factura` possibly null (pre-existing)
- Various `.test.ts` files in configuracion, inventario, ventas schemas — same infra gap

**No TypeScript errors were introduced by `kardex-ux-improvements`.**

---

## Spec Compliance Matrix

### Capability: kardex-filtros

| Scenario | Status | Evidence |
|----------|--------|----------|
| SC-01: Auto-load on navigation | ✅ PASS | `useState(true)` for `aplicado` (line 22); `filtrosAplicados` initialized with `startOfMonth()` / `todayStr()` (lines 23–30); data loads on mount |
| SC-02: Re-query with changed range | ✅ PASS | `handleConsultar` updates `filtrosAplicados` and calls `setAplicado(true)` (lines 65–75) |
| SC-03: Facturación filter | ✅ PASS | In `movimientosFiltrados` useMemo: `tipoSalida === 'FACTURACION'` → checks `m.origen !== 'VEN'` (lines 48–49); `'FACTURACION'` value never written to DB |
| SC-04: Merma unaffected by VEN | ✅ PASS | `else` branch checks `m.tipo_salida !== filtrosAplicados.tipoSalida` (line 51); entirely separate from VEN check |
| SC-05: Causa hidden/reset when Entradas | ✅ PASS | `useEffect` resets `filtroTipoSalida` when `filtroTipo === 'E'` (lines 34–36); Causa select rendered only when `filtroTipo !== 'E'` (line 225) |
| SC-06: Causa visible when Salidas | ✅ PASS | `filtroTipo !== 'E'` → select renders; options: Todas, Merma, Extravío, Consumo Interno, Facturación (lines 233–237) |
| SC-07: Causa visible when Todos | ✅ PASS | `filtroTipo === ''` is not `'E'` → same 5 options visible |

### Capability: kardex-print

| Scenario | Status | Evidence |
|----------|--------|----------|
| SC-08: Print button disabled without results | ✅ PASS | `disabled={!aplicado \|\| movimientosFiltrados.length === 0}` (line 253); on fresh load with auto-preload, `aplicado=true` so protection is via `length === 0` |
| SC-09: Print opens dialog with correct data | ⚠️ WARNING | `handlePrint` uses `window.open` + inline `<script>window.print()</script>` ✅; all 8 columns present (Fecha, Producto, Tipo, Origen, Causa, Cantidad, Stock, Motivo) ✅; generation timestamp ✅; **missing: department label in filter summary header** (spec requires "filter summary (date range, product, department, type, cause)"); company name also absent (spec: "if available") |

### Capability: kardex-product-autocomplete

| Scenario | Status | Evidence |
|----------|--------|----------|
| SC-10: Partial text search shows matches | ✅ PASS | LIKE query on `nombre OR codigo` with `%query%` (line 353); dropdown renders when `open && debouncedQuery && productos.length > 0` (line 80) |
| SC-11: Wildcard returns first 50 | ✅ PASS | `isWildcard = query.trim() === '*'` → `LIMIT 50` query without WHERE clause on nombre/codigo (lines 345, 351) |
| SC-12: Selecting suggestion closes dropdown | ✅ PASS | `handleSelect` calls `onChange(p.nombre)`, `setInputValue(p.nombre)`, `setOpen(false)` (lines 64–68) |
| SC-13: Outside click closes dropdown | ✅ PASS | `mousedown` listener on `containerRef`; closes when click is outside `containerRef.current` (lines 38–46) |
| SC-14: Empty input shows no dropdown | ✅ PASS | `isBuscando = query.trim().length > 0`; hook returns `[]` when `!isBuscando` (line 363); dropdown requires truthy `debouncedQuery` (line 80) |

### Capability: ajuste-masivo-flow

| Scenario | Status | Evidence |
|----------|--------|----------|
| SC-15: Initial state hides table | ✅ PASS | `tablaMostrada` initialized `false` (line 63); table wrapped in `{tablaMostrada ? (...) : (...)}` (line 510); "Generar Planilla de Conteo" button visible in else-branch (line 684) |
| SC-16: Department selection enables button | ⚠️ WARNING | Button disabled condition: `!filtroDepto \|\| !depositoId \|\| depositoId === '__ALL__'` (line 680). Spec says "disabled until at least one department is selected" but implementation ALSO requires depositoId. Functionally correct (can't count without a deposito) but spec only mentions department. |
| SC-17: Button click reveals table | ✅ PASS | `onClick={() => setTablaMostrada(true)}` (line 679) |
| SC-18: Scope change resets table | ✅ PASS | `useEffect(() => { setTablaMostrada(false) }, [depositoId, filtroDepto])` (lines 73–75) |

---

## Correctness Table

| Check | Status | Detail |
|-------|--------|--------|
| All queries filter by `empresa_id` | ✅ PASS | `useMovimientosFiltrados`, `useBuscarProductosKardex` use `useCurrentUser()` + `empresaId`; `AjusteMasivo` uses `empresaId` in all queries |
| No new DB mutations introduced | ✅ PASS | `useBuscarProductosKardex` and `KardexProductoBuscador` are read-only; no writes added |
| TypeScript — no new errors in changed files | ✅ PASS | Confirmed via `grep` of type-check output against file paths |
| `FACTURACION` value not written to DB | ✅ PASS | Only used as in-memory filter value; all DB writes use existing `tipo_salida` values |
| Existing table logic (editing, saving, bulk apply) unchanged | ✅ PASS | `AjusteMasivo` wraps existing logic inside `{tablaMostrada && ...}`; all save/apply paths intact |

---

## Design Coherence

| Decision | Status | Detail |
|----------|--------|--------|
| `aplicado=true` initial state | ✅ Aligned | Matches spec requirement for auto-preload; design intent confirmed |
| Debounce 300ms on autocomplete | ✅ Aligned | Per task spec; avoids excessive query calls |
| `mousedown` (not `click`) for outside-click close | ✅ Aligned | Prevents race with `onBlur`; `onMouseDown` + `e.preventDefault()` on suggestion click preserves selection |
| `filtroTipoSalida` reset via `useEffect` | ✅ Aligned | Ensures reset is reactive to any change of `filtroTipo`, not just on click |
| `tablaMostrada` reset on both `depositoId` and `filtroDepto` changes | ✅ Aligned | Both scopes must be re-confirmed per spec SC-18 |

---

## Issues

### WARNINGS

**W-01 — SC-09: Department missing from print header**
- Spec: "filter summary (date range, product, **department**, type, cause)"
- Implementation: `filtrosAplicados.depto` is applied in filtering but NOT rendered in the print header HTML
- Impact: Printed report lacks department scope context
- File: `src/features/inventario/components/kardex/kardex-list.tsx` lines 141–146

**W-02 — SC-09: Company name absent from print header**
- Spec: "company name (if available)"
- Implementation: No empresa name lookup; header starts directly with "Kardex de Movimientos"
- Impact: Print output doesn't identify the tenant company
- File: `src/features/inventario/components/kardex/kardex-list.tsx` line 139
- Note: Classified as WARNING (not CRITICAL) because spec uses conditional "if available"

**W-03 — SC-16: Button requires deposito + department (spec only mentions department)**
- Spec: "disabled until at least one department is selected"
- Implementation: Also requires `depositoId` to be set and not `'__ALL__'`
- Impact: User must select BOTH deposito AND department to enable the button (more restrictive than spec)
- File: `src/features/inventario/components/ajustes/ajuste-masivo.tsx` line 680
- Note: Functionally defensible (can't generate a count sheet without knowing which deposito); not a regression

### SUGGESTIONS

**S-01 — Pre-existing: test runner type definitions missing**
- All `.test.ts` files produce `Cannot find name 'describe'/'it'/'expect'` errors
- Not introduced by this change; requires `@types/jest` or Vitest globals configuration
- Tracked separately from this change

---

## Final Verdict

> **PASS WITH WARNINGS**

All 18 spec scenarios are verified as compliant or flagged with non-blocking warnings. All 6 tasks are complete. No TypeScript errors introduced. No DB mutation rules violated. Two print header omissions (department label + company name) are the only spec gaps — functional behavior is correct, only output completeness is reduced.
