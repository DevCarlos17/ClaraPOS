# Proposal: Plantillas de Traslado

## Intent

Testers doing recurring stock transfers (e.g. "reposicion semanal caja 1") must re-pick the same set of products every time they create a traspaso. This change adds reusable transfer templates: a named set of products (no quantities) that pre-loads a traspaso's lineas, letting the user add quantities and freely adjust the set at creation time.

## Scope

### In Scope
- New tables `traspaso_plantillas` (header) + `traspaso_plantillas_det` (product membership, no `cantidad`).
- Migration `0085_traspaso_plantillas.sql`: tables, indexes, RLS (header: SELECT/INSERT/UPDATE/soft-DELETE via `is_active`; det: SELECT/INSERT/DELETE, no UPDATE), idempotent `ALTER PUBLICATION powersync ADD TABLE` blocks.
- `backend/powersync-sync-rules.yaml`: two new lines under `bucket_definitions.by_empresa.data` (INVENTARIO section, after `traspasos_inventario_det`).
- `schema.ts`: register both tables (decimals/UUIDs/timestamps as `column.text`, booleans as `column.integer`).
- New hook `use-plantillas-traspaso.ts`: list active plantillas, create/update header, add/remove det rows — mirrors `use-marcas.ts` + `recetas` delete-and-reinsert pattern.
- CRUD UI: third tab "Plantillas" on `traspasos.tsx`, `PlantillaList` (flat table, mirrors `marca-list.tsx`) + `PlantillaForm` dialog (header fields + product multiselect, reuses the existing `ProductoBuscador` pattern from `traspaso-form.tsx`).
- `traspaso-form.tsx` integration: "Cargar plantilla" select (gated on `depositoOrigenId` being set, same as `ProductoBuscador`), REPLACES current lineas on load, filters out `productos.is_active = 0` at load time (reuse `productosActivos`), flags products with zero stock in origen with a "sin stock en origen" badge distinct from `stockExcedido`.

### Out of Scope
- Storing `cantidad` on `_det` rows (confirmed: quantities are always entered fresh at traspaso time).
- Append/merge-on-load UX (decision below is REPLACE-only for this change).
- Hard-delete of plantillas (soft-delete via `is_active` only).
- New permission slug (reuses existing `INVENTORY_ADJUST`).
- Any change to `use-traspasos.ts` write path — plantillas only pre-populate client state before submit.
- Confirm-before-replace dialog is flagged as a UX detail, not committed in this proposal (see Risks).

## Decisions

1. **Load-template behavior**: selecting a plantilla REPLACES the current `lineas` array (not append/merge). "Cargar plantilla" always starts fresh from that template.
2. **Delete**: soft delete via `is_active` toggle on the header (consistent with `marcas`/editable catalog entities), not hard DELETE.
3. **FK `producto_id` on `_det`**: `ON DELETE RESTRICT` — the repo never hard-deletes `productos` (soft-delete via `is_active` confirmed at `traspaso-form.tsx:178-181`), so RESTRICT is safe and protects referential integrity without blocking any existing flow.
4. **Permissions**: reuse `PERMISSIONS.INVENTORY_ADJUST` (`inventario.ajustar`) — confirmed at `traspasos.tsx:18`, the whole route (including the new tab) is already gated with `<RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST}>`. No new permission slug needed.

## Capabilities

### New Capabilities
- `traspaso-plantillas`: CRUD for named, reusable product-only transfer templates.
- `traspaso-cargar-plantilla`: loading a plantilla into the traspaso form pre-populates lineas (replace semantics), editable afterward.

### Modified Capabilities
- None.

## Approach

Header/detail pair modeled on two existing precedents: `marcas` (editable header, needs UPDATE RLS) for `traspaso_plantillas`, and `recetas` (membership-only, SELECT/INSERT/DELETE, no UPDATE) for `traspaso_plantillas_det`. Structural shape (FKs, indexes, RLS block layout, publication `DO $$` idempotent pattern) copied from the most recent precedent, `migrations/0084_traspasos_inventario.sql` — except 0084 is intentionally immutable; this migration MUST include the header's UPDATE policy since templates are editable config data, not financial records. Ship as 3 chained slices (below) since combined scope exceeds the 400-line review budget.

## Slicing (chained PRs)

