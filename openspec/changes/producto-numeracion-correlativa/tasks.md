# Tasks: Numeración configurable de código de producto (`libre` vs `correlativo`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230 (migration ~45, schema.ts ~1, use-productos.ts ~20, use-ventas.ts ~3, producto-schema.ts ~5, producto-form.tsx ~40, producto-list.tsx ~10, import-productos-modal.tsx ~6, company-data-form.tsx ~30, misc wiring ~70) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 9 tasks below | PR 1 | Estimate stays well under 400-line budget; still ask user per `ask-always` before apply. |

## Phase 1: Database Foundation

- [x] 1.1 Create `migrations/0099_producto_numeracion_correlativa.sql`: `ALTER TABLE productos ADD COLUMN codigo_status TEXT NOT NULL DEFAULT 'asignado' CHECK (codigo_status IN ('pendiente','asignado'))`; `CREATE OR REPLACE FUNCTION assign_codigo_producto()` + `CREATE TRIGGER trg_assign_codigo_producto BEFORE INSERT ON productos` (gap-fill via `pg_advisory_xact_lock(hashtext(empresa_id::text))` + `generate_series`/`LEFT JOIN`, per design.md). `codigo` stays `NOT NULL` — no `DROP NOT NULL`. Apply manually via Supabase SQL Editor (no migration runner). Verify: SC-C1, SC-C2, SC-C3, SC-C4 manually in Supabase SQL Editor (staging).

## Phase 2: Local Schema

- [x] 2.1 `src/core/db/powersync/schema.ts`: add `codigo_status: column.text` to `productos` Table (~line 348-383). Verify: `yarn type-check`.

## Phase 3: Data Hooks

- [x] 3.1 `src/features/inventario/hooks/use-productos.ts`: add `codigo_status: string` to `Producto` interface; `crearProducto()` accepts `codigo_status?: 'pendiente' | 'asignado'` (default `'asignado'`); add `AND codigo_status = 'asignado'` to the WHERE clause of `useProductosActivos` and `useProductosTipo` (leave `useProductos()` unfiltered — inventario list must show PENDIENTE per SC-E4). Verify: `yarn type-check`; satisfies SC-E2, SC-E3, SC-E4.
- [x] 3.2 **(Isolated, high-risk task)** `src/features/ventas/hooks/use-ventas.ts` lines 232-238: add `AND p.codigo_status = 'asignado'` to the POS search `WHERE` clause (same query block that filters `p.empresa_id` and `p.is_active`). This hook does its own raw SQL and does NOT reuse `use-productos.ts` — easy to forget. Verify: `yarn type-check`; manually confirm a PENDIENTE product does not appear in POS search; satisfies SC-E1.

## Phase 4: Validation Schema

- [x] 4.1 `src/features/inventario/schemas/producto-schema.ts`: remove fixed `.min(1)` from `codigo` field (keep `.transform(v => v.toUpperCase())`); "required" validation moves to form-level, conditional on `numeracion_modo === 'libre'`. Verify: Vitest unit test in `schemas/__tests__` covering both modes (automatable); `yarn type-check`.

## Phase 5: Form UI

- [x] 5.1 `src/features/inventario/components/productos/producto-form.tsx`: read `numeracion_modo` via `readConfigNamespace(company?.config, 'inventario', { numeracion_modo: 'libre' })`; make `codigo` input `disabled` when `!isEditing && numeracion_modo === 'correlativo'`; helper text (~line 2035-2042) shows "Último código creado" (query `ORDER BY created_at DESC, id DESC LIMIT 1` — id DESC tiebreaker) in `libre`, or "Siguiente código: PENDIENTE (asignado por el servidor)" in `correlativo`; submit (~line 1658) sends `codigo: '', codigo_status: 'pendiente'` in `correlativo` (new, not editing), else `codigo: parsed.data.codigo, codigo_status: 'asignado'`. Verify: `yarn type-check`, `yarn lint`; manual check of both modes; satisfies SC-F1, SC-F2, SC-F3.

## Phase 6: Inventory List Indicator

- [x] 6.1 `src/features/inventario/components/productos/producto-list.tsx`: render `PENDIENTE` badge (`bg-amber-50 text-amber-700 ring-amber-600/20`, existing style) in the código column when `codigo_status === 'pendiente'`. Verify: `yarn lint`; manual visual check; satisfies SC-E4.

