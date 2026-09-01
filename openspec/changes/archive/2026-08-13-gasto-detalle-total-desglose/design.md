# Design: Fix Total Factura y Desglose Base/IVA en Detalle de Gasto

## Technical Approach

Both bugs live in `factura-proveedor-modal.tsx`'s `amounts` `useMemo`, branch `tipo === 'GASTO'`
(develop, ~L226-249, Decimal.js). The branch derives `totalProveedorUsd` from `gasto.monto_factura`
(base imponible) instead of `gasto.monto_usd` (base+IVA). Fix: extract the whole GASTO derivation
into a pure, unit-testable function `deriveGastoTotales()` that reads `monto_usd` as the total and
adds a Base/IVA breakdown reusing `montoCostoGasto`/`montoIvaGasto`/`montoTotalGasto` from
`gasto-montos.ts` (already on develop, ported by PR #25 but wired only into the dead
`gasto-detalle-modal.tsx`). The JSX breakdown block is ported verbatim in spirit from that dead
component's "Resumen de la Factura" (Gravable/Exento/Exonerado branches) into the live modal's
"Totales" section.

## Architecture Decisions

### Decision: One pure function per document type, not one shared function

**Choice**: Two separate pure functions — `deriveGastoTotales(gasto, tasaValor)` (new, in
`gasto-montos.ts`) and the existing inline COMPRA derivation stays inline (unchanged).
**Alternatives considered**: A single `deriveTotales(row, tipo, tasaValor)` dispatcher shared by
both COMPRA and GASTO.
**Rationale**: `CompraRow` and `GastoRow` are different shapes with different total semantics —
`facturas_compra.total_usd`/`total_bs` are ALREADY post-IVA totals (schema has separate
`subtotal_usd` and `total_iva_usd` columns), so the COMPRA branch has no analogous bug and needs
no change. `GastoRow` uses `monto_factura` (base) vs `monto_usd` (base+IVA) — a different column
semantics entirely. A shared dispatcher would force an artificial common interface for no benefit
and risk coupling the fix to unrelated CxP code. **No `tipo === 'GASTO'` runtime guard is needed
inside the new function** — it only ever receives `GastoRow` data, so it structurally cannot run
for COMPRA. The existing `if (tipo === 'COMPRA' ...) / if (tipo === 'GASTO' ...)` gate at the call
site in the `useMemo` is untouched, which is what actually prevents regression.

### Decision: Convert the TOTAL (not the base) for the BS/parallel-rate case — SUPERSEDED, see amendment below

**Choice (as originally designed, later found wrong)**: When `usaParalela` and
`moneda_factura !== 'USD'`, divide `monto_usd` (total) by `tasaRef`, not `monto_factura` (base) as
today.
**Alternatives considered**: Convert base and IVA separately then sum — mathematically equivalent
but adds Decimal operations without benefit since `monto_usd` is already persisted as the
authoritative total.
**Rationale (at design time)**: Matches the working pattern already validated in
`gasto-form.tsx`'s `ResumenConfirm` (per exploration obs #1499) and in the dead-but-correct
`gasto-detalle-modal.tsx`.

> **AMENDMENT (post-verify correction, commit `90c6673`)**: This decision was implemented literally
> and caused a CRITICAL double-currency-conversion bug, caught by fresh-context re-verify. Root
> cause: `crearGasto` (`use-gastos.ts` L204-218) already converts BS → USD exactly once at creation
> time and persists the result in `monto_usd` for ALL modes (USD, BS no-paralela, BS paralela) — it
> is never a "still in Bs, needs conversion" value. Dividing it by `tasaRef` again at render time
> was a second, spurious conversion (e.g. a real $116.00 total rendered as $2.90 — off by exactly
> the exchange rate). **Corrected decision**: `totalProveedorUsd = totalContableUsd` (`= monto_usd`)
> unconditionally, no division, no branching on `moneda_factura`/`usaParalela`. See
> `openspec/specs/gasto-detalle-desglose/spec.md`, Requirement "Total Factura Usa el Monto USD
> Canonico (Sin Reconversion)" for the corrected, final spec. The `GastoTotalesResult` interface
> below (`totalProveedorUsd`/`totalContableUsd` as two fields) was kept as-is post-fix, even though
> both fields are now always equal, to avoid touching `factura-proveedor-modal.tsx`'s consumer code
> — flagged as a non-urgent future cleanup, not undone here.

### Decision: Reuse `gasto-montos.ts` selectors, do not duplicate breakdown math

**Choice**: Call `montoCostoGasto(gasto)`, `montoIvaGasto(gasto)`, `montoTotalGasto(gasto)` for
base/IVA/total; read `gasto.tipo_impuesto` + `gasto.porcentaje_iva` for label logic
(Gravable/Exento/Exonerado), same three-way switch used in the dead modal.
**Alternatives considered**: Recompute base/IVA from `monto_usd` and `porcentaje_iva` inline.
**Rationale**: `gasto-montos.ts` already has defensive `parseOrNull` fallbacks and is the single
documented source of truth (see its header comment on canonical column semantics). Duplicating
the math risks drifting from that contract.

