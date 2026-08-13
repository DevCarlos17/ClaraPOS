# Design: Reordenar Secciones y Desglose de Pagos en Recibo de Venta

## Technical Approach

Wiring-only change (no schema/persistence changes). Three layers:
1. **New pure module** `recibo-pagos.ts` (agrupación de pagos, cierre de excedente/crédito, reconciliación) — unit-testable, zero DOM/jsPDF deps.
2. **Threading**: `cobro-modal.tsx` forwards the `discrepancy` object it already builds (line ~432) through `onSuccess` → `VentaExitosaData` → `buildReciboData()`.
3. **Render**: two INDEPENDENT render paths get the new "Métodos de pago" + cierre section. Correction to the brief: `buildReciboPdfBlob` does **not** consume `construirLineasRecibo` — it has its own jsPDF/autoTable layout. Only `buildReciboTextoPlano` (share fallback) and `buildReciboImagenBlob` (PNG) share `construirLineasRecibo`. Both paths must be edited separately.

## Discovery (corrects task brief)

`buildReciboPdfBlob`'s existing order is **already** emisor → nro+fecha → cliente → artículos → totales — matches the target order. No PDF reorder needed, only an ADDITION (payments + cierre section after totales). The REORDER (move emisor before nro/fecha) is only needed in `construirLineasRecibo`, whose current order is nro/fecha → emisor → cliente → artículos → totales.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Where pure functions live | New `recibo-pagos.ts` sibling module | Inline in `factura-export.ts` | Keeps jsPDF/Canvas file (494 lines) from growing; isolates testable logic from rendering deps |
| Excess amounts source | Reuse `discrepancy` object already computed in `handleProcesar` (line 432) | Recompute in `onSuccess` | DRY — avoids duplicating Decimal math; single source of truth |
| Credit amount source | Client-side `saldoPendUsd` (already computed in `venta-exitosa-modal.tsx` L69-73, `totalUsd - Σpagos`) | Re-query `ventas.saldo_pend_usd` | Matches existing proposal risk mitigation; avoids offline-sync timing race |
| Currency resolution per payment | Use `PagoEntryForm.moneda`/`.metodo_nombre` (already denormalized on each pago) | Re-join against `metodos_cobro` table | Data already present on every `pagos` row — no extra query needed |
| `reconciliarTotalBs` tolerance | Flat `0.01` Bs | Tasa-scaled tolerance (`tasa * 0.01`, like `umbralBs` in cobro-modal) | Inputs are already view-precision (2 decimals) display totals; Decimal.js used through the whole accumulation chain avoids float drift, so a flat cent-tolerance suffices without threading `tasa` into the signature |
| PNG text wrap | Manual `measureText`-based greedy wrap applied to ALL `LineaRecibo` entries | Wrap only 2-3 flagged fields | Canvas has no native wrap; wrapping generically also defends against long product names for free |

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/ventas/utils/recibo-pagos.ts` | Create | `agruparPagosPorMetodo`, `construirCierreRecibo`, `reconciliarTotalBs`, `wrapCanvasText`; types `ReciboPagoLinea`, `ReciboCierre` |
| `src/features/ventas/utils/__tests__/recibo-pagos.test.ts` | Create | Table-driven unit tests (see Testing Strategy) |
| `src/features/ventas/utils/factura-export.ts` | Modify | Extend `ReciboData`/`BuildReciboDataInput`; reorder + extend `construirLineasRecibo` (~L202); add payments+cierre section to `buildReciboPdfBlob` (~L266); apply `splitTextToSize` wrap to emisor/cliente text; apply `wrapCanvasText` in `buildReciboImagenBlob` (~L390), recompute canvas height from wrapped line count |
| `src/features/ventas/components/cobro-modal.tsx` | Modify | `onSuccess({...})` (~L501) adds `discrepancy: discrepancy ? {mode, montoUsd, montoBs} : null` |
| `src/features/ventas/components/venta-exitosa-modal.tsx` | Modify | `VentaExitosaData` adds `discrepancy`; `construirRecibo` (~L75) passes `pagos`, `discrepancy`, `saldoPendUsd` (existing local) into `buildReciboData` |

## Interfaces / Contracts

```ts
// recibo-pagos.ts
export interface ReciboPagoInput {           // subset of PagoEntryForm
  metodo_cobro_id: string
  metodo_nombre: string
  moneda: 'USD' | 'BS'
  monto: number
}
export interface ReciboPagoLinea {
  metodoCobroId: string
  metodoNombre: string
  moneda: 'USD' | 'BS'
  montoNativo: number   // Σ monto in the method's native currency
  montoBs: number        // montoNativo if BS; usdToBs(montoNativo, tasa) if USD
  montoUsd: number        // montoNativo if USD; bsToUsd(montoNativo, tasa) if BS
}
export type ReciboCierreTipo = 'VUELTO' | 'SAF' | 'PROPINA' | 'DIFERENCIAL_SOBRANTE' | 'CREDITO'
export interface ReciboCierre { tipo: ReciboCierreTipo; montoUsd: number; montoBs: number }
export interface ReciboDiscrepancyInput {
  mode: ReciboCierreTipo | 'ABSORBER' | 'DIFERENCIAL_FALTANTE' | null
  montoUsd: number
  montoBs: number
}