## Phase 7: Import Bug Fix (independent)

- [x] 7.1 `src/features/inventario/components/productos/import-productos-modal.tsx`: move `const now = localNow()` inside the `.map()` loops for `productoInserts` (~line 637) and `productoUpdates` (~line 682) so each row gets its own `created_at`; always set `codigo_status: 'asignado'` on imported rows. Verify: Vitest unit test asserting N unique timestamps for N imported rows (automatable); satisfies SC-B1.

## Phase 8: Config UI

- [x] 8.1 `src/features/configuracion/components/company-data-form.tsx`: add `numeracion_modo` `Select` ('libre'/'correlativo') using `readConfigNamespace`/`serializeConfigNamespace` with namespace `'inventario'`, replicating the `moneda_presentacion_documentos` pattern. Verify: `yarn type-check`, `yarn lint`; manual toggle + reload check; satisfies "Modo de Numeración por Empresa" requirement.

## Phase 9: Manual Verification Checklist (no automated harness)

- [ ] 9.1 SC-X1 (concurrency): two simultaneous inserts same empresa in `correlativo` get distinct codes — manual, staging SQL.
- [ ] 9.2 SC-X2 (idempotent retry): PowerSync upload retry doesn't duplicate row or re-assign code — manual, offline test.
- [ ] 9.3 SC-F3/F4 (offline → sync): offline create persists PENDIENTE locally, then transitions to assigned code after sync — manual, offline/online toggle test.

### Manual Checklist — SQL Snippets (Supabase staging)

**9.1 SC-X1 (concurrency)** — two parallel sessions, same `empresa_id`, `correlativo` mode:
```sql
-- Session A and Session B, run near-simultaneously (two SQL Editor tabs):
INSERT INTO productos (id, codigo, codigo_status, tipo, nombre, departamento_id, empresa_id, costo_usd, precio_venta_usd, stock, stock_minimo, is_active)
VALUES (gen_random_uuid(), '', 'pendiente', 'P', 'TEST CONCURRENCY', '<depto_id>', '<empresa_id>', 1, 2, 0, 0, 1);
-- Expect: distinct codigo values assigned, no UNIQUE violation, no deadlock.
```

**9.2 SC-X2 (idempotent retry)** — simulate PowerSync upload retry:
```sql
-- Insert once with codigo='' (correlativo); confirm a code was assigned.
-- Re-run the EXACT same INSERT with the same id (simulating connector retry)
-- and confirm it either no-ops (PK conflict) or does NOT assign a second code/row.
```

**9.3 SC-F3/F4 (offline → sync)** — manual browser test:
1. Set `inventario.numeracion_modo = 'correlativo'` for the test empresa (Datos de la Empresa).
2. Go offline (DevTools → Network → Offline).
3. Create a product. Confirm it appears in inventario list with PENDIENTE badge, `codigo_status='pendiente'` locally.
4. Go back online, wait for PowerSync sync.
5. Confirm the product row updates to an assigned integer `codigo`, badge disappears, and the product becomes searchable in POS.

## Spec Coverage

All 15 scenarios (SC-C1..C4, SC-X1, SC-X2, SC-F1..F4, SC-E1..E4, SC-B1) are mapped to the tasks above.

## Apply Summary

- Tasks 1.1–8.1 (9 implementation tasks across 8 phases): **done**, implemented on branch `feat/producto-numeracion-correlativa`, 8 work-unit commits.
- Task 9.1–9.3: **pending manual staging verification** (SQL snippets above) — not automatable, consistent with design.md/spec.md.
- `yarn test:run`: 2065/2068 tests passing (3 pre-existing failures in `cxc-list`/`cliente-detalle`/`cxc-cliente-detalle`, unrelated — confirmed via baseline diff before this change).
- `yarn type-check` / `yarn type-check:test`: clean except pre-existing noise (test-file `describe/it/expect` globals, 1 pre-existing unused-var in `use-pwa-update.ts`, 2 pre-existing `Producto` literal errors in `producto-form-aviso-borrador.test.tsx`/`producto-form-edit-open-mask.test.tsx` — all confirmed present on baseline before this change).
