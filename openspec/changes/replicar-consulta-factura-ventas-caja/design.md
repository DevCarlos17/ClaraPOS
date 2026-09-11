# Design: Replicar consulta de factura en Ventas emitidas y NC-POS

## Technical Approach

Both screens drop in the EXISTING `FacturasEmpresaTable` + `ConsultaFacturaModal`
pair exactly as wired in `cliente-detalle.tsx` — zero changes to either
component. Screen 1 is a hook/table/modal swap plus deletion of ~380 lines of
duplicated bespoke code. Screen 2 does not touch the existing NC emission
tree at all; it wraps it behind one boolean reveal-gate and adds a sibling
`ConsultaFacturaModal` for "Reimprimir", reusing the read-only pipeline.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Screen 1 data source | `useFacturasEmpresa({ busqueda / clienteId, fechaDesde: FECHA_INICIO_HISTORICO, fechaHasta: todayStr() })` | Adapter mapping `FacturaBusqueda`→`FacturaParaAnular` | Hook already emits the exact shape `FacturasEmpresaTable`/`ConsultaFacturaModal` need — zero adapter (explore finding) |
| Historical search preserved | Local module const `FECHA_INICIO_HISTORICO = '2000-01-01'` in `ventas-consultas-modal.tsx`, passed explicitly | Add a "no date filter" mode to the hook | Hook's documented escape hatch is "pass an explicit wide range" (see `use-facturas-empresa.ts` JSDoc) — no hook change needed |
| "Por Factura" avoids full-table query on empty input | Add optional `enabled?: boolean` (default `true`) to `FiltroFacturasEmpresaHook`; `false` → empty SQL to `useQuery`, same skip pattern already used by `useFacturasSesionActiva`/`useFacturasPorCliente` | Always run the wide-range query | Preserves today's "type to search" UX (no query until 1+ char) — necessary tiny hook generalization, flagged per instructions, precedent already exists in-file |
| Screen 1 selection state | Single `facturaSeleccionada: FacturaParaAnular \| null` at `VentasConsultasModal` top level, replaces the old ternary `selectedFactura ? <FacturaDetalle/> : <Tabs/>` | Per-tab local modal state | Mirrors `cliente-detalle.tsx` 1:1; tabs stay always-visible, modal overlays |
| Screen 2 gate | One `ncSectionRevealed` boolean in `NotaCreditoPosModal`, gates JSX only | New sub-component / router state | Spec requires zero change to NC validation logic — a render condition is the minimal surface |
| Screen 2 Reimprimir | Mount `<ConsultaFacturaModal venta={factura} isOpen={reimprimirOpen} onClose={...} />` as a sibling `Dialog`, own `reimprimirOpen` state | Reuse the NC flow's own `FacturaDetallePanel` mount | `ConsultaFacturaModal` already composes `useReciboDesdeFactura`+`useEvolucionFactura` internally — no manual hook wiring needed here |

## Data Flow

**Screen 1** (per tab): `input → useFacturasEmpresa(filtros) → FacturasEmpresaTable(onRowClick) → setFacturaSeleccionada → ConsultaFacturaModal(venta)`

