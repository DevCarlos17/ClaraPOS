# Design: Inventario Multideposito

## Technical Approach

Make `productos.deposito_id` the default-deposito source for stock-IN, `cajas.deposito_id` the source for stock-OUT on sales, and make `inventario_stock` the authoritative per-`(empresa, producto, deposito)` counter via **one shared transactional helper** invoked from every mutating path (ventas, compras, kardex, ajustes, traspasos). `movimientos_inventario` stays the immutable historical source; `inventario_stock` is a maintained projection over it, with a recalculation repair function as safety net. Ship as 4 chained PRs per the proposal's ordering.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Stock authority | `inventario_stock.cantidad_actual` authoritative, updated in-tx alongside every kardex insert | On-the-fly `SUM()` from kardex on every read | Read-hot path (POS product search) needs O(1) lookup; SUM-on-read would regress POS latency. Repair function covers drift risk. |
| `productos.stock` | Kept as denormalized cross-deposit total, updated in the same tx | Drop entirely | Reports/dashboards already read it; dropping is a bigger blast radius than keeping it in sync via the same helper. |
| Stock upsert mechanism | Explicit SELECT-then-INSERT-or-UPDATE inside `writeTransaction` | `INSERT ... ON CONFLICT DO UPDATE` | Codebase has **zero** local `ON CONFLICT` usage in `writeTransaction` code (grep confirmed); every existing write path (ventas, compras, kardex) uses SELECT-then-branch. Matches PowerSync/wa-sqlite conventions already in use. |
| Traspasos immutability | No `UPDATE`/`DELETE` RLS policy on `traspasos_inventario(_det)` — immutable by RLS-default-deny | New `trg_traspaso_no_update/delete` triggers (kardex-style) | `autorizado_por`/`verificado_por` are explicitly out-of-scope placeholders with **no later-fill workflow** (spec: "fully effective... no PENDIENTE state"), so there's no legitimate UPDATE path to allow. Mirrors `movimientos_inventario`/`ventas_det`/`facturas_compra_det`, which get SELECT+INSERT-only policies with no dedicated trigger. Simpler, same effective guarantee. |
| Notas de credito deposito | `venta.deposito_id` (already selected via existing `SELECT * FROM ventas`) | Current caja's deposito | Ratifies exploration Finding E recommendation — returns stock to where it was actually drawn from, correct even if the return happens at a different caja/day. |
| Sale w/ no active caja | Fallback to empresa principal deposito | Block the sale | Mirrors the existing factura-numbering fallback (`use-ventas.ts:388-396`); consistent existing precedent, no new UX dead-end. |
| Transfer correlativo | `COUNT(*)+1` scoped to `(empresa_id, usuario_id)`, computed in-tx | Client-generated ULID + server dedup | Accepts the same known multi-device COUNT-collision tradeoff already live for facturas (Finding F) — consistency over new mechanism for an out-of-scope edge case. |
| `productos.deposito_id` NOT NULL | Deferred to follow-up migration | Set NOT NULL now | Matches `0040_nro_caja.sql` nullable→backfill→NOT NULL pattern; avoids blocking this migration on 100%-verified backfill across all tenants. |

## Data Model / Migration `0083_deposito_multitenant.sql`

