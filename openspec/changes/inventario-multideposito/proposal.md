# Proposal: Inventario Multideposito

## Intent

ClaraPOS forces every caja to discount stock from a single empresa-wide "principal" deposito and tracks stock only via a denormalized `productos.stock` counter. This blocks multi-branch/multi-warehouse operation (almacen + piso de venta). `inventario_stock` — the table already keyed per `(empresa, producto, deposito)` — is orphaned: written once at product creation, never maintained afterward, so it silently goes stale. This change makes inventory truly per-deposit and gives `inventario_stock` a real, authoritative role.

## Scope

### In Scope
- `productos.deposito_id` (persistent default deposito) — drives stock-in for initial stock, compras (per line), and manual kardex ingreso (overridable default).
- Compras: each `factura_compra_det` line routes stock-in to ITS product's deposito (fallback empresa principal).
- Ventas: caja discounts from its OWN `cajas.deposito_id`; stock validation (article select, red-highlight guard, local tx re-check, `validar-stock` Edge Function) becomes deposit-scoped across all 4 call sites.
- Notas de credito egreso: returns stock to `venta.deposito_id` (same deposito the sale drew from).
- `inventario_stock.cantidad_actual` becomes the authoritative per-deposit counter, updated atomically alongside every `movimientos_inventario` insert (ventas, compras, kardex, ajustes, traspasos). `productos.stock` stays as a denormalized cross-deposit total. A "recalcular desde kardex" repair function is added as a safety net.
- New `traspasos_inventario` + `traspasos_inventario_det` (header/detail) feature: atomic paired kardex writes between deposits, individual + batch, per-user correlativo, nullable `autorizado_por`/`verificado_por`.
- `register-owner` Edge Function auto-creates one principal deposito + linked caja on company signup.
- Migration `0083_*` (nullable `productos.deposito_id`, backfill, new tables, `cajas.deposito_id` backfill), kept in lockstep with `schema.ts` + `kysely/types.ts` + PowerSync sync rules.

### Out of Scope
- Access-control / device-linking for the transfer correlativo's known multi-device COUNT-collision edge case (accepted existing tradeoff, same as facturas) — deferred to a future access-control change.
- `autorizado_por`/`verificado_por` approval workflow (status field) — placeholders only, no workflow now.
- `NOT NULL` constraint on `productos.deposito_id` (follow-up migration after backfill verified).

## Capabilities

### New Capabilities
- `producto-deposito-default`: product has a persistent, editable default deposito driving stock-in defaults.
- `compras-por-linea-deposito`: purchase lines route stock-in per product's deposito.
- `kardex-deposito-sugerido`: manual kardex ingreso defaults to the product's deposito, overridable.
- `ventas-stock-por-deposito`: sale stock validation (select, guard, tx re-check, server check) is caja-deposito-scoped.
- `notas-credito-deposito-origen`: credit-note egreso returns stock to the original sale's deposito.
- `inventario-stock-autoritativo`: `inventario_stock` is the maintained per-deposit source of truth, with a kardex-based recalculation repair function.
- `traspasos-inventario`: atomic, documented stock transfers between deposits (individual + batch).
- `empresa-bootstrap-deposito`: company registration seeds one principal deposito + caja.

### Modified Capabilities
- None (no existing `openspec/specs/*` capability governs deposito/stock behavior today).

## Approach

Add `productos.deposito_id` as the default-deposito source of truth for stock-in paths; keep the caja's own `deposito_id` as the source for stock-out on sales. Make `inventario_stock` authoritative by upserting it inside the SAME `writeTransaction` that writes each kardex row, across every mutating path. Introduce a header/detail `traspasos_inventario` pair mirroring the existing `ventas`/`ventas_det` pattern for atomic cross-deposit moves. Seed deposito+caja at company bootstrap so day-1 tenants can invoice. Ship as chained PRs (see Risks) rather than one PR.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `migrations/0083_*.sql`, `schema.ts`, `kysely/types.ts`, sync rules | New | `productos.deposito_id`, `traspasos_inventario(_det)`, backfills — must stay in lockstep |
| `producto-form.tsx` | Modified | Persist + make deposito editable on edit |
| `use-compras.ts` | Modified | Per-line deposito resolution instead of one prefetched deposito |
| `use-kardex.ts`, `movimiento-form.tsx` | Modified | Default suggestion from product's deposito |
| `use-ventas.ts`, `panel-productos.tsx`, `pos-terminal.tsx`, `linea-items.tsx` | Modified | Caja-deposito-scoped stock reads (financial-critical) |
| `supabase/functions/validar-stock/index.ts` | Modified | Server-side re-check becomes deposit-aware |
| `use-notas-credito.ts` | Modified | Return stock to `venta.deposito_id` |
| `use-traspasos.ts` (new), transfer UI, new route | New | Traspasos feature end-to-end |
| `supabase/functions/register-owner/index.ts` | Modified | Seed deposito + caja after step 9 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ventas stock path is financial-critical (4 call sites + Edge Function) | Medium | Its own tightly-reviewed PR slice; keep existing anti-negative guards, add deposit-scoped tests before merge |
| `inventario_stock` upsert missed on any write path → silent stock drift | Medium | Single shared helper invoked from every mutating path; `recalcular desde kardex` repair function as safety net |
| Migration lockstep (SQL / `schema.ts` / `kysely/types.ts` / sync rules) drifts | Medium | Land all four in the same PR slice; add to PR checklist |
| Backfill assumes exactly one `es_principal` deposito per empresa | Low | Verify per-tenant before migrating; manual fallback documented |
| Transfer correlativo multi-device COUNT collision | Low (accepted) | Same tradeoff already accepted for facturas; out of scope to fix here |

## Rollback Plan

Each PR slice is independently revertable: (1) schema/productos/compras/kardex slice reverts via migration down-script + code revert (no data loss, `productos.deposito_id` stays nullable); (2) ventas slice reverts to reading `productos.stock` directly (git revert, no schema dependency); (3) traspasos slice is fully additive (new tables/routes) — safe to drop; (4) bootstrap slice reverts to the prior `register-owner` without deposito/caja seeding.

## Dependencies

- Exploration findings A-F (`exploration.md`) — all 7 open questions resolved, no further discovery needed.
- Slicing must land in order: (1) schema+productos+compras+kardex → (2) ventas → (3) traspasos → (4) bootstrap, since (2)-(4) read `productos.deposito_id`/`inventario_stock` groundwork from (1).

## Success Criteria

- [ ] A product's default deposito persists and is editable; drives compras/kardex-ingreso defaults.
- [ ] Sales discount stock only from the caja's own deposito; out-of-stock/insufficient-stock guards work per-deposito at all 4 call sites + Edge Function.
- [ ] `inventario_stock` matches kardex-derived totals per deposito for every mutating path; `productos.stock` matches the cross-deposit sum.
- [ ] A traspaso atomically moves stock between two depositos (individual + batch) with correct paired kardex rows.
- [ ] New company registration has one usable deposito + caja without manual setup.
</content>
