# Tasks: Kardex Salidas Tipificadas

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–330 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 7 artifacts as a single cohesive change | PR 1 | Migration + types + hooks + UI; no natural split point |

---

## Phase 1: Infrastructure — DB + Type Layers

- [x] T01 — Create `migrations/0068_kardex_salidas_tipificadas.sql`: `ALTER TABLE movimientos_inventario ADD COLUMN tipo_salida TEXT` + `ADD CONSTRAINT chk_mov_inv_tipo_salida CHECK (tipo_salida IS NULL OR tipo_salida IN ('MERMA','EXTRAVIO','CONSUMO_INTERNO'))`; `ALTER TABLE gastos ADD COLUMN doc_origen_id UUID` + `ADD COLUMN doc_origen_tipo TEXT`. Acceptance: existing rows unaffected (all nullable, no DEFAULT).
- [x] T02 — Modify `src/core/db/powersync/schema.ts`: add `column.text('tipo_salida')` to `movimientos_inventario` table definition; add `column.text('doc_origen_id')` + `column.text('doc_origen_tipo')` to `gastos` table definition.
- [x] T03 — Modify `src/core/db/kysely/types.ts`: add `tipo_salida: string | null` to `MovimientosInventario`; add `doc_origen_id: string | null` + `doc_origen_tipo: string | null` to `Gastos`.

## Phase 2: Zod Schema — Validation Contract

- [x] T04 — Modify `src/features/inventario/schemas/kardex-schema.ts`: add `tipo_salida: z.enum(['MERMA','EXTRAVIO','CONSUMO_INTERNO']).optional()` to `kardexSchema`; add `.refine((d) => d.tipo !== 'S' || d.tipo_salida != null, { message: 'Selecciona el tipo de salida', path: ['tipo_salida'] })`. Acceptance: SC-04 — form with tipo=S and no tipo_salida fails schema validation.

## Phase 3: Core Business Logic

- [x] T05 — Modify `src/features/inventario/hooks/use-kardex.ts`: extend `registrarMovimiento` params with `tipoSalida?: 'MERMA' | 'EXTRAVIO' | 'CONSUMO_INTERNO'`; when tipoSalida is set, READ `productos.costo_usd` + `productos.nombre` + latest `tasas_cambio`; inside single `db.writeTransaction`: INSERT movimiento with `tipo_salida`, `costo_unitario = producto.costo_usd`, `tasa_cambio`; if `totalUsd > 0` INSERT gasto with `monto_usd = cantidad × costo_unitario`, `concepto = "Salida por {tipo_salida}: {nombre}"`, `doc_origen_id = movimiento.id`, `doc_origen_tipo = 'MOVIMIENTO_INVENTARIO'`. Acceptance: SC-01, SC-02, SC-03 (gasto created per tipo); SC-07 (gasto failure rolls back movimiento); SC-08 (gasto queryable by empresa_id).
- [x] T06 — Modify `src/features/inventario/hooks/use-ajustes.ts`: fix $0-gasto bug — when `costo_unitario` is null and `afecta_costo = 1`, fall back to `productos.costo_usd` via a READ before the transaction; set `doc_origen_id = ajuste.id` + `doc_origen_tipo = 'AJUSTE_INVENTARIO'` on each gasto INSERT; propagate `tipo_salida` from the ajuste line to the movimiento INSERT. Acceptance: SC-06 (gasto monto_usd = cantidad × costo_usd, not $0; doc_origen_tipo = 'AJUSTE_INVENTARIO').

## Phase 4: UI

- [x] T07 — Modify `src/features/inventario/components/kardex/movimiento-form.tsx`: add native `<select>` for tipo_salida with options Merma / Extravío / Consumo Interno, rendered conditionally when `tipo === 'S'`; show read-only cost preview (costo_usd, tasa_cambio, total_usd, total_bs) computed from selected product + active rate; wire tipo_salida value into `registrarMovimiento` call; Zod validation error for missing tipo_salida surfaces inline. Acceptance: SC-01→SC-03 (form submits correctly per type); SC-04 (blocked without tipo_salida); SC-05 (selector absent for ENTRADA).
