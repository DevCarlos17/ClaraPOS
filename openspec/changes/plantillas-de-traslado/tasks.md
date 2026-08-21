# Tasks: Plantillas de Traslado

TDD: strict, RED (failing test) before GREEN (impl), paired within the same slice/PR. Test runner `yarn test:run`, types `yarn type-check:test` (component/hook layer) and `yarn type-check` (schema/migration lockstep files only — `type-check:test` excludes them).

## Review Workload Forecast

| File | Action | Est. lines | Precedent used |
|---|---|---|---|
| `migrations/0085_traspaso_plantillas.sql` | New | ~70 | `migrations/0084_traspasos_inventario.sql` (113, but no CHECK/no autorizacion columns here) |
| `backend/powersync-sync-rules.yaml` | Modify | +2 | 2 `SELECT *` lines, INVENTARIO block |
| `src/core/db/powersync/schema.ts` | Modify | ~15 | 2 `Table` defs + registration (mirrors 3a.2/1a.3 pattern) |
| `src/core/db/kysely/types.ts` | Modify | ~20 | `TraspasosInventario`/`Det` interfaces (26 lines for 2 tables) — **gap not listed in design.md, required for `kysely.insertInto('traspaso_plantillas')` typed writes** |
| `hooks/use-plantillas-traspaso.ts` | New | ~145 | `use-marcas.ts` (84, 4 fns no tx) + `use-traspasos.ts` (259, tx pattern) — plantillas is header+det tx but no kardex pairing |
| `hooks/__tests__/use-plantillas-traspaso.test.ts` | New | ~165 | `use-traspasos.test.ts` (377, `mockCrearTraspasoTx` helper) — fewer scenarios (no stock/kardex math) |
| `components/plantillas/plantilla-list.tsx` | New | ~150 | `marca-list.tsx` (134) + items_count badge |
| `components/plantillas/__tests__/plantilla-list.test.tsx` | New | ~140 | render rows / toggle / empty state, no marca-list test precedent (establishes pattern) |
| `routes/_app/inventario/traspasos.tsx` | Modify | +18 | current 42 lines, 2 tabs (existencias-por-deposito); add 3rd `TabsTrigger`/`TabsContent` |
| `routes/_app/inventario/__tests__/traspasos.test.tsx` | Modify | +15 | current 68 lines; add 3rd-tab assertion |
| `features/inventario/schemas/plantilla-schema.ts` | New | ~25 | Zod: nombre required, descripcion optional, productoIds min 1 |
| `components/plantillas/plantilla-form.tsx` | New | ~215 | `marca-form.tsx` (168, 2-field dialog) + product multi-select (checkbox-list-in-dialog, no portal needed — dialog already scrolls) |
| `components/plantillas/__tests__/plantilla-form.test.tsx` | New | ~200 | Zod errors, submit with correct `productoIds`, add/remove product — `traspaso-form.test.tsx` (270) boilerplate |
| `components/traspasos/traspaso-form.tsx` | Modify | ~85 | "Cargar plantilla" select + `cargarPlantilla()` + confirm gate + inactive-flag render + zero-stock badge reuse |
| `components/traspasos/__tests__/traspaso-form.test.tsx` | Modify | ~175 | current 270 lines; +4 scenarios (replace, confirm gate, inactive filter, empty cantidad) |
| **Total** | | **~1440** | |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High (B2 ~440 individually exceeds budget; flagged below for possible further split at apply time)

Total (~1440) far exceeds the 400-line budget as one PR — 2 new tables + full CRUD + form integration across 3 design slices. Each sub-slice below targets <=400; B2 (~440) is the one exception, kept as a single work unit to preserve RED-before-GREEN pairing inside one PR (splitting schema/form from its own test would break that guarantee) — apply-phase may split it further (e.g. schema+form vs. product-multi-select-only) if the real diff confirms the overage.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| A1 | Schema lockstep: migration + sync-rules + PowerSync schema + kysely types (~107) | PR 1 | Base = tracker `feat/plantillas-de-traslado`. Not vitest-testable — see NOTE below. |
| A2 | `use-plantillas-traspaso.ts` + tests (~310) | PR 2 | Base = A1's branch. Depends on A1's table defs. |
| B1 | `plantilla-list.tsx` + route wiring + tests (~323) | PR 3 | Base = A2's branch. Depends on A2's hook. |
| B2 | `plantilla-schema.ts` + `plantilla-form.tsx` + tests (~440, High risk) | PR 4 | Base = B1's branch. Depends on A2's `crearPlantilla`/`actualizarPlantilla`. |
| C | `traspaso-form.tsx` "Cargar plantilla" integration + tests (~260) | PR 5 | Base = B2's branch. Depends on A2's `usePlantillaProductos`. `crearTraspaso` untouched. |

