# Verification Report: reimpresion-factura-fiscal

_Filesystem copy of Engram obs #3324 (`sdd/reimpresion-factura-fiscal/verify`), created during this archive pass._

**Change**: reimpresion-factura-fiscal
**Version**: N/A (openspec)
**Mode**: Standard

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 30 (T1-01..10, T2-01..09, T3a-01..04, T3b-01..10) |
| Tasks complete (code verified) | 30/30 — all implemented and covered by passing tests |
| Tasks incomplete | 0 functionally; at verify time T1-01..T1-10 were left unchecked `[ ]` in tasks.md despite being fully implemented, tested, and passing (doc-tracking gap only, WARNING) — **checked off before this archive pass** |

## Build & Tests Execution

**Tests**: 1335 passed / 0 failed (113 files) — matches documented baseline exactly.
One documented non-regression: `db.ts` "Worker is not defined" unhandled rejection in jsdom (pre-existing, confirmed `use-cxc.ts`/`db.ts` untouched by this diff).

**Type-check** (`yarn type-check:test`): only the pre-existing `use-pwa-update.ts` TS6133 error (confirmed file has zero diff vs base branch — not introduced by this change). No new type errors.

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Apertura del detalle por click en fila | Click fila B abre B, cierre limpia | `cliente-detalle.test.tsx` "PR3b: click de fila..." + "cerrar el modal limpia..."; `facturas-empresa-tab.test.tsx` onRowClick tests | COMPLIANT |
| Contenido del modal | FacturaDetallePanel + 2 botones | `reimprimir-factura-modal.test.tsx` "renderiza FacturaDetallePanel...ambos botones" | COMPLIANT |
| Reimpresión PDF con marca centrada | PDF idéntico + REIMPRESION centrada | `factura-export.test.ts` "marcador REIMPRESION en buildReciboPdfBlob" (align:center, position between info block and Articulos) | COMPLIANT |
| Reimpresión por Compartir | oculto sin navigator.share; AbortError silencioso | `reimprimir-factura-modal.test.tsx` "sin navigator.share" + "AbortError...no dispara toast.error" | COMPLIANT |
| Marca ausente en venta en vivo | esReimpresion default false = byte-identical | `factura-export.test.ts` "con esReimpresion false y omitido, el texto es identico...NO contiene REIMPRESION" (regression guard) | COMPLIANT |
| Aislamiento por empresa | reconstrucción solo empresa actual | Static: `venta.id` arrives empresa_id-scoped via `useFacturasEmpresa` upstream (unchanged); no new unscoped query added | COMPLIANT (static evidence, design-documented gap not touched) |
| Reimpresión es pura lectura | sin writes, salida idéntica | grep confirmed zero writeTransaction/INSERT/UPDATE/DELETE in `recibo-desde-factura.ts` + `reimprimir-factura-modal.tsx`; both are pure read compositions | COMPLIANT |
| Neutralidad NC modals | suites NC pasan sin cambios | `git diff` on both NC modal test files = empty (zero bytes changed); both suites pass (part of 1335 total) | COMPLIANT |

**Compliance summary**: 8/8 scenarios/requirement groups compliant (10/10 individual scenarios covered).

## FROZEN Confirmation

`nota-credito-pos-modal.test.tsx` and `crear-ncr-modal.test.tsx`: **UNMODIFIED** — `git diff` shows zero changes to both files. Both suites pass as part of the 1335-test run. FROZEN contract honored.

## Regression-Guard Confirmation

Present and passing: `factura-export.test.ts` — "con esReimpresion false y omitido, el texto es identico entre ambos y NO contiene REIMPRESION (regresion: cero impacto en venta POS)". Also a matching PDF-side test confirms zero "REIMPRESION" `doc.text` calls when flag is false/omitted.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| esReimpresion marker (PR1) | Implemented | Additive on both interfaces; injected in `construirLineasRecibo` (between client-data spacer and 'Articulos') and `buildReciboPdfBlob` (between info block and 'Articulos' label, native `align:'center'`); `centrarTexto` pure helper correct (floor/ceil split, no-op if text >= width) |
| Extraction (PR2) | Implemented | `recibo-desde-factura.ts` matches design signatures exactly; both NC modals swapped to 1-line call, useMemo deps arrays untouched |
| Row click wiring (PR3a) | Implemented | `onRowClick?` additive prop, passed straight to existing `DataTable.onRowClick`; no per-row button added; only `cliente-detalle.tsx` wires it (other `FacturasEmpresaTable` caller in `facturas-empresa-tab.tsx` L294 unaffected, uses default `mostrarAcciones` so no click-propagation conflict) |
| Reprint modal (PR3b) | Implemented | Uses `useReciboDesdeFactura(venta, { esReimpresion: true, derivarMonedaPresentacion: true })`; reuses `FacturaDetallePanel`/`descargarReciboPdf`/`compartirReciboImagen` as-is (zero diff to `factura-detalle-panel.tsx`); Compartir hidden without `navigator.share`; AbortError swallowed (defense-in-depth, documented deviation in tasks.md T3b-08); loading state present |
| Pure read | Confirmed | No writeTransaction/INSERT/UPDATE/DELETE in any new/changed reprint-path file |
| empresa_id gap | Not newly introduced, not fixed | `useDetalleFactura`/`usePagosFactura` in `use-cxc.ts` confirmed zero diff — pre-existing filter-by-venta_id-only gap untouched, exactly as documented in design.md/tasks.md "Out of scope" |
| Immutability | No impact | No changes to any immutable financial write path (ventas, movimientos_*, tasas_cambio) |

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| 1. Pure fn + hook split | Yes | Exact signatures match design.md Interfaces/Contracts section |
| 2. Module location `utils/recibo-desde-factura.ts` | Yes | |
| 3. esReimpresion marker placement/centering | Yes | Text/PNG via `centrarTexto`, PDF via native `align:'center'` |
| 4. `monedaPresentacion` opt-in | Yes | NC modals get `undefined` (unchanged behavior); new modal passes `derivarMonedaPresentacion: true` |
| 5. Modal location in `features/ventas/components/` | Yes | |

## Issues Found

**CRITICAL**: None.
**WARNING**: `tasks.md` T1-01 through T1-10 (PR1) were left unchecked `[ ]` at verify time even though fully implemented and verified passing — cosmetic tracking gap only, no functional impact. Checked off before this archive pass.
**SUGGESTION**: None.

## Verdict

**PASS** — All 8 spec requirements / 10 scenarios verified compliant with passing runtime tests; FROZEN NC modal contract honored (zero diff, green); regression guard present and passing; reprint path confirmed pure-read; full suite 1335/1335 green with only documented pre-existing non-regressions.
