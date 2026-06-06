# Spec: cxc-mejoras-pagos

_Change: cxc-mejoras-pagos | Date: 2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## CAP-1: cxc-saf-manual — SAF Manual en CxC

> **Type**: New capability  
> **Affects**: `pago-factura-modal.tsx`, `abono-global-modal.tsx`, `use-cxc.ts`

### Requirement: Manual SAF Selection in CxC Payment Modals

`PagoFacturaModal` and `AbonoGlobalModal` MUST display a "Usar saldo a favor" section if and only if `cliente.saldo_actual < -0.001`. The `SAF+FIFO` auto-application sub-mode MUST be removed from `PagoFacturaModal`. When the user enables the SAF section, the selected SAF amount SHALL reduce the required payment amount. All SAF applications MUST record a `movimiento_cuenta tipo='SAF'` with `saf_origen_refs` populated.

#### Scenario: SAF section absent — client without credit

- GIVEN a client with `saldo_actual >= -0.001`
- WHEN `PagoFacturaModal` or `AbonoGlobalModal` opens
- THEN the "Usar saldo a favor" section is not rendered

#### Scenario: SAF section visible — client has credit

- GIVEN a client with `saldo_actual = -50.00`
- WHEN `PagoFacturaModal` opens
- THEN a section "Usar saldo a favor (disponible: $50.00)" is rendered

#### Scenario: SAF applied reduces required payment

- GIVEN a client with SAF $30 and an invoice with `saldo_pend_usd = $100`
- WHEN the user selects to apply $30 from SAF
- THEN the required payment amount updates to $70 and a `movimiento_cuenta tipo='SAF'` is recorded with non-null `saf_origen_refs`

#### Scenario: SAF exceeds debt — full coverage, excess preserved

- GIVEN a client with SAF $120 and an invoice with `saldo_pend_usd = $100`
- WHEN the user applies SAF to cover the full invoice
- THEN the invoice is marked paid and the $20 excess remains as SAF credit for future invoices

#### Scenario: SAF partial — remainder via payment method

- GIVEN a client with SAF $30 and an invoice with `saldo_pend_usd = $100`
- WHEN the user applies $30 SAF and selects a payment method for $70
- THEN both the SAF movement and the payment movement are recorded atomically via `db.writeTransaction()`

#### Scenario: Payment history shows SAF origin refs

- GIVEN a `movimiento_cuenta` with `tipo = 'SAF'` and `saf_origen_refs = '["PAG-001"]'`
- WHEN the CxC payment history renders that record
- THEN the row shows label "Saldo a favor" and text "Originado por: PAG-001"

---

## CAP-2: pos-saf-metodo-cobro — SAF como Método de Cobro en POS

> **Type**: New capability  
> **Affects**: `cobro-modal.tsx`, `use-ventas.ts`

### Requirement: Conditional SAF Payment Option in CobroModal

`CobroModal` MUST include "Saldo a favor" as a selectable payment method if and only if a client is assigned to the sale AND `cliente.saldo_actual < -0.001`. The available SAF amount SHALL pre-load as the method amount, editable up to the available maximum. On checkout the system MUST insert a `movimiento_cuenta tipo='SAF'` with `saf_origen_refs = [venta_id]`. Overpayment without SAF selection MUST continue increasing `saldo_actual` (preserved behavior).

#### Scenario: No client — SAF option absent

- GIVEN a sale with no client assigned
- WHEN `CobroModal` renders the payment method list
- THEN "Saldo a favor" is not shown

#### Scenario: Client without SAF — option absent

- GIVEN a client with `saldo_actual = 0`
- WHEN `CobroModal` renders the payment method list
- THEN "Saldo a favor" is not shown

#### Scenario: Client with SAF — option visible

- GIVEN a client with `saldo_actual = -80.00`
- WHEN `CobroModal` renders the payment method list
- THEN an option "Saldo a favor ($80.00 disponible)" is rendered

#### Scenario: SAF selected — amount pre-loaded

- GIVEN a client with SAF $80 and a sale total of $60
- WHEN the cashier selects "Saldo a favor"
- THEN the amount field pre-loads $60 (capped at invoice total, not at SAF balance)

#### Scenario: SAF combined with another method

- GIVEN a client with SAF $30 and a sale total of $100
- WHEN the cashier enters SAF $30 plus Efectivo $70
- THEN the total equals $100 and the sale can be confirmed

#### Scenario: SAF exact — movement recorded

- GIVEN a client selects SAF to cover the exact sale total
- WHEN the cashier confirms the sale
- THEN a `movimiento_cuenta tipo='SAF'` is inserted with `saf_origen_refs = [venta.id]`

#### Scenario: Overpayment without SAF preserves existing behavior

- GIVEN a client pays more than the sale total without selecting SAF
- WHEN the sale is confirmed
- THEN the excess increases `cliente.saldo_actual` as before (no regression)

---

## CAP-3: fifo-moneda-display — FIFO Preview en Moneda del Abono

> **Type**: New capability  
> **Affects**: `abono-global-modal.tsx`

### Requirement: Currency-aware FIFO Distribution Table

`AbonoGlobalModal` MUST display FIFO distribution amounts in the currency of the selected payment method. When `moneda = 'BS'`, amounts MUST be converted using `tasaEfectiva` (already in component scope). Internal FIFO calculation SHALL remain in USD. Display conversion is presentation-only and MUST NOT affect stored values.

#### Scenario: USD method — amounts in USD

- GIVEN a USD payment method is selected in `AbonoGlobalModal`
- WHEN the FIFO distribution table renders
- THEN all amount cells display `$X.XX` format

#### Scenario: Bs method — amounts converted