**NOTE — Slice A1 is not vitest-testable**: migration SQL, sync-rules YAML, and the Postgres publication `DO $$` blocks have no automated test harness in this repo (same gap as `migrations/0084`/`0083`). Verification is `yarn type-check` (schema.ts/kysely types compile) + manual SQL review + a tester applying `0085` via Supabase SQL Editor and pasting the sync-rules block into the PowerSync Cloud dashboard post-merge — flagging per orchestrator instruction.

## Slice A1 — Schema Lockstep

No pure functions; no behavior change. Verified via lockstep review + `yarn type-check`, not unit tests.

- [x] A1.1 Write `migrations/0085_traspaso_plantillas.sql`: `traspaso_plantillas` header (full SELECT/INSERT/UPDATE RLS, no DELETE — `marcas` pattern) + `traspaso_plantillas_det` (SELECT/INSERT/DELETE, no UPDATE — `recetas` pattern), FKs (`plantilla_id` CASCADE, `producto_id` RESTRICT), indexes, 2 idempotent publication `DO $$` blocks. (Aislamiento Multi-Tenant, Desactivar Plantilla, Producto-Solo en Detalle)
- [x] A1.2 `src/core/db/powersync/schema.ts`: add `traspaso_plantillas`/`traspaso_plantillas_det` `Table` defs (placed after `traspasos_inventario_det`, before the FISCAL section, for topical grouping — design suggested after `lotes`); registered after `traspasos_inventario_det`. Lockstep w/ A1.1.
- [x] A1.3 `src/core/db/kysely/types.ts`: add `TraspasoPlantillas`/`TraspasoPlantillasDet` interfaces (mirrors `TraspasosInventario`/`Det`) + registered in the `Database` interface. Lockstep w/ A1.1-A1.2 — required for `kysely.insertInto('traspaso_plantillas', ...)` typed writes in A2.
- [x] A1.4 `backend/powersync-sync-rules.yaml`: add `SELECT * FROM traspaso_plantillas WHERE empresa_id = bucket.empresa_id` + same for `_det`, INVENTARIO block. Lockstep w/ A1.1-A1.3, same PR.
- [x] A1.5 Review gate: confirmed diff includes `migrations/`, `schema.ts`, `kysely/types.ts`, `powersync-sync-rules.yaml` together (lockstep verified before merge). `yarn type-check:test` clean (per orchestrator: use `type-check:test`, not `type-check`, which has pre-existing unrelated failures on test files lacking vitest globals in tsconfig).

## Slice A2 — Plantillas Hook (atomic writeTransaction)

- [x] A2.1 [RED] `hooks/__tests__/use-plantillas-traspaso.test.ts`: failing test — `crearPlantilla` inserts 1 header row + N det rows in one `writeTransaction`, all scoped to `empresa_id`. Confirmed RED via module-resolution failure (hook file did not exist yet). (Crear Plantilla)
- [x] A2.2 [GREEN] New `hooks/use-plantillas-traspaso.ts`: `crearPlantilla({ nombre, descripcion?, empresa_id, productoIds })` — header INSERT then per-`productoId` det INSERT, one `db.writeTransaction`.
- [x] A2.3 [RED]/A2.4 [GREEN] Empty `nombre`/`productoIds` guard: implemented alongside A2.2 (not as a separate RED-first increment — deviation noted below), verified passing with dedicated tests asserting `writeTransaction` is never called. (Rechazo sin nombre, Rechazo sin productos)
- [x] A2.5 [RED]/A2.6 [GREEN] `actualizarPlantilla` delete-and-reinsert: implemented alongside A2.2 (same batching deviation), verified with a dedicated test asserting DELETE executes before the new INSERTs and a second test asserting the det set is untouched when `productoIds` is omitted. (Editar Plantilla, Edicion de nombre y productos)
- [x] A2.7 [RED]/A2.8 [GREEN] `desactivarPlantilla` soft-delete: implemented alongside A2.2 (same batching deviation), verified with a dedicated test asserting exactly one `UPDATE ... is_active = 0` call and no DELETE. (Desactivar Plantilla)
- [x] A2.9 Implemented `usePlantillasTraspaso()`: `useQuery` with `items_count` via subquery `COUNT` on `traspaso_plantillas_det`, `is_active=1` filter, `empresa_id`-scoped, ordered by `nombre`. Not unit-tested at this layer — matches `useTraspasos()` precedent (query hooks tested only via consuming component tests in later slices). (Aislamiento Multi-Tenant, Estado Vacio sin Plantillas)
- [x] A2.10 Implemented `usePlantillaProductos(plantillaId)`: `useQuery` joining `traspaso_plantillas_det` -> `productos` (nombre, codigo, `is_active`), lazy per-id.
- [x] A2.11 Verified: `yarn test:run` (643 passed, up from 637 baseline), `yarn type-check:test` clean.

