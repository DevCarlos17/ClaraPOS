# Tasks: Inventario Multideposito

Spec legend: PDD=producto-deposito-default, CPD=compras-por-linea-deposito, KDS=kardex-deposito-sugerido, VSD=ventas-stock-por-deposito, NCD=notas-credito-deposito-origen, ISA=inventario-stock-autoritativo, TRI=traspasos-inventario, EBD=empresa-bootstrap-deposito. TDD: strict, RED (failing test) before GREEN (impl). Test runner `yarn test:run`, types `yarn type-check:test`.

## Delivery Decisions (ratified)

- **Chain strategy**: `feature-branch-chain` — tracker branch accumulates integration; each PR targets the immediate previous slice's branch; only the tracker merges to `develop`.
- **Slice 1 split**: `1a`/`1b`/`1c` (below) — Slice 1's original ~600-680 lines exceeded the 400-line budget as one PR.

## Review Workload Forecast (final)

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: see per-slice table (all sub-slices now <=400)

| Slice | Est. lines | Risk | Chained PR | Decision needed |
|---|---|---|---|---|
| 1a. Schema/migration foundation | ~20-30 | Low | Yes | No |
| 1b. inventario_stock helper + current-resolution wiring | ~340-380 | Medium | Yes | No |
| 1c. Ingreso deposit routing (behavior change) | ~320-360 | Medium | Yes | No |
| 2a. Ventas read-path + POS threading | ~250 | Low-Medium | Yes | No |
| 2b. Ventas write-path guard + Edge Function | ~300 | Medium | Yes | No |
| 3a. Traspasos schema + pure fns | ~190 | Low | Yes | No |
| 3b. Traspasos atomic hook | ~300 | Medium | Yes | No |
| 3c. Traspasos UI | ~210 | Low-Medium | Yes | No |
| 4. Bootstrap + notas de credito | ~140 | Low | Yes | No |

All 9 sub-slices are now individually <=400 changed lines. Total across the chain ≈ 2,050-2,240 lines — expected for an 8-requirement, 34-scenario, cross-cutting multi-tenant inventory change; the chain (not a single PR) is what keeps each review small.

## Why 1b/1c split this way (not e.g. compras-full-in-one, kardex-full-in-one)

`1b`'s job is ONLY to stop `inventario_stock` from being orphaned (exploration Finding C) — it wires the new `upsertStockDeposito` helper into compras/kardex/ajustes write paths using WHATEVER deposit resolution is already live today (single prefetched `depositoId` for compras, principal-only fallback for kardex, already-correct `linea.deposito_id` for ajustes). No user-visible routing behavior changes. `1c` then swaps ONLY the resolution input feeding those same `upsertStockDeposito` calls (per-line for compras, product-default for kardex) — same call sites, different source variable, so the `1c` diff is a small, isolated behavioral swap on top of `1b`'s plumbing.

