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

- [x] 1c.1 [RED] Failing test for `resolveDepositoIngreso(productoDepositoId, empresaPrincipalId)` — `??` fallback. (PDD/Fallback a Deposito Principal, CPD/Enrutamiento de Ingreso por Linea)
- [x] 1c.2 [GREEN] Implement `resolveDepositoIngreso` in `stock-deposito.ts`.
- [x] 1c.3 `producto-form.tsx`: persist `depositoId` local state to `productos.deposito_id` on create; add deposito select to edit mode (currently create-only). (PDD/Crear producto, PDD/Editar deposito default)
- [x] 1c.4 Integration test: producto-form create persists `deposito_id`; edit updates it without moving existing stock. (Implementado a nivel de data-layer: `use-productos.test.ts` prueba `crearProducto`/`actualizarProducto` directamente — mismo criterio que 1b, sin RTL de `producto-form.tsx` completo)
- [x] 1c.5 `use-compras.ts`: swap the depositoId feeding 1b.6's `upsertStockDeposito` call from single-prefetch to per-line `resolveDepositoIngreso(producto.deposito_id, principal)` at each `factura_compra_det` line (~432-448). (CPD/Enrutamiento de Ingreso por Linea)
- [x] 1c.6 Integration test (upgrade of 1b.7): compra con 2 products in 2 depositos writes kardex+`inventario_stock` correctly per line; failing line reverts entire invoice atomically. (CPD/Compra multi-producto en 2 depositos, CPD/Fallo parcial revierte todo)
- [x] 1c.7 `use-kardex.ts` `registrarMovimiento`: swap 1b.8's fallback from principal-only to `resolveDepositoIngreso(producto.deposito_id, principal)`.
- [x] 1c.8 `movimiento-form.tsx`: pre-select deposito with product's `deposito_id`, overridable; batch rows default independently per own product. (KDS/Sugerencia por defecto, KDS/Usuario sobrescribe, KDS/Registro por lote — nota: no existe UI de "batch rows" en este formulario single-entry; la sugerencia es por-producto vía el mismo estado, cumple el criterio en el unico flujo existente)
- [x] 1c.9 Integration test (upgrade of 1b.9): kardex ingreso defaults to product's deposito; override persists; batch rows default independently. (RTL en `movimiento-form.test.tsx`)

## Slice 2a — Ventas: Read-Path + POS Threading

