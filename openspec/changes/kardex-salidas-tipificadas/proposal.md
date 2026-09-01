# Proposal: Typed Manual Inventory Exits (Salidas Tipificadas)

## Intent

Manual kardex exits have no exit type, never populate `costo_unitario`/`tasa_cambio`, and never generate a gasto. The bulk ajuste flow silently creates $0 gastos. This change adds a typed-exit selector (MERMA, EXTRAVIO, CONSUMO_INTERNO), populates cost fields, auto-generates a gasto, and links it back to the originating movement via `doc_origen_id/tipo`.

## Scope

### In Scope
- Migration: add nullable `tipo_salida TEXT` to `movimientos_inventario`; add nullable `doc_origen_id UUID` + `doc_origen_tipo TEXT` to `gastos`
- PowerSync schema: update both table definitions
- Fix `aplicarAjuste` $0-gasto bug: auto-read `costo_usd` from `productos` when `costo_unitario IS NULL` and `afecta_costo=1`
- Extend `registrarMovimiento`: accept `tipo_salida` + `motivo_ajuste_id`; populate cost fields; insert gasto with `doc_origen_*`
- `movimiento-form.tsx`: typed-exit selector (visible only when `tipo='S'`)
- `kardex-schema.ts`: optional `tipo_salida` enum field

### Out of Scope
- Renaming `EXTRAVIO` key (confirmed: stays as-is)
- UI changes to `ajuste-masivo.tsx` (indirectly fixed by `aplicarAjuste` fallback)
- Gasto list UI changes or reporting on typed-exit aggregates
- Módulo Clínica or any other module

## Capabilities

### New Capabilities
- `kardex-salidas-tipificadas`: typed manual inventory exits — exit-type selector, auto cost population, gasto generation, and `doc_origen` traceability

### Modified Capabilities
None

## Approach

Reuse the existing `ajuste_motivos` catalog (already seeded: MERMA, EXTRAVIO, CONSUMO_INTERNO) and replicate the gasto-insertion pattern from `aplicarAjuste` into `registrarMovimiento`. All writes (kardex movement + gasto) in a single `db.writeTransaction`. The `tipo_salida` column captures the UI choice on the movement record; `doc_origen_id/tipo` links the generated gasto back for audit.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/` | New | ADD COLUMN `tipo_salida` on `movimientos_inventario`; `doc_origen_id` + `doc_origen_tipo` on `gastos` |
| `src/core/db/powersync/schema.ts` | Modified | New columns in both table definitions |
| `src/features/inventario/hooks/use-kardex.ts` | Modified | Accept `tipo_salida` + `motivo_ajuste_id`; populate cost fields; insert gasto + `doc_origen_*` |
| `src/features/inventario/hooks/use-ajustes.ts` | Modified | Fallback: auto-read `costo_usd` from `productos` when `costo_unitario` is null |
| `src/features/inventario/components/kardex/movimiento-form.tsx` | Modified | Add typed-exit selector (shown for `tipo='S'` only) |
| `src/features/inventario/schemas/kardex-schema.ts` | Modified | Optional `tipo_salida` enum field |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `aplicarAjuste` now generates real-amount gastos (behavior change) | Low | Correct and expected; $0 values were bugs |
| `cuentas_config` rows missing for exit keys | Low | Gasto silently skips — current behavior preserved |
| `powersync-sync-rules.yaml` may need update for new columns | Low | Verify after migration; old records sync as null (acceptable) |
| Offline atomicity | Low | Kardex + gasto in same `writeTransaction` — existing pattern |

## Rollback Plan

All new columns are nullable — existing records unaffected. To revert: remove UI selector and schema changes; run `ALTER TABLE … DROP COLUMN` (safe since columns are nullable and new). Existing gastos are unchanged; `doc_origen_*` columns remain null on old rows.

## Dependencies

- `ajuste_motivos` seeded by `use-ensure-default-motivos.ts` — already in place
- `cuentas_config` rows for `MERMA_INVENTARIO`, `EXTRAVIO_INVENTARIO`, `CONSUMO_INTERNO` per empresa — existing operational requirement

## Success Criteria

- [ ] Typed-exit selector appears in `movimiento-form.tsx` only when `tipo='S'`
- [ ] Selecting a typed exit creates a `movimiento_inventario` with `tipo_salida`, `costo_unitario`, and `tasa_cambio` populated
- [ ] A `gasto` is auto-generated with correct `monto_usd` (costo × cantidad) and `doc_origen_id` pointing to the movement
- [ ] Ajuste masivo no longer produces $0 gastos for typed exits
- [ ] All writes are atomic (single `writeTransaction`)
- [ ] TypeScript strict — no `any`
