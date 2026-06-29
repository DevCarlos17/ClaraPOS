# Exploration: kardex-salidas-tipificadas

**Date**: 2026-06-29  
**Change**: Typed inventory exits (Pérdida / Merma / Consumo interno) with automatic expense (gasto) generation

---

## Current State

### movimientos_inventario table
Already has `costo_unitario` and `tasa_cambio` columns in the schema, but **neither is populated** by the manual exit flow (`registrarMovimiento`). The `motivo` field is free text only. No typed-exit discriminator exists.

```
movimientos_inventario:
  tipo           TEXT  -- 'E' | 'S'
  origen         TEXT  -- 'MAN' | 'AJU' | 'VTA' | 'NCR' ...
  costo_unitario TEXT  -- exists in schema, never populated for MAN exits
  tasa_cambio    TEXT  -- exists in schema, never populated for MAN exits
  motivo         TEXT  -- free text, no enum
  ← MISSING: tipo_salida (Pérdida / Merma / Consumo interno)
```

### ajuste_motivos — already seeded
`use-ensure-default-motivos.ts` already seeds three typed exit motivos per empresa:

| nombre          | operacion_base | afecta_costo | cuentas_config_clave  |
|-----------------|----------------|--------------|------------------------|
| MERMA           | RESTA          | 1            | MERMA_INVENTARIO       |
| EXTRAVIO        | RESTA          | 1            | EXTRAVIO_INVENTARIO    |
| CONSUMO INTERNO | RESTA          | 1            | CONSUMO_INTERNO        |

### aplicarAjuste — partial auto-gasto already in place
`use-ajustes.ts` lines 389–458 already generate a gasto when `motivo.cuentas_config_clave` is set and `operacion_base = 'RESTA'`. **However**, the gasto amount is calculated as:
```ts
costo * cantidad per line → sum = totalCostoUsd
```
If `linea.costo_unitario` is `null` (as it always is for bulk counts in `ajuste-masivo.tsx`), the gasto is created with `monto_usd = 0`. This is a silent bug.

### movimiento-form.tsx (manual kardex)
Only fields: producto, tipo (E/S), cantidad, motivo (free text). No connection to `ajuste_motivos`, no gasto generation, `costo_unitario` and `tasa_cambio` are never passed to `registrarMovimiento`.

### ajuste-masivo.tsx (bulk count)
Does not capture `costo_unitario` per line when calling `crearAjuste` → `aplicarAjuste` then generates $0 gastos for typed exits.

### gastos table — relevant fields
```
gastos: nro_gasto, cuenta_id, descripcion, fecha, moneda_id, tasa,
        monto_usd, tipo_impuesto, status, ...
← NO movimiento_inventario_id or ajuste_id FK (traceability via nro_factura text only)
```

---

## Affected Areas

| Path | Why affected |
|------|-------------|
| `src/core/db/powersync/schema.ts` | Add `tipo_salida: column.text` to `movimientos_inventario` |
| `migrations/` | New migration: `ALTER TABLE movimientos_inventario ADD COLUMN tipo_salida TEXT` |
| `src/features/inventario/hooks/use-kardex.ts` | Extend `registrarMovimiento` with `tipo_salida`, auto-read `costo_usd` + `tasa`, insert gasto |
| `src/features/inventario/hooks/use-ajustes.ts` | Fix gasto generation: auto-read `costo_usd` from `productos` when `costo_unitario IS NULL` and `afecta_costo=1` |
| `src/features/inventario/components/kardex/movimiento-form.tsx` | Add typed-exit selector (only visible when tipo='S') |
| `src/features/inventario/schemas/kardex-schema.ts` | Add `tipo_salida` optional enum field |

---

## Approaches

### Approach 1 — Minimal: Fix ajuste flow, extend manual kardex (Recommended)
- Add `tipo_salida TEXT` column to `movimientos_inventario`
- Fix `aplicarAjuste` to auto-read `costo_usd` when `costo_unitario` is null (1 line guard)
- Extend `registrarMovimiento` to accept `tipo_salida` + `motivo_ajuste_id`; when both are set and the motivo has `cuentas_config_clave`, auto-read costo_usd from producto and insert a gasto
- Update `movimiento-form.tsx` to show a typed-exit select (driven by `useAjusteMotivosActivos` filtered to RESTA + cuentas_config_clave set)

**Pros:**
- Reuses `ajuste_motivos` catalog already seeded with the 3 types
- Reuses the gasto-insertion pattern already in `aplicarAjuste`
- No new tables
- Ajuste masivo automatically benefits from the `aplicarAjuste` fix without UI changes

