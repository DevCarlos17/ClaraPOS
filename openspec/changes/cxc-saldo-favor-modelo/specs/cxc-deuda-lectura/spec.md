# CxC Deuda Lectura Specification

## Purpose

Defines how client debt and standing credit are computed and displayed across the CxC list, KPI cards, Reportes CxC, and the "Aplicar saldo a favor" modal. Debt and credit are separate, never-netted figures — always computed independently of `clientes.saldo_actual` (which remains a combined ledger used elsewhere; see `cxc-saldo-credito`).

## Requirements

### Requirement: Debt Total Computed From Pending Invoices, Never Netted Against Credit

The system MUST compute a client's CxC debt as `SUM(ventas.saldo_pend_usd WHERE saldo_pend_usd > 0.001)`. The system MUST NOT subtract any standing credit from this total, and MUST NOT use the netted `clientes.saldo_actual` field to determine whether a client appears in the CxC list.

#### Scenario: Two pending invoices, no credit

- GIVEN client X has invoice A with `saldo_pend_usd = 1.30` and invoice B with `saldo_pend_usd = 1.30`, and no standing credit
- WHEN the CxC list loads
- THEN client X's debt shown is $2.60 (sum of both invoices)
- AND client X appears in the CxC list

#### Scenario: Client with pending invoice must not disappear due to credit

- GIVEN client X has invoice A with `saldo_pend_usd = 1.30` pending, and a $0.70 standing credit
- WHEN the CxC list loads
- THEN debt shown is $1.30 and credit shown is $0.70, displayed as separate figures
- AND debt is NOT reduced to $0.60 (1.30 minus 0.70) anywhere in the display
- AND client X still appears in the CxC list (not excluded by a near-zero netted balance)

### Requirement: All CxC Debt/Credit Surfaces Use the Same Never-Netted Sources

CxC list, KPI cards, Reportes CxC (KPIs, top deudores, utilización de crédito), and the "Aplicar saldo a favor" modal's `creditoDisponible` MUST all read debt from the invoice-sum source and credit from the standing-credit source defined in `cxc-saldo-credito`. None of these surfaces MAY read `clientes.saldo_actual` to represent debt or applicable credit.

#### Scenario: Reportes CxC reflects invoice-sum debt

- GIVEN client X has $2.60 in pending invoices and a $0.70 standing credit
- WHEN Reportes CxC KPIs and "Top deudores" render
- THEN deuda_total for client X is $2.60, not a netted $1.90

#### Scenario: Aplicar-SAF modal shows trustworthy credit

- GIVEN client X has a $1.30 standing credit created by a prior "dejar saldo a favor" event
- WHEN the user opens "Aplicar saldo a favor" for client X
- THEN `creditoDisponible` shown is $1.30, sourced from the standing-credit source, not from `clientes.saldo_actual`