## Data Flow

    gastos row (g.*, SELECT already fetches all columns)
         │
         ▼
    GastoRow interface (add: tipo_impuesto, porcentaje_iva,
                              base_imponible_usd, monto_iva_usd)
         │
         ▼
    deriveGastoTotales(gasto, tasaValor)  ── pure, gasto-montos.ts
         │
         ├─► { totalProveedorUsd, totalContableUsd, totalBs,
         │     baseUsd, ivaUsd, porcentajeIva, tipoImpuesto, ... }
         ▼
    amounts.useMemo (GASTO branch) ──► JSX "Totales" block
                                        (Base/IVA/Total rows, dynamic by tipo_impuesto)

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/contabilidad/lib/gasto-montos.ts` | Modify | Add exported `deriveGastoTotales(gasto, tasaValor)` pure function |
| `src/features/compras/components/factura-proveedor-modal.tsx` | Modify | Extend `GastoRow` interface (4 fields); replace inline GASTO derivation (~L226-249) with `deriveGastoTotales()` call; add Base/IVA/Total JSX rows in "Totales" section (~L624-638, non-paralela branch) gated by `tipo === 'GASTO'` |
| `src/features/contabilidad/lib/__tests__/gasto-montos.test.ts` | Create | Unit tests for `deriveGastoTotales` (USD/BS × with/without paralela × 3 `tipo_impuesto`) |
| `src/features/contabilidad/components/gasto-detalle-modal.tsx` | Modify | Add `// TODO(dead-code):` header comment — not imported anywhere, kept only as reference; do not delete (out of scope) |

## Interfaces / Contracts

```ts
// gasto-montos.ts — extends existing GastoMontos-based selectors

export interface GastoTotalesInput extends GastoMontos {
  moneda_factura: string          // 'USD' | 'BS'
  usa_tasa_paralela: number       // 0 | 1
  tasa: string                    // tasa interna
  tasa_proveedor: string | null   // tasa paralela, si aplica
  tipo_impuesto: string           // 'Gravable' | 'Exento' | 'Exonerado'
  porcentaje_iva: string
}

export interface GastoTotalesResult {
  totalProveedorUsd: number  // total en USD equivalente proveedor (fix: usa monto_usd, no monto_factura)
  totalContableUsd: number   // = montoTotalGasto(gasto)
  totalBs: number            // totalContableUsd * tasaValor (tasa actual, no la de factura)
  baseUsd: number            // montoCostoGasto(gasto)
  ivaUsd: number              // montoIvaGasto(gasto)
  porcentajeIva: number
  esGravable: boolean         // tipo_impuesto === 'Gravable' && ivaUsd > 0.005
  esExento: boolean
  esExonerado: boolean
  usaParalela: boolean
  tasaFactura: number
  tasaInterna: number
}

export function deriveGastoTotales(
  gasto: GastoTotalesInput,
  tasaValor: number
): GastoTotalesResult
```

Call site replaces the current inline `if (tipo === 'GASTO' && gasto) { ... }` body with
`deriveGastoTotales(gasto, tasaValor)` plus the pre-existing `saldo` computation (unchanged, not
part of this bug).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `deriveGastoTotales` | `yarn test:run` — table-driven cases: USD no-paralela, BS no-paralela, USD+paralela, BS+paralela, × Gravable/Exento/Exonerado. Assert `totalProveedorUsd` never `< totalAbonado`-style regression (i.e. equals `monto_usd`-derived total, not `monto_factura`) |
| Unit | `montoCostoGasto`/`montoIvaGasto`/`montoTotalGasto` | Already covered on develop (reused, no new tests needed unless missing) |
| Type | `yarn type-check` / `yarn type-check:test` | Verify `GastoRow` extension and function signature compile clean |
| Manual | Modal render | Open a GASTO with Base $10.00 / IVA $1.60 → "Total Factura" shows $11.60, breakdown shows Base/IVA(16%)/Total rows |

No new integration/E2E harness exists in this repo; unit coverage on the pure function is the
primary correctness guarantee (per TDD constraint — write failing tests first against
`deriveGastoTotales` before touching the JSX).

## CxP Regression Analysis (required)

**Question**: Is `monto_usd` the right "total" field for COMPRA too, or must the fix be
conditioned on `tipo === 'GASTO'`?

**Finding**: Not applicable — `CompraRow` has no `monto_usd` field at all. `facturas_compra`
stores `subtotal_usd`, `total_iva_usd`, and `total_usd` (already base+IVA) as distinct columns;
the COMPRA branch already correctly uses `compra.total_usd`/`compra.total_bs` as totals. These are
two structurally disjoint branches of the same `useMemo`, gated by `tipo === 'COMPRA' && compra`
vs `tipo === 'GASTO' && gasto` — mutually exclusive by construction (`compra` and `gasto` are only
populated when the corresponding PowerSync query is enabled by `tipo`).

**Decision**: No explicit `tipo === 'GASTO'` conditioning is added inside `deriveGastoTotales`
itself — it is unreachable from the COMPRA path because it only accepts `GastoRow`-shaped input
and is only called from the `tipo === 'GASTO'` branch of the `useMemo`. The COMPRA branch is left
completely untouched. This satisfies "does not regress compra behavior" without adding dead
conditionals.

## Migration / Rollout

No migration required. Pure UI/derivation fix, no schema or data changes. Ship behind normal PR
review; no feature flag needed (display-only bug fix).

## Rollback Plan

`git revert` the commit(s) touching `factura-proveedor-modal.tsx`, `gasto-montos.ts`, and the new
test file. No schema/migration to unwind.

## Open Questions

None — scope, data model, and reference implementation (dead `gasto-detalle-modal.tsx`) are fully
determined from exploration (obs #1499) and proposal (obs #1500).