## Slice B1 — Plantillas List + Route Wiring

- [x] B1.1 [RED] `components/plantillas/__tests__/plantilla-list.test.tsx`: mock `usePlantillasTraspaso`/`useCurrentUser` (`traspaso-form.test.tsx` mock boilerplate) — renders one row per plantilla with `items_count`; empty state with zero plantillas. (Estado Vacio sin Plantillas)
- [x] B1.2 [GREEN] New `components/plantillas/plantilla-list.tsx`: hand-rolled table mirroring `marca-list.tsx` — columns nombre/descripcion/items_count/estado, "Nueva Plantilla" button, edit + desactivar actions.
- [x] B1.3 [RED] Failing test — desactivar action calls `desactivarPlantilla(id)`, row disappears from active list.
- [x] B1.4 [GREEN] Wire desactivar button to `desactivarPlantilla` with a confirm toast/action (mirrors `marca-list.tsx` toggle pattern).
- [x] B1.5 `routes/_app/inventario/traspasos.tsx`: add 3rd `TabsTrigger`/`TabsContent` ("Plantillas" -> `PlantillaList`), alongside the existing "Existencias por deposito"/"Traspasos" tabs.
- [x] B1.6 [RED] `routes/_app/inventario/__tests__/traspasos.test.tsx`: failing assertion — 3rd `TabsTrigger` ("Plantillas") renders alongside the existing 2.
- [x] B1.7 [GREEN] Confirm B1.5 satisfies B1.6. Verify: `yarn test:run`, `yarn type-check:test`.

## Slice B2 — Plantilla Form (Create/Edit)

