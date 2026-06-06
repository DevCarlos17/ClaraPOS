# Archive Report: cxc-mejoras-pagos

_Change: cxc-mejoras-pagos | Archived: 2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## Executive Summary

**cxc-mejoras-pagos** closed 7 data-integrity and UX gaps in the CxC and POS payment flows. The core delivery was replacing the automatic SAF+FIFO application (which applied credit without user consent) with an explicit "Usar saldo a favor" manual selection across all payment flows. Additionally, the change added schema traceability for SAF movements, currency-aware FIFO display, a per-currency vuelto breakdown, and resolved BRECHA-002 (loan overpayment routing).

**Verification result**: PASS — 30/30 spec scenarios (100%), 3 passes required.  
**TypeScript**: 0 new errors across all 9 changed files.  
**Delivery**: Single PR with size:exception approved (~460 lines changed).

---

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **SAF without auto-application** — explicit manual selection in all flows | Removes consent gap. Auto-apply was applying client credit to invoices the cashier did not intend |
| 2 | **`useSaldoAFavor` in `src/core/hooks/`** — shared between CxC and POS | Both `pago-factura-modal.tsx` and `cobro-modal.tsx` need the same SAF detection; cross-feature imports forbidden |
| 3 | **`saf_origen_refs` as TEXT JSON array** — human-readable refs (`"PAG-000123"`), not UUIDs | Matches what the UI already shows in payment history; avoids JOIN to resolve UUID labels |
| 4 | **Sync rules unchanged** — `SELECT *` auto-includes new column | No change to `powersync-sync-rules.yaml` needed; additive column is picked up automatically |
| 5 | **PRESTAMO panel: SAF + Vuelto only, no "Propina"** | "Propina" semantically inapplicable to loan payments; approved deviation from FACTURA panel pattern |
| 6 | **`pagos` INSERT inside `if (montoUsd > 0)`** — skip row when SAF covers 100% | Prevents inserting a zero-amount payment record; verified against SAF-full-coverage scenario |

---

## Approved Deviations

| Deviation | Approved |
|-----------|----------|
| `registrarPagoFactura` accepts `monto >= 0` (zero allowed when SAF covers all) | ✅ |
| SAF in `registrarAbonoGlobal` does FIFO distribution in same tx | ✅ |
| SAF in `cobro-modal` as checkbox + editable monto (not dropdown item) | ✅ |
| INSERT of `pagos` inside `if (montoUsd > 0)` | ✅ |
| Panel PRESTAMO: SAF + Vuelto only, no Propina option | ✅ |

---

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `migrations/0050_add_saf_origen_refs.sql` | Created | Additive migration: `ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT` |
| `src/core/db/powersync/schema.ts` | Modified | Added `saf_origen_refs: column.text` to `movimientos_cuenta` table definition |
| `src/core/hooks/use-saldo-a-favor.ts` | Created | Shared hook returning `{ disponible, tieneSaf }` — used by both CxC and POS |
| `src/features/cxc/hooks/use-cxc.ts` | Modified | Added SAF params to `PagoFacturaParams` + `AbonoGlobalParams`; new `registrarSafExcedente` + `registrarAbonoPrestamo` functions |
| `src/features/cxc/components/pago-factura-modal.tsx` | Modified | Removed auto-apply SAF+FIFO; added manual "Usar saldo a favor" section + PRESTAMO overpayment panel |
| `src/features/cxc/components/abono-global-modal.tsx` | Modified | Added manual SAF section; FIFO table now uses payment currency (inline ternary) |
| `src/features/cxc/components/factura-detalle-cxc.tsx` | Modified | Payment history: SAF rows show "Saldo a favor" badge + "Originado por: PAG-001" from parsed `saf_origen_refs` |
| `src/features/ventas/hooks/use-ventas.ts` | Modified | Added `SafEntry` interface + `safEntry?` param to `crearVenta` |
| `src/features/ventas/components/cobro-modal.tsx` | Modified | Added SAF as dynamic payment method + per-currency vuelto breakdown panel |

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/prestamos/spec.md` | Updated | Added REQ-005 (overpayment routing to SAF UI); removed BRECHA-002 from Known Open Items |

No new main spec was created. The CxC capabilities (CAP-1 through CAP-5) were change-level specs only — no pre-existing `openspec/specs/cxc/` domain exists.

---

## Post-Deploy Instructions

**MANDATORY before frontend deploy** — apply in Supabase Dashboard SQL Editor:

```sql
-- migrations/0050_add_saf_origen_refs.sql
ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT;
```

This migration is additive (nullable column, no backfill). Safe for live data in "Sabro Queso 2".  
Rollback if needed: `ALTER TABLE movimientos_cuenta DROP COLUMN saf_origen_refs;`

---

## Residual Technical Debt

| ID | Severity | Location | Description |
|----|----------|----------|-------------|
| S-1 | Suggestion | `use-cxc.ts` L1484-1503 | Legacy `aplicarSaldoFavor()` (used by `AplicarSafModal`) inserts `movimiento_cuenta tipo='SAF'` without `saf_origen_refs`. All new paths now populate it; legacy path remains as pre-existing gap. |
| S-2 | Suggestion | `abono-global-modal.tsx` L121 | `fifoPreview` recalculates on every render without `useMemo`. Low impact in practice (list is small). |

---

## SDD Cycle Summary

| Phase | Status | Model |
|-------|--------|-------|
| Proposal | ✅ Complete | anthropic/claude-sonnet-4-6 |
| Spec | ✅ Complete | anthropic/claude-sonnet-4-6 |
| Design | ✅ Complete | anthropic/claude-opus-4-6 |
| Tasks | ✅ Complete (8/8) | anthropic/claude-sonnet-4-6 |
| Apply | ✅ Complete (8 tasks + 2 fix passes) | anthropic/claude-sonnet-4-6 |
| Verify | ✅ PASS 30/30 (3 passes) | anthropic/claude-sonnet-4-6 |
| Archive | ✅ Complete | anthropic/claude-sonnet-4-6 |

The SDD cycle for `cxc-mejoras-pagos` is fully complete.