- GIVEN a Bs payment method is selected
- WHEN the FIFO distribution table renders
- THEN all amount cells display `BsX.XX` (each `p.aplicar` multiplied by `tasaEfectiva`)

#### Scenario: No method selected — default USD

- GIVEN no payment method is selected
- WHEN the FIFO distribution table renders
- THEN amounts display in USD as default

#### Scenario: Method change — table recalculates in real time

- GIVEN a USD method is active showing USD amounts
- WHEN the user switches to a Bs method
- THEN the table immediately recalculates and shows Bs amounts

#### Scenario: Footer total matches selected currency

- GIVEN a Bs method is selected
- WHEN the table footer renders
- THEN the total row shows "Total abonado: BsX.XX"

#### Scenario: Stored values remain in USD

- GIVEN a Bs method is selected and FIFO distributes across multiple invoices
- WHEN the abono is submitted
- THEN `movimiento_cuenta.monto_usd` values are stored in USD regardless of display currency

---

## CAP-4: vuelto-calculadora — Vuelto con Desglose por Moneda

> **Type**: New capability  
> **Affects**: `cobro-modal.tsx`

### Requirement: Per-currency Change Breakdown in CobroModal

When overpayment occurs, `CobroModal` MUST render a per-currency vuelto breakdown before confirming. The existing `movimientos_metodo_cobro tipo='EGRESO' origen='VUELTO'` insertion MUST be preserved unchanged.

#### Scenario: Exact payment — no breakdown shown

- GIVEN the tendered amount equals the sale total exactly
- WHEN the payment section renders
- THEN no vuelto calculator section is displayed

#### Scenario: Vuelto in a single currency

- GIVEN overpayment in a single-currency method (USD or Bs only)
- WHEN the vuelto section renders
- THEN it shows "Vuelto: $X.XX" or "Vuelto: BsX.XX" according to the method

#### Scenario: Vuelto across mixed currencies

- GIVEN overpayment spread across USD and Bs methods
- WHEN the vuelto section renders
- THEN it shows a two-row breakdown: "USD: $X.XX | Bs: BsX.XX"

#### Scenario: EGRESO record preserved after UX change

- GIVEN any vuelto scenario
- WHEN the cashier confirms the payment
- THEN a `movimientos_metodo_cobro tipo='EGRESO' origen='VUELTO'` record is inserted as before

---

## CAP-5: cxc-saf-origen-refs — Migración y Trazabilidad SAF

> **Type**: New capability  
> **Affects**: `schema.ts`, `powersync-sync-rules.yaml`, `migrations/`

### Requirement: saf_origen_refs Column in movimientos_cuenta

The database MUST add column `saf_origen_refs TEXT NULL` to `movimientos_cuenta` via an additive SQL migration. `src/core/db/powersync/schema.ts` and `powersync-sync-rules.yaml` MUST be updated to include the new column. The migration MUST NOT backfill existing rows.

#### Scenario: Existing rows unaffected

- GIVEN `movimientos_cuenta` rows created before the migration
- WHEN the migration runs
- THEN all existing rows have `saf_origen_refs = NULL` with no data loss

#### Scenario: New SAF movement includes refs

- GIVEN a SAF application is recorded via any CAP-1 or CAP-2 flow
- WHEN the `movimiento_cuenta` is inserted
- THEN `saf_origen_refs` contains a JSON array string with at least one origin reference

#### Scenario: Multiple origin payments

- GIVEN SAF accumulated from 3 separate overpayments (PAG-001, PAG-002, PAG-003)
- WHEN SAF is applied
- THEN `saf_origen_refs = '["PAG-001","PAG-002","PAG-003"]'`

#### Scenario: History displays parsed origins

- GIVEN a `movimiento_cuenta` with `saf_origen_refs = '["PAG-001","PAG-003"]'`
- WHEN the payment history renders that row
- THEN it shows "Originado por: PAG-001, PAG-003"

#### Scenario: Column included in PowerSync sync

- GIVEN the `empresa[]` bucket definition in `powersync-sync-rules.yaml`
- WHEN `movimientos_cuenta` rows sync
- THEN `saf_origen_refs` is included in the synced column list

---

## MODIFIED: prestamos — BRECHA-002 Resolution

> **Domain**: `openspec/specs/prestamos/spec.md`  
> **Action**: Add REQ-005; remove BRECHA-002 from Known Open Items

### Requirement: REQ-005 — Overpayment in PagoFacturaModal Routes to SAF UI (ADDED)

When a loan payment via `PagoFacturaModal` results in overpayment, the excess MUST be offered via the manual "Usar saldo a favor" section defined in CAP-1. The system MUST NOT automatically distribute the excess to other invoices or loans.

#### Scenario: Loan overpayment — manual SAF section offered

- GIVEN a loan with `saldo_pendiente_usd = $50` and the user enters $80
- WHEN `PagoFacturaModal` processes the payment
- THEN the $30 excess is offered via "Usar saldo a favor" (not auto-applied to other loans)

#### Scenario: Cashier declines SAF — excess credited

- GIVEN a loan overpayment of $30
- WHEN the cashier does not enable the SAF option
- THEN the $30 increases `cliente.saldo_actual` as new SAF credit

---

## Constraints

| Constraint | Rule |
|-----------|------|
| TypeScript | No `any`; no `as` without justification |
| Multi-tenant | All queries MUST filter by `empresa_id` |
| Atomicity | Financial operations MUST use `db.writeTransaction()` |
| UI language | Solo español en todos los textos |
| Currency storage | Internal values MUST remain in USD; Bs display is presentation-only |
| Migration safety | `ALTER TABLE` MUST be additive; no backfill required for "Sabro Queso 2" |
| SAF condition | `saldo_actual < -0.001` is the sole gate for all SAF UI visibility |
