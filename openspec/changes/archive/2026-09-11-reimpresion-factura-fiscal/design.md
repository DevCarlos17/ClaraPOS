# Design: Reimpresion de Factura Fiscal (Gestion de Clientes)

## Technical Approach

Reprint is a pure-read composition of already-proven pieces. `buildReciboData`
(factura-export.ts) never changes shape — it gains one additive field. The
saved-invoice-to-`ReciboData` mapping, today duplicated byte-for-byte in
`nota-credito-pos-modal.tsx:263-291` and `crear-ncr-modal.tsx:121-149`, is
extracted into ONE pure function reused by both (extraction-only, zero
behavior change) plus a new hook that composes it for the new modal, which
has no pre-fetched `detalle`/`pagos`/`company` of its own. `FacturasEmpresaTable`
gains `onRowClick` wired straight to `DataTable`'s existing prop (already
supported, zero `DataTable` changes).

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| 1. Pure fn vs hook | Both: `buildReciboDataDesdeFacturaGuardada` (pure) used by the 2 existing modals (they already own `useDetalleFactura`/`usePagosFactura`/`useCompany`); `useReciboDesdeFactura(venta)` (hook) wraps the same 3 hooks + pure fn for the NEW modal, which starts only with a `FacturaParaAnular` row | Hook-only everywhere | NC modals already call the 3 hooks themselves with different variable names/deps arrays (FROZEN file); forcing them onto a new hook risks a `useMemo` deps mismatch. Touching only the `buildReciboData({...})` call site is the smallest possible diff on FROZEN code. |
| 2. New module location | `src/features/ventas/utils/recibo-desde-factura.ts` | Inline in each modal (status quo); `use-cxc.ts` | Sits next to `factura-export.ts` (its only real dependency) without inflating an unrelated hooks file; both modals already import from `utils/` |
| 3. `esReimpresion` marker | Additive `esReimpresion?: boolean` on `BuildReciboDataInput`/`ReciboData`, default `false`. Injected in `construirLineasRecibo` between the spacer after client data (L440) and `'Articulos'` (L441), and in `buildReciboPdfBlob` between the info block (L561) and `'Articulos'` label (L563). Centered via new pure helper `centrarTexto(texto, RECIBO_ANCHO_CHARS)` for text/PNG (space-pad, matches existing monospace convention) and native `{ align: 'center' }` for PDF (already used elsewhere in the same function) | `centered` flag on `LineaRecibo` touching the canvas draw loop | Space-padding is a pure string helper, zero change to the PNG draw loop; native center already proven in the PDF path |
| 4. `monedaPresentacion` in the extraction | Hook accepts `derivarMonedaPresentacion?: boolean`. Omitted (both NC modals) → `undefined` passed through → `buildReciboData` defaults `'USD'`, byte-identical to today. New modal passes `true` → hook reads `parseEmpresaConfig(company?.config).moneda_presentacion_documentos`, same source `venta-exitosa-modal.tsx` already uses | Always derive from company config | NC modals never read company config for this today (pre-existing, accepted gap per exploration.md); changing it would violate behavior-neutrality. Making it opt-in preserves both call sites' current behavior exactly. |
| 5. Modal location | `src/features/ventas/components/reimprimir-factura-modal.tsx` | `src/features/clientes/components/` | `cliente-detalle.tsx` already imports `FacturasEmpresaTable` from `ventas` (established cross-feature direction); keeps all `ReciboData` consumers (`venta-exitosa-modal`, `nota-credito-pos-modal`, `crear-ncr-modal`, `factura-detalle-panel`, now this) in one feature, ready for the 2 deferred ventas surfaces (POS dia, ventas-consultas-modal) without a later move |

## Data Flow

```
FacturasEmpresaTable row click (DataTable.onRowClick, existing prop)
  -> cliente-detalle.tsx: setFacturaSeleccionada(FacturaParaAnular)
    -> <ReimprimirFacturaModal venta={...} isOpen onClose />
      -> useReciboDesdeFactura(venta, { esReimpresion: true, derivarMonedaPresentacion: true })
           useDetalleFactura(venta.id)   [ventas_det JOIN productos]
           usePagosFactura(venta.id)     [pagos JOIN metodos_cobro/monedas]
           useCompany()                  [empresas WHERE id = empresa_id]
           -> buildReciboDataDesdeFacturaGuardada(venta, detalle, pagos, company, opts)
                -> buildReciboData(...)  [pure, unchanged shape + esReimpresion]
      -> <FacturaDetallePanel recibo={recibo} />        (reused as-is)
      -> "Descargar PDF" -> descargarReciboPdf(recibo)  (reused as-is)
      -> "Compartir"    -> compartirReciboImagen(recibo) (reused as-is, hidden if !navigator.share)
```

