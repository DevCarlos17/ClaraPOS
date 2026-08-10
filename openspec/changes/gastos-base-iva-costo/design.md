# Design: Base Imponible como Costo Real en Gastos y Compras

## Technical Approach

`gastos` keeps its 3 existing columns but each gets ONE frozen meaning, enforced by a shared pure-helper module instead of inline `monto_usd` reads. `monto_usd` stays **Total (base+IVA, desembolso)** table-wide — it is NOT redefined per row-type. Reports read `base_imponible_usd` for the "cost/gasto" figure. This avoids the column-semantic-split risk flagged in exploration (obs #1348): manual and cargo rows keep the identical 3-field contract, only the cargo INSERT had a bug writing Total into a field reports mis-read as cost.

## Architecture Decisions

### Decision: Canonical column semantics (frozen, table-wide)

| Column | Meaning | Read as |
|---|---|---|
| `monto_factura` | Base in `moneda_factura` (pre-IVA, original currency) | reference only |
| `base_imponible_usd` | Base in USD — **the real cost** | `montoCostoGasto()` |
| `monto_iva_usd` | Tax in USD | `montoIvaGasto()` |
| `monto_usd` | Total USD = base+IVA — **the outflow** | `montoTotalGasto()` |

**Alternatives considered**: (a) redefine `monto_usd` = base only for cargo rows → rejected, corrupts mixed-row reports (per #1348). (b) leave `monto_usd` as cost everywhere, ignore decision #1350 → rejected, contradicts frozen business decision.
**Rationale**: One meaning per column, always. Bug is isolated to the WRITE (cargo INSERT wrote Total where it should read consistently), not to the column contract.

### Decision: Safe-read fallback (defensive only, not migration)

`montoCostoGasto(g)`: if `base_imponible_usd` is null/empty/NaN → fallback to `monto_usd`. Same pattern for `monto_iva_usd` → 0. No historical backfill (per #1350, no real data exists) — this is cheap defensiveness for any row a future bug leaves incomplete, not a migration mechanism.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/inventario/hooks/use-compras.ts:861` | Modify | `toStorageString(dTotal)` → `toStorageString(dBase)` for the cargo `monto_usd`/`monto_bs` VALUES param. `base_imponible_usd`/`monto_iva_usd` (L864-865) already correct — unchanged. |
| `src/features/contabilidad/hooks/use-gastos.ts:218` | None | Verified: `crearGasto` already writes base/iva/total correctly. No code change. |
| `src/features/contabilidad/lib/gasto-montos.ts` | Create | `montoCostoGasto`, `montoIvaGasto`, `montoTotalGasto` pure selectors + fallback rule. |
| `src/features/contabilidad/lib/__tests__/gasto-montos.test.ts` | Create | RED-first unit tests for selectors. |
| `src/features/contabilidad/components/gasto-reportes.tsx` | Modify | L56-57 (accum totalUsd/totalBs), L171/174 (render) → swap `monto_usd` reads to `montoCostoGasto`. Grand-total block (L66-68) gains adjacent IVA/Total via `montoIvaGasto`/`montoTotalGasto`. |
| `src/features/contabilidad/components/gastos-dashboard.tsx` | Modify | All 19 `monto_usd` reads (L187,205,214,222,236,285,295,300,303,313,316,322,374,405,777,854,882,919) → `montoCostoGasto`. KPI headers L222/236/777/882 additionally show IVA (`montoIvaGasto` sum) + Total (`montoTotalGasto` sum) for Base\|IVA\|Total. `GastoConJoins` type (L911-915) extended with `base_imponible_usd: string; monto_iva_usd: string`. |
| `src/features/inventario/lib/compra-lineas-cargo.ts` | Modify | Add `mergeDesgloseConCargo(desglose, cargo: TotalLineasCargo)` pure fn: adds `cargo.exentoUsd` to `exentoUsd`; `cargo.baseUsd`/`ivaUsd` merge into the existing 16% `gravableGroups` entry (create if absent, since `LineaCargoUI.porcentaje_iva` is only `0\|16`); recomputes `totalIvaUsd`. |
| `src/features/inventario/lib/__tests__/compra-lineas-cargo.test.ts` | Modify | Add `mergeDesgloseConCargo` cases. |
| `src/features/inventario/components/compras/compra-form.tsx` | Modify | Move `const { exentoUsd, gravableGroups, totalIvaUsd } = desgloseUsd` (L479) to AFTER `cargoTotales` (L500-501), replaced by `useMemo(() => mergeDesgloseConCargo(desgloseUsd, cargoTotales), [desgloseUsd, cargoTotales])`. Render block (L2269-2308) unchanged — reads the now-merged values. |
| `src/features/inventario/components/compras/compra-list.tsx` | Modify | Add "Base USD"/"IVA USD" `<th>` (near L169) + `<td>` (near L216) from `compra.total_base_usd`/`total_iva_usd` (already selected via `c.*`, already on `CompraConProveedor`). No conversion needed — already USD. |

## Interfaces / Contracts

```ts
// src/features/contabilidad/lib/gasto-montos.ts
interface GastoMontos { base_imponible_usd: string; monto_iva_usd: string; monto_usd: string }
function montoCostoGasto(g: GastoMontos): number   // base_imponible_usd, fallback monto_usd
function montoIvaGasto(g: GastoMontos): number     // monto_iva_usd, fallback 0
function montoTotalGasto(g: GastoMontos): number   // monto_usd

// src/features/inventario/lib/compra-lineas-cargo.ts
function mergeDesgloseConCargo(
  desglose: { exentoUsd: number; gravableGroups: { pct: number; base: number; iva: number }[]; totalIvaUsd: number },
  cargo: TotalLineasCargo
): typeof desglose
```

## Testing Strategy (TDD, RED-first)

| Case | File |
|---|---|
| base=100 iva=16 → cost=100, iva=16, total=116 | gasto-montos.test.ts |
| exento (iva=0) → cost=base, iva=0 | gasto-montos.test.ts |
| base missing → cost falls back to monto_usd | gasto-montos.test.ts |
| iva missing → iva=0 | gasto-montos.test.ts |
| manual-gasto row vs cargo row → identical helper output shape | gasto-montos.test.ts |
| cargo 16% merges into existing 16% product group | compra-lineas-cargo.test.ts |
| cargo 0% merges into exentoUsd | compra-lineas-cargo.test.ts |
| cargo has 16% but no product group at 16% yet → creates group | compra-lineas-cargo.test.ts |
| empty lineasCargo → desglose unchanged (reference case) | compra-lineas-cargo.test.ts |

Grep checklist to close the change: `rg "monto_usd" src/features/contabilidad/components/gasto-reportes.tsx src/features/contabilidad/components/gastos-dashboard.tsx` must return zero *display/aggregation* matches (type-only refs and the `GastoConJoins`/`Gasto` type field itself are expected to remain).

## Regression Safety — MUST NOT change

- Product-line desglose loop (`compra-form.tsx:436-477`), kardex/inventory cost logic, `facturas_compra` header totals (`total_base_usd`/`total_iva_usd`/`total_exento_usd` — already correct per #1348).
- `generarAsientosCompra`/`libro_contable` — untouched (accounting module paused per #1346).
- PR #17 (`compra-empaque-flete`) branch/consolidation logic (`consolidarLineasCargo`, `totalizarLineasCargo` bodies) — only additive `mergeDesgloseConCargo` appended.
- `crearGasto` INSERT values — verified correct, no diff.

## Migration / Rollout

No migration required (no historical data per #1350). Revert = `use-compras.ts:861` back to `dTotal` + revert helper call sites back to `monto_usd`.

## Review Workload Forecast

Estimated ~350-430 changed lines (additions+deletions): use-compras.ts (~2), gasto-montos.ts+test (~120), compra-lineas-cargo.ts+test (~85), compra-form.tsx (~15), compra-list.tsx (~10), gasto-reportes.tsx (~20), gastos-dashboard.tsx (~90-120 across 19 sites + type + 4 KPI additions). **400-line budget risk: Medium.** Recommend `sdd-tasks` slice as 2 units: (1) core fix + helpers + tests + compra-list (small, self-contained, ~230 lines), (2) reports/dashboard migration (~150-200 lines, mechanical but wide). Chained PRs recommended if slice 2 grows past 400 alone.

## Open Questions

- [ ] Should KPI Base\|IVA\|Total breakdown be added at all 4 headline points (L222/236/777/882) or just one canonical summary card? (tasks.md can decide during implementation — non-blocking)