```sql
-- 1. productos.deposito_id (nullable FK)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS deposito_id UUID REFERENCES depositos(id);

UPDATE productos p SET deposito_id = (
  SELECT id FROM depositos WHERE empresa_id = p.empresa_id AND es_principal = true LIMIT 1
) WHERE p.deposito_id IS NULL;

-- 2. cajas.deposito_id backfill (column exists since schema.ts:257, may be NULL)
UPDATE cajas c SET deposito_id = (
  SELECT id FROM depositos WHERE empresa_id = c.empresa_id AND es_principal = true LIMIT 1
) WHERE c.deposito_id IS NULL;

-- 3. traspasos_inventario (header)
CREATE TABLE IF NOT EXISTS traspasos_inventario (
  id UUID PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  deposito_origen_id UUID NOT NULL REFERENCES depositos(id),
  deposito_destino_id UUID NOT NULL REFERENCES depositos(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL,
  observacion TEXT,
  autorizado_por UUID REFERENCES usuarios(id),
  verificado_por UUID REFERENCES usuarios(id),
  correlativo_usuario INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT chk_traspaso_depositos_distintos CHECK (deposito_origen_id <> deposito_destino_id)
);

-- 4. traspasos_inventario_det (detail)
CREATE TABLE IF NOT EXISTS traspasos_inventario_det (
  id UUID PRIMARY KEY,
  traspaso_id UUID NOT NULL REFERENCES traspasos_inventario(id),
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
  mov_salida_id UUID REFERENCES movimientos_inventario(id),
  mov_entrada_id UUID REFERENCES movimientos_inventario(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: SELECT + INSERT only (no UPDATE/DELETE) — mirrors movimientos_inventario/ventas_det.
CREATE POLICY "select_own_empresa" ON traspasos_inventario FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON traspasos_inventario FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
-- (mirror for traspasos_inventario_det)
```

**Lockstep table** (must land together, per spec `Migracion en Lockstep`):

| Artifact | Change |
|---|---|
| `migrations/0083_deposito_multitenant.sql` | New — SQL above |
| `src/core/db/powersync/schema.ts` | Add `deposito_id: column.text` to `productos` Table (schema.ts:348-380); add `traspasos_inventario` / `traspasos_inventario_det` Table defs with `cantidad: column.text` (decimal-as-string convention), register in exported table list |
| `src/core/db/kysely/types.ts` | Add `deposito_id: string \| null` to `Productos` (types.ts:324-354); add `TraspasosInventario` / `TraspasosInventarioDet` interfaces |
| `backend/powersync-sync-rules.yaml` | `productos`/`inventario_stock`/`movimientos_inventario` already use `SELECT *` (auto-includes new columns, no edit needed). Add 2 new lines: `SELECT * FROM traspasos_inventario WHERE empresa_id = bucket.empresa_id` and same for `_det`, in the `--- INVENTARIO ---` block (line ~94) |

## `inventario_stock` Maintenance Helper (cross-cutting core)

New pure-ish module `src/features/inventario/lib/stock-deposito.ts`:

```ts
export async function upsertStockDeposito(
  tx: Transaction,
  params: { empresa_id: string; producto_id: string; deposito_id: string; delta: Decimal; usuario_id: string; now: string }
): Promise<{ stockDepositoNuevo: Decimal; stockTotalNuevo: Decimal }>
```

Sequence (inside the SAME `writeTransaction` as the kardex insert): (1) `SELECT cantidad_actual FROM inventario_stock WHERE empresa_id=? AND producto_id=? AND deposito_id=?`; if found, guard `current.plus(delta) >= 0` then `UPDATE`, else `INSERT` new row (guard applies here too, `delta >= 0` required since no row = 0 baseline); (2) `SELECT stock FROM productos WHERE id=?`, `UPDATE productos SET stock = stock + delta`. Both steps use `decimal.js` (3-decimal `.toFixed(3)` on write, matching existing `stockNuevo.toFixed(3)` convention). Non-negative guard throws `Error('Stock insuficiente...')` before any write — caller's `writeTransaction` promise rejects, PowerSync rolls back the WHOLE transaction (all kardex/detail rows included), preserving atomicity.

**Integration per write path** (each call is 2 extra statements added right after the existing kardex `INSERT`, replacing the sibling `UPDATE productos SET stock=...` call):

| Path | File:line (current) | Change |
|---|---|---|
| Ventas egreso | `use-ventas.ts:586-590` (no-lote), `:640-644` (servicio/receta) | Replace `UPDATE productos SET stock=...` with `upsertStockDeposito(tx, {..., deposito_id: depositoId, delta: cantidad.negated()})` |
| Ventas egreso (lotes) | `use-ventas.ts:512-543` | Same, delta negated, per lote-loop iteration total |
| Compras ingreso | `use-compras.ts:642-660` (movimiento insert) | Add `upsertStockDeposito(tx, {..., deposito_id: lineaDepositoId, delta: dCantidad})` after kardex insert; drop the separate `productos.stock` write that currently trails the loop |
| Kardex manual | `use-kardex.ts` after kardex insert (~line 164+) | Add `upsertStockDeposito` call with `delta` signed by `tipo` |
| Ajustes | existing `linea.deposito_id`-based writes | Add `upsertStockDeposito` call (already deposit-scoped, only needs the new helper wired in) |
| Notas de credito | `use-notas-credito.ts` after kardex entrada insert | Add `upsertStockDeposito(tx, {..., deposito_id: venta.deposito_id, delta: cantidad})` |
| Traspasos | new | 2 calls per line (origen negative, destino positive) — see below |