**Cons:**
- `registrarMovimiento` grows in complexity
- Needs a DB migration

**Effort**: Medium (3–4 files changed, 1 migration)

---

### Approach 2 — Route manual typed exits through Ajuste flow
- Instead of extending `registrarMovimiento`, the typed-exit form calls `crearAjuste` + `aplicarAjuste` transparently
- The manual form becomes a thin wrapper over the ajuste API for typed exits
- `registrarMovimiento` stays unchanged

**Pros:**
- No changes to `registrarMovimiento`
- Auto-gasto logic is already in `aplicarAjuste`
- Consistent: both manual and bulk use the same code path

**Cons:**
- Creates an ajuste record (with `num_ajuste`) for what looks like a single-line manual movement
- Ajuste historial would mix bulk counts with single-product typed exits
- User sees "Ajuste XXXXXX" instead of "Movimiento manual" in the kardex list
- Still needs the `aplicarAjuste` fix for costo_unitario fallback

**Effort**: Medium (2–3 files, 1 fix)

---

## Recommendation

**Approach 1** — Minimal, targeted.

The key insight: `movimientos_inventario` already has `costo_unitario` and `tasa_cambio` columns — they just aren't populated for manual exits. The gasto auto-generation pattern from `aplicarAjuste` can be copied inline to `registrarMovimiento` with minimal changes.

The critical fix that unblocks both manual and bulk flows is the `aplicarAjuste` costo fallback (1 guard line). Everything else flows from that.

**Implementation order**:
1. DB migration + PowerSync schema (add `tipo_salida`)
2. Fix `aplicarAjuste` costo fallback — this alone fixes ajuste masivo typed exits
3. Extend `registrarMovimiento` with typed-exit logic
4. Update `movimiento-form.tsx` + `kardex-schema.ts`

---

## Risks

- **Immutability**: `movimientos_inventario` has PostgreSQL triggers blocking UPDATE/DELETE. Adding a column via `ALTER TABLE` is safe — it only affects INSERTs going forward.
- **PowerSync sync rules**: The `powersync-sync-rules.yaml` must be updated if `tipo_salida` needs to be included in the sync bucket. Otherwise it syncs as `null` for old records (acceptable).
- **cuentas_config dependency**: The gasto auto-generation requires `cuentas_config` rows for keys `MERMA_INVENTARIO`, `EXTRAVIO_INVENTARIO`, `CONSUMO_INTERNO`. If these are not configured, the gasto silently skips (current behavior preserved). This is documented behavior, not a regression.
- **Offline-first atomicity**: Both the kardex movement and the gasto must be in the same `db.writeTransaction`. Already the pattern used in `aplicarAjuste`. No new risk.
- **$0 gastos (existing silent bug)**: `aplicarAjuste` currently creates gastos with `monto_usd = 0` when `costo_unitario` is null. The fix auto-reads from `productos.costo_usd`. This is a behavior change (gastos will now have real amounts), but it's the correct and expected behavior.
- **Multi-tenant isolation**: All queries already filter by `empresa_id`. No new risk.

---

## Gap Summary Table

| Gap | Where | Fix type |
|-----|-------|----------|
| No typed exit discriminator on `movimientos_inventario` | DB schema + PowerSync schema | New column `tipo_salida TEXT` |
| `registrarMovimiento` never populates `costo_unitario` + `tasa_cambio` | `use-kardex.ts` | Logic extension |
| `registrarMovimiento` never generates gasto for typed exits | `use-kardex.ts` | Logic extension |
| `movimiento-form.tsx` has no typed exit selector | UI component | New select field |
| `aplicarAjuste` generates $0 gastos when `costo_unitario IS NULL` | `use-ajustes.ts` | 1-line fallback fix |
| `ajuste-masivo.tsx` doesn't pass `costo_unitario` per line | Indirectly fixed by the above | |
| No FK from gasto to inventory movement (traceability) | gastos table | Optional: add `doc_origen_id` / `doc_origen_tipo` pattern (low priority) |

---

## Ready for Proposal

**Yes.** Scope is clear, risk is low, and no new tables are needed.

The orchestrator should confirm with the user whether:
1. The third exit type should be "PERDIDA" or "EXTRAVIO" (the seeded motivo is `EXTRAVIO`, but the user said `Pérdida` — they may want a rename or they can stay as `EXTRAVIO`)
2. Whether traceability (FK from gasto back to movement) is in scope or deferred
