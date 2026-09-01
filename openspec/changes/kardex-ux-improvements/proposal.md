# Proposal: Kardex UX Improvements

## Intent

Five friction-reducing UX improvements to the Kardex and Ajuste Masivo screens. Current pain points: data doesn't load until "Consultar" is pressed manually, POS sales are invisible in the causa filter, no print capability, product search is a plain text box, and the ajuste masivo table renders before the user confirms scope.

## Scope

### In Scope
- Kardex: auto-load current-month data on mount
- Kardex: "Facturación" causa option; hide causa select for Entradas
- Kardex: print button for filtered results (browser print)
- Kardex: product autocomplete dropdown (new hook + component)
- Ajuste Masivo: "Generar Planilla de Conteo" gate before table renders

### Out of Scope
- Multi-select departments/depositos in ajuste masivo (separate future change)
- PDF export via jsPDF
- Causa options for entry movements (not yet defined)
- Devolution cause type

## Capabilities

### New Capabilities
- `kardex-filtros`: Auto-preload on mount + dynamic causa filter with Facturación support
- `kardex-print`: Print filtered kardex results via browser print dialog
- `kardex-product-autocomplete`: Typeahead product search in kardex
- `ajuste-masivo-flow`: Explicit confirmation gate before count table renders

### Modified Capabilities
- None

## Approach

All changes are frontend-only — no DB migrations, no PowerSync schema changes.

1. **Preload**: Change `useState(false)` → `useState(true)` for `aplicado`; query already fires on mount with current-month defaults
2. **Causa filter**: Add synthetic `FACTURACION` option → filter by `m.origen === 'VEN'`; render causa select only when `filtroTipo === ''` or `'S'`; reset `filtroTipoSalida` when switching to Entradas
3. **Print**: `window.open() + window.print()` with inline HTML table; enabled only when `aplicado && results.length > 0`
4. **Autocomplete**: New `useBuscarProductosKardex(query)` returning `{id, codigo, nombre}` (LIMIT 15); new `KardexProductoBuscador` component — simplified POS buscador without price/barcode/tasa
5. **Flow gate**: Add `tablaMostrada: boolean` state; `useEffect` resets it when deposito or depto changes; "Generar Planilla" button appears when scope is selected but table not yet shown

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/inventario/components/kardex/kardex-list.tsx` | Modified | #1 preload · #2A/B causa filter · #3 print · #4 autocomplete wiring |
| `src/features/inventario/hooks/use-kardex.ts` | Modified | Add `useBuscarProductosKardex` hook |
| `src/features/inventario/components/kardex/kardex-producto-buscador.tsx` | New | Autocomplete component |
| `src/features/inventario/components/ajustes/ajuste-masivo.tsx` | Modified | `tablaMostrada` flow gate |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Popup blocker on print | Low | `onClick` is synchronous — guaranteed to bypass blockers |
| `'FACTURACION'` string collides with DB CHECK | Low | DB CHECK only covers `tipo_salida` column; string only lives in frontend filter state |
| Autocomplete perf on large catalogs | Low | LIMIT 15 + indexed `empresa_id`; POS buscador works without debounce |
| `tablaMostrada` resets mid-edit | Low-Med | Intentional (stale scope prevention); no data loss — no writes have occurred yet |

## Rollback Plan

All changes isolated to 4 files, no shared state or DB side-effects. Rollback per improvement: revert `aplicado` init, remove `FACTURACION` option, remove print button, restore plain `<input>`, remove `tablaMostrada` state. Each is independent.

## Dependencies

None — no external libraries, no migrations, no new PowerSync buckets.

## Success Criteria

- [ ] Kardex shows current-month data on mount without pressing "Consultar"
- [ ] "Facturación" causa filter returns only `origen = 'VEN'` movements
- [ ] Causa select is hidden when filtroTipo = Entradas
- [ ] Print button opens browser print dialog with filter summary and results table
- [ ] Typing ≥2 chars in product search shows matching dropdown; `*` shows first 50
- [ ] Ajuste masivo table renders only after "Generar Planilla de Conteo" is clicked