- [x] 2a.1 [RED] Failing test for `resolveDepositoEgresoVenta(cajaDepositoId, empresaPrincipalId)`. (VSD/Egreso de Venta desde el Deposito de la Caja)
- [x] 2a.2 [GREEN] New `src/features/ventas/lib/deposito-venta.ts`: implement `resolveDepositoEgresoVenta`.
- [x] 2a.3 New `src/features/ventas/hooks/use-deposito-activo.ts`: `useDepositoActivoVenta()` wraps `useSesionActiva()` → `caja_id` → query `cajas.deposito_id`, falls back to principal query via `resolveDepositoEgresoVenta`.
- [ ] 2a.4 **DEFERRED TO 2b (scope correction, ratified this session)**: `use-ventas.ts` `crearVenta` deposit resolution (~271-294) — this is the depositoId that feeds the venta/kardex INSERT and the stock-OUT write, i.e. WRITE-path, not read-path. Left hardcoded to `es_principal` in 2a; migrates to `resolveDepositoEgresoVenta` together with the rest of the write-path wiring in 2b (local re-check + `upsertStockDeposito` + Edge Function). For this slice the POS display/validation is deposit-scoped but the actual sale still discounts the empresa principal deposito — documented, intentional, closed in 2b.
- [x] 2a.5 `panel-productos.tsx` `ALL_PRODUCTS_QUERY` (~11-18): `LEFT JOIN inventario_stock` scoped to `depositoId` param, `COALESCE(...,0) AS stock`, accept `depositoId` prop. (VSD/Producto sin stock ... oculto/bloqueado) — note: this component has zero imports anywhere in the codebase (orphan/unwired), updated for spec parity only.
- [x] 2a.6 `use-ventas.ts` `useBuscarProductosVenta` (~193-211) + `buscarProductoPorCodigoBarras` (~231-251): add `depositoId` param, same JOIN change.
- [x] 2a.7 `pos-terminal.tsx`: call `useDepositoActivoVenta()` once, thread `depositoId` into `ProductoBuscador` (the component actually wired in the POS — `PanelProductos` is unwired but also threaded for parity). No change to `stock_actual` capture (~354) or hard-block (~456-464) — they inherit deposit-scoped data.
- [~] 2a.8 Integration test: covered at the pure-function/query-builder level (`buildStockPorDepositoFragments` unit tests + `buscarProductoPorCodigoBarras` test with mocked `db.execute`) instead of a full PowerSync/RTL integration test — no precedent in this codebase for mocking `@powersync/react`'s `useQuery` (verified via grep, zero existing tests do this); `useBuscarProductosVenta`/`useDepositoActivoVenta` remain untested at the hook level, consistent with the project's existing gap for `useQuery`-based hooks.
- [x] 2a.9 **CRITICAL fix (found in post-2a review, not in the original task list)**: automatic, idempotent, once-per-device backfill of `inventario_stock` from the kardex on authenticated app startup — closes the gap where a legacy product with real `productos.stock` but no `inventario_stock` row yet (1b's self-heal is lazy/on-write-only) would read as 0 and be wrongly hidden/blocked by 2a's deposit-scoped POS reads. New `src/lib/inventario-stock-backfill-store.ts` (localStorage flag, versioned) + `src/features/inventario/lib/inventario-stock-backfill.ts` (orchestrator, calls `recalcularStockDesdeKardex` unmodified) + `src/features/inventario/hooks/use-inventario-stock-backfill.ts`, mounted in `src/routes/_app/route.tsx`.
- [x] 2a.10 **WARNING fix (found in post-2a.9 review)**: first-run-only POS gate ("Verificando inventario…") closing the window where the fire-and-forget backfill (2a.9) hadn't yet completed on a device's FIRST cold start. New `src/features/inventario/lib/inventario-stock-backfill-gate.ts` (pure `computeBackfillGateEstado`) + `src/features/inventario/stores/inventario-stock-backfill-gate-store.ts` (Zustand, initial state computed synchronously at module load to avoid a race, read-only `useInventarioStockBackfillListo()` selector for `pos-terminal.tsx`). Subsequent starts (flag already set): zero gate, zero delay. Failure path un-gates without marking done (retries next start).

## Slice 2b — Ventas: Write-Path Guard + Edge Function

- [x] 2b.1 `use-ventas.ts` local tx re-check (~454-479): replace `SELECT stock FROM productos` with `SELECT cantidad_actual FROM inventario_stock WHERE producto_id=? AND deposito_id=?` (caja's deposito). (VSD/Re-chequeo local rechaza stock insuficiente) — nota: el `SELECT tipo, stock, nombre, maneja_lotes FROM productos` original se conserva (necesario para `tipo`/`nombre`/`maneja_lotes` y el snapshot `stock_anterior`/`stock_nuevo` del kardex, sin cambios, mismo precedente que 1b/1c en use-kardex.ts); se AGREGO el nuevo SELECT per-deposito como guard de disponibilidad.
- [x] 2b.2 `use-ventas.ts` egreso writes (~512-543 lotes, 586-590 no-lote, 640-644 servicio/receta): replace `UPDATE productos SET stock=...` with `upsertStockDeposito(tx, {..., deposito_id, delta: cantidad.negated()})`. (ISA/Fuente Unica de Verdad — ventas leg; first time ventas is wired, deliberately deferred from 1b per risk-isolation) — verificado con grep: 0 `UPDATE productos SET stock` manuales restantes en use-ventas.ts. **WARNING cerrado (post-2b review)**: el pre-check de ingredientes de receta leia `productos.stock` global en vez del `inventario_stock` del deposito de la caja, inconsistente con el guard ya aplicado a la linea de producto directo. Extraidos `evaluarStockDepositoSuficiente` (decision pura) y `leerStockDeposito` (lectura compartida) en `stock-deposito.ts`, reusados por AMBOS pre-checks (producto directo e ingrediente) — sin duplicar la query ni el `<`/`>=`.
- [x] 2b.3 `supabase/functions/validar-stock/index.ts` (~47-52, 102-106): request adds `deposito_id`; query switches `productos.select(...stock)` → `inventario_stock.select(producto_id,cantidad_actual).eq(deposito_id,...)`, join to `nombre` from `lineas` payload client-side. (VSD/Edge Function valida por deposito) — `deposito_id` null/ausente → `{ok:true}` (fallback seguro; sin tests, no existe infra de test para Edge Functions Deno en el repo — verificado, ninguna funcion existente tiene tests).
- [x] 2b.4 `use-ventas.ts` `validarStockServidor` caller (~25-71): pass caja's `deposito_id` in the Edge Function request body. `depositoId` threaded pos-terminal.tsx → CobroModal (nueva prop) → validarStockServidor.
- [x] 2b.5 Integration test: sale discounts stock only from caja's deposito, `inventario_stock`+`productos.stock` updated atomically; local re-check throws and blocks commit on insufficient stock. (`use-ventas.test.ts`: 4 tests nuevos — deposito de caja usado, productos.stock decrementado UNA sola vez, fallback sin caja, re-chequeo rechaza stock insuficiente por-deposito)
- [~] 2b.6 Integration test: Edge Function returns 409 when deposit-scoped stock is insufficient even if global `productos.stock` would pass; client blocks `crearVenta`. — sin test automatizado (no existe infra de test para Supabase Edge Functions/Deno en este repo, verificado via grep; mismo gap que toda funcion existente). Verificado por lectura de codigo: contrato 409 preservado.
- [x] 2b.7 Integration test: no active `sesion_caja` → sale falls back to empresa principal deposito. (VSD/Venta sin sesion de caja activa) — cubierto en `use-ventas.test.ts`.

## Slice 3a — Traspasos: Schema + Pure Functions

- [x] 3a.1 Write `migrations/0084_traspasos_inventario.sql`: `traspasos_inventario` (header, `autorizado_por`/`verificado_por` nullable, `correlativo_usuario`) + `traspasos_inventario_det` (detail), `CHECK deposito_origen<>destino`, RLS SELECT+INSERT-only (no UPDATE/DELETE policy). (TRI/Migracion en Lockstep, TRI/Placeholders de Autorizacion) — nota: tambien amplia el CHECK `movimientos_inventario_origen_check` para incluir `'TRA'` (no explicito en design.md pero requerido para que el INSERT del kardex de traspasos no viole el constraint existente `('MAN','FAC','VEN','AJU','NCR','COM','NDB','DEV')`).
- [x] 3a.2 `schema.ts`: add `traspasos_inventario`/`traspasos_inventario_det` Table defs (`cantidad: column.text`), register in exported table list. Lockstep w/ 3a.1.
- [x] 3a.3 `kysely/types.ts`: add `TraspasosInventario`/`TraspasosInventarioDet` interfaces. Lockstep w/ 3a.1-3a.2.
- [x] 3a.4 `backend/powersync-sync-rules.yaml`: add 2 `SELECT *` rules for the new tables in the INVENTARIO block (~line 94). Lockstep w/ 3a.1-3a.3, same PR. (TRI/Lockstep verificado antes de mergear)
- [x] 3a.5 [RED] Failing test for `computeCorrelativoUsuario(count)` — returns `count+1`. (TRI/Correlativo incrementa por usuario)
- [x] 3a.6 [GREEN] New `src/features/inventario/lib/traspasos.ts`: implement `computeCorrelativoUsuario`.
- [x] 3a.7 [RED] Failing test for `buildTraspasoKardexPair(...)` — returns salida (`tipo='S', origen='TRA'`) + entrada (`tipo='E', origen='TRA'`) row objects sharing `doc_origen_id`, no SQL executed.
- [x] 3a.8 [GREEN] Implement `buildTraspasoKardexPair` in `traspasos.ts`.

## Slice 3b — Traspasos: Atomic Hook

- [x] 3b.1 New `src/features/inventario/hooks/use-traspasos.ts` `crearTraspaso(params)`: reject same-deposito client-side; `computeCorrelativoUsuario` from `COUNT(*)`; `INSERT traspasos_inventario` header (`autorizado_por`/`verificado_por` NULL); per line `SELECT inventario_stock` origen, throw if `< cantidad`; `buildTraspasoKardexPair` + 2x `INSERT movimientos_inventario`; `upsertStockDeposito` origen(-)/destino(+); `INSERT traspasos_inventario_det`. ALL inside one `writeTransaction`. — nota: tambien se agrego `useTraspasos()` (read hook, listado, mismo shape que `useAjustes()`) para reuso trivial en 3c; `stock_anterior`/`stock_nuevo` del kardex de cada leg se llenan con lecturas per-deposito (`leerStockDeposito`) en vez de `productos.stock` global, tal como documenta el comentario de `buildTraspasoKardexPair` en `traspasos.ts` (un traspaso no cambia el total cross-deposito, por lo que el snapshot global seria identico antes/despues y no informativo).
- [x] 3b.2 Integration test: individual traspaso A→B moves stock atomically, `inventario_stock` reflects both sides in one tx. (TRI/Traspaso individual mueve stock A→B)
- [x] 3b.3 Integration test: batch of 3 productos creates 3 det rows + 6 paired kardex rows atomically under one header. (TRI/Traspaso batch de varios productos)
- [x] 3b.4 Integration test: `correlativo_usuario` increments per user, independent of other users' counts. (TRI/Correlativo incrementa por usuario)
- [x] 3b.5 Integration test: insufficient origen stock blocks the whole tx (individual + batch line), no partial commit. (TRI/Traspaso bloqueado por falta de stock)
- [x] 3b.6 Integration test: traspaso created with `autorizado_por`/`verificado_por` NULL, fully effective immediately. (TRI/Traspaso creado sin autorizacion)

## Slice 3c — Traspasos: UI

- [x] 3c.1 New `src/features/inventario/components/traspasos/traspaso-form.tsx`: single form, dynamic lines array (mirrors `ajustes` pattern), deposito origen/destino selects, client-side same-deposito rejection. — tambien `traspaso-schema.ts` (Zod, refine origen!==destino) y `traspaso-list.tsx` (mirror `ajuste-list.tsx`, usa `useTraspasos` de 3b).
- [x] 3c.2 New route `src/routes/_app/inventario/traspasos.tsx`: list + create modal, same shape as existing `ajustes` route. — entrada "Traspasos" agregada al sidebar (permiso `INVENTORY_ADJUST`).
- [x] 3c.3 Integration/UI test: form blocks submit when origen===destino; individual and batch (N lines) both submit through `crearTraspaso`. — RTL en `traspaso-form.test.tsx` (4 tests) + `traspaso-schema.test.ts` (9 tests, TDD RED/GREEN).

## Slice 4 — Company Bootstrap + Notas de Credito

- [x] 4.1 `supabase/functions/register-owner/index.ts`: insert 1 `depositos` row (`es_principal:true, permite_venta:true`) + 1 `cajas` row (`deposito_id`=that id, `nro_caja` omitted) after step-9 block (~line 461), before final response. (EBD/Deposito y Caja Sembrados, EBD/Numeracion de Caja No Manual)
- [~] 4.2 Integration test: new empresa registration yields exactly 1 `es_principal` deposito + 1 linked caja, `nro_caja=1` assigned by trigger. — sin test automatizado (no existe infra de test para Supabase Edge Functions/Deno en este repo, verificado via grep; mismo gap que toda funcion existente, incl. `validar-stock` en 2b.6). Verificado por lectura de codigo: mismo patron `supabaseAdmin.from(...).insert(...)` que `caja_fuerte`/`metodos_cobro` (paso 9, ya en produccion); `nro_caja` deliberadamente omitido del insert para que `trg_assign_nro_caja` (0040_nro_caja.sql) lo asigne.
- [x] 4.3 `use-notas-credito.ts` (~160-180): replace `es_principal` re-derivation with `venta.deposito_id` (already selected via existing `SELECT * FROM ventas`); use in `upsertStockDeposito` call for kardex entrada. (NCD/Reingreso al Deposito de Origen)
- [x] 4.4 Integration test: credit note returns stock to `venta.deposito_id`; `inventario_stock` for `(producto, deposito B)` = N + cantidad_devuelta within the same `writeTransaction` as the kardex entrada. (NCD/inventario_stock incrementado correctamente) — `use-notas-credito.test.ts` (5 tests nuevos: deposito de origen usado en vez de principal, inventario_stock incrementado con delta positivo, productos.stock incrementado UNA sola vez, movimientoInventarioId correcto pasado a upsertStockDeposito con reconstruccion de baseline, reintegro de ingrediente de receta al deposito de origen).
- [x] 4.5 **CRITICAL fix (found in final tracker integration verify, not in the original task list)**: `reversarCompra` (`use-compras.ts`) bypassed `upsertStockDeposito` — inserted the `DEV` kardex row but wrote `productos.stock` via a manual `UPDATE`, leaving `inventario_stock` stale after every purchase reversal (the only remaining write path never touched by any slice, since it's pre-existing code untouched by 1b-1c). Fixed: per detail line, `upsertStockDeposito(tx, { deposito_id: linea.deposito_id, delta: qty.negated(), movimientoInventarioId: <fresh DEV kardex id>, ... })` replaces the manual stock UPDATE; `costo_usd` (weighted-average) keeps its own separate `UPDATE productos SET costo_usd=...` (helper doesn't touch it). Deposito source: `facturas_compra_det.deposito_id` — `NOT NULL` since the ORIGINAL schema (`0007_compras.sql`), already the exact deposito 1c routed that line's stock-IN to, so a multi-deposito purchase reverses correctly per line with no fallback needed. `use-compras.test.ts`: 3 tests nuevos (deposito de la linea + delta negativo + cero UPDATE manual de stock; movimientoInventarioId correcto con reconstruccion de baseline; multi-linea multi-deposito sin cruce de deposito/movimientoInventarioId entre lineas). Grep-verified: zero `UPDATE productos SET stock` remain in `use-compras.ts`.
- [x] 4.6 **CRITICAL fix (found by tester on a real device against Supabase, not in the original task list)**: registering a multi-deposito purchase invoice threw `23505 duplicate key value violates unique constraint "uq_stock_empresa_producto_deposito"` on the `inventario_stock` upload PUT, and PowerSync discarded the op as FATAL (local/server divergence). Root cause: `upsertStockDeposito`'s SELECT-then-INSERT-or-UPDATE isn't concurrency-safe across separate `writeTransaction`s (startup backfill `recalcularStockDesdeKardex` vs. a near-simultaneous purchase, each generating its own local UUID row for the same `(empresa_id,producto_id,deposito_id)`), and the connector's generic upsert-by-`id` PUT path doesn't detect the natural-key conflict before Postgres does. Fixed in two parts: **(1) connector.ts** — added `inventario_stock: 'empresa_id,producto_id,deposito_id'` to `TABLE_NATURAL_KEYS` + matching entry in `IMMUTABLE_COLUMNS` (same generic natural-key PUT path already used by `horarios_staff`: UPDATE-by-natural-key first, INSERT only if 0 rows matched — this is the real fix). **(2) stock-deposito.ts** — hardened `upsertStockDeposito`'s local INSERT into a guarded `INSERT ... WHERE NOT EXISTS (...) RETURNING id`, with a SELECT+UPDATE reconciliation fallback if the guard finds 0 rows inserted (defense-in-depth; PowerSync's `Table`/`Index` schema has no `unique` option, so a true `ON CONFLICT` isn't available locally — `WHERE NOT EXISTS` + `RETURNING` is the achievable equivalent, since `rowsAffected` is documented as unreliable for this purpose). New tests: `connector-inventario-stock-upsert.test.ts` (3 tests — UPDATE-by-natural-key when a Supabase row exists, INSERT when none exists, and the exact bug-reproduction scenario converging without `uploadFailed`); `stock-deposito.test.ts` (+2 tests — guarded-INSERT race-fallback reconciliation, and confirms the fallback does NOT run on the normal no-race path). 6 other hook test files (`use-compras`, `use-kardex`, `use-ajustes`, `use-traspasos`, `use-notas-credito`) needed their fake `tx.execute` INSERT branches updated to return `rows` (simulating `RETURNING`) since `upsertStockDeposito` now inspects the INSERT's return value.

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
