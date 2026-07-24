# Design: Conciliación Legible + Lotes POS

> Change: `conciliacion-lotes-pos` | Implements spec.md capabilities `conciliacion-bancaria-legibilidad`, `lotes-pos-cuadre`

## Technical Approach

T1/T2 (read-only) fix a mapper bug and add a display helper — zero schema impact. T3 adds one PowerSync table (`lotes_pos_cuadre`, pre-close working data, explicitly non-immutable) plus `metodos_cobro.consolidar_lotes`, and does additive surgery on the existing consolidation loop (`cerrarSesionCaja` steps 8-9, `use-sesiones-caja.ts:963-1123`) inside the same `writeTransaction`, preserving Opción 1 ordering (consolidation writes happen before `UPDATE status='CERRADA'`, satisfying `fn_validate_sesion_abierta`).

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Table name | `lotes_pos_cuadre` | `lotes_cobro_pos`, `sesiones_caja_lotes` | Avoids collision with inventory's `lotes`; matches proposal's own migration filename |
| **Consolidation amount source (highest-risk item)** | For `tipo='PUNTO'` methods **with ≥1 batch row for the session**: the Tesorería transfer amount is the **batch sum** (or per-batch amounts), **replacing** `totalSistemaD` (pagos-derived) for that purpose only. No batches → `totalSistemaD`, byte-identical to today. | Sum batches on top of `totalSistemaD`; always prefer `totalSistemaD` | Batches represent the bank's confirmed settlement — the entire reason lotes exist (Banesco/Mercantil settle by batch, not by POS-recorded sales). Summing on top would double-count the same money already in `pagos`. `sesiones_caja_detalle.total_sistema` (step 6) stays pagos-derived and unchanged — the gap vs. batch total is a visible `diferencia`, not a blocker, matching how físico-vs-sistema already works |
| Batch persistence timing | **Live**: INSERT/UPDATE/DELETE on `lotes_pos_cuadre` on every add/edit/delete, not batched at close | Buffer in React state, write once at `cerrarSesionCaja` | Offline-first convention: local SQLite write is instant/offline-safe; survives reload before close (spec SC-09); avoids extending `CerrarSesionParams` — `cerrarSesionCaja` just re-queries the table by `sesion_caja_id` inside its own tx, same pattern as `pagos`/`movimientos_metodo_cobro` |
| RLS on new table | SELECT+INSERT+UPDATE+**DELETE**, own-empresa, via `public.current_empresa_id()` (0035 pattern) | Project's default no-UPDATE/no-DELETE policy | Explicit deviation, called out in spec: batches are editable/deletable pre-close working data, not an immutable ledger (unlike Kardex/tasas) |
| POS-method filter | `metodos_cobro.tipo = 'PUNTO'` | `usa_pos` flag | `usa_pos` gates POS-terminal payment-method selection at sale time (unrelated concept); `tipo='PUNTO'` is the existing enum value for "Punto de Venta" |

## Data Flow (close-time, inside `cerrarSesionCaja`'s single writeTransaction)

    ...steps 1-7 unchanged (montoSistema*, sesiones_caja_detalle from pagos)...
    8. SELECT metodos_cobro config (unchanged) for metodosParaConsolidar
       + NEW: SELECT nro_lote, monto FROM lotes_pos_cuadre WHERE sesion_caja_id=? GROUP BY metodo_cobro_id
    9. for each metodo in metodosParaConsolidar:
         resolve destino (unchanged) → validate destino-moneda (unchanged, fail-close)
         lotes = lotesPorMetodoMap.get(metodoCobroId)
         IF lotes exist (implies tipo='PUNTO'):
           IF consolidar_lotes=1: ONE consolidarMetodoATesoreriaEnTx(monto=SUM(lotes),
              descripcion="... Lotes: 10, 11"); comisión sobre el total
           IF consolidar_lotes=0: N× consolidarMetodoATesoreriaEnTx (one per lote,
              descripcion="... Lote 10"); comisión por lote, N× insertarGastoComisionEnTx
         ELSE: consolidarMetodoATesoreriaEnTx(monto=totalSistemaD) — UNCHANGED path
    10. UPDATE status='CERRADA' (last write, unchanged)

## File Changes

| File | Action | Description |
|---|---|---|
| `migrations/0079_lotes_pos_cuadre.sql` | Create | New table + `consolidar_lotes` column (see below) |
| `src/core/db/powersync/schema.ts` | Modify | Add `lotes_pos_cuadre` Table; add `consolidar_lotes: column.integer` to `metodos_cobro` |
| `src/core/db/kysely/types.ts` | Modify | Mirror both |
| `src/features/caja/hooks/use-lotes-pos.ts` | Create | `useLotesPos(sesionCajaId)`, `agregarLote`, `actualizarLote`, `eliminarLote` — live CRUD |
| `src/features/caja/schemas/lote-pos-schema.ts` | Create | Zod: `{ metodo_cobro_id, nro_lote: min(1), monto: positive }` |
| `src/features/reportes/components/cuadre-conteo-fisico.tsx` (~L294-339) | Modify | For `m.tipo==='PUNTO'`: render batch mini-table (add row, edit, delete) instead of the single "Físico" input; `sum(lotes)` feeds the existing `onConteoFisicoChange` |
| `src/features/caja/hooks/use-sesiones-caja.ts` (~L963-1123) | Modify | Steps 8-9: query `lotes_pos_cuadre`, branch per `consolidar_lotes` as above |
| `src/features/tesoreria/hooks/use-traspasos.ts` | None | `consolidarMetodoATesoreriaEnTx` signature unchanged, called N times instead of 1 when `consolidar_lotes=0` |
| `src/features/configuracion/schemas/payment-method-schema.ts` | Modify | Add `consolidar_lotes: z.boolean().default(true)` |
| `src/features/configuracion/components/payment-method-form.tsx` | Modify | Toggle, shown only when `tipo==='PUNTO'` |
| `src/features/tesoreria/components/conciliacion-tesoreria.tsx:65` | Modify | `descripcion: mov.descripcion` → `'observacion' in mov ? (mov.descripcion ?? mov.observacion) : mov.descripcion` (T1a; `MovCajaFuerte` has no `observacion`) |
| `src/features/ventas/components/cobro-modal.tsx` (~L760-780) | Modify | Block submit + Spanish error when `metodoSeleccionado?.requiere_referencia===1 && !referencia.trim()`, mirroring `gasto-form.tsx:1317` (T1b) |
| `src/lib/format.ts` | Modify | Add `formatSesionId(id: string) => 'SES-' + id.slice(0,8).toUpperCase()` |
| `src/features/caja/hooks/use-sesiones-caja.ts:1077` | Modify | `descripcion` uses `formatSesionId(id)` instead of raw `id` (T2) |

