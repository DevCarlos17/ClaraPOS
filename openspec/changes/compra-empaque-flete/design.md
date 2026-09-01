# Design: Líneas de cargo (Material de Empaque / Flete) en Factura de Compra

## Technical Approach

Add a **separate `lineasCargo` state array** in `compra-form.tsx`, parallel to the existing `lineas` (product) array, feeding into `crearCompra()` as a new optional parameter. Charge amounts fold into the *same* IVA-rate buckets (`totalExentoUsd`/`totalBaseUsd`/`totalIvaUsd`) the product loop already builds, so CxP/saldo logic needs zero changes. Consolidation and bucketing are extracted into a **new pure lib** (`compra-lineas-cargo.ts`) for strict-TDD unit testing, then called from both the form (display) and `crearCompra` (write). Inside `crearCompra`'s existing `writeTransaction`, after the product-line loop, resolve accounts via `cuentas_config` (same pattern as `use-ajustes.ts` RESTA branch) and raw-`tx.execute` one `INSERT INTO gastos` per concept present.

## Architecture Decisions

| Decision | Option chosen | Alternatives considered | Rationale |
|---|---|---|---|
| Charge-line storage | Separate `lineasCargo: LineaCargoUI[]` state, own Zod schema | Discriminated union inside `lineas` | `producto_id` is a hard-required UUID in `lineaCompraSchema`; a union would touch every consumer of `LineaUI`/`pvp_niveles` in a 2421-line file. Separate array = zero product-logic diff. |
| `doc_origen_tipo` on gasto rows | `'FACTURA_COMPRA'` | `'COMPRA'` (from frozen scope note) | Matches the table-name convention already used (`AJUSTE_INVENTARIO`→`ajustes`, `MOVIMIENTO_INVENTARIO`→`movimientos_inventario`). `proposal.md` §Approach already resolved this the same way — treated as authoritative over the earlier scope note. |
| Raw charge-line persistence | Not persisted individually; only consolidated `gastos` rows | New `facturas_compra_cargos` table | Success criteria only require "exactamente 1 gasto por concepto presente" — no requirement to audit individual lines. Avoids a new table/migration/schema.ts entry. |
| Missing `cuentas_config` key at write time | **Throw**, abort the whole compra tx | Silently skip gasto (ajustes precedent) | Unlike ajustes (config may legitimately be unset), migration backfills `MATERIAL_EMPAQUE`/`FLETE_COMPRA` for every empresa — a null here means the migration wasn't applied (documented dependency). Silently skipping would post cargo money to CxP with no matching expense record — a financial-integrity gap. Fail loud instead. |
| Mixed IVA within one concept | Store `base_imponible_usd`/`monto_iva_usd` as true sums; `porcentaje_iva` = effective rate (`iva/base*100`, or `0`); `tipo_impuesto` = `'Gravable'` if `iva>0` else `'Exento'` | Reject mixed IVA per concept | `porcentaje_iva` is informational text on `gastos`; the real accounting values are the absolute base/IVA sums. Scope explicitly requires supporting mixed 0%/16% lines per concept. |
| Currency arithmetic | `Decimal.js` directly + existing `toStorageString()` (verified bug-free) | New currency helper | Read `lib/currency.ts` in full — `usdToBs`/`bsToUsd` return `Decimal` correctly, no leak found. Reuse the exact idiom already used throughout `crearCompra` (`new Decimal(...)`, `toStorageString(...)`). |

## Data Flow

    compra-form.tsx (lineasCargo state)
        │  totalizarLineasCargo() ──→ folds into totalDisplay/totalIvaUsd/totalUsd/totalBs (preview)
        │  Zod validate + submit guard (block on incomplete line)
        ▼
    crearCompra(params.lineasCargo) [use-compras.ts]
        │  Step 1: totalizarLineasCargo() → same fold into totalExentoUsd/totalBaseUsd/totalIvaUsd
        │  Step 3: INSERT facturas_compra (totals already include cargos)
        │  Step 4: product-line loop (UNCHANGED)
        │  Step 4b (NEW): consolidarLineasCargo() → per concept {EMPAQUE?, FLETE?}
        │      resolve cuenta via cuentas_config (clave) → tx.execute INSERT INTO gastos
        │  Step 5/6: CxP + asientos contables (UNCHANGED, sees totals already inflated)
        ▼
    gastos table: 0–2 new rows, doc_origen_id=compraId, doc_origen_tipo='FACTURA_COMPRA'

