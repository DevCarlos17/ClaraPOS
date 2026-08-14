# Design: Orden fiscal de IGTF y referencia de factura en abono/excedente del recibo

## Technical Approach

B2 and B5 are both **pure derivation/formatting fixes** on already-computed data — no new
queries, no schema changes. B2 introduces one derived pre-IGTF subtotal and a **shared row
builder** consumed by both render paths (PNG/texto and PDF) so the ordering bug can never
diverge again. B5 restores a value already computed in `cobro-modal.tsx` that gets discarded
one function call later, and threads it through the existing `ReciboDiscrepancyInput` →
`construirCierreRecibo` → `ReciboCierre` → `formatearCierre` pipeline as an optional field.

## Architecture Decisions

### Decision: Shared `construirFilasTotales` row builder (B2)

| Option | Tradeoff | Decision |
|---|---|---|
| Fix PNG/texto totals block and PDF `totalesBody` independently | Simplest diff, but is exactly how the current bug happened (two copies, one fixed) | Rejected |
| Extract one pure function returning ordered `FilaTotal[]`, mapped by each renderer into its own shape | Slightly more code, but makes the two paths structurally unable to diverge | **Chosen** |

`construirFilasTotales(totales: ReciboTotales): FilaTotal[]` lives in `factura-export.ts`
next to `ReciboTotales`. PNG/texto (`construirLineasRecibo`) maps each row to a `LineaRecibo`;
PDF (`totalesBody`) maps each row to a `[label, value]` tuple. Both consume the *same* array,
in the *same* order, from the *same* `ReciboTotales` object — eliminating the class of bug
the tester found.

### Decision: `TOTAL FACTURA` label is reused as the final line when IGTF is absent (B2)

Per spec scenario "Venta sin IGTF": no separate `IGTF` line AND the final total shows *only*
the invoice total, without a `+ IGTF` suffix. Rather than keep both `TOTAL FACTURA` (subtotal)
and a redundant `TOTAL` line when IGTF is 0, `construirFilasTotales` folds them into a single
bold final row labeled `TOTAL FACTURA` when `igtfUsd` is null/0, or `TOTAL FACTURA` (non-bold
subtotal, USD-only, like `Base Imponible`) + `IGTF` + `TOTAL + IGTF` (bold, bimonetario) when
IGTF applies. No new field needed for the "no-IGTF final total" case — it's `totalFacturaUsd/Bs`
displayed as the last, bold row instead of `totalGeneralUsd/Bs`.

### Decision: `invoiceAssignments` carries only `nroFactura` + `montoUsd`; Bs computed downstream (B5)