## Migration 0079 (idempotent additive, follows 0035/0069 pattern)

```sql
CREATE TABLE lotes_pos_cuadre (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sesion_caja_id UUID NOT NULL REFERENCES sesiones_caja(id),
  metodo_cobro_id UUID NOT NULL REFERENCES metodos_cobro(id),
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  nro_lote TEXT NOT NULL,
  monto NUMERIC(18,4) NOT NULL CHECK (monto > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lote_pos_metodo_sesion UNIQUE (empresa_id, metodo_cobro_id, sesion_caja_id, nro_lote)
);
CREATE INDEX idx_lotes_pos_empresa ON lotes_pos_cuadre(empresa_id);
CREATE INDEX idx_lotes_pos_sesion ON lotes_pos_cuadre(sesion_caja_id);
CREATE INDEX idx_lotes_pos_metodo ON lotes_pos_cuadre(metodo_cobro_id);
CREATE TRIGGER trg_lotes_pos_cuadre_updated BEFORE UPDATE ON lotes_pos_cuadre
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Sin trigger anti-UPDATE/DELETE: dato de trabajo pre-cierre, no inmutable.

ALTER TABLE lotes_pos_cuadre ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON lotes_pos_cuadre FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON lotes_pos_cuadre FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON lotes_pos_cuadre FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "delete_own_empresa" ON lotes_pos_cuadre FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

ALTER TABLE metodos_cobro ADD COLUMN IF NOT EXISTS consolidar_lotes BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE metodos_cobro SET consolidar_lotes = TRUE WHERE consolidar_lotes IS NULL;
```

Must be applied manually by the user in Supabase SQL Editor, like 0077/0078.

## Interfaces / Contracts

```ts
// use-lotes-pos.ts
export interface LotePos { id: string; metodo_cobro_id: string; nro_lote: string; monto: string }
export function useLotesPos(sesionCajaId: string): { lotesPorMetodo: Record<string, LotePos[]>; isLoading: boolean }
export async function agregarLote(p: { sesionCajaId, metodoCobroId, monedaId, nroLote, monto, empresaId, userId }): Promise<{ id: string }>
export async function actualizarLote(id: string, p: { nroLote?: string; monto?: number }): Promise<void>
export async function eliminarLote(id: string): Promise<void>
```

## Testing Strategy (no test runner in project — manual checklist)

| Layer | What | Approach |
|---|---|---|
| Type/lint | All new/changed files | `yarn type-check && yarn lint` |
| Manual — T1/T2 | Reconciliation shows real text; `SES-XXXXXXXX`; ref enforcement | Cobro con "Pago Móvil" (requiere_referencia=1) sin ref → bloqueado; ver descripción de venta antes "-", ahora visible |
| Manual — T3 consolidado | `consolidar_lotes=1`, 2 lotes | Cierre → Tesorería: 1 traspaso, "Lotes: X, Y", comisión sobre total |
| Manual — T3 por-lote | `consolidar_lotes=0`, 2 lotes | Cierre → Tesorería: 2 traspasos, comisión c/u |
| Manual — no regresión (SC-13) | Sesión mixta Efectivo + Tarjeta con lotes | Efectivo idéntico a antes; método sin lotes cargados (aunque tipo=PUNTO) también idéntico a antes |
| Manual — atomicidad (SC-14) | Un método sin destino configurado | Cierre completo falla, `status` permanece ABIERTA, ningún lote-traspaso persiste |

## Migration / Rollout — Recommended PR split (review budget 400 lines, ask-always)

| PR | Contents | Est. lines |
|---|---|---|
| **PR-A** (light, read-side) | T1a/T1b + T2: `conciliacion-tesoreria.tsx`, `cobro-modal.tsx`, `format.ts`, `use-sesiones-caja.ts:1077` | ~80-120 |
| **PR-B** (schema + capture) | Migration 0079, `schema.ts`/`types.ts`, `use-lotes-pos.ts`, `lote-pos-schema.ts`, `cuadre-conteo-fisico.tsx` batch UI, `payment-method-form.tsx`/schema toggle | ~250-350 |
| **PR-C** (routing, financial) | `use-sesiones-caja.ts` steps 8-9 branching | ~100-150 |

Sequence B before C (schema/UI before the transaction that reads it); A is independent, can ship anytime. Total T3 (B+C) likely exceeds 400 lines combined — kept as two PRs per house convention rather than one.

## Open Questions

None — all four items in the task brief (schema/migration, UI, close-time routing incl. double-counting, reconciliation) are resolved above with explicit decisions.
