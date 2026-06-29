# Design: Kardex Salidas Tipificadas

## Technical Approach

Add `tipo_salida` column to `movimientos_inventario` and `doc_origen_id`/`doc_origen_tipo` to `gastos`. Extend `registrarMovimiento` to accept a typed exit, auto-read cost from `productos.costo_usd`, fetch active `tasa_cambio`, and atomically insert both the kardex movement and a linked gasto in one `writeTransaction`. Fix the $0-gasto bug in `aplicarAjuste` by falling back to `productos.costo_usd` when `costo_unitario` is null.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| tipo_salida → cuentas_config mapping | Hardcoded map: `MERMA→MERMA_INVENTARIO`, `EXTRAVIO→EXTRAVIO_INVENTARIO`, `CONSUMO_INTERNO→CONSUMO_INTERNO` | Query `ajuste_motivos` by nombre | The 3 typed exits are DB-constrained via CHECK; querying ajuste_motivos adds a join and fragile name matching (e.g. "CONSUMO INTERNO" vs "CONSUMO_INTERNO") |
| Cost source | `productos.costo_usd` | `inventario_stock` | `inventario_stock` has no cost column; `costo_usd` on `productos` is the authoritative unit cost |
| UI component for tipo_salida | Native `<select>` in existing `<dialog>` | shadcn/ui `<Select>` | The existing movimiento-form.tsx uses native HTML inputs — keep consistency |
| Gasto CHECK constraint | Guard `if (totalUsd > 0)` before INSERT, skip silently otherwise | Remove Postgres CHECK | Postgres `gastos.monto_usd CHECK(monto_usd > 0)` must be respected; products with `costo_usd = 0` simply won't generate a gasto |

## Data Flow

```
movimiento-form.tsx (tipo_salida selector)
        │
        ▼
registrarMovimiento({ ..., tipoSalida })
        │
        ├─ READ productos.costo_usd, productos.nombre
        ├─ READ tasas_cambio (latest by empresa_id)
        ├─ READ cuentas_config (by TIPO_SALIDA → clave mapping)
        ├─ READ monedas (USD id)
        │
        └─ writeTransaction ─┬─ INSERT movimientos_inventario (+ tipo_salida, costo_unitario, tasa_cambio)
                             ├─ UPDATE productos.stock
                             └─ INSERT gastos (doc_origen_id=mov.id, doc_origen_tipo='MOVIMIENTO_INVENTARIO')
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/0068_kardex_salidas_tipificadas.sql` | Create | ADD COLUMN tipo_salida on movimientos_inventario; doc_origen_id + doc_origen_tipo on gastos |
| `src/core/db/powersync/schema.ts` | Modify | Add `tipo_salida` to movimientos_inventario; `doc_origen_id` + `doc_origen_tipo` to gastos |
| `src/core/db/kysely/types.ts` | Modify | Add `tipo_salida` to MovimientosInventario; `doc_origen_id` + `doc_origen_tipo` to Gastos |
| `src/features/inventario/schemas/kardex-schema.ts` | Modify | Add conditional `tipo_salida` enum field |
| `src/features/inventario/hooks/use-kardex.ts` | Modify | Extend `registrarMovimiento` signature + gasto generation |
| `src/features/inventario/hooks/use-ajustes.ts` | Modify | Fix $0-gasto bug (fallback to productos.costo_usd); add doc_origen_id/tipo to gasto INSERT; set tipo_salida on movimiento |
| `src/features/inventario/components/kardex/movimiento-form.tsx` | Modify | Add tipo_salida `<select>`, cost preview, pass to registrarMovimiento |

## Interfaces / Contracts

```typescript
// registrarMovimiento — extended signature (new params only)
export async function registrarMovimiento(params: {
  // ... existing params unchanged ...
  tipoSalida?: 'MERMA' | 'EXTRAVIO' | 'CONSUMO_INTERNO'
}): Promise<void>

// tipo_salida → cuentas_config_clave mapping
const TIPO_SALIDA_CLAVE: Record<string, string> = {
  MERMA: 'MERMA_INVENTARIO',
  EXTRAVIO: 'EXTRAVIO_INVENTARIO',
  CONSUMO_INTERNO: 'CONSUMO_INTERNO',
}

// kardexSchema — Zod (tipo_salida required when tipo='S')
export const kardexSchema = z.object({
  producto_id: z.string().min(1, 'Selecciona un producto'),
  tipo: z.enum(['E', 'S']),
  cantidad: z.number().positive(),
  motivo: z.string().optional(),
  tipo_salida: z.enum(['MERMA', 'EXTRAVIO', 'CONSUMO_INTERNO']).optional(),
}).refine(
  (d) => d.tipo !== 'S' || d.tipo_salida != null,
  { message: 'Selecciona el tipo de salida', path: ['tipo_salida'] }
)
```

## Migration SQL

```sql
-- 0068_kardex_salidas_tipificadas.sql

-- 1. tipo_salida on movimientos_inventario (immutable table — nullable, no default)
ALTER TABLE movimientos_inventario
  ADD COLUMN tipo_salida TEXT;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_mov_inv_tipo_salida
  CHECK (tipo_salida IS NULL OR tipo_salida IN ('MERMA','EXTRAVIO','CONSUMO_INTERNO'));

-- 2. doc_origen traceability on gastos
ALTER TABLE gastos
  ADD COLUMN doc_origen_id UUID;

ALTER TABLE gastos
  ADD COLUMN doc_origen_tipo TEXT;
```

## Testing Strategy

No test infrastructure exists (`strict_tdd: false`). Verification will be manual per spec scenarios SC-01 through SC-08.

## Migration / Rollout

All columns nullable — zero-downtime migration. PowerSync `SELECT *` sync rules auto-include new columns. Old records sync with null values. Rollback: `ALTER TABLE … DROP COLUMN` (safe — no data loss on existing rows).

## Open Questions

- None — all decisions resolved.