This ordering guarantees `1a+1b` alone is a deployable, non-regressive state: `inventario_stock` becomes accurate for 3 of 4 write paths (ventas deliberately deferred to Slice 2, matching the proposal's existing risk-isolation rationale — ventas gets its own tightly-reviewed slice, unchanged), with `recalcularStockDesdeKardex` available as a safety net. `1c` alone adds the ingreso-routing feature without ever leaving `inventario_stock` inconsistent. Splitting by write-path-first-then-behavior (rather than by file) also matches `work-unit-commits`: each sub-slice is a complete, revertible, deliverable behavior, not a file-type slice.

---

## Slice 1a — Schema/Migration Foundation

No pure functions; no behavior change. Verified via lockstep review, not unit tests.

- [ ] 1a.1 Pre-migration audit: run `SELECT empresa_id, COUNT(*) FROM depositos WHERE es_principal GROUP BY empresa_id HAVING COUNT(*)<>1` against prod before deploying. (deploy-time action, not implementable from this branch — deferred to reviewer/ops before running 0083 in production)
- [x] 1a.2 Write `migrations/0083_deposito_multitenant.sql`: `productos.deposito_id` nullable FK + backfill from empresa principal; `cajas.deposito_id` backfill. (PDD/Migracion en Lockstep)
- [x] 1a.3 `src/core/db/powersync/schema.ts`: add `productos.deposito_id: column.text`. Lockstep w/ 1a.2.
- [x] 1a.4 `src/core/db/kysely/types.ts`: add `deposito_id: string | null` to `Productos`. Lockstep w/ 1a.2-1a.3.
- [x] 1a.5 Review gate: confirm the PR diff includes `migrations/`, `schema.ts`, and `kysely/types.ts` together (no sync-rules change needed — `productos` already `SELECT *`). (PDD/Lockstep verificado antes de mergear)

## Slice 1b — inventario_stock Authoritative Helper (current-resolution wiring)

Pure fn: `computeStockDelta`. Wires compras/kardex/ajustes into the new helper WITHOUT changing where stock routes.

- [ ] 1b.1 [RED] `src/features/inventario/lib/__tests__/stock-deposito.test.ts`: failing tests for `computeStockDelta(current, delta)` — throws when `current.plus(delta) < 0`; exact `0.125+0.125=0.250` decimal case. (ISA/No Stock Negativo, ISA/Precision Decimal)
- [ ] 1b.2 [GREEN] New `src/features/inventario/lib/stock-deposito.ts`: implement `computeStockDelta` with `decimal.js`, `.toFixed(3)`.
- [ ] 1b.3 Implement `upsertStockDeposito(tx, params)` in `stock-deposito.ts`: SELECT-then-INSERT/UPDATE `inventario_stock` using `computeStockDelta` guard, then `UPDATE productos SET stock=stock+delta`. Integration-tested via 1b.7/1b.9/1b.11 (PowerSync-required). (ISA/Fuente Unica de Verdad, ISA/productos.stock)
- [ ] 1b.4 Implement `recalcularStockDesdeKardex(params)` in `stock-deposito.ts`: group `movimientos_inventario` by `(producto_id, deposito_id)`, `SUM(E)-SUM(S)`, write `inventario_stock` + recompute `productos.stock`, one `writeTransaction`.
- [ ] 1b.5 Integration test: `recalcularStockDesdeKardex` rebuilds `inventario_stock` from mixed E/S entries across 2 depositos, matches kardex exactly. (ISA/Funcion de recalculo)
- [ ] 1b.6 `use-compras.ts`: wire `upsertStockDeposito` into the existing kardex-insert call sites (~553/598/621/650) using the CURRENT single-prefetched `depositoId` — no per-line resolution yet. (ISA/Fuente Unica de Verdad — compras leg, current-resolution)
- [ ] 1b.7 Integration test: compra (single deposito, current resolution) writes `inventario_stock` correctly alongside kardex, same `writeTransaction`.
- [ ] 1b.8 `use-kardex.ts` `registrarMovimiento` (~121-142, ~164+): add `upsertStockDeposito` call after kardex insert, delta signed by `tipo` — using the EXISTING principal-only fallback (no product-deposito resolution yet).
- [ ] 1b.9 Integration test: kardex ingreso (current principal-only resolution) writes `inventario_stock` correctly.
- [ ] 1b.10 Wire `upsertStockDeposito` into existing ajustes write path (already deposit-scoped via `linea.deposito_id`), replacing direct `productos.stock` write — no resolution change needed here. (ISA/Fuente Unica de Verdad — ajustes leg)
- [ ] 1b.11 Integration test: ajuste writes `inventario_stock` for its `linea.deposito_id` in the same transaction as the kardex row.

## Slice 1c — Ingreso Deposit Routing (behavior change)

Pure fn: `resolveDepositoIngreso`. Swaps the resolution INPUT feeding 1b's `upsertStockDeposito` calls.

- [ ] 1c.1 [RED] Failing test for `resolveDepositoIngreso(productoDepositoId, empresaPrincipalId)` — `??` fallback. (PDD/Fallback a Deposito Principal, CPD/Enrutamiento de Ingreso por Linea)
- [ ] 1c.2 [GREEN] Implement `resolveDepositoIngreso` in `stock-deposito.ts`.
- [ ] 1c.3 `producto-form.tsx`: persist `depositoId` local state to `productos.deposito_id` on create; add deposito select to edit mode (currently create-only). (PDD/Crear producto, PDD/Editar deposito default)
- [ ] 1c.4 Integration test: producto-form create persists `deposito_id`; edit updates it without moving existing stock.
- [ ] 1c.5 `use-compras.ts`: swap the depositoId feeding 1b.6's `upsertStockDeposito` call from single-prefetch to per-line `resolveDepositoIngreso(producto.deposito_id, principal)` at each `factura_compra_det` line (~432-448). (CPD/Enrutamiento de Ingreso por Linea)
- [ ] 1c.6 Integration test (upgrade of 1b.7): compra with 2 products in 2 depositos writes kardex+`inventario_stock` correctly per line; failing line reverts entire invoice atomically. (CPD/Compra multi-producto en 2 depositos, CPD/Fallo parcial revierte todo)
- [ ] 1c.7 `use-kardex.ts` `registrarMovimiento`: swap 1b.8's fallback from principal-only to `resolveDepositoIngreso(producto.deposito_id, principal)`.
- [ ] 1c.8 `movimiento-form.tsx`: pre-select deposito with product's `deposito_id`, overridable; batch rows default independently per own product. (KDS/Sugerencia por defecto, KDS/Usuario sobrescribe, KDS/Registro por lote)
- [ ] 1c.9 Integration test (upgrade of 1b.9): kardex ingreso defaults to product's deposito; override persists; batch rows default independently.

## Slice 2a — Ventas: Read-Path + POS Threading

- [ ] 2a.1 [RED] Failing test for `resolveDepositoEgresoVenta(cajaDepositoId, empresaPrincipalId)`. (VSD/Egreso de Venta desde el Deposito de la Caja)
- [ ] 2a.2 [GREEN] New `src/features/ventas/lib/deposito-venta.ts`: implement `resolveDepositoEgresoVenta`.
- [ ] 2a.3 New `src/features/ventas/hooks/use-deposito-activo.ts`: `useDepositoActivoVenta()` wraps `useSesionActiva()` → `caja_id` → query `cajas.deposito_id`, falls back to principal query via `resolveDepositoEgresoVenta`.
- [ ] 2a.4 `use-ventas.ts` deposit resolution (~271-294): switch from hardcoded `es_principal` query to caja's `deposito_id` via `sesion_caja_id`. (VSD/Venta descuenta del deposito de la caja, VSD/Venta sin sesion de caja activa)
- [ ] 2a.5 `panel-productos.tsx` `ALL_PRODUCTS_QUERY` (~11-18): `LEFT JOIN inventario_stock` scoped to `depositoId` param, `COALESCE(...,0) AS stock`, accept `depositoId` prop. (VSD/Producto sin stock ... oculto/bloqueado)
- [ ] 2a.6 `use-ventas.ts` `useBuscarProductosVenta` (~193-211) + `buscarProductoPorCodigoBarras` (~231-251): add `depositoId` param, same JOIN change.
- [ ] 2a.7 `pos-terminal.tsx`: call `useDepositoActivoVenta()` once, thread `depositoId` into `PanelProductos` + `ProductoBuscador`. No change to `stock_actual` capture (352) or hard-block (456-464) — they inherit deposit-scoped data.
- [ ] 2a.8 Integration test: product with 0 stock in caja's deposito but >0 elsewhere is excluded from grid/search/barcode results (services exempt); available stock renders correctly for red-highlight guard.

## Slice 2b — Ventas: Write-Path Guard + Edge Function

- [ ] 2b.1 `use-ventas.ts` local tx re-check (~454-479): replace `SELECT stock FROM productos` with `SELECT cantidad_actual FROM inventario_stock WHERE producto_id=? AND deposito_id=?` (caja's deposito). (VSD/Re-chequeo local rechaza stock insuficiente)
- [ ] 2b.2 `use-ventas.ts` egreso writes (~512-543 lotes, 586-590 no-lote, 640-644 servicio/receta): replace `UPDATE productos SET stock=...` with `upsertStockDeposito(tx, {..., deposito_id, delta: cantidad.negated()})`. (ISA/Fuente Unica de Verdad — ventas leg; first time ventas is wired, deliberately deferred from 1b per risk-isolation)
- [ ] 2b.3 `supabase/functions/validar-stock/index.ts` (~47-52, 102-106): request adds `deposito_id`; query switches `productos.select(...stock)` → `inventario_stock.select(producto_id,cantidad_actual).eq(deposito_id,...)`, join to `nombre` from `lineas` payload client-side. (VSD/Edge Function valida por deposito)
- [ ] 2b.4 `use-ventas.ts` `validarStockServidor` caller (~25-71): pass caja's `deposito_id` in the Edge Function request body.
- [ ] 2b.5 Integration test: sale discounts stock only from caja's deposito, `inventario_stock`+`productos.stock` updated atomically; local re-check throws and blocks commit on insufficient stock.
- [ ] 2b.6 Integration test: Edge Function returns 409 when deposit-scoped stock is insufficient even if global `productos.stock` would pass; client blocks `crearVenta`.
- [ ] 2b.7 Integration test: no active `sesion_caja` → sale falls back to empresa principal deposito. (VSD/Venta sin sesion de caja activa)

## Slice 3a — Traspasos: Schema + Pure Functions

- [ ] 3a.1 Write `migrations/0084_traspasos_inventario.sql`: `traspasos_inventario` (header, `autorizado_por`/`verificado_por` nullable, `correlativo_usuario`) + `traspasos_inventario_det` (detail), `CHECK deposito_origen<>destino`, RLS SELECT+INSERT-only (no UPDATE/DELETE policy). (TRI/Migracion en Lockstep, TRI/Placeholders de Autorizacion)
- [ ] 3a.2 `schema.ts`: add `traspasos_inventario`/`traspasos_inventario_det` Table defs (`cantidad: column.text`), register in exported table list. Lockstep w/ 3a.1.
- [ ] 3a.3 `kysely/types.ts`: add `TraspasosInventario`/`TraspasosInventarioDet` interfaces. Lockstep w/ 3a.1-3a.2.
- [ ] 3a.4 `backend/powersync-sync-rules.yaml`: add 2 `SELECT *` rules for the new tables in the INVENTARIO block (~line 94). Lockstep w/ 3a.1-3a.3, same PR. (TRI/Lockstep verificado antes de mergear)
- [ ] 3a.5 [RED] Failing test for `computeCorrelativoUsuario(count)` — returns `count+1`. (TRI/Correlativo incrementa por usuario)
- [ ] 3a.6 [GREEN] New `src/features/inventario/lib/traspasos.ts`: implement `computeCorrelativoUsuario`.
- [ ] 3a.7 [RED] Failing test for `buildTraspasoKardexPair(...)` — returns salida (`tipo='S', origen='TRA'`) + entrada (`tipo='E', origen='TRA'`) row objects sharing `doc_origen_id`, no SQL executed.
- [ ] 3a.8 [GREEN] Implement `buildTraspasoKardexPair` in `traspasos.ts`.

## Slice 3b — Traspasos: Atomic Hook

- [ ] 3b.1 New `src/features/inventario/hooks/use-traspasos.ts` `crearTraspaso(params)`: reject same-deposito client-side; `computeCorrelativoUsuario` from `COUNT(*)`; `INSERT traspasos_inventario` header (`autorizado_por`/`verificado_por` NULL); per line `SELECT inventario_stock` origen, throw if `< cantidad`; `buildTraspasoKardexPair` + 2x `INSERT movimientos_inventario`; `upsertStockDeposito` origen(-)/destino(+); `INSERT traspasos_inventario_det`. ALL inside one `writeTransaction`.
- [ ] 3b.2 Integration test: individual traspaso A→B moves stock atomically, `inventario_stock` reflects both sides in one tx. (TRI/Traspaso individual mueve stock A→B)
- [ ] 3b.3 Integration test: batch of 3 productos creates 3 det rows + 6 paired kardex rows atomically under one header. (TRI/Traspaso batch de varios productos)
- [ ] 3b.4 Integration test: `correlativo_usuario` increments per user, independent of other users' counts. (TRI/Correlativo incrementa por usuario)
- [ ] 3b.5 Integration test: insufficient origen stock blocks the whole tx (individual + batch line), no partial commit. (TRI/Traspaso bloqueado por falta de stock)
- [ ] 3b.6 Integration test: traspaso created with `autorizado_por`/`verificado_por` NULL, fully effective immediately. (TRI/Traspaso creado sin autorizacion)

## Slice 3c — Traspasos: UI

- [ ] 3c.1 New `src/features/inventario/components/traspasos/traspaso-form.tsx`: single form, dynamic lines array (mirrors `ajustes` pattern), deposito origen/destino selects, client-side same-deposito rejection.
- [ ] 3c.2 New route `src/routes/_app/inventario/traspasos.tsx`: list + create modal, same shape as existing `ajustes` route.
- [ ] 3c.3 Integration/UI test: form blocks submit when origen===destino; individual and batch (N lines) both submit through `crearTraspaso`.

## Slice 4 — Company Bootstrap + Notas de Credito

- [ ] 4.1 `supabase/functions/register-owner/index.ts`: insert 1 `depositos` row (`es_principal:true, permite_venta:true`) + 1 `cajas` row (`deposito_id`=that id, `nro_caja` omitted) after step-9 block (~line 461), before final response. (EBD/Deposito y Caja Sembrados, EBD/Numeracion de Caja No Manual)
- [ ] 4.2 Integration test: new empresa registration yields exactly 1 `es_principal` deposito + 1 linked caja, `nro_caja=1` assigned by trigger.
- [ ] 4.3 `use-notas-credito.ts` (~160-180): replace `es_principal` re-derivation with `venta.deposito_id` (already selected via existing `SELECT * FROM ventas`); use in `upsertStockDeposito` call for kardex entrada. (NCD/Reingreso al Deposito de Origen)
- [ ] 4.4 Integration test: credit note returns stock to `venta.deposito_id`; `inventario_stock` for `(producto, deposito B)` = N + cantidad_devuelta within the same `writeTransaction` as the kardex entrada. (NCD/inventario_stock incrementado correctamente)

## Dependency Order

`1a → 1b → 1c → 2a → 2b → 3a → 3b → 3c → 4`, strictly sequential — matches the feature-branch-chain topology below. Slice 4's `4.1` (bootstrap) has no code dependency on prior slices but stays last per the chain order.

## Branch/PR Topology (feature-branch-chain)

Tracker branch: `feat/inventario-multideposito`, branched from `develop`. Only the tracker ever merges to `develop` (final PR, after `sdd-verify` passes on the fully-integrated tracker).

| # | Slice | Branch | PR base (review target) |
|---|---|---|---|
| 1 | 1a | `feat/inventario-multideposito/1a-schema-migration` | `feat/inventario-multideposito` (tracker) |
| 2 | 1b | `feat/inventario-multideposito/1b-stock-helper` | `1a-schema-migration` |
| 3 | 1c | `feat/inventario-multideposito/1c-ingreso-routing` | `1b-stock-helper` |
| 4 | 2a | `feat/inventario-multideposito/2a-ventas-read-path` | `1c-ingreso-routing` |
| 5 | 2b | `feat/inventario-multideposito/2b-ventas-write-path` | `2a-ventas-read-path` |
| 6 | 3a | `feat/inventario-multideposito/3a-traspasos-schema` | `2b-ventas-write-path` |
| 7 | 3b | `feat/inventario-multideposito/3b-traspasos-hook` | `3a-traspasos-schema` |
| 8 | 3c | `feat/inventario-multideposito/3c-traspasos-ui` | `3b-traspasos-hook` |
| 9 | 4 | `feat/inventario-multideposito/4-bootstrap-notas-credito` | `3c-traspasos-ui` |
| — | tracker | `feat/inventario-multideposito` | `develop` (final PR only) |

**Merge rule**: implement and open PRs strictly in chain order. Each slice's PR is reviewed against its listed base so the diff shows ONLY that slice's own changes. On approval: merge the slice branch into its base, then fast-forward that base into the tracker if it isn't the tracker already, and retarget the next slice's PR base to the tracker before merging it (standard stacked-PR retarget — if GitHub ever shows a previous slice's changes in a child diff, retarget/rebase before review, per the shared SDD guard). Never merge any slice branch directly to `develop`.
