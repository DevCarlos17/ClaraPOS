# Design: Consulta de Factura + Evolución Post-Emisión

## Technical Approach

Additive `ReciboData.evolucion?: ReciboEvolucion` field, mapped by a new pure
function `buildReciboEvolucion` (factura-export.ts) from two hook-fetched
sources: `useReversosFactura` (extended with `total_usd`/`total_bs`) and a new
`useEvolucionFactura(ventaId, empresaId)` (`movimientos_cuenta` PAG/REV/SAFC).
Composition lives in `useReciboDesdeFactura`; the pure builder
(`buildReciboDataDesdeFacturaGuardada` → `buildReciboData`) only maps
already-fetched arrays — same fetch-in-hook/map-in-pure-fn split already used
for `detalle`/`pagos`/`company`/`esReimpresion`. All 3 renderers
(`construirLineasRecibo`, `buildReciboPdfBlob`, `FacturaDetallePanel`) read
this one field. Default/empty ⇒ `evolucion` is `undefined` ⇒ byte-identical
output (same discipline as `esReimpresion`).

Reversal amounts come from `notas_credito.total_usd/total_bs` (own table),
**not** `movimientos_cuenta` NCR — confirmed unreliable for CONTADO invoices
(exploration.md). `agruparReversosPorNc` groups quantities per NC line but
must take the NC's amount **once per group**, not once per joined row.

## Architecture Decisions

### Decision: Bs derivation for evolution amounts

| Option | Tradeoff | Decision |
|---|---|---|
| Use `monto_moneda` when `moneda_pago==='BS'`, else `usdToBs(monto, tasa_pago)` | Two branches, extra null-handling | Rejected — unnecessary branching |
| Always `usdToBs(monto, tasa_pago)` | Single formula, same helper factura-export.ts already uses everywhere (`usdToBs(totalUsd, input.tasa)`) | **Chosen** |

