# Design: Kardex UX Improvements

## Technical Approach

Five isolated, frontend-only changes to `kardex-list.tsx`, `use-kardex.ts`, a new autocomplete component, and `ajuste-masivo.tsx`. No DB/schema/sync changes. Each improvement modifies independent state slices — no cross-improvement coupling.

## Architecture Decisions

| Decision | Choice | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Preload strategy | Flip `aplicado` init to `true` | Trigger `handleConsultar` in `useEffect` | Initial `filtrosAplicados` already holds correct defaults; no extra render cycle needed |
| Facturación filter | UI-only synthetic value `'FACTURACION'` branching on `m.origen === 'VEN'` | Add `FACTURACION` to DB `tipo_salida` CHECK | DB CHECK covers real column values; this is a presentation filter only |
| Print implementation | `window.open` + inline HTML + `window.print()` | jsPDF | Follows existing `handleReporte` pattern in ajuste-masivo.tsx; no new dependency |
| Autocomplete debounce | `useState` + `useEffect` (300ms) | `useDeferredValue` / external lib | Matches project convention (no debounce lib used anywhere); 300ms is POS-standard |
| Flow gate reset | `useEffect` on `depositoId` + `filtroDepto` | Reset only on button re-click | Prevents stale-scope edits; no data loss since table is read-only until apply |

## Data Flow

### Kardex Autocomplete
```
KardexProductoBuscador (inputValue) ──debounce──→ useBuscarProductosKardex(query)
       │                                              │
       │ onChange(nombre)                              │ useQuery → SQLite
       ↓                                              ↓
  kardex-list.tsx (busqueda state)         { productos, isLoading }
```

### Ajuste Masivo Flow Gate
```
filtroDepto/depositoId change ──useEffect──→ tablaMostrada = false
                                                    │
  "Generar Planilla" click ─────────────────→ tablaMostrada = true
                                                    │
                                              render table (existing logic)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/inventario/components/kardex/kardex-list.tsx` | Modify | #1 preload · #2 causa filter + visibility + reset · #3 print button · #4 swap input for autocomplete |
| `src/features/inventario/hooks/use-kardex.ts` | Modify | Add `useBuscarProductosKardex` hook |
| `src/features/inventario/components/kardex/kardex-producto-buscador.tsx` | Create | Autocomplete dropdown component |
| `src/features/inventario/components/ajustes/ajuste-masivo.tsx` | Modify | Add `tablaMostrada` gate + "Generar Planilla" button |

## Interfaces / Contracts

```typescript
// use-kardex.ts — new hook
export function useBuscarProductosKardex(query: string): {
  productos: Array<{ id: string; nombre: string; codigo: string }>
  isLoading: boolean
}
// Guards: empty/whitespace → []; '*' → LIMIT 50; else → LIKE %query% LIMIT 15
// Always filters by empresa_id via useCurrentUser()

// kardex-producto-buscador.tsx — new component
interface KardexProductoBuscadorProps {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string
  className?: string
}
export function KardexProductoBuscador(props: KardexProductoBuscadorProps): JSX.Element
// Internal: debouncedQuery (300ms), open state, containerRef for click-outside
// Dropdown item: <span className="font-mono text-xs">{codigo}</span> {nombre}
```

### kardex-list.tsx state changes

```typescript
// #1 Preload — line 21
const [aplicado, setAplicado] = useState(true)  // was false

// #2 Causa — add useEffect + conditional render
useEffect(() => {
  if (filtroTipo === 'E') setFiltroTipoSalida('')
}, [filtroTipo])
// Causa select: render only when filtroTipo !== 'E'
// Add <option value="FACTURACION">Facturación</option>

// #2 Filter logic — in movimientosFiltrados useMemo
if (filtrosAplicados.tipoSalida === 'FACTURACION') {
  if (m.origen !== 'VEN') return false
} else if (filtrosAplicados.tipoSalida && m.tipo_salida !== filtrosAplicados.tipoSalida) {
  return false
}

// #3 Print — add import { Printer } from '@phosphor-icons/react'
// handlePrint(): same window.open pattern as ajuste-masivo handleReporte (lines 300-337)
// tipoSalidaLabel helper for plain text: MERMA→Merma, EXTRAVIO→Extravío, CONSUMO_INTERNO→Consumo Interno, else→value
// Button: disabled={!aplicado || movimientosFiltrados.length === 0}
```

### ajuste-masivo.tsx state changes

```typescript
// New state — after line 62
const [tablaMostrada, setTablaMostrada] = useState(false)

// Reset effect
useEffect(() => { setTablaMostrada(false) }, [depositoId, filtroDepto])

// "Generar Planilla" button: enabled when filtroDepto !== '' && depositoId !== ''
// Existing table section (lines 505-670): wrap in {tablaMostrada && (...)}
// When !tablaMostrada && depositoId && filtroDepto: show button instead of table
```

## Testing Strategy

No test infrastructure exists (strict_tdd: false). Manual verification per scenario SC-01 through SC-18 from spec.

## Migration / Rollout

No migration required. All changes are additive UI state — no DB writes, no schema changes.

## Open Questions

None.