**Repair function**: `recalcularStockDesdeKardex(params: { empresa_id: string; producto_id?: string; deposito_id?: string })` — groups `movimientos_inventario` by `(producto_id, deposito_id)`, computes `SUM(cantidad WHERE tipo='E') - SUM(cantidad WHERE tipo='S')`, writes each result to `inventario_stock` inside one `writeTransaction`, then recomputes `productos.stock` as the cross-deposit sum. Admin-triggered utility (not on any hot write path); no UI required this change, exposed as a callable hook for future admin tooling.

## Deposit Resolution Logic

| Flow | Resolution | Fallback |
|---|---|---|
| Compras (per line), Kardex manual ingreso | `productos.deposito_id` of that line's/that product's row | Empresa `es_principal=1` deposito |
| Ventas egreso | `sesiones_caja.caja_id → cajas.deposito_id`, resolved once at `use-ventas.ts:271-294` (replaces the current hardcoded `es_principal` query) | Empresa `es_principal=1` deposito if no `sesion_caja_id` or caja's `deposito_id` is NULL |
| Notas de credito egreso reversal | `venta.deposito_id` (row already fetched at `use-notas-credito.ts:180`) | None needed — `ventas.deposito_id` is always set at sale time |

Two pure functions extracted for unit testing: `resolveDepositoIngreso(productoDepositoId, empresaPrincipalId)` and `resolveDepositoEgresoVenta(cajaDepositoId, empresaPrincipalId)` — both trivial `??` but isolated so the fallback logic is covered without PowerSync/tx setup.

## Ventas Stock-Validation Redesign (highest risk)

Elegance point: keep the field name `stock` in `ProductoVenta`/`stock_actual` in line-item state — only the query's JOIN target changes. Downstream consumers (`linea-items.tsx:68,214`, `pos-terminal.tsx:352,456-464`) need **zero code changes** because they already just read `producto.stock` / `linea.stock_actual`.

New shared hook `useDepositoActivoVenta()` (new file, `src/features/ventas/hooks/use-deposito-activo.ts`): wraps `useSesionActiva()` → `sesion.caja_id` → `useQuery('SELECT deposito_id FROM cajas WHERE id=?', [caja_id])`, falls back to a principal-deposito query when no active session. Called ONCE in `pos-terminal.tsx`, `depositoId` threaded as a prop to `PanelProductos` and `ProductoBuscador`.

