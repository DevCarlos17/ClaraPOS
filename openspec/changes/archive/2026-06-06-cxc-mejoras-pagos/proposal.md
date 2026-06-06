# Proposal: CxC Mejoras de Pagos

_Date: 2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## Intent

The current CxC and POS payment flows have 7 data-integrity and UX gaps: SAF in `PagoFacturaModal` auto-applies via FIFO without user consent; FIFO preview is hardcoded in USD regardless of payment currency; the cashier change (vuelto) UI lacks a per-currency breakdown; there is no traceability linking SAF applications to originating payments; and cashiers cannot use a client's existing credit balance as a payment method in POS. These improvements close all 7 gaps, add schema trazabilidad, and protect live data in "Sabro Queso 2" with an additive migration.

---

## Scope

### In Scope
- Remove SAF auto-application from `PagoFacturaModal`; add manual "Usar saldo a favor" section in both `PagoFacturaModal` and `AbonoGlobalModal` (shown only when `cliente.saldo_actual < -0.001`)
- SAF as dynamic payment method in POS `CobroModal` (only when client has existing credit)
- FIFO distribution preview in payment currency (not hardcoded USD)
- Vuelto UX redesigned as per-currency calculator; EGRESO record in `movimientos_metodo_cobro` preserved
- Add `saf_origen_refs` (TEXT, nullable JSON array) to `movimientos_cuenta` — additive SQL migration + `schema.ts` + sync rules update
- Payment history: display "Saldo a favor" label + origin refs when SAF is the payment type

### Out of Scope
- Dashboard P&L integration with SAF balance
- Tesorería changes
- Automatic FIFO SAF application (removed by design)
- Retenciones changes

---

## Capabilities

### New Capabilities
- `cxc-saf-manual`: Manual SAF selection inside `PagoFacturaModal` and `AbonoGlobalModal` replacing the current auto-apply
- `cxc-saf-origen-refs`: Schema column + sync rule for SAF traceability (payment origin references)
- `pos-saf-metodo-cobro`: SAF as dynamic payment method option in POS `CobroModal`

### Modified Capabilities
- `prestamos`: BRECHA-002 (overpayment in `PagoFacturaModal`) is partially addressed by the `cxc-saf-manual` capability

---

## Approach

- **SAF CxC**: Remove `aplicarSaldoFavor()` auto-call from `registrarPagoFactura`. Add a UI toggle "Usar saldo a favor" that, when enabled, reduces the required payment amount by the SAF balance used. The hook records the SAF application with `saf_origen_refs` pointing to the originating `movimiento_cuenta` IDs.
- **SAF POS**: In `CobroModal`, add "Saldo a favor" to the payment methods list, conditioned on `cliente.saldo_actual < -0.001`. It behaves as a special method: creates `movimiento_cuenta tipo='SAF'` with `saf_origen_refs = [venta_id]`.
- **FIFO currency**: In `AbonoGlobalModal`, replace hardcoded `formatUsd()` on FIFO rows with a conditional formatter using `metodoSeleccionado.moneda` (already available in component scope).
- **Vuelto calculator**: Replace single-amount display with a two-row breakdown (USD vuelto + Bs vuelto). EGRESO record in `movimientos_metodo_cobro` remains unchanged.
- **Schema + migration**: `ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT` — nullable, no backfill needed.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/cxc/components/pago-factura-modal.tsx` | Modified | Remove auto-apply SAF+FIFO; add manual SAF section |
| `src/features/cxc/components/abono-global-modal.tsx` | Modified | Manual SAF section; FIFO preview in payment currency |
| `src/features/cxc/hooks/use-cxc.ts` | Modified | `registrarPagoFactura` + `registrarAbonoGlobal`: accept SAF params, write `saf_origen_refs`; remove auto-apply call |
| `src/features/ventas/components/cobro-modal.tsx` | Modified | SAF dynamic payment method; vuelto per-currency calculator |
| `src/features/ventas/hooks/use-ventas.ts` | Modified | `crearVenta`: handle SAF method, write `movimiento_cuenta` with `saf_origen_refs` |
| `src/core/db/powersync/schema.ts` | Modified | Add `saf_origen_refs` to `movimientos_cuenta` table definition |
| `backend/migrations/` | New | Additive: `ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT` |
| `backend/powersync-sync-rules.yaml` | Modified | Include `saf_origen_refs` in `movimientos_cuenta` bucket sync |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `cobro-modal.tsx` already modified by `pos-mejoras-cobro` change | High | Coordinate merge: `pos-mejoras-cobro` adds SAF for overpayment; this change adds SAF for existing credit — different conditions, same file |
| SAF balance reflects only after PowerSync sync | Medium | Show pending confirmation UI; CxC updates reactively via PowerSync |
| Cashiers confused by removal of auto-apply | Low | Replace with explicit "Usar saldo a favor" toggle — behavior is more transparent |
| `saf_origen_refs` JSON parsing on SQLite | Low | Store as TEXT, parse lazily in display layer only |

---

## Rollback Plan

The SQL migration is additive (nullable column). Rollback for frontend = `git revert` on 5 files. DB rollback = `ALTER TABLE movimientos_cuenta DROP COLUMN saf_origen_refs` (no existing data uses it). `movimientos_cuenta` rows written with `saf_origen_refs` are append-only and do not affect other queries if the column is dropped.

---

## Dependencies

- `pos-mejoras-cobro` tasks must be reconciled before apply — overlap in `cobro-modal.tsx`
- Migration must run before frontend deploy (additive, safe for live data)

---

## Success Criteria

- [ ] `PagoFacturaModal`: SAF+FIFO no longer auto-applies to other invoices on overpayment
- [ ] `PagoFacturaModal` + `AbonoGlobalModal`: "Usar saldo a favor" section visible only when `saldo_actual < -0.001`; payment amount reduced by selected SAF amount
- [ ] `CobroModal`: "Saldo a favor" method appears only when client has existing credit; selecting it creates `movimiento_cuenta tipo='SAF'`
- [ ] FIFO preview shows amounts in the payment method's currency (not hardcoded USD)
- [ ] Vuelto shows per-currency breakdown (USD + Bs); EGRESO record still created
- [ ] `movimientos_cuenta.saf_origen_refs` populated for all SAF-type movements
- [ ] Migration applied on "Sabro Queso 2" with zero data loss
