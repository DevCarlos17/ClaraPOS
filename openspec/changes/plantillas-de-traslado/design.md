# Design: Plantillas de Traslado

## Technical Approach

Header/detail modeled on two live precedents: `marcas` (editable catalog, full SELECT/INSERT/UPDATE RLS) for `traspaso_plantillas`, and `recetas` (membership-only, SELECT/INSERT/DELETE, no UPDATE) for `traspaso_plantillas_det`. Structural shape (indexes, FKs, idempotent publication `DO $$` block) copied from `migrations/0084_traspasos_inventario.sql`, EXCEPT the header MUST add the UPDATE policy 0084 intentionally omits (0084 is immutable kardex; plantillas are editable config, same class as `marcas`/`ajustes` — omitting it repeats the pre-`0018` `ajustes` bug). Det rows follow `use-recetas.ts`'s delete-and-reinsert pattern (no `cantidad`, membership only). New hook `use-plantillas-traspaso.ts` mirrors `use-marcas.ts` (list/crear/actualizar via kysely) plus a det-replace step, one `db.writeTransaction`. UI is the same hand-rolled-table + Dialog precedent as `marca-list.tsx`/`marca-form.tsx`. `traspaso-form.tsx` integration reuses `productosActivos` filtering and the existing `stockDisponiblePorProducto` map. Ships as 3 chained slices (A: schema+hook, B: CRUD UI, C: form integration); `crearTraspaso` stays untouched.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Header RLS | Full SELECT/INSERT/UPDATE (`marcas`) | SELECT/INSERT only (`0084`) | Editable config, not immutable financial data; omitting UPDATE repeats pre-`0018` `ajustes` bug (PowerSync reverts local edits) |
| Det RLS | SELECT/INSERT/DELETE, no UPDATE (`recetas`) | Full CRUD | No mutable field on det rows; membership changes are delete+reinsert, matching `agregarIngrediente`/`eliminarIngrediente` |
| Det write strategy | Delete-and-reinsert full set per save | Diff-based add/remove | Matches `recetas` UX; template sets are small, no perf concern |
| Query layer | Raw `useQuery` (reads) + kysely (writes) | Kysely for both | Matches `use-marcas.ts` 1:1 |
| Load-template query | Lazy `usePlantillaProductos(id)`, fetched on select | Eager-join in list query | Product lists only needed once selected in `traspaso-form.tsx`; eager join wastes reads on every Plantillas-tab render |
| `cargarPlantilla` semantics | REPLACE `lineas`; `window.confirm` gate when lineas non-empty | Silent replace / merge | Proposal Decision 1 (REPLACE) + addresses flagged UX risk without a new Dialog component |

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `migrations/0085_traspaso_plantillas.sql` | Create | 2 tables, indexes, header full RLS + soft-delete, det SELECT/INSERT/DELETE, publication `DO $$` blocks |
| `src/core/db/powersync/schema.ts` | Modify | `Table` declarations after `lotes` (~483); registration after `traspasos_inventario_det` (~1595) |
| `backend/powersync-sync-rules.yaml` | Modify | 2 lines after line 96 (INVENTARIO block) |
| `src/features/inventario/hooks/use-plantillas-traspaso.ts` | Create | `usePlantillasTraspaso`, `usePlantillaProductos`, `crearPlantilla`, `actualizarPlantilla`, `desactivarPlantilla` |
| `.../hooks/__tests__/use-plantillas-traspaso.test.ts` | Create | Mocks `db.writeTransaction`, asserts SQL shape, mirrors `use-traspasos.test.ts` |
| `.../components/plantillas/plantilla-list.tsx` | Create | Hand-rolled table, mirrors `marca-list.tsx` |
| `.../components/plantillas/plantilla-form.tsx` | Create | Dialog: nombre, descripcion, product multi-select |
| `.../components/plantillas/__tests__/plantilla-list.test.tsx` | Create | Render/toggle/empty-state |
| `.../components/plantillas/__tests__/plantilla-form.test.tsx` | Create | Validation, create/edit submit, product add/remove |
| `src/features/inventario/schemas/plantilla-schema.ts` | Create | Zod: `nombre` required, `descripcion` optional, `productoIds` min 1 |
| `src/routes/_app/inventario/traspasos.tsx` | Modify | 3rd `TabsTrigger`/`TabsContent` ("Plantillas") → `PlantillaList` |
| `.../components/traspasos/traspaso-form.tsx` | Modify | "Cargar plantilla" `<select>` + `cargarPlantilla()` handler |
| `.../components/traspasos/__tests__/traspaso-form.test.tsx` | Modify | Load replaces lineas, confirm gate, inactive filter, empty cantidad |

## Interfaces / Contracts

```ts
export interface TraspasoPlantilla {
  id: string; empresa_id: string; nombre: string; descripcion: string | null
  is_active: number; created_at: string; updated_at: string
  created_by: string | null; updated_by: string | null
}
export interface PlantillaConProductos extends TraspasoPlantilla { items_count: number }
export interface PlantillaProducto {
  id: string; producto_id: string; producto_nombre: string
  producto_codigo: string; producto_is_active: number
}
export function usePlantillasTraspaso(): { plantillas: PlantillaConProductos[]; isLoading: boolean }
export function usePlantillaProductos(plantillaId: string): { productos: PlantillaProducto[]; isLoading: boolean }
export async function crearPlantilla(data: {
  nombre: string; descripcion?: string; empresa_id: string; productoIds: string[]
}): Promise<string>
export async function actualizarPlantilla(id: string, data: {
  nombre?: string; descripcion?: string; productoIds?: string[]; empresa_id: string; updated_by?: string
}): Promise<void>
export async function desactivarPlantilla(id: string): Promise<void>
```

