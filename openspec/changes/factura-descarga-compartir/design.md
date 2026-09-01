# Design: Descargar/Compartir Recibo desde Venta Procesada

## Technical Approach

Add a pure data/document layer (`factura-export.ts`) that turns a venta's persisted rows into a `ReciboData` model, then renders that model as plain text or PDF. `venta-exitosa-modal.tsx` gets one smart action button that feature-detects `navigator.share` to decide share-text (mobile) vs download-PDF (desktop). No new deps, no network calls, offline-safe.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Data source for line items | Re-query `ventas_det` via `ventaId` (existing `useDetalleFactura`) | Reuse in-memory `lineas` from `cobro-modal.tsx` | Matches persisted, decimal-rounded values (what `crearVenta` actually stored). Zero drift risk. |
| `useDetalleFactura` consolidation | Keep canonical query in `use-cxc.ts`; `use-notas-credito.ts` re-exports it; `venta-exitosa-modal.tsx` imports it directly | Move to `use-ventas.ts` (ventas domain) | Zero existing call sites change. Smallest diff. Domain purity is a nice-to-have, not worth extra churn in PR1. |
| Empresa fiscal header | `useCompany()` (`empresas` table: `rif`, `direccion`, `telefono`) | Query `empresas_fiscal_ve` | `empresas` already has the 3 fields needed; confirmed no `empresas_fiscal_ve` fields required by the fiscal decision (#1444). |
| Cliente header (RIF/direccion) | Thread `clienteIdentificacion`/`clienteDireccion` into `VentaExitosaData` from `clienteData: Cliente` (already a `cobro-modal.tsx` prop) | Re-query `clientes` in the modal | Data already in memory at submit time; no new query. |
| Money math in builders | `decimal.js` (`Decimal`), mirroring `lib/currency.ts` | Native `Number`/`.toFixed()` (as `venta-exitosa-modal.tsx` currently does for `totalAbonadoUsd`) | Repo has had rounding-drift bugs; `crearVenta` itself computes totals with `Decimal`. Builders must match, not the modal's ad-hoc float pattern. |
| Format strategy (PR1) | One button: mobile → `navigator.share({ text })`; desktop → PDF blob download | Separate "Compartir"/"Descargar" buttons, or add PNG format | Smallest UI surface; matches proposal's explicit PR1 slice; PNG/file-share deferred. |
| Exento/Exonerado grouping | Both `tipo_impuesto` values go to "monto exento" bucket, marked `(E)`, excluded from alicuota grouping | Mirror `crearVenta`'s totals loop (which only special-cases `'Exento'`, not `'Exonerado'`) | Fiscal requirement (#1444) explicitly groups both; builder is a display-only recomputation from `ventas_det`, independent of `crearVenta`'s stored total — no risk of altering stored totals. |

## Data Flow

```
cobro-modal.tsx (crearVenta) ──ventaId──> onSuccess(VentaExitosaData incl. ventaId,
                                            clienteIdentificacion, clienteDireccion)
                                                │
                                                ▼
                                    venta-exitosa-modal.tsx
                                        │             │
                              useDetalleFactura   useCompany()
                              (ventas_det JOIN     (empresas)
                               productos)
                                        │             │
                                        └──────┬──────┘
                                               ▼
                                     buildReciboData()  [pure]
                                               │
                                   ┌───────────┴───────────┐
                                   ▼                        ▼
                     buildReciboTextoPlano()       buildReciboPdfBlob()
                          [pure, string]              [jsPDF, Blob]
                                   │                        │
                                   ▼                        ▼
                         navigator.share({text})    anchor + URL.createObjectURL
                              (mobile)                   (desktop)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/ventas/utils/factura-export.ts` | Create | `ReciboData` model, `buildReciboData`, `buildReciboTextoPlano`, `buildReciboPdfBlob`, `shareOrDownloadRecibo` |
| `src/features/ventas/utils/__tests__/factura-export.test.ts` | Create | Vitest unit tests for the 2 pure builders |
| `src/features/ventas/components/venta-exitosa-modal.tsx` | Modify | Add `ventaId`, `clienteIdentificacion`, `clienteDireccion` to `VentaExitosaData`; add smart action button |
| `src/features/ventas/components/cobro-modal.tsx` | Modify | Thread `result.ventaId` + `clienteData.identificacion`/`.direccion` into `onSuccess(...)` |
| `src/features/ventas/hooks/use-notas-credito.ts` | Modify | Replace local `useDetalleFactura` with re-export from `use-cxc.ts` |

## Interfaces / Contracts

```ts
export type TipoImpuestoLinea = 'Gravable' | 'Exento' | 'Exonerado'

export interface ReciboLinea {
  codigo: string
  nombre: string
  esExento: boolean          // tipo_impuesto in ('Exento','Exonerado') -> shown as "(E)"
  cantidad: number
  precioUnitarioUsd: number  // sin IVA
  totalUsd: number           // cantidad * precioUnitarioUsd, sin IVA
}

export interface ReciboAlicuota { pct: number; baseUsd: number; ivaUsd: number }

export interface ReciboTotales {
  montoExentoUsd: number
  baseImponibleUsd: number   // sum of Gravable line totals
  alicuotas: ReciboAlicuota[] // grouped by impuesto_pct, Gravable lines only
  igtfUsd: number | null      // null when not applicable
  totalGeneralUsd: number
  totalGeneralBs: number
}

export interface ReciboData {
  nroFactura: string
  fecha: string
  emisor: { nombre: string; rif: string | null; direccion: string | null }
  cliente: { nombre: string; identificacion: string; direccion: string | null }
  lineas: ReciboLinea[]
  totales: ReciboTotales
}

export function buildReciboData(input: {...}): ReciboData          // pure
export function buildReciboTextoPlano(recibo: ReciboData): string  // pure
export function buildReciboPdfBlob(recibo: ReciboData): Blob       // jsPDF, deterministic
export function shareOrDownloadRecibo(recibo: ReciboData): Promise<void>
```

`shareOrDownloadRecibo` catches `AbortError` from a cancelled share sheet silently (no toast); any other share failure re-throws for the caller to toast.

## Totals-by-Alicuota Algorithm

For each `ReciboLinea` sourced from `ventas_det`:
1. `totalUsd = Decimal(cantidad).times(precioUnitarioUsd)` (matches stored `subtotal_usd`, not recomputed from float).
2. If `tipo_impuesto` is `'Exento'` or `'Exonerado'` → add `totalUsd` to `montoExentoUsd`.
3. Else (`'Gravable'`) → add `totalUsd` to `baseImponibleUsd`; add to the `alicuotas` bucket keyed by `impuesto_pct` (create bucket if new), `ivaUsd += totalUsd * pct / 100`.
4. `totalGeneralUsd = montoExentoUsd + baseImponibleUsd + sum(alicuota.ivaUsd) + (igtfUsd ?? 0)`.
5. `totalGeneralBs = usdToBs(totalGeneralUsd, tasa)` — uses `lib/currency.ts`, same rounding config as the rest of the app.

`igtfUsd` is passed straight through from `VentaExitosaData.igtfUsd` (already computed by `cobro-modal.tsx`) — no recomputation, no new source of truth.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `buildReciboData` totals | Vitest, table-style cases: single alicuota, mixed alicuotas (16%+8%), fully exento, IGTF present/absent — assert `ReciboTotales` fields |
| Unit | `buildReciboTextoPlano` | Snapshot-free assertions on key substrings (`(E)` marker, each alicuota line, IGTF line only when present) — avoid brittle full-string golden files |
| Unit | `shareOrDownloadRecibo` share path | Mock `navigator.share`; assert `AbortError` swallowed, other errors rethrown |
| Manual | PDF layout, iOS share gesture | Not automated in PR1; note in Open Questions |

`buildReciboPdfBlob` is not unit-tested directly (jsPDF output isn't meaningfully assertable) — its correctness is covered indirectly since it consumes the already-tested `ReciboData`.

## Migration / Rollout

No migration required. All changes are additive (`VentaExitosaData` gains optional-safe new fields; new util file; one new button). `ventaId` threading is a non-breaking field addition. Rollback = revert the 3 modified files + delete the new util; venta flow keeps working without the export feature.

## Size Forecast & Slicing

Estimated PR1 diff: `factura-export.ts` (~180 lines incl. types) + test file (~120 lines) + modal/button changes (~40 lines) + `cobro-modal.tsx` threading (~10 lines) + `use-notas-credito.ts` dedup (~5 lines) ≈ **~355 lines**, under the ~400 budget. If `buildReciboPdfBlob` grows past ~80 lines once column widths/pagination are tuned, split it into its own commit within the same PR (see `work-unit-commits`) rather than shrinking scope further.

## Open Questions

- [ ] iOS Safari share-gesture quirk (call `share()` synchronously in the click handler, no prior `await`) — needs real-device verification before merge, not blocking design.
- [ ] PDF pagination for receipts with many line items — reuse `jsPDF.addPage` pattern from `ventas-consultas-modal.tsx` if a receipt overflows one page; not expected to occur often for POS quick-sales.
