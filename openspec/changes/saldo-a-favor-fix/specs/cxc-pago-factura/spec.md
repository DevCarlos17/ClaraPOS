# CxC Pago Factura Specification

## Purpose

Defines the behavior of `aplicarPagoFacturaEnTx` (`src/features/cxc/hooks/use-cxc.ts:334`), which applies a payment to a specific CxC invoice, updates the invoice's pending balance, and writes the client's `movimientos_cuenta` PAG row. First formal spec for this domain (no prior `openspec/specs/cxc-pago-factura/`).

## Requirements

### Requirement: Preserve negative (credit) saldoNuevo
When computing the client's new balance for the `PAG` `movimientos_cuenta` row, `aplicarPagoFacturaEnTx` MUST NOT clamp the result to a minimum of zero. If the client held a saldo a favor (negative `saldo_actual`) before the payment and the payment amount is smaller than the absolute value of that credit, the resulting negative balance MUST be preserved as-is.

#### Scenario: Pay invoice while holding SAF credit (adjacent bug)
- GIVEN cliente holds `saldo_actual = -$0.70` (saldo a favor) and an unrelated pending invoice
- WHEN `aplicarPagoFacturaEnTx` applies a payment to that invoice
- THEN the resulting `saldo_nuevo` written to `movimientos_cuenta` and `clientes.saldo_actual` is the true `saldo_actual - montoUsd` value, including negative results
- AND the value is NOT clamped to $0

#### Scenario: Pay invoice with no prior credit (regression guard)
- GIVEN cliente holds `saldo_actual >= $0` (no saldo a favor) before the payment
- WHEN `aplicarPagoFacturaEnTx` applies a payment
- THEN `saldo_nuevo` matches `saldo_actual - montoUsd` exactly, unchanged from current behavior (this case never triggered the clamp, since the payment being validated cannot exceed the invoice's `saldo_pend_usd`)

### Requirement: Invoice-level saldo_pend_usd floor unchanged
This change modifies ONLY the client-balance (`clientes.saldo_actual` / `movimientos_cuenta.saldo_nuevo`) computation. The invoice-level `ventas.saldo_pend_usd` floor-at-zero clamp (`Decimal.max(0, saldoFactura.minus(montoUsd))`) MUST remain unchanged — an invoice's pending balance MUST NOT go negative regardless of this fix.

#### Scenario: Invoice balance still floors at zero
- GIVEN an invoice with `saldo_pend_usd = $0.70` (validated so payment cannot exceed it)
- WHEN a payment of $0.70 is applied
- THEN `ventas.saldo_pend_usd` = $0, still clamped at the floor as before this change