`cobro-modal.tsx`'s `fifoPreview`/`invoiceAssignments` never computed `montoBs`. Rather than add
that at the modal (yet another Decimal conversion site), `construirCierreRecibo` — which already
receives `tasa` — derives `montoBs = usdToBs(montoUsd, tasa)` per assignment, same as it already
does for the top-level `montoBs`. Single conversion authority, consistent rounding.

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `factura-export.ts:37-44` (`ReciboTotales`) | Modify | Add `totalFacturaUsd: number`, `totalFacturaBs: number` (pre-IGTF subtotal) |
| `factura-export.ts:184-202` (`buildReciboData`) | Modify | Compute `totalFacturaUsd = montoExentoUsd+baseImponibleUsd+ivaTotal`; `totalFacturaBs = usdToBs(...)`; keep `totalGeneralUsd/Bs` unchanged (already = total+IGTF) |
| `factura-export.ts` (new, near line 253) | Add | `interface FilaTotal { label: string; usd: string; bs?: string; bold: boolean }` + `construirFilasTotales(totales: ReciboTotales): FilaTotal[]` (pure) |
| `factura-export.ts:280-295` (`construirLineasRecibo`) | Modify | Replace inline totals block with `construirFilasTotales(...).map(...)` → `LineaRecibo[]` |
| `factura-export.ts:419-429` (`buildReciboPdfBlob` `totalesBody`) | Modify | Replace inline totals block with `construirFilasTotales(...).map(...)` → `[label, value]` rows (line 431-434's old final-total push is removed, folded into the mapped rows) |
| `factura-export.ts:237-251` (`formatearCierre`) | Modify | `SAF` case: if `cierre.facturasAplicadas?.length`, render invoice list; else current text |
| `recibo-pagos.ts:26-30` (`ReciboCierre`) | Modify | Add `facturasAplicadas?: Array<{ nroFactura: string; montoUsd: number; montoBs: number }>` |
| `recibo-pagos.ts:32-36` (`ReciboDiscrepancyInput`) | Modify | Add `invoiceAssignments?: Array<{ nroFactura: string; montoUsd: number }>` |
| `recibo-pagos.ts:97-119` (`construirCierreRecibo`) | Modify | When `discrepancy.mode === 'SAF'` and `invoiceAssignments?.length`, map to `facturasAplicadas` with `montoBs` via `usdToBs` |
| `venta-exitosa-modal.tsx:35` (`VentaExitosaData.discrepancy`) | No type change | Already typed `ReciboDiscrepancyInput \| null` — inherits new optional field automatically |
| `cobro-modal.tsx:516-518` (`onSuccess` payload) | Modify | `invoiceAssignments: discrepancy.invoiceAssignments?.map(a => ({ nroFactura: a.nroFactura, montoUsd: a.montoUsd }))` added to the `discrepancy` object literal |

## Interfaces / Contracts

```ts
// factura-export.ts
export interface ReciboTotales {
  montoExentoUsd: number
  baseImponibleUsd: number
  alicuotas: ReciboAlicuota[]
  igtfUsd: number | null
  totalFacturaUsd: number   // NEW — pre-IGTF subtotal
  totalFacturaBs: number    // NEW
  totalGeneralUsd: number   // unchanged: exento+base+iva+igtf
  totalGeneralBs: number
}

interface FilaTotal { label: string; usd: string; bs?: string; bold: boolean }
function construirFilasTotales(totales: ReciboTotales): FilaTotal[]
// order: Exento? -> Base? -> IVA%... -> [TOTAL FACTURA(subtotal) -> IGTF] if igtf>0
//        -> final bold row (TOTAL + IGTF if igtf>0, else TOTAL FACTURA), always with `bs`

// recibo-pagos.ts
export interface ReciboDiscrepancyInput {
  mode: ReciboCierreTipo | 'ABSORBER' | 'DIFERENCIAL_FALTANTE' | null
  montoUsd: number
  montoBs: number
  invoiceAssignments?: Array<{ nroFactura: string; montoUsd: number }>  // NEW
}

export interface ReciboCierre {
  tipo: ReciboCierreTipo
  montoUsd: number
  montoBs: number
  facturasAplicadas?: Array<{ nroFactura: string; montoUsd: number; montoBs: number }>  // NEW
}

function formatearFacturasAplicadas(facturas: NonNullable<ReciboCierre['facturasAplicadas']>): string
// "1234 por Bs 500 ($1)" | "1234 por Bs 300 ($0.6), 1235 por Bs 200 ($0.4)"
// formatearCierre SAF case: `Abono aplicado a factura(s) ${formatearFacturasAplicadas(facturasAplicadas)}`
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `buildReciboData` totals math | `totalFacturaUsd` excludes IGTF; `totalGeneralUsd` unchanged |
| Unit | `construirFilasTotales` | IGTF>0: subtotal+IGTF+final 3 rows in order; IGTF null/0: single final `TOTAL FACTURA` row, no IGTF row |
| Unit | `construirLineasRecibo` / PDF `totalesBody` | Both produce same order/values for identical `ReciboData` fixture (regression guard for the original PDF/PNG divergence bug) |
| Unit | `construirCierreRecibo` | `invoiceAssignments` → `facturasAplicadas` with correct `montoBs`; absent → `facturasAplicadas` undefined |
| Unit | `formatearFacturasAplicadas` / `formatearCierre` | 0/1/N invoices; fallback SAF text when list empty; VUELTO/PROPINA/DIFERENCIAL/CREDITO untouched |
| Integration | `cobro-modal.tsx` FIFO submit → `VentaExitosaData.discrepancy.invoiceAssignments` | Assert not stripped at the `onSuccess` call site |

All new logic is pure (`Decimal`/`usdToBs` in, primitives out) — no canvas/jsPDF mocking needed
except the existing PDF snapshot-style assertions already in place for `buildReciboPdfBlob`.

## Migration / Rollout

No migration required. Display-only; revert the commit to roll back.

## Open Questions

None — both B2 and B5 are fully scoped by the existing spec and exploration.
