# Exploration: inventario-multideposito

## Established ground truth (from prior investigations, not re-derived)

- `productos` has NO deposit column (`schema.ts:348-380`). The "Deposito" select on the product-form "Inventario" tab is local state `depositoId` (`producto-form.tsx:373`), used ONLY once at creation for the initial-stock kardex entry (`producto-form.tsx:978-1008`). Not persisted, not read afterward.
- SALES egreso resolves deposit via hardcoded `SELECT id FROM depositos WHERE empresa_id=? AND es_principal=1 AND is_active=1 LIMIT 1` (fallback: any active) — `use-ventas.ts:271-294`. Same pattern in `use-notas-credito.ts:161-177`. Product-agnostic, caja-agnostic.
- PURCHASES ingreso: same hardcoded `es_principal` query, resolved ONCE for the whole invoice — `use-compras.ts` (actual path: `src/features/inventario/hooks/use-compras.ts:432-447`).
- MANUAL kardex: `use-kardex.ts:121-142` accepts optional user-supplied `deposito_id`, else falls back to hardcoded principal.
- AJUSTES: deposit comes from per-line `linea.deposito_id`, user-chosen. Already correct.
- `cajas.deposito_id` exists (`schema.ts:257`), wired in `caja-form.tsx`/`use-cajas.ts`, but never read in the sale flow.
- `depositos.es_principal` exists (`schema.ts:337`).

## Findings A–F (new investigation, with evidence)

### A. Stock validation in the sale (highest-risk path)

Three independent layers read stock, and **all three read `productos.stock`** — a single denormalized empresa-wide counter — **never `inventario_stock` (the per-deposit table)**.

1. **Article select (hides out-of-stock products)** — two separate queries, both filter on the denormalized column:
   - `panel-productos.tsx:11-18` (grid view): `WHERE p.empresa_id = ? AND p.is_active = 1 AND (p.tipo = 'S' OR CAST(p.stock AS REAL) > 0)`
   - `use-ventas.ts:193-211` `useBuscarProductosVenta` (search dropdown): same `AND (p.tipo = 'S' OR CAST(p.stock AS REAL) > 0)` filter, plus `buscarProductoPorCodigoBarras` (`use-ventas.ts:231-251`) has the identical filter for barcode scan.

2. **Quantity > available → red highlight, blocks invoicing**:
   - `pos-terminal.tsx:352` sets `stock_actual: parseFloat(producto.stock)` on the line item when a product is added to the cart — same denormalized column, captured as a point-in-time snapshot.
   - `linea-items.tsx:68` (compact) and `:214` (full table): `stockDisponible = linea.stock_actual - linea.cantidad`; red styling / `border-destructive` applied when `stockDisponible < 0` (`linea-items.tsx:69,125,215,268`).
   - `pos-terminal.tsx:456-464` `handleAbrirCobro`: hard block — `productosConStockInsuficiente = lineas.filter(l => l.tipo === 'P' && l.cantidad > l.stock_actual)`; if any and the user lacks `PERMISSIONS.SALES_OVERRIDE_STOCK`, invoicing is rejected client-side.

3. **Local write-time re-check inside the transaction** — `use-ventas.ts:454-479`: re-reads `productos.stock` fresh inside `writeTransaction`, throws `Stock insuficiente...` if `stockActual < linea.cantidad`. This is the authoritative local guard (client select can be stale).

4. **Server-side re-check (defense in depth)** — `validarStockServidor` (`use-ventas.ts:25-71`) calls Edge Function `supabase/functions/validar-stock/index.ts`, called from the POS checkout flow before `crearVenta`. That function **also reads `productos.stock`** directly from Postgres (`validar-stock/index.ts:102-106,126`), not `inventario_stock`. Returns HTTP 409 to hard-block if insufficient.

**Conclusion**: making sales deposit-aware requires touching **4 separate stock-reading call sites** (2 select queries, 1 client pre-check, 1 local tx re-check) **plus the Edge Function**, and all must switch from `productos.stock` to a per-(product, deposito) quantity. Today `inventario_stock.cantidad_actual` exists in the schema but is **not authoritative** — see Finding C.

### B. Company creation / bootstrap