`venta.id` arrives already `empresa_id`-scoped (via `useFacturasEmpresa` upstream in `cliente-detalle.tsx`); `useDetalleFactura`/`usePagosFactura` filter only by `venta_id` (pre-existing gap, not introduced here, per exploration.md). `useCompany()` filters by `empresa_id` directly.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/ventas/utils/factura-export.ts` | Modify | Add `esReimpresion?: boolean` (2 types); `centrarTexto` helper; inject marker in `construirLineasRecibo` + `buildReciboPdfBlob` |
| `src/features/ventas/utils/recibo-desde-factura.ts` | Create | `buildReciboDataDesdeFacturaGuardada(factura, detalle, pagos, company, opts?)` (pure) + `useReciboDesdeFactura(venta, opts?)` (hook) |
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modify (extraction-only) | Replace `recibo` `useMemo` body (L263-291) with `buildReciboDataDesdeFacturaGuardada(...)`; delete now-unused local `toTipoImpuestoLinea`. FROZEN — hook calls/deps untouched |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modify (extraction-only) | Same swap (L121-149) |
| `src/features/ventas/components/facturas-empresa-tab.tsx` | Modify | `FacturasEmpresaTable` gains `onRowClick?: (f: FacturaParaAnular) => void`, passed to `DataTable` |
| `src/features/clientes/components/cliente-detalle.tsx` | Modify | `facturaSeleccionada` state + `onRowClick` wiring + render `ReimprimirFacturaModal` |
| `src/features/ventas/components/reimprimir-factura-modal.tsx` | Create | `FacturaDetallePanel` + Descargar/Compartir buttons (JSX mirrors `venta-exitosa-modal.tsx` L286-309) |

## Interfaces / Contracts

```ts
// factura-export.ts (additive)
interface BuildReciboDataInput { /* ...existing... */ esReimpresion?: boolean }
interface ReciboData { /* ...existing... */ esReimpresion?: boolean }
// buildReciboData(): esReimpresion: input.esReimpresion ?? false

// recibo-desde-factura.ts
function buildReciboDataDesdeFacturaGuardada(
  factura: FacturaParaAnular, detalle: DetalleFacturaCxc[], pagos: PagoFacturaCxc[],
  company: Company | null,
  opts?: { esReimpresion?: boolean; monedaPresentacion?: MonedaPresentacion }
): ReciboData

function useReciboDesdeFactura(
  venta: FacturaParaAnular | null,
  opts?: { esReimpresion?: boolean; derivarMonedaPresentacion?: boolean }
): { recibo: ReciboData | null; isLoading: boolean }
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `esReimpresion` default false = zero diff vs. current output; marker centered in both paths when true | Direct `buildReciboData`/`construirLineasRecibo`/`buildReciboPdfBlob` fixtures, no React |
| Unit | `buildReciboDataDesdeFacturaGuardada` mapping | Fixture `FacturaParaAnular`+`detalle`+`pagos`+`company` -> assert `ReciboData` fields, incl. `esReimpresion`/`monedaPresentacion` passthrough |
| Integration | `nota-credito-pos-modal.test.tsx`, `crear-ncr-modal.test.tsx` | Run UNMODIFIED against extracted code — must stay green (behavior-neutral proof) |
| Integration | `useReciboDesdeFactura` | Mock `@powersync/react` `useQuery`, assert loading/null/populated states |
| Integration | `reimprimir-factura-modal.test.tsx` | Row click opens/closes; Descargar/Compartir call the real pipeline; Compartir hidden w/o `navigator.share`; `AbortError` silent |
| Integration | `facturas-empresa-tab.test.tsx`, `cliente-detalle.test.tsx` | `onRowClick` fires with correct row; no per-row button rendered |

## Migration / Rollout

No migration required. Purely additive/extraction frontend change, no schema, no writes.

## Open Questions

- [ ] None blocking. Deferred (per proposal, out of v1): POS "facturas de caja del dia" standalone surface, `ventas-consultas-modal.tsx` ad-hoc PDF replacement.

## Review Workload Forecast — Proposed Slices

| Slice | Content | Est. lines |
|---|---|---|
| PR1 | `esReimpresion` marker + `centrarTexto` (factura-export.ts) + unit tests | ~120-160 |
| PR2 | `recibo-desde-factura.ts` (pure fn + hook) + swap into both NC modals + their tests stay green + new unit tests | ~250-320 |
| PR3a | `onRowClick` on `FacturasEmpresaTable` + `cliente-detalle.tsx` wiring + tests | ~120-160 |
| PR3b | `reimprimir-factura-modal.tsx` + tests | ~180-230 |

PR2 and PR3b individually approach but should stay under the 400-line budget; PR3a/PR3b are split to keep FROZEN-adjacent work (PR2) isolated from new-UI work (PR3).