export function agruparPagosPorMetodo(pagos: ReciboPagoInput[], tasa: DecimalInput): ReciboPagoLinea[]
// Groups by metodo_cobro_id, SUMs monto per group (Decimal), derives Bs/USD equivalents.

export function construirCierreRecibo(
  discrepancy: ReciboDiscrepancyInput | null, saldoPendUsd: number, tasa: DecimalInput
): ReciboCierre | null
// mode in {VUELTO,SAF,PROPINA,DIFERENCIAL_SOBRANTE} -> that line.
// else saldoPendUsd > 0.01 -> {tipo:'CREDITO', ...}. else null (covers ABSORBER/DIFERENCIAL_FALTANTE/null).

export function reconciliarTotalBs(lineas: ReciboPagoLinea[], totalBs: number): { reconciliado: boolean; diferenciaBs: number }
// tolerance = 0.01 Bs. Never throws — display-only; console.warn on mismatch.

export function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidthPx: number): string[]
```

```ts
// factura-export.ts additions
export interface ReciboData { /* existing fields */ pagos: ReciboPagoLinea[]; cierre: ReciboCierre | null }
export interface BuildReciboDataInput { /* existing */ pagos: ReciboPagoInput[]; discrepancy: ReciboDiscrepancyInput | null; saldoPendUsd: number }
```

```ts
// venta-exitosa-modal.tsx
export interface VentaExitosaData { /* existing */ discrepancy: ReciboDiscrepancyInput | null }
```

## Render Reorder Plan

`construirLineasRecibo`: emisor(nombre/RIF/dirección, wrapped) → "RECIBO Nro/Fecha" → cliente → artículos → totales → **"Métodos de pago" (per `ReciboPagoLinea`, Bs + $ equiv if USD)** → **cierre line (bold, if not null, via mode→texto map)**.

`buildReciboPdfBlob`: keep existing order (already correct); append new `autoTable` (Método | Monto) after the totales table, then a bold `doc.text` cierre line if present.

## Layout Wrap Approach

- **PDF**: `doc.splitTextToSize(text, maxWidth)` + loop `doc.text` per sub-line, incrementing `y`. `maxWidth = pageWidth - 30` (15mm margins) for centered emisor block; `maxWidth = pageWidth/2 - 20` for the two-column cliente/fecha block.
- **PNG**: `wrapCanvasText(ctx, text, PNG_ANCHO - 2*PNG_PADDING)` applied per `LineaRecibo` before drawing; canvas `alto` must be computed from the **wrapped** line count, not `lineas.length` (current bug source if left unwrapped).
- **Open question**: tester report mentions "usuario" overflowing, but no cashier/usuario field exists in `ReciboData` today (`Company` only has nombre/rif/dirección). Wrap is applied defensively to emisor.nombre/dirección + cliente.nombre/dirección; adding an actual cashier field is out of scope pending tester clarification.

## Testing Strategy

| Function | Cases |
|---|---|
| `agruparPagosPorMetodo` | multi-pago same método (sums), USD método (Bs equiv via tasa), BS método, full 3-método example reconciling to Bs 1000 |
| `construirCierreRecibo` | 4 excess modes, CREDITO via saldoPendUsd, null for ABSORBER/DIFERENCIAL_FALTANTE/null |
| `reconciliarTotalBs` | exact match, within 0.01 tolerance, outside tolerance |
| `wrapCanvasText` | short text (1 line), long text (multi-line split at word boundary) |

Visual PDF/PNG bytes are not asserted — covered by manual visual check per proposal risk mitigation.

## Migration / Rollout

No migration. Additive fields (`pagos`, `cierre`, `discrepancy` all new/optional at the boundary). Rollback: revert `factura-export.ts` section addition + `cobro-modal.tsx`/`venta-exitosa-modal.tsx` threading; receipt reverts to current form.

## Open Questions

- [ ] Clarify what "usuario" field the tester meant — no such field exists in `ReciboData`/`Company` today.