**Screen 2**: `select factura → setFacturaId (existing) + setNcSectionRevealed(false)`
→ footer `[Volver | Reimprimir | Emitir nota de crédito]` (gate closed)
→ click "Emitir nota de crédito" → `setNcSectionRevealed(true)` → existing NC
block (L534-671, untouched) renders, footer swaps to the existing
`[Volver | Editar métodos de pago | Confirmar Anulación]`. "Volver" always
does `setFacturaId(null)` (unchanged) + `setNcSectionRevealed(false)` (new
line) — single-stage per spec, same handler in both gate states.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/reportes/components/ventas-consultas-modal.tsx` | Modify | Delete `FacturaDetalle` (L385-693, jsPDF/autoTable builder), `FacturasList` (L339-381), `StatusBadge` (L707-721), now-unused imports/helpers. Swap `BuscarPorFactura`/`BuscarPorCliente` internals to `useFacturasEmpresa`+`FacturasEmpresaTable(mostrarAcciones=false)`. Top-level state → `facturaSeleccionada: FacturaParaAnular`, mount `ConsultaFacturaModal`. "Por Producto" untouched. |
| `src/features/reportes/hooks/use-ventas-reportes.ts` | Modify | Delete `useBuscarFacturas`, `useFacturasPorCliente`, `FacturaBusqueda` — confirmed zero other consumers (grepped) |
| `src/features/ventas/hooks/use-facturas-empresa.ts` | Modify (additive) | Add optional `enabled?: boolean` to `FiltroFacturasEmpresaHook` |
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modify | Add `ncSectionRevealed`+`reimprimirOpen` state; gate L534 condition; restructure footer L676-709 into two-branch render; add "Reimprimir" button + `ConsultaFacturaModal` mount; reset gate in the 3 existing trigger points (row-select L464-480, `isOpen`-close effect L196-209, "Volver" handler L678-685) |
| `src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` | Modify | Add shared test helper (click "Emitir nota de crédito") called by every existing test that reaches NC-section elements (~35-45 of 47 tests, one line each); add new `describe` for gate + Reimprimir scenarios |
| `src/features/reportes/components/__tests__/ventas-consultas-modal.test.tsx` | Create | New suite — file has none today |

## Interfaces / Contracts

```ts
// use-facturas-empresa.ts — additive, default preserves all 3 existing callers byte-identical
export interface FiltroFacturasEmpresaHook {
  fechaDesde?: string
  fechaHasta?: string
  busqueda?: string
  clienteId?: string
  enabled?: boolean // default true; false → useQuery('', [])
}
```

```ts
// nota-credito-pos-modal.tsx — new state only, zero change to existing state tree
const [ncSectionRevealed, setNcSectionRevealed] = useState(false)
const [reimprimirOpen, setReimprimirOpen] = useState(false)
// gate: {factura && puedeEmitirNc && ncSectionRevealed && (...existing NC JSX, untouched...)}
```

## Testing Strategy (strict TDD, RED → GREEN per slice)

| Slice | Assert | Must stay green |
|---|---|---|
| Screen 1 "Por Factura" | old-month invoice found (no month restriction), row-click opens `ConsultaFacturaModal`, close unmounts | — (new suite) |
| Screen 1 "Por Cliente" | client select → table → row-click → modal; `enabled=false` skips query pre-search | Screen 1 "Por Factura" tests |
| Screen 2 gate | NC section + "Tipo de nota de crédito" hidden by default; footer shows exactly `[Volver, Reimprimir, Emitir nota de crédito]`; "Emitir" reveals section + swaps footer; changing factura/closing panel/"Volver" re-hides | All 47 existing NC tests (via retrofit helper) |
| Screen 2 Reimprimir | Button only with factura selected; opens `ConsultaFacturaModal` with that factura's data; independent of gate state | Same as above |

## Slice Plan (informs sdd-tasks, final guard lines are that phase's call)

Screen 1's two tabs share one top-level state (`facturaSeleccionada`) and one
deletion set (`FacturaDetalle`/`FacturasList`) — they are **not severable**
into independently-shippable PRs without a throwaway adapter (rejected).
Revised split: **PR1** = both tabs' code conversion + full "Por Factura" test
coverage + a smoke test for "Por Cliente" (~450-550 raw lines, mostly
deletion). **PR2** = complete "Por Cliente" test coverage only, zero
production code (~100-150 lines, low risk). This replaces the proposal's
"tab-by-tab" split with a "code-then-test-completion" split.

**PR3 (reveal-gate) cannot shrink further.** Landing the gate and retrofitting
the ~35-45 existing tests it breaks must happen in the SAME PR — strict TDD
requires main stay green after every merge, and the retrofit is a direct,
unavoidable consequence of the gate (not deferrable to a follow-up PR).
Estimated 300-450 raw lines, but retrofit lines are mechanical one-liners
(low reviewer cognitive load despite the count). Recommend accepting a
documented `size:exception` for PR3 rather than fragmenting an atomic
change. PR4 (Reimprimir) stays separate and small (~80-150 lines), fully
additive, no interaction with the gate retrofit.

## Migration / Rollout

No migration required. Pure UI/read-only change; no schema, no writes, no
new tables.

## Open Questions

None blocking. `useDetalleFactura`/`usePagosFactura` empresa_id gap is
pre-existing debt, explicitly out of scope (confirmed not worsened — both
screens already route through the same shared pipeline other screens use).