- **Slice A — Schema & data layer** (~150-200 lines): `migrations/0085_traspaso_plantillas.sql`, `schema.ts` additions, `powersync-sync-rules.yaml` additions, `use-plantillas-traspaso.ts` hook. No UI. Verifiable via hook-level tests / direct SQL.
- **Slice B — Template CRUD UI** (~200-250 lines): `PlantillaList` + `PlantillaForm` (+ product multiselect), new "Plantillas" tab in `traspasos.tsx`. Depends on Slice A's hook.
- **Slice C — Traspaso form integration** (~80-120 lines): "Cargar plantilla" selector + `cargarPlantilla()` handler (replace semantics) + stock-flag badge in `traspaso-form.tsx`. Depends on Slice A's hook (read-only), independent of Slice B.

Total estimate ~450-570 lines across 3 slices — chained PRs (A -> B -> C) recommended, each independently mergeable and verifiable. 400-line budget risk: **Medium** for the combined change, **Low** per individual slice.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `migrations/0085_traspaso_plantillas.sql` | New | 2 tables, RLS (header UPDATE included), idempotent publication block |
| `src/core/db/powersync/schema.ts` | Modified | Register `traspaso_plantillas`, `traspaso_plantillas_det` |
| `backend/powersync-sync-rules.yaml` | Modified | 2 new bucket lines (INVENTARIO section) |
| `src/features/inventario/hooks/use-plantillas-traspaso.ts` | New | CRUD hook mirroring `use-marcas.ts` + `recetas` delete/reinsert |
| `src/features/inventario/components/plantillas/plantilla-list.tsx`, `plantilla-form.tsx` | New | CRUD UI, mirrors `marca-list.tsx`/`marca-form.tsx` |
| `src/routes/_app/inventario/traspasos.tsx` | Modified | Third `TabsTrigger`/`TabsContent` for "Plantillas" |
| `src/features/inventario/components/traspasos/traspaso-form.tsx` | Modified | "Cargar plantilla" select, `cargarPlantilla()` handler, stock-flag badge |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RLS header UPDATE policy omitted (repeat of pre-0018 `ajustes` bug) | Medium | Migration 0085 MUST include the header UPDATE policy in the SAME migration; explicit checklist item in tasks phase; template is editable, unlike immutable 0084 |
| Sync-rules or Postgres publication omitted for either table | Medium | Migration includes idempotent `DO $$ ... ALTER PUBLICATION powersync ADD TABLE ... $$` (copy 0084 pattern) AND `powersync-sync-rules.yaml` updated in the same slice; PowerSync Cloud dashboard sync-rules paste is a manual post-merge step, flag in tasks |
| `producto_id ON DELETE RESTRICT` blocks an undiscovered hard-delete flow | Low | Repo has no confirmed hard-delete of `productos` (soft-delete via `is_active` only); revisit if one is found during apply |
| Empresa isolation gap | Low | Both tables get `empresa_id` FK + RLS `current_empresa_id()` check + hook-level `WHERE empresa_id = ?`, consistent with all 63 existing tables |
| REPLACE-on-load silently discards unsaved lineas | Medium | Flagged as UX detail: consider a confirm prompt when `lineas` already has non-empty entries before calling `cargarPlantilla()` — decide during design/tasks |
| Stale template drift (inactive producto referenced by template) | Low | Filter/flag via existing `productosActivos` at load time, not blind trust of the join |

## Rollback Plan

Each slice is independently revertable. Slice A: revert migration (down-script drops both tables), revert `schema.ts`/sync-rules additions — no data loss since tables are new and unused until Slice B/C ship. Slice B: purely additive UI (new tab, new components) — revert by removing the tab and component files, no schema dependency. Slice C: revert the "Cargar plantilla" selector and handler in `traspaso-form.tsx` — traspaso creation continues to work exactly as before, no schema dependency.

## Dependencies

- Exploration `sdd/plantillas-de-traslado/explore` — data model, precedents, slice boundaries, and risk surface confirmed; all 4 open questions resolved via Decisions above.
- Slice ordering: A before B and C (both depend on the hook); B and C are mutually independent but B realistically ships first so templates exist to load in C.

## Success Criteria

- [ ] A user can create/edit/deactivate a named plantilla holding a set of products (no quantities).
- [ ] "Cargar plantilla" in the traspaso form replaces current lineas with the template's products (cantidad empty), editable afterward (add/remove lines freely).
- [ ] Inactive productos are filtered/flagged, not silently trusted, when loading a plantilla.
- [ ] Every query filters by `empresa_id`; header RLS supports full CRUD (including UPDATE); det RLS is SELECT/INSERT/DELETE only.
- [ ] Both tables sync via PowerSync (present in `powersync-sync-rules.yaml` AND the Postgres `powersync` publication).
- [ ] `yarn type-check:test` and `yarn test:run` pass for all 3 slices.