`crearPlantilla`/`actualizarPlantilla` run in one `db.writeTransaction`: header UPSERT, then (update only) `DELETE FROM traspaso_plantillas_det WHERE plantilla_id = ?`, then one `INSERT` per `producto_id` — batched atomically instead of `recetas`' per-call pattern, since the form submits the full set at once.

`cargarPlantilla` (local, `traspaso-form.tsx`):
```ts
function cargarPlantilla(plantillaId: string) {
  const tieneLineasNoVacias = lineas.some((l) => l.producto_id)
  if (tieneLineasNoVacias && !window.confirm('Esto reemplazara los productos actuales. Continuar?')) return
  const activos = plantillaProductos.filter((p) => p.producto_is_active === 1)
  setLineas(activos.length > 0
    ? activos.map((p) => ({ producto_id: p.producto_id, producto_nombre: p.producto_nombre, producto_codigo: p.producto_codigo, cantidad: '' }))
    : [{ ...LINEA_VACIA }])
}
```
Zero-stock-in-origen badge reuses the existing `stockDisponiblePorProducto` map (`useStockPorDeposito(depositoOrigenId)`), firing when `disponibleNum === 0` — distinct from `stockExcedido` (fires only once `cantidad` is typed).

## Migration `0085_traspaso_plantillas.sql`

```sql
CREATE TABLE IF NOT EXISTS traspaso_plantillas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_empresa ON traspaso_plantillas(empresa_id);

CREATE TABLE IF NOT EXISTS traspaso_plantillas_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plantilla_id UUID NOT NULL REFERENCES traspaso_plantillas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_det_empresa ON traspaso_plantillas_det(empresa_id);
CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_det_plantilla ON traspaso_plantillas_det(plantilla_id);
CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_det_producto ON traspaso_plantillas_det(producto_id);

ALTER TABLE traspaso_plantillas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON traspaso_plantillas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON traspaso_plantillas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON traspaso_plantillas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());
-- Soft-delete only (is_active via UPDATE above); no DELETE policy.

ALTER TABLE traspaso_plantillas_det ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON traspaso_plantillas_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON traspaso_plantillas_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "delete_own_empresa" ON traspaso_plantillas_det FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());
-- No UPDATE: membership rows are delete+reinsert only (recetas precedent).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'traspaso_plantillas') THEN
    ALTER PUBLICATION powersync ADD TABLE traspaso_plantillas;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'traspaso_plantillas_det') THEN
    ALTER PUBLICATION powersync ADD TABLE traspaso_plantillas_det;
  END IF;
END $$;
```

## PowerSync `schema.ts` additions

```ts
const traspaso_plantillas = new Table(
  { empresa_id: column.text, nombre: column.text, descripcion: column.text,
    is_active: column.integer, created_at: column.text, updated_at: column.text,
    created_by: column.text, updated_by: column.text },
  { indexes: {} }
)
const traspaso_plantillas_det = new Table(
  { empresa_id: column.text, plantilla_id: column.text, producto_id: column.text, created_at: column.text },
  { indexes: {} }
)
```
Registration after `traspasos_inventario_det` (~line 1595): `traspaso_plantillas, traspaso_plantillas_det,`.

## Sync-rules addition (after line 96)

```yaml
      - SELECT * FROM traspaso_plantillas WHERE empresa_id = bucket.empresa_id
      - SELECT * FROM traspaso_plantillas_det WHERE empresa_id = bucket.empresa_id
```

## Testing Strategy

| Slice | What to Test | Approach |
|---|---|---|
| A (migration/sync-rules) | Cannot be unit-tested in vitest | Verified via `yarn type-check` (schema.ts/kysely types compile) + manual SQL review + PowerSync Cloud dashboard sync-rules paste (post-merge manual step, same as `0084`) |
| A (hook) | `crearPlantilla` inserts header+N det in one tx; `actualizarPlantilla` deletes old det before inserting new; `desactivarPlantilla` issues `UPDATE is_active=0`; all calls include `empresa_id` | `vi.mock('@/core/db/powersync/db', ...)`, assert captured SQL/params — mirrors `use-traspasos.test.ts`'s `mockCrearTraspasoTx` helper |
| B (CRUD UI) | Renders rows/empty state; toggle calls `desactivarPlantilla`; form opens on Nueva/Editar; Zod errors surface; submit calls `crearPlantilla`/`actualizarPlantilla` with correct `productoIds`; product add/remove | Mock hooks; `traspaso-form.test.tsx` boilerplate (mock `@/core/db/powersync/db`, `useCurrentUser`) — no existing `marca-list` test to follow, this establishes the pattern |
| C (form integration) | Non-empty lineas → `window.confirm` fires; accept replaces lineas; reject leaves untouched; inactive producto filtered; loaded `cantidad` starts `''`; zero-stock badge renders when `disponibleNum === 0` | Extends existing `traspaso-form.test.tsx` mocks, adds `usePlantillasTraspaso`/`usePlantillaProductos` mocks |

Commands: `yarn test:run`, `yarn type-check:test`, `yarn type-check` (covers `schema.ts`/generated kysely types).

## Migration / Rollout

Slice A: run `0085` via Supabase SQL Editor, paste sync-rules INVENTARIO block into PowerSync Cloud dashboard (manual, same as every prior migration — no automated deploy step exists). Tables unused until Slice B ships — zero risk to existing flows. Slices B/C independently revertable (remove tab+components for B; remove selector+handler for C, `crearTraspaso` untouched).

## Open Questions

- [ ] `window.confirm` vs. a styled Dialog for replace-confirmation in Slice C — minimal fix chosen (no native-confirm precedent in repo; other confirmations use toast/inline UI). Flag for tasks-phase if a styled dialog is preferred.
