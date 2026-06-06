# Proposal: Caja SAF

_Date: 2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## Intent

SAF used as a direct payment method in POS (implemented in `cxc-mejoras-pagos`) writes to `movimientos_cuenta` but never to `pagos` or `movimientos_metodo_cobro`. Because the cashier closing report queries those two tables for the payment method breakdown, SAF-applied amounts are invisible in the cuadre. This change closes that gap and adds a drilldown so cashiers can see exactly which invoices consumed SAF during a session.

---

## Scope

### In Scope
- Additive migration: `sesion_caja_id TEXT` (nullable) on `movimientos_cuenta`
- Schema + sync-rule update to include the new column
- Pass `sesion_caja_id` when inserting SAF in `use-ventas.ts` (step 7d)
- `useSafDiario(sesionId)` hook in `use-cuadre.ts` — sums SAF applied per session
- "Saldo a favor aplicado" section in `PagosResumen` (read-only, clearly separate from cash inflows)
- Drilldown modal: invoices with SAF in session (nro. factura, cliente, monto SAF, pago total vs. parcial)

### Out of Scope
- SAF from overpayment in CxC (already shown under "Cobros CxC via POS")
- `sesiones_caja_detalle` snapshot update for historical records
- Dashboard P&L / Tesorería
- Back-fill of `sesion_caja_id` for records prior to this change (NULL is valid)

---

## Capabilities

### New Capabilities
- `saf-cuadre`: SAF total applied per session shown in cashier closing breakdown
- `saf-detalle-facturas`: Drilldown listing every invoice paid with SAF in a given session

### Modified Capabilities
None

---

## Approach

- **Migration (Opción B)**: `ALTER TABLE movimientos_cuenta ADD COLUMN sesion_caja_id TEXT` — additive, no backfill, safe on live data
- **use-ventas.ts step 7d**: Read `sesion_caja_id` already present on the `venta` payload; include it in the SAF `movimiento_cuenta` INSERT
- **use-cuadre.ts**: Add `useSafDiario` (SUM query on `movimientos_cuenta WHERE tipo='SAF' AND sesion_caja_id=?`) and `useFacturasPagadasConSaf` (JOIN to `ventas` for the drilldown)
- **pagos-resumen.tsx**: Render a new row "Saldo a favor aplicado" below existing method rows — styled differently (no currency inflow)
- **cuadre-page.tsx**: Wire click-on-SAF-row to open drilldown modal

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/0051_add_sesion_caja_id_movimientos_cuenta.sql` | New | Additive ALTER TABLE |
| `src/core/db/powersync/schema.ts` | Modified | Add `sesion_caja_id` to `movimientos_cuenta` table |
| `powersync-sync-rules.yaml` | Modified | Include `sesion_caja_id` in `movimientos_cuenta` bucket |
| `src/features/ventas/hooks/use-ventas.ts` | Modified | Step 7d: pass `sesion_caja_id` on SAF INSERT |
| `src/features/reportes/hooks/use-cuadre.ts` | Modified | Add `useSafDiario` + `useFacturasPagadasConSaf` |
| `src/features/reportes/components/pagos-resumen.tsx` | Modified | New "Saldo a favor aplicado" row |
| `src/features/reportes/components/cuadre-page.tsx` | Modified | Wire drilldown modal for SAF row |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Historical SAF records have `sesion_caja_id = NULL` — they will not appear in the cuadre | Low | Expected and documented; only new sessions are affected |
| SAF overpayment (discrepancy mode) already shown under CxC section — user confusion if same venta appears twice | Medium | `useSafDiario` filters `tipo='SAF'` only; discrepancy flow uses `movimientos_metodo_cobro`, not `tipo='SAF'` — no overlap |
| `ventas.sesion_caja_id` might be NULL for draft/void ventas | Low | Filter: `WHERE mc.tipo='SAF' AND mc.sesion_caja_id IS NOT NULL` |

---

## Rollback Plan

Frontend: `git revert` on 3 component/hook files. Migration: `ALTER TABLE movimientos_cuenta DROP COLUMN sesion_caja_id` (column is nullable; no downstream logic breaks if dropped). Records already written with the column populated are append-only and do not affect other queries.

---

## Dependencies

- `cxc-mejoras-pagos` must be archived (already done: `2026-06-06`)
- Migration must deploy before frontend to avoid NULL column errors on new inserts

---

## Success Criteria

- [ ] Cuadre de caja shows "Saldo a favor aplicado: $X.XX" for sessions where SAF was used
- [ ] Clicking the SAF row opens a drilldown listing each invoice with: nro. factura, cliente, monto SAF, pago total/parcial
- [ ] Sessions with zero SAF usage do not show the SAF row
- [ ] `movimientos_cuenta` rows for SAF-method payments include `sesion_caja_id` matching the active session
- [ ] Migration applied with zero data loss; historical records retain `sesion_caja_id = NULL` without error