| Call site | File:line | New query shape |
|---|---|---|
| Grid select | `panel-productos.tsx:11-18` `ALL_PRODUCTS_QUERY` | `LEFT JOIN inventario_stock s ON s.producto_id=p.id AND s.deposito_id=?` ... `AND (p.tipo='S' OR CAST(COALESCE(s.cantidad_actual,0) AS REAL)>0)`; alias `COALESCE(s.cantidad_actual,0) AS stock`. Params: `[depositoId, empresaId]` |
| Search dropdown | `use-ventas.ts:193-211` `useBuscarProductosVenta` | Same JOIN, add `depositoId` param to the hook signature |
| Barcode scan | `use-ventas.ts:231-251` `buscarProductoPorCodigoBarras` | Same JOIN, add `depositoId` param |
| POS capture + hard block | `pos-terminal.tsx:352,456-464` | No change — reads `producto.stock` which is now per-deposit via the query above |
| Local tx re-check | `use-ventas.ts:454-479` | Step-0 depositoId is now the caja's deposito (see resolution table); replace `SELECT stock FROM productos` with `SELECT cantidad_actual FROM inventario_stock WHERE producto_id=? AND deposito_id=?` |
| Edge Function | `supabase/functions/validar-stock/index.ts:47-52,102-106` | Request body adds `deposito_id: string` (top-level, one per checkout since all lines share the caja's deposito); Postgres query changes from `.from("productos").select("id,nombre,stock")` to `.from("inventario_stock").select("producto_id,cantidad_actual").eq("deposito_id", deposito_id).in("producto_id", productIds)`, joined client-side to `nombre` from the existing `lineas` payload for the error message |

## Traspasos Feature Design

New hook `src/features/inventario/hooks/use-traspasos.ts`:

```ts
export interface LineaTraspaso { producto_id: string; cantidad: number }
export interface CrearTraspasoParams {
  empresa_id: string; usuario_id: string
  deposito_origen_id: string; deposito_destino_id: string
  observacion?: string
  lineas: LineaTraspaso[]   // 1 = individual, N = batch — same code path
}
export async function crearTraspaso(params: CrearTraspasoParams): Promise<{ traspasoId: string; correlativo: number }>
```

Atomic sequence, ALL inside one `db.writeTransaction`: (1) reject `deposito_origen_id === deposito_destino_id` client-side (DB CHECK is defense-in-depth); (2) `correlativo = COUNT(*) FROM traspasos_inventario WHERE empresa_id=? AND usuario_id=?` + 1 (pure function `computeCorrelativoUsuario(count)` for unit test); (3) `INSERT traspasos_inventario` header, `autorizado_por`/`verificado_por` = NULL; (4) per line: `SELECT cantidad_actual FROM inventario_stock WHERE producto_id=? AND deposito_id=origen` — throw if `< linea.cantidad` (blocks the WHOLE tx, no partial commit, satisfies spec "Bloqueo por Stock Insuficiente en Origen" for individual AND batch); `INSERT movimientos_inventario` salida (`tipo='S', origen='TRA', doc_origen_id=traspasoId`) → `movSalidaId`; `INSERT movimientos_inventario` entrada (`tipo='E', origen='TRA'`) → `movEntradaId`; `upsertStockDeposito` origen (delta negative) and destino (delta positive); `INSERT traspasos_inventario_det` linking both mov ids. Pure function `buildTraspasoKardexPair(...)` returns the two row objects without executing SQL — unit-testable without PowerSync.

UI mirrors `ajustes`' single-form-multi-line pattern (not two separate individual/batch components): one `TraspasoForm` with a dynamic lines array under `src/features/inventario/components/traspasos/`, new route `src/routes/_app/inventario/traspasos.tsx` (list + create modal, same shape as the existing `ajustes` route).

## Company Bootstrap Design

`supabase/functions/register-owner/index.ts`, inserted immediately after the existing step-9 block (after line 461, before the `return jsonResponse(...)` at line 463):

```ts
const { data: deposito } = await supabaseAdmin.from("depositos").insert({
  id: crypto.randomUUID(), empresa_id: empresa.id, nombre: "Almacen Principal",
  es_principal: true, permite_venta: true, is_active: true,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  created_by: authData.user.id,
}).select("id").single();

if (deposito?.id) {
  await supabaseAdmin.from("cajas").insert({
    id: crypto.randomUUID(), empresa_id: empresa.id, nombre: "Caja 1",
    deposito_id: deposito.id, is_active: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    created_by: authData.user.id,
    // nro_caja intentionally omitted — trg_assign_nro_caja (0040_nro_caja.sql) assigns it server-side
  });
}
```

Same `supabaseAdmin.from(...).insert(...)` pattern as the existing `caja_fuerte`/`metodos_cobro` inserts in the same file — no new infra.

## Cross-Cutting Concerns

- **Migration ordering**: `0083` (schema+backfill) MUST deploy and complete backfill BEFORE the ventas/compras/kardex code changes ship — otherwise reads of `productos.deposito_id`/`cajas.deposito_id` hit NULL on unmigrated rows. Every fallback (`?? principal`) is bulletproof against NULL, so even a partial backfill degrades to today's behavior (principal-only), never breaks. Backfill is idempotent (`WHERE ... IS NULL`), safe to re-run.
- **Transaction boundaries**: every write path (ventas, compras, kardex, ajustes, notas de credito, traspasos) is already, and remains, one `db.writeTransaction` per operation — the new `upsertStockDeposito` calls are added INSIDE those existing transactions, never a separate one. All-or-nothing confirmed for every path in the tables above.
- **TDD extraction** (`strict_tdd: true`): pure, PowerSync-free unit-testable functions: `resolveDepositoIngreso`, `resolveDepositoEgresoVenta`, `computeCorrelativoUsuario`, `buildTraspasoKardexPair`, and the delta math inside `upsertStockDeposito` (extract as `computeStockDelta(current: Decimal, delta: Decimal): Decimal` that throws on negative, tested directly with decimal.js fixtures incl. the 0.125+0.125 precision scenario from the spec). Everything touching `tx.execute`/`writeTransaction` is integration-level, tested against a real PowerSync/wa-sqlite instance per existing project convention (no test infra exists yet — first tests in this change establish the pattern).

## Chained-PR Slicing (ratified)

| Slice | Boundary | Pure functions introduced | Test surface |
|---|---|---|---|
| 1. Schema + Productos + Compras + Kardex-ingreso | `0083` migration + schema.ts/types.ts/sync-rules lockstep, `producto-form.tsx` persist+edit, `use-compras.ts` per-line resolution, `use-kardex.ts`/`movimiento-form.tsx` default suggestion, `upsertStockDeposito` helper + `recalcularStockDesdeKardex` | `resolveDepositoIngreso`, `computeStockDelta` | Unit: fallback logic, delta math (incl. decimal precision). Integration: compra multi-deposito writes correct kardex+inventario_stock per line; kardex ingreso defaults correctly |
| 2. Ventas stock validation | `use-ventas.ts` (resolution + re-check), `panel-productos.tsx`, `use-ventas.ts` search/barcode, `pos-terminal.tsx` (prop threading only), `validar-stock/index.ts`, new `useDepositoActivoVenta` | `resolveDepositoEgresoVenta` | Unit: resolution fallback. Integration: sale discounts from caja deposito, insufficient-stock guard blocks at all 4 sites + Edge Function, product hidden when 0 in caja's deposito but >0 elsewhere |
| 3. Traspasos | New migration tables (already in slice 1's `0083`, or split to own migration if slice 1 lands first — TBD in tasks), `use-traspasos.ts`, UI components, new route | `computeCorrelativoUsuario`, `buildTraspasoKardexPair` | Unit: correlativo math, kardex-pair construction. Integration: individual + batch atomic transfer, insufficient-stock block, correlativo increments per user |
| 4. Company bootstrap + Notas de credito | `register-owner/index.ts` inserts, `use-notas-credito.ts` deposit source | None (trivial wiring) | Integration: new empresa has usable deposito+caja; credit note returns stock to `venta.deposito_id` |

Each slice's `400`-line review budget: slice 2 (ventas) is the highest risk for exceeding it given 5 touched files — `sdd-tasks` should forecast this explicitly and consider a further split (read-path vs. write-path re-check) if needed.

## Migration / Rollout

Nullable-first `productos.deposito_id`, backfilled in the same migration, `NOT NULL` deferred to a follow-up migration once backfill is verified per-tenant (per-tenant `es_principal` uniqueness must hold — exploration Finding D flags this as unverified; recommend a pre-migration audit query `SELECT empresa_id, COUNT(*) FROM depositos WHERE es_principal GROUP BY empresa_id HAVING COUNT(*) <> 1` before running `0083` in production).

## Open Questions — Resolved

All 7 questions from `exploration.md` are ratified above: (1) `inventario_stock` authoritative via transactional helper; (2) `productos.stock` kept as denormalized total; (3) NULL `producto.deposito_id` falls back silently to principal; (4) notas de credito uses `venta.deposito_id`; (5) no-caja sale falls back to principal; (6) correlativo accepts existing COUNT-collision tradeoff; (7) `autorizado_por`/`verificado_por` are NULL-forever placeholders in this change, no workflow, hence no UPDATE policy needed.
