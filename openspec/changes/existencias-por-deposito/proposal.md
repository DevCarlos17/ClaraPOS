# Proposal: Existencias por Deposito

## Intent

Testers report that the current inventory view only shows a single global `productos.stock` counter, with no way to see how stock is distributed across depositos. This blocks a basic operational question ("cuanto tengo de X en cada deposito") that `inventario_stock` already has the data for — it just has no matrix-style read UI. This change adds a read-only product x deposito matrix inside the existing Traspasos page.

## Scope

### In Scope
- New read-only hook `useExistenciasPorDeposito()` in `use-inventario-stock.ts`: one flat query (`inventario_stock JOIN productos WHERE empresa_id = ?`), pivoted client-side into `{ producto, [deposito_id]: cantidad }` rows.
- New component `existencias-por-deposito.tsx` in `src/features/inventario/components/existencias/`: hand-rolled `<table>` matrix (matches `ProductoList`/`TraspasoList` styling, not the unused `DataTable`), search filter by nombre/codigo (reusing `ProductoList` UX).
- Route restructure: `traspasos.tsx` gains `Tabs` (`variant="line"`, `horarios-staff-page.tsx` precedent) with two tabs — "Existencias por deposito" (primary, default) and "Historico de traspasos" (existing `TraspasoList`, relocated unchanged).
- 5 decisions (below), documented to close exploration's open questions.

### Out of Scope
- Schema changes, migrations, or writes to `inventario_stock` (already write-protected — only mutated via `stock-deposito.ts` during ventas/compras/traspasos/ajustes).
- Price/cost columns (quantity-only; avoids duplicating `ProductoList`'s role).
- Low-stock color tiers (v1 is plain quantities).
- Deactivated depositos with residual stock (future consideration).
- Any change to traspaso creation/approval logic or permissions model.

## Decisions

1. **Deposit columns**: only `useDepositosActivos()` (active depositos) — matches where stock actually moves.
2. **Product rows**: only `tipo='P'` (almacenables); exclude `tipo='S'` (servicios, always stock 0) and `tipo='C'` (combos, no own stock) — matches the traspaso buscador's existing filter.
3. **Column order**: `es_principal` deposito first, then remaining depositos by `nombre` ASC.
4. **Cell display**: quantity-only, no color/warning tiers (keeps v1 simple, avoids `stock_minimo` scope creep).
5. **Search**: reuse `ProductoList`'s nombre/codigo text filter (no pagination pattern exists in this codebase).

## Capabilities

### New Capabilities
- `existencias-por-deposito`: read-only product x deposito stock matrix view.

### Modified Capabilities
- None.

## Approach

Single flat query joins `inventario_stock` to `productos`, filtered by `empresa_id`. Client-side pivot builds the matrix keyed by `(producto_id, deposito_id)`; missing `inventario_stock` rows (lazy-creation — no row until first movement) default to `'0.000'` rather than being dropped, mirroring `stock-deposito.ts`'s existing "row absent = zero" semantic.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/inventario/hooks/use-inventario-stock.ts` | Modified | New `useExistenciasPorDeposito()` hook, extends existing `StockItem` idiom |
| `src/features/inventario/components/existencias/existencias-por-deposito.tsx` | New | Matrix component + search filter |
| `src/routes/_app/inventario/traspasos.tsx` | Modified | Wrap in `Tabs`, add existencias tab, relocate `TraspasoList` unchanged |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Lazy `inventario_stock` rows read as missing product | Low | Pivot iterates `productos` as base row set, defaults missing cells to `'0.000'` |
| Large catalogs make matrix heavy to scan | Low | Search filter (nombre/codigo), no pagination needed at current catalog sizes |
| Scope creep toward price columns / low-stock coloring | Low | Explicitly out of scope in this proposal; quantity-only cells |

## Rollback Plan

Purely additive: revert the hook addition and component file, and revert `traspasos.tsx` to render `<TraspasoList />` directly (no `Tabs` wrapper). No schema/data impact — safe single-commit revert.

## Dependencies

- Exploration `sdd/existencias-por-deposito/explore` — all open questions resolved via Decisions section above.

## Success Criteria

- [ ] Matrix shows one row per `tipo='P'` producto, one column per active deposito (`es_principal` first), cell = `cantidad_actual` (defaulting to 0 for missing rows).
- [ ] "Historico de traspasos" tab renders the existing `TraspasoList` with unchanged behavior.
- [ ] Every query filters by `empresa_id`; no schema/migration/write-path changes.
- [ ] `yarn type-check` and `yarn test:run` pass; estimated diff stays well under the 400-line review budget (~250-300 lines).