- Frontend registration flow (`src/features/auth/`) calls the Supabase Edge Function `register-owner` (`supabase/functions/register-owner/index.ts`) — this is a **Deno edge function performing service-role Postgres inserts**, not a frontend PowerSync write. It runs before the user has offline data, so this is the only correct injection point.
- Step 9 (`register-owner/index.ts:362-461`) already seeds `caja_fuerte` (treasury safes, one for Bs one for USD) and their linked `metodos_cobro` rows — but does **not** create any `depositos` row nor any `cajas` (POS cash-register) row.
- **Exact injection point**: immediately after step 9 (line 461), before the final `return jsonResponse(...)` (line 463), add: insert one `depositos` row (`es_principal: true`, `permite_venta: true`) for `empresa.id`, then insert one `cajas` row (`deposito_id` = that new deposito's id) for the same empresa. Both use `supabaseAdmin.from(...).insert(...)` exactly like the existing `caja_fuerte`/`metodos_cobro` inserts — same file, same pattern, no new infra.
- Note: `cajas.nro_caja` is assigned server-side by a Postgres trigger (see Finding F) — so the bootstrap insert must NOT set `nro_caja` manually; the trigger fires on insert regardless of caller (service-role or normal insert).
- There is no separate frontend "create company" write path — `register-owner` is the sole company-creation entry point.

### C. `inventario_stock` structure

`schema.ts:382-393`:
```
inventario_stock: { empresa_id, producto_id, deposito_id, cantidad_actual, stock_reservado, updated_at, updated_by }
```
Confirmed keyed per `(empresa_id, producto_id, deposito_id)` — the row model DOES support per-deposit stock.

**However — critical discovery**: this table is essentially orphaned today.
- Only write site in the whole codebase: `producto-form.tsx:999` (`INSERT INTO inventario_stock ...`), fired once at product creation alongside the initial kardex entry.
- Only read sites: `use-inventario-stock.ts` (`useStockPorProducto`, `useStockPorDeposito`) — a reporting-only hook, not consumed by sales, purchases, or the manual kardex form.
- **Sales, purchases, manual kardex, and ajustes all update `productos.stock` directly** (e.g. `use-ventas.ts:586-590,640-644`) and **never touch `inventario_stock.cantidad_actual`** after the initial insert. So after the first stock movement, `inventario_stock` silently goes stale/wrong for any product that's ever sold, purchased, or adjusted.
- The hook's own doc comment (`use-inventario-stock.ts:17,39`) claims "el stock solo se modifica via movimientos" (read-only, kept in sync via movements) — that claim is **false** in the current codebase; nothing keeps it in sync.

**Implication for design**: the redesign cannot just "start reading `inventario_stock`" — it must also make every stock-mutating write path (ventas, compras, kardex ingreso/manual salida, ajustes) start writing to `inventario_stock.cantidad_actual` per deposit, in addition to (or instead of) `productos.stock`. This is a bigger surface than it first appears.

### D. Existing data migration concerns

- After adding `productos.deposito_id`: existing product rows will have `NULL`. Backfill: `UPDATE productos SET deposito_id = (SELECT id FROM depositos WHERE empresa_id = productos.empresa_id AND es_principal = 1 LIMIT 1) WHERE deposito_id IS NULL` — safe if every empresa already has exactly one `es_principal` deposito (needs to be verified per-tenant before migrating; if an empresa has zero or >1 `es_principal` deposits, the backfill needs a manual fallback).
- Existing `cajas.deposito_id` may also be `NULL` for empresas that never touched that field in `caja-form.tsx`. Backfill: same pattern, `UPDATE cajas SET deposito_id = (principal deposito of empresa) WHERE deposito_id IS NULL`.
- Migrations live in `migrations/`, numbered `NNNN_description.sql`, sequential, idempotent (`migrations/README.md`). **Discovery**: the README's own "current migrations" table only documents 3 files (`0001`, `0002`, `0055`) but the folder actually contains 82 files up to `0082_seed_material_empaque_flete_cuentas.sql`, including duplicate numbers (`0029` and `0047` each appear twice) — the README index is stale/incomplete, not a reliable source for "next number available". Next free sequential number to use: **0083** (confirmed via `ls migrations/*.sql`, highest existing is 0082).
- `productos.deposito_id` should be added as **nullable initially**, backfilled, then optionally set `NOT NULL` in a follow-up migration once backfill is verified — mirrors the exact pattern already used for `cajas.nro_caja` in `migrations/0040_nro_caja.sql` (nullable → populate → `NOT NULL` → constraint).
- `productos.deposito_id` needs a matching entry in `src/core/db/powersync/schema.ts` (`productos` table, `schema.ts:348-380`) and `src/core/db/kysely/types.ts` (`Productos` interface, `types.ts:324-354`) — PowerSync sync rules / Kysely types must be kept in lockstep with the SQL migration or local writes will silently drop the column.

### E. Transfer feature — reuse vs. new table

- `traspasos_tesoreria` (`schema.ts:908-933`) is confirmed **money-only**: `cuenta_origen_tipo/id`, `cuenta_destino_tipo/id`, `monto_origen/destino`, `moneda_origen/destino_id`, `tasa_cambio` — no `producto_id`, no `cantidad`. Cannot be reused or extended for inventory; conceptually a different domain (financial account transfer vs. stock transfer).
- No `traspasos_inventario` (or similar) table exists anywhere in the schema.
- `movimientos_inventario` columns available (`schema.ts:395-419`): `producto_id, deposito_id, tipo_movimiento_id, tipo (E/S), origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, moneda_id, tasa_cambio, doc_origen_id, doc_origen_ref, lote_id, motivo, usuario_id, fecha, created_at, tipo_salida`. A transfer CAN be represented as two paired rows (`tipo='S', origen='TRA'` from deposito A + `tipo='E', origen='TRA'` into deposito B) linked by a shared `doc_origen_id`/`doc_origen_ref` — this is the exact pattern already used for sale-with-lotes (`use-ventas.ts:522-543`, multiple kardex rows sharing `doc_origen_id: ventaId`).
- **Recommendation**: paired `movimientos_inventario` rows alone are enough to move stock and to report/group (via shared `doc_origen_id`), but they are **not enough** to satisfy the requirement for a documented transfer header (responsible user, datetime, `autorizado_por`/`verificado_por` placeholders, per-user correlativo). Recommend a **new header table `traspasos_inventario`** (one row per transfer, holds `deposito_origen_id`, `deposito_destino_id`, `usuario_id`, `fecha`, `observacion`, `autorizado_por` nullable, `verificado_por` nullable, `correlativo_usuario` integer, plus `mov_salida_id`/`mov_entrada_id` per detail line) **+ a detail table `traspasos_inventario_det`** (one row per product transferred, `producto_id`, `cantidad`, `mov_salida_id`, `mov_entrada_id`) so a single transfer document can move a batch of products atomically and still be queried as one unit — mirrors the `ventas`/`ventas_det` and `facturas_compra`/`facturas_compra_det` header/detail pattern already used everywhere else in this codebase.

### F. Per-user correlativo pattern

- `cajas.nro_caja` (the caja's own C01/C02 number) is assigned by a **Postgres trigger**, not the frontend: `migrations/0040_nro_caja.sql:38-51` — `BEFORE INSERT ON cajas`, `NEW.nro_caja := COALESCE((SELECT MAX(nro_caja)+1 FROM cajas WHERE empresa_id = NEW.empresa_id), 1)`. This requires a round-trip to Supabase/Postgres — `crearCaja()` (`use-cajas.ts:64-88`) inserts without ever setting `nro_caja` itself; the value only becomes visible locally once the row round-trips through PowerSync sync. **Not offline-safe for immediate use** — a caja created offline won't have its `nro_caja` until the device reconnects and syncs back down.
- The **factura correlativo per caja** (`C01-000001`) is a **different, fully client-side mechanism**: `use-ventas.ts:348-396` — inside the local `writeTransaction`, `SELECT COUNT(*) FROM ventas v INNER JOIN sesiones_caja sc ON v.sesion_caja_id = sc.id WHERE v.empresa_id = ? AND sc.caja_id = ?`, then `cnt + 1`. This is offline-safe by construction (reads local SQLite, no server round-trip) but has a known weakness: a code comment elsewhere (`use-ventas.ts:950` area, `nroGastoAbs`) explicitly notes COUNT-based numbering is "immune to multi-device COUNT collisions" *only* when using UUID-suffixed identifiers instead — implying the COUNT approach **can** collide if two devices create records for the same caja/user while both offline, then sync.
- **For the transfer correlativo**: recommend mirroring the `use-ventas.ts:348-396` COUNT-based pattern scoped to `usuario_id` instead of `caja_id` (`SELECT COUNT(*) FROM traspasos_inventario WHERE empresa_id = ? AND usuario_id = ?`), computed inside the same `writeTransaction` that creates the transfer — fully offline-safe for the common single-device-per-user case, with the same known multi-device-collision caveat that already exists for facturas today (not a new risk, an accepted existing tradeoff in this codebase).

## Implementation surface (files that will need to change)

**Schema / migration**
- `migrations/0083_*.sql` (next free number) — add `productos.deposito_id` (nullable FK → depositos), backfill, add `traspasos_inventario` + `traspasos_inventario_det` tables, backfill `cajas.deposito_id` where NULL.
- `src/core/db/powersync/schema.ts` — add `productos.deposito_id` column; add `traspasos_inventario` / `traspasos_inventario_det` table definitions + register in the exported table list.
- `src/core/db/kysely/types.ts` — add `deposito_id` to `Productos`; add `TraspasosInventario` / `TraspasosInventarioDet` interfaces.
- PowerSync sync rules (wherever bucket definitions live, e.g. `powersync-sync-rules.yaml`) — ensure new tables/columns are included in the `empresa[]` bucket.

**Productos**
- `src/features/inventario/components/productos/producto-form.tsx` — persist the existing `depositoId` local state to `productos.deposito_id` on create AND make it editable/visible on edit (currently create-only, one-shot).

**Compras (purchases ingreso)**
- `src/features/inventario/hooks/use-compras.ts` — replace the single pre-fetched `depositoId` (lines ~431-448, used at 553/598/621/650) with a per-line resolution: each `factura_compra_det` line reads `productos.deposito_id` of ITS product (fallback to empresa principal if null), so one purchase invoice can write kardex entries to multiple deposits. `facturas_compra_det.deposito_id` column already exists — no schema change needed here, only logic.

**Kardex manual ingreso**
- `src/features/inventario/hooks/use-kardex.ts` (`registrarMovimiento`, lines 121-142) — change the "no `deposito_id` passed" fallback to first check the product's `productos.deposito_id`, then principal, instead of jumping straight to principal.
- `src/features/inventario/components/kardex/movimiento-form.tsx` — pre-select the deposito dropdown with the product's default deposito (still overridable) instead of leaving `depositoId` state empty by default.

**Ventas (sale egreso + stock validation — highest risk)**
- `src/features/ventas/hooks/use-ventas.ts` — deposit resolution (lines 271-294) must switch from empresa-wide principal to the CAJA's `deposito_id` (via `sesion_caja_id → cajas.deposito_id`); stock re-check (lines 454-479) must read `inventario_stock` for `(producto_id, caja's deposito_id)` instead of `productos.stock`.
- `src/features/ventas/components/panel-productos.tsx` (`ALL_PRODUCTS_QUERY`, lines 11-18) — must filter/join on per-deposit stock for the active caja's deposito, not the global `productos.stock` column.
- `src/features/ventas/hooks/use-ventas.ts` (`useBuscarProductosVenta`, lines 193-211, and `buscarProductoPorCodigoBarras`, lines 231-251) — same per-deposit filter change.
- `src/features/ventas/components/pos-terminal.tsx` (line 352, `stock_actual` capture, and 456-464, the hard block) — must source `stock_actual` from the caja's deposit stock, not `producto.stock`.
- `src/features/ventas/components/linea-items.tsx` — no logic change expected (already just compares `stock_actual - cantidad`); only upstream data source changes.
- `supabase/functions/validar-stock/index.ts` (lines 88-135) — server-side re-check must also become deposit-aware: needs `deposito_id` (from the caja) in the request payload, and must query per-deposit stock in Postgres instead of `productos.stock`.

**Notas de crédito (egreso reversal)**
- `src/features/ventas/hooks/use-notas-credito.ts` (lines 160-177) — recommend reading `venta.deposito_id` (already selected via `SELECT * FROM ventas`) instead of re-deriving empresa principal, so the credit note returns stock to the SAME deposit the original sale drew from.

**Ajustes**
- No changes — already user-chosen per line (`linea.deposito_id`).

**Traspasos (new feature)**
- New hook `src/features/inventario/hooks/use-traspasos.ts` (or similar) — atomic 2-movement kardex write (salida from A + entrada to B) inside one `writeTransaction`, batch (multi-product) support, per-user correlativo, `autorizado_por`/`verificado_por` nullable fields.
- New UI component(s) — transfer modal (individual + batch), likely under `src/features/inventario/components/traspasos/`.
- New route under `src/routes/_app/inventario/` (mirrors existing `ajustes`, `kardex` routes).

**Company bootstrap**
- `supabase/functions/register-owner/index.ts` — insert one principal `depositos` row + one `cajas` row (linked via `deposito_id`) after step 9 (~line 461), before the final response.

**`inventario_stock` consistency (cross-cutting, discovered — not explicitly requested but blocks correctness)**
- Every stock-mutating write path above (ventas, compras, kardex ingreso/manual salida, ajustes, and the new traspasos) needs to also upsert `inventario_stock.cantidad_actual` for `(producto_id, deposito_id)`, or the redesign will read from a table that's silently stale for any previously-touched product. This needs an explicit DESIGN-phase decision (see open questions).

## Open technical questions for the DESIGN phase

1. **Source of truth for per-deposit stock**: does `inventario_stock.cantidad_actual` become the authoritative per-deposit counter (kept in sync by every write path, mirroring how `productos.stock` is kept in sync today), or does the design instead compute per-deposit stock on the fly via `SUM(movimientos_inventario.cantidad WHERE tipo='E') - SUM(... WHERE tipo='S')`? The former needs a write-path audit across ventas/compras/kardex/ajustes; the latter avoids sync-drift risk but changes every read-side query into an aggregate.
2. **`productos.stock` (empresa-wide) fate**: kept as a denormalized cross-deposit total (sum of all `inventario_stock` rows) for reports/dashboards, or dropped entirely once per-deposit stock is authoritative? If kept, needs a trigger or transactional update on every kardex write to stay consistent — same class of risk as #1.
3. **Purchase line with a product whose `deposito_id` is NULL post-migration**: fallback to empresa principal deposito silently, or block the purchase line and force the user to set the product's deposito first? (Affects UX and whether the backfill in Finding D must be 100% complete before the compras logic change ships.)
4. **Notas de crédito egreso deposit**: confirmed recommendation is `venta.deposito_id` (Finding E's sibling note above) — DESIGN phase should ratify this or pick an alternative (e.g. always current caja's deposito) and document the rationale, since it affects stock accuracy after returns.
5. **Sale with no active caja / no `sesion_caja_id`** (edge case already handled today via fallback to global factura numbering, `use-ventas.ts:388-396`): what deposito does the sale draw from when there's no caja context? Needs an explicit fallback (e.g. empresa principal) documented in design.
6. **Transfer correlativo collision tradeoff**: accept the same COUNT-based multi-device collision risk that already exists for facturas (Finding F), or invest in a stronger mechanism (e.g. client-generated ULID + server-side dedup) for the new feature? Recommend accepting the existing pattern for consistency unless the business has already reported real collisions with facturas.
7. **`autorizado_por` / `verificado_por` semantics**: are these meant to be filled at transfer-creation time (e.g. supervisor PIN, similar to `supervisorId` overrides seen in `use-ventas.ts` ABSORBER flow) or as a later approval step (nullable until someone verifies)? Determines whether traspasos needs a status/workflow field (`PENDIENTE`/`VERIFICADO`) in addition to the two user-reference columns.

## Rough complexity / size read (S/M/L)

| Concern | Size | Notes |
|---|---|---|
| Schema/migration (productos.deposito_id + traspasos tables + backfill) | S | Single migration file, mirrors existing patterns (0040_nro_caja.sql) closely |
| Productos (persist + edit deposito) | S | One field, one form, already has local state wired |
| Compras (per-line deposit resolution) | S | Logic-only change; schema column already exists |
| Kardex manual ingreso (default suggestion) | S | Fallback logic + one form default |
| **Ventas stock validation (4 call sites + Edge Function)** | **L** | Highest risk: financial/inventory-critical path, touches select queries, POS terminal state, local tx re-check, and a Deno edge function; needs careful testing against negative-stock edge cases |
| Notas de crédito | S | One query change |
| Traspasos (new feature: schema + hook + UI + route) | L | New domain end-to-end: header/detail tables, atomic paired-kardex writes, batch UI, correlativo, auth placeholders |
| Company bootstrap | S | Two inserts added to an existing, already-transactional-by-convention Edge Function step |
| `inventario_stock` consistency (cross-cutting) | M–L | Depends entirely on open question #1; if it becomes authoritative, every write path above needs an additional upsert |

**Overall read**: this change is **not a single-PR-sized unit**. The Ventas stock-validation path alone (financial-critical, 5 files including an Edge Function) and the new Traspasos feature (new domain, 2 tables + hook + UI) each independently justify their own chained PR. Recommend the DESIGN/TASKS phases plan at minimum: (1) schema + productos + compras + kardex-ingreso as one slice, (2) ventas stock validation as its own tightly-reviewed slice, (3) traspasos as its own slice, (4) company bootstrap as a small trailing slice. `inventario_stock` consistency should be resolved as a design decision *before* slicing, since it changes the shape of slice (2) and (3).

## Skill Resolution

`paths-injected` — loaded `~/.config/opencode/skills/sdd-explore/SKILL.md` per the orchestrator's `## Skills to load before work` block, plus `_shared/sdd-phase-common.md` and `_shared/openspec-convention.md` referenced from within it.