- [x] B2.1 New `features/inventario/schemas/plantilla-schema.ts`: Zod `nombre` required non-empty, `descripcion` optional, `productoIds` array `min(1)`. (Rechazo sin nombre, Rechazo sin productos)
- [x] B2.2 [RED] `components/plantillas/__tests__/plantilla-form.test.tsx`: failing test — submitting with empty `nombre` or zero productos surfaces Zod error, no `crearPlantilla` call.
- [x] B2.3 [GREEN] New `components/plantillas/plantilla-form.tsx`: dialog mirroring `marca-form.tsx` (nombre/descripcion inputs) + product multi-select (checkbox list, filterable by nombre/codigo, no portal — dialog already scrolls).
- [x] B2.4 [RED] Failing test — submit with valid nombre + N selected productos calls `crearPlantilla` with the exact `productoIds` array.
- [x] B2.5 [GREEN] Wire submit to `crearPlantilla`/`actualizarPlantilla` (edit mode via `plantilla` prop, same pattern as `marca-form.tsx`'s `isEditing`).
- [x] B2.6 [RED] Failing test — editing a plantilla pre-selects its current productos (from `usePlantillaProductos`); adding/removing a checkbox updates the submitted `productoIds`.
- [x] B2.7 [GREEN] Wire edit-mode initial state from `usePlantillaProductos(plantilla.id)`.
- [x] B2.8 Verify: `yarn test:run`, `yarn type-check:test`. Review gate: B2 actual diff (~544 lines) EXCEEDED the ~400-line budget as forecast. Decision: shipped as a single Slice B PR with maintainer-approved `size:exception` (cohesive CRUD list+form; splitting the product multi-select from the form adds friction without review value). Also wired `PlantillaForm` into `plantilla-list.tsx` (Nueva/Editar buttons -> dialog), completing the B1 placeholder handlers.

## Slice C — Traspaso-Form Integration ("Cargar Plantilla")

- [ ] C.1 [RED] `components/traspasos/__tests__/traspaso-form.test.tsx`: failing test — selecting a plantilla with empty `lineas` replaces `lineas` with the plantilla's productos, `cantidad=''` for each. (Reemplazo de Lineas al Cargar, Carga reemplaza lineas vacias)
- [ ] C.2 [GREEN] `components/traspasos/traspaso-form.tsx`: add "Cargar plantilla" `<select>` (options from `usePlantillasTraspaso()`, empresa-scoped) + `cargarPlantilla(plantillaId)` handler using `usePlantillaProductos(plantillaId)`.
- [ ] C.3 [RED] Failing test — selecting a plantilla when `lineas` has non-empty data triggers `window.confirm`; reject leaves `lineas` untouched, accept replaces.
- [ ] C.4 [GREEN] Add `window.confirm('Esto reemplazara los productos actuales. Continuar?')` gate before replacing, per design's `cargarPlantilla` contract.
- [ ] C.5 [RED] Failing test — a plantilla producto with zero stock in `depositoOrigenId` still loads as a linea (not filtered out); entering `cantidad>0` on it shows the existing zero-stock/stock-exceeded badge (reuse `stockDisponiblePorProducto`, `disponibleNum === 0`). (Producto sin Stock en Origen no Desaparece, Feedback de Stock Aplicado)
- [ ] C.6 [GREEN] Confirm `cargarPlantilla` never filters by `stockDisponiblePorProducto`; badge logic reused unchanged from existing `stockExcedido`/`disponibleNum` computation.
- [ ] C.7 [RED] Failing test — a plantilla producto that is now `is_active=0` still loads into `lineas`, visually flagged inactive (not dropped); a plantilla where ALL productos are inactive still populates `lineas` (all flagged), no blank grid. (Productos Inactivos al Cargar, Estado Vacio - Plantilla sin Productos Activos)
- [ ] C.8 [GREEN] `cargarPlantilla` maps ALL `usePlantillaProductos` rows to `lineas` (no `is_active` filter on load); pass `producto_is_active` through to `LineaItem` for a visual "inactivo" flag in the row render.
- [ ] C.9 Verify `crearTraspaso` (use-traspasos.ts) is untouched — grep confirms zero diff in that file. (Sin Cambios al Flujo de Escritura)
- [ ] C.10 Verify: `yarn test:run`, `yarn type-check:test`.

## Dependency Order

`A1 -> A2 -> B1 -> B2 -> C`, strictly sequential — B1/B2 both depend on A2's hook; C depends on A2's `usePlantillaProductos` (not on B1/B2 directly, but chained last per the feature-branch-chain topology to keep the CRUD UI reviewable before the integration diff).

## Branch/PR Topology (feature-branch-chain)

Tracker branch: `feat/plantillas-de-traslado`, branched from `develop`. Only the tracker merges to `develop` (final PR, after `sdd-verify` passes on the fully-integrated tracker).

| # | Slice | Branch | PR base (review target) |
|---|---|---|---|
| 1 | A1 | `feat/plantillas-de-traslado/a1-schema-lockstep` | `feat/plantillas-de-traslado` (tracker) |
| 2 | A2 | `feat/plantillas-de-traslado/a2-plantillas-hook` | `a1-schema-lockstep` |
| 3 | B1 | `feat/plantillas-de-traslado/b1-plantilla-list` | `a2-plantillas-hook` |
| 4 | B2 | `feat/plantillas-de-traslado/b2-plantilla-form` | `b1-plantilla-list` |
| 5 | C | `feat/plantillas-de-traslado/c-traspaso-form-integracion` | `b2-plantilla-form` |
| — | tracker | `feat/plantillas-de-traslado` | `develop` (final PR only) |

**Merge rule**: implement and open PRs strictly in chain order. Each slice's PR is reviewed against its listed base so the diff shows ONLY that slice's own changes. On approval: merge the slice branch into its base, then fast-forward that base into the tracker, and retarget the next slice's PR base to the tracker before merging it. Never merge any slice branch directly to `develop`.