## File Changes

| File | Action | Description |
|---|---|---|
| `migrations/0082_seed_material_empaque_flete_cuentas.sql` | Create | New `plan_cuentas` 6.1.25 FLETES Y TRANSPORTE DE MERCANCIA; `CREATE OR REPLACE` on `seed_plan_cuentas`/`seed_cuentas_config` (0064 pattern) adding `MATERIAL_EMPAQUE`→6.1.16, `FLETE_COMPRA`→6.1.25; idempotent backfill to existing empresas |
| `src/features/inventario/lib/compra-lineas-cargo.ts` | Create | Pure functions: `calcularLineaCargo`, `totalizarLineasCargo`, `consolidarLineasCargo` + `LineaCargoUI` type |
| `src/features/inventario/schemas/compra-schema.ts` | Modify | Add `lineaCargoSchema` (concepto enum, `campoFinanciero` monto, IVA literal 0\|16) |
| `src/features/inventario/components/compras/compra-form.tsx` | Modify | `lineasCargo` state, 2 buttons, list UI, fold into total display, submit-guard validation, pass to `crearCompra` |
| `src/features/inventario/hooks/use-compras.ts` | Modify | `CrearCompraParams.lineasCargo?`, fold into totals, in-tx cuenta resolution + `INSERT INTO gastos` per concept |
| `src/features/contabilidad/schemas/cuentas-config-schema.ts` | Modify | Add `MATERIAL_EMPAQUE`/`FLETE_COMPRA` to `CLAVES_CONFIG` (verified: lives here, not in `use-cuentas-config.ts` as proposal stated) |

## Interfaces / Contracts

```ts
// compra-lineas-cargo.ts
export type LineaCargoUI = { id: string; concepto: 'EMPAQUE' | 'FLETE'; monto: number; porcentaje_iva: 0 | 16 }
export function totalizarLineasCargo(lineas: LineaCargoUI[]): { exentoUsd: number; baseUsd: number; ivaUsd: number }
export function consolidarLineasCargo(lineas: LineaCargoUI[]):
  Array<{ concepto: 'EMPAQUE' | 'FLETE'; baseUsd: number; ivaUsd: number; totalUsd: number }>
```

`consolidarLineasCargo` groups strictly by `concepto` (ignores rate for grouping, sums base/iva independently per proposal's mixed-rate rule); only concepts with ≥1 line appear in the result.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `calcularLineaCargo`, `totalizarLineasCargo`, `consolidarLineasCargo` | Pure, no DB. Cases: empty input→`[]`; single line 0%; single line 16%; same concept mixed 0%+16% (bases/IVA summed independently — Medium-risk case); both concepts present → 2 groups, deterministic order; only one concept present → 1 group; Decimal precision with 3× non-terminating amounts (no float drift) |
| Unit | Zod `lineaCargoSchema` | Reject monto ≤ 0, reject IVA ≠ {0,16} |
| Integration | `crearCompra` with `lineasCargo` | Assert `facturas_compra.total_usd` includes cargo+IVA; assert exactly N `gastos` rows (N = concepts present) with correct `doc_origen_id`/`tipo`; assert missing `cuentas_config` key throws and rolls back whole tx; assert 0 cargo lines → byte-identical behavior to today (regression) |
| E2E | N/A this change | Manual QA per proposal success criteria |

## Migration / Rollout

`migrations/0082_seed_material_empaque_flete_cuentas.sql`, applied in Supabase before deploy (documented dependency, same as 0066). Additive only — new account + 2 config keys, `ON CONFLICT DO NOTHING` backfill, no data migration for historical facturas.

## Open Questions

- [ ] None blocking. Optional nice-to-have (not required by success criteria): disable "+ Flete"/"+ Empaque" buttons in the UI via `useCuentaConfigPorClave` if the key isn't configured yet, instead of failing at submit — left for implementation discretion.