`movimientos_cuenta.monto` is **always USD** (confirmed at `aplicarPagoFacturaEnTx` L501-509, `registrarReversoAbono` L1573-1591, and the SAFC insert at `use-ventas.ts` L1140-1149 — all three call sites store `toStorageString(montoUsd)`). `tasa_pago` is the historical rate photographed at write time (rule #10). `usdToBs(monto, tasa_pago)` reproduces the exact same value SQLite already stored in `monto_moneda` for BS-native movements (same Decimal formula, deterministic), and is the only formula that also works for USD-native movements (where there is no separate Bs column). One formula, zero branching.

### Decision: `useEvolucionFactura` return shape

| Option | Tradeoff | Decision |
|---|---|---|
| Raw flat rows, grouping left to caller | Every consumer re-filters by `tipo` | Rejected |
| Pre-grouped `{ abonos, reversosPago, saldoAFavor }` | One `useQuery`, then 3 in-memory `.filter()` by `tipo` — trivial, keeps the hook's contract self-describing | **Chosen** (mirrors exploration.md recommendation) |

### Decision: `agruparReversosPorNc` amount extraction

**Choice**: read `total_usd`/`total_bs` only when creating a NEW group entry (`if (!grupo)` branch), never inside the per-row `grupo.lineas.push(...)` loop.
**Why safe for the 2 FROZEN NC modals**: they only ever read `.lineas[].cantidad` (quantity gating, `SeleccionLineasNc`) — never an amount field. Adding `montoUsd`/`montoBs` to `ReversoAplicado` is purely additive; existing consumers ignore the new fields.

## Data Flow

```
useReciboDesdeFactura(venta, opts)
  ├─ useDetalleFactura(ventaId)                         (unchanged)
  ├─ usePagosFactura(ventaId)                            (unchanged)
  ├─ useCompany()                                        (unchanged)
  ├─ useReversosFactura(ventaId, empresaId)   [PR2: +total_usd/total_bs]
  └─ useEvolucionFactura(ventaId, empresaId)  [PR3: NEW]
         │
         ▼ (all raw hook outputs)
buildReciboDataDesdeFacturaGuardada(..., evolucion?)   [PR4]
         │  maps ReversoAplicado[] + PAG/REV/SAFC rows
         ▼
buildReciboData({ ..., evolucion })                     [PR4]
         │  buildReciboEvolucion(input.evolucion) → ReciboEvolucion | undefined
         ▼
    ReciboData.evolucion?: ReciboEvolucion
         │
    ┌────┼─────────────────┐
    ▼    ▼                 ▼
construirLineasRecibo  buildReciboPdfBlob   FacturaDetallePanel
  (text/PNG) [PR5]       (PDF) [PR5]          (modal) [PR6]
```

`empresa_id` flows from `useCurrentUser()` inside `useReciboDesdeFactura` (new — today it has no `user` dependency) into both `useReversosFactura` and `useEvolucionFactura`, mirroring the pattern already used by `nota-credito-pos-modal.tsx`/`crear-ncr-modal.tsx`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `ventas/components/consulta-factura-modal.tsx` (was `reimprimir-factura-modal.tsx`) | Rename | `ReimprimirFacturaModal` → `ConsultaFacturaModal`; title → "Consulta de Factura" |
| `ventas/components/__tests__/consulta-factura-modal.test.tsx` (was `reimprimir-factura-modal.test.tsx`) | Rename | Mirror rename |
| `clientes/components/cliente-detalle.tsx` | Modify | Import path + JSX tag update |
| `clientes/components/__tests__/cliente-detalle.test.tsx` | Modify | Mock path + testid |
| `ventas/components/factura-detalle-panel.tsx` | Modify | Un-hide pagos (PR1); evolution section replacing L134-156 (PR6); rewrite L117-132 comment |
| `ventas/hooks/use-notas-credito.ts` | Modify | `useReversosFactura` SELECT +`nc.total_usd, nc.total_bs` (PR2) |
| `ventas/utils/notas-credito-ui.ts` | Modify | `ReversoFacturaRowInput`/`ReversoAplicado` +amount fields; `agruparReversosPorNc` fix (PR2) |
| `cxc/hooks/use-cxc.ts` | Modify | New `useEvolucionFactura(ventaId, empresaId)` (PR3) |
| `ventas/utils/factura-export.ts` | Modify | `ReciboEvolucion*` types, `buildReciboEvolucion`, `BuildReciboDataInput.evolucion` (PR4); render injection in `construirLineasRecibo`/`buildReciboPdfBlob` (PR5) |
| `ventas/utils/recibo-desde-factura.ts` | Modify | Compose `useReversosFactura`+`useEvolucionFactura`+`useCurrentUser`; `buildReciboDataDesdeFacturaGuardada` gains `evolucion?` param (PR4) |

## Interfaces / Contracts

```ts
// factura-export.ts — additive output types
export interface ReciboEvolucionReverso {
  nroNcr: string
  tipo: 'TOTAL' | 'PARCIAL'
  fecha: string
  montoUsd: number
  montoBs: number
}
export interface ReciboEvolucionMovimiento {
  fecha: string
  montoUsd: number
  montoBs: number
}
export interface ReciboEvolucion {
  reversos: ReciboEvolucionReverso[]
  abonos: ReciboEvolucionMovimiento[]
  reversosPago: ReciboEvolucionMovimiento[]
  saldoAFavorGeneradoUsd: number | null
  saldoAFavorGeneradoBs: number | null
}
// ReciboData.evolucion?: ReciboEvolucion   (added to existing ReciboData)

// factura-export.ts — additive input types + pure mapper
export interface ReciboEvolucionReversoInput {
  nroNcr: string
  tipo: string          // raw 'TOTAL' | 'PARCIAL' from ReversoAplicado
  fecha: string
  totalUsd: DecimalInput
  totalBs: DecimalInput
}
export interface ReciboEvolucionMovimientoInput {
  fecha: string
  monto: DecimalInput          // movimientos_cuenta.monto — always USD
  tasaPago: DecimalInput | null // movimientos_cuenta.tasa_pago
}
export interface ReciboEvolucionInput {
  reversos?: ReciboEvolucionReversoInput[]
  abonos?: ReciboEvolucionMovimientoInput[]
  reversosPago?: ReciboEvolucionMovimientoInput[]
  saldoAFavorGenerado?: ReciboEvolucionMovimientoInput | null
}
// BuildReciboDataInput.evolucion?: ReciboEvolucionInput   (added, additive)

/** Pure. Returns undefined when everything is empty (byte-identical guard). */
export function buildReciboEvolucion(input?: ReciboEvolucionInput): ReciboEvolucion | undefined

// use-notas-credito.ts — additive extension
export interface ReversoFacturaRow {
  // ...existing fields...
  total_usd: string   // NEW
  total_bs: string     // NEW
}
export function useReversosFactura(ventaId: string | null, empresaId: string): { reversos: ReversoFacturaRow[]; isLoading: boolean }
// SQL: SELECT nc.id as nota_credito_id, nc.nro_ncr, nc.tipo, nc.fecha,
//        nc.total_usd, nc.total_bs,               -- NEW
//        ncd.venta_det_id, ncd.descripcion as producto_descripcion, ncd.cantidad
//      FROM notas_credito nc JOIN notas_credito_det ncd ON ncd.nota_credito_id = nc.id
//      WHERE nc.venta_id = ? AND nc.empresa_id = ? ORDER BY nc.fecha ASC

// notas-credito-ui.ts — additive extension
export interface ReversoFacturaRowInput {
  // ...existing fields...
  total_usd: string  // NEW
  total_bs: string    // NEW
}
export interface ReversoAplicado {
  // ...existing fields...
  montoUsd: number  // NEW — read once per NC group
  montoBs: number    // NEW
}
// agruparReversosPorNc: montoUsd/montoBs set ONLY in the `if (!grupo)` branch
// (grupo creation), from row.total_usd/row.total_bs — never accumulated.

// cxc/hooks/use-cxc.ts — new hook (models useAfectacionCxc, but typed)
export interface EvolucionFacturaRow {
  tipo: 'PAG' | 'REV' | 'SAFC'
  monto: string            // USD (movimientos_cuenta.monto)
  tasa_pago: string | null
  fecha: string
  referencia: string
  observacion: string
}
export function useEvolucionFactura(ventaId: string | null, empresaId: string): {
  abonos: EvolucionFacturaRow[]
  reversosPago: EvolucionFacturaRow[]
  saldoAFavor: EvolucionFacturaRow[]
  isLoading: boolean
}
// SQL: SELECT tipo, monto, tasa_pago, fecha, referencia, observacion
//      FROM movimientos_cuenta
//      WHERE venta_id = ? AND empresa_id = ? AND tipo IN ('PAG','REV','SAFC')
//      ORDER BY fecha ASC
// (empresa_id filter is NOT optional here — rule #11; unlike the pre-existing
// gap in useDetalleFactura/usePagosFactura, this is NEW code and must not
// repeat it.)

// recibo-desde-factura.ts — additive param
export function buildReciboDataDesdeFacturaGuardada(
  factura: FacturaParaAnular,
  detalle: DetalleFacturaCxc[],
  pagos: PagoFacturaCxc[],
  company: Company | null,
  opts?: { esReimpresion?: boolean; monedaPresentacion?: MonedaPresentacion },
  evolucion?: ReciboEvolucionInput   // NEW, additive, default undefined
): ReciboData
```

## Loading Composition

`useReciboDesdeFactura` currently aggregates `loadingDetalle || loadingPagos || loadingCompany`. It gains two more sources:

```ts
const { user } = useCurrentUser()
const empresaId = user?.empresa_id ?? ''
const { reversos, isLoading: loadingReversos } = useReversosFactura(ventaId, empresaId)
const { abonos, reversosPago, saldoAFavor, isLoading: loadingEvolucion } = useEvolucionFactura(ventaId, empresaId)
// ...
if (loadingDetalle || loadingPagos || loadingCompany || loadingReversos || loadingEvolucion) {
  return { recibo: null, isLoading: true }
}
```

`ConsultaFacturaModal`'s existing `isLoading ? <Cargando/> : <FacturaDetallePanel .../>` branch needs no change — it already gates on the hook's single `isLoading`.

## Render Injection (PR5 — text/PNG + PDF)

Both injections read `recibo.evolucion` and render **nothing** when `undefined`.

1. **Text/PNG** (`construirLineasRecibo`, factura-export.ts): insert after L498 (pagos block's closing `lines.push({ text: SEPARADOR })`) and before L501 (`if (recibo.cierre)`). Header label: **"Evolucion"** (accent-free, consistent with the rest of the file — e.g. `Articulos`, `Metodos de pago`). Guard: `if (recibo.evolucion) { ... }` (guaranteed non-empty by `buildReciboEvolucion`'s own guard, so no need to re-check array lengths at render time).
   - Per reverso: `${r.nroNcr} (${r.tipo === 'TOTAL' ? 'Reverso Total' : 'Reverso Parcial'}): ${formatMontoBimonetario(r.montoUsd, r.montoBs, recibo.monedaPresentacion)}`
   - Per abono: `Abono ${formatDateTime(a.fecha)}: ${formatMontoBimonetario(...)}`
   - Per reversoPago: `Reverso de pago ${formatDateTime(rp.fecha)}: ${formatMontoBimonetario(...)}`
   - If `saldoAFavorGeneradoUsd != null`: `Genero saldo a favor: ${formatMontoBimonetario(saldoAFavorGeneradoUsd, saldoAFavorGeneradoBs, recibo.monedaPresentacion)}`

2. **PDF** (`buildReciboPdfBlob`, factura-export.ts): insert after L662 (pagos `autoTable`'s `y = ... .finalY + 6`) and before L665 (`if (recibo.cierre)`). Third `autoTable`, same `theme: 'grid'` / header styling as the pagos table (L651-660), body rows built from the same 4 cases above (`[label, formatMontoBimonetario(...)]`).

## Modal Render (PR6 — FacturaDetallePanel)

- PR1 (separate slice) un-hides the "Metodos de pago" block (mirrors L486-499 of `construirLineasRecibo`), placed right after the totals block (current L115), replacing the deleted comment L117-132.
- PR6 places the evolution block immediately after: same 4-case rendering as PDF/text, but as JSX cards (mirrors the existing `reversos.length > 0 && (...)` block style at L134-156). This REPLACES that block for the Consulta surface (`FacturaDetallePanel` is reused by other, unrelated FROZEN callers via the `reversos` prop — see below).
- `reversos` prop **stays** on `FacturaDetallePanelProps`, untouched — the 2 FROZEN NC modals pass `reversos` (for their unrelated max-double-credit line-quantity display, not money-flow reporting) but never pass a `ReciboData.evolucion`, so nothing new renders for them. `ConsultaFacturaModal` is the only caller whose `recibo.evolucion` is populated.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `buildReciboEvolucion` — empty input → `undefined`; multi-case input → correct USD/Bs via `usdToBs(monto, tasa_pago)` | New describe block in `factura-export.test.ts` |
| Unit | `agruparReversosPorNc` — multi-line NC takes `total_usd`/`total_bs` ONCE, not summed per line | New test in `notas-credito-ui.test.ts` (or its test file) with a 2+ line NC fixture |
| Unit | `useEvolucionFactura` — `empresa_id` in WHERE, `tipo IN (...)` filter, grouping by `tipo` | New describe block in `use-cxc.test.ts`, mirrors `useAfectacionCxc` tests |
| Unit | `useReversosFactura` extension — SELECT includes `total_usd`/`total_bs`; existing describe block's assertions stay green unmodified | Extend `use-notas-credito.test.ts` describe at L1172 additively |
| Regression | Empty evolucion ⇒ byte-identical text/PDF/PNG output | New test mirroring the existing `esReimpresion` byte-identical test (`factura-export.test.ts` L1166) |
| Regression | 2 FROZEN NC modal suites (`nota-credito-pos-modal.test.tsx`, `crear-ncr-modal.test.tsx`) pass unmodified after the additive `ReversoAplicado` extension | Run as-is, zero edits |
| Component | `FacturaDetallePanel` renders pagos + evolution sections when present, omits when absent | New/extended tests in its test file |
| Component | Rename: `ConsultaFacturaModal` renders title "Consulta de Factura"; `cliente-detalle.test.tsx` mock path/testid updated | Rewrite of the 2 renamed test files |

## Migration / Rollout

No migration required. Additive fields, read-only queries, no schema changes. Feature-branch-chain (6 PR slices on `feat/consulta-factura-evolucion`, base `feat/reimpresion-factura-fiscal`) allows discarding a late slice (e.g. evolution) without affecting earlier merged slices (rename, un-hide).

## Open Questions

None — all data sources, injection points, and the additive-empty-guard discipline were confirmed in `exploration.md` against actual source line references.
