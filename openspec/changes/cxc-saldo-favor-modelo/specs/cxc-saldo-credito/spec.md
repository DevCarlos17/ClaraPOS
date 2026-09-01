# CxC Saldo a Favor (Standing Credit) Specification

## Purpose

Defines an independently-tracked, never-netted standing credit source for clients. Standing credit is created when a client leaves excess payment at POS ("dejar saldo a favor") and is consumed only when explicitly applied to invoices via "Aplicar saldo a favor." It MUST NOT be created or consumed by silently netting against unrelated invoice debt.

## Requirements

### Requirement: Standing Credit Creation Touches No Invoice's Debt

When a POS overpayment is routed to "dejar saldo a favor" (DIRECTO), the system MUST create a standing credit for the client equal to the excess amount, and MUST NOT reduce `saldo_pend_usd` on any invoice, including invoices unrelated to the current sale.

#### Scenario: Leave saldo a favor as pure standing credit

- GIVEN client X has a pending invoice A with `saldo_pend_usd = 1.30`
- WHEN client X overpays a new sale by $0.70 and the cajero selects "dejar saldo a favor"
- THEN client X's standing credit becomes $0.70
- AND invoice A's `saldo_pend_usd` remains $1.30, unchanged

#### Scenario: Unaffected routes remain unchanged

- GIVEN a POS overpayment of $0.70
- WHEN the cajero selects "aplicar a facturas" (FIFO) instead of "dejar saldo a favor"
- THEN the applicable invoice(s) `saldo_pend_usd` are reduced by up to $0.70, exactly as today
- AND "dar vuelto" and "propina" routes continue writing only to `movimientos_metodo_cobro`, untouched by this change

### Requirement: Standing Credit Application Consumes User-Selected Invoices From a Trustworthy Source

"Aplicar saldo a favor" MUST read available credit from the standing-credit source (not `clientes.saldo_actual`), MUST let the user select which pending invoice(s) to apply it to, and MUST reduce each selected invoice's `saldo_pend_usd` by the applied amount while reducing standing credit by the same total.

#### Scenario: Apply standing credit to a selected invoice

- GIVEN client X has invoice A (`saldo_pend_usd = 1.30`) and invoice B (`saldo_pend_usd = 1.30`), total debt $2.60, and a $1.30 standing credit
- WHEN the user opens "Aplicar saldo a favor," selects invoice A, and applies $1.30
- THEN invoice A's `saldo_pend_usd` becomes $0
- AND invoice B's `saldo_pend_usd` remains $1.30, unchanged
- AND client X's standing credit becomes $0
- AND debt shown for client X becomes $1.30

#### Scenario: Partial/FIFO application across multiple invoices

- GIVEN client X has invoice A ($1.30), invoice B ($1.30), and a $2.00 standing credit
- WHEN the user applies FIFO automatically
- THEN invoice A is reduced to $0 first, then invoice B is reduced by the remaining $0.70 to $0.60
- AND standing credit becomes $0

### Requirement: Existing Cash and CxC Flows Remain Unaffected

Vueltos, "abonos" (`registrarAbonoGlobal`, `registrarPagoFactura`, `aplicarPagoFacturaEnTx`, `registrarAbonoPrestamo`), and cuadre de caja outputs MUST remain unchanged, since none of them read `saldo_actual` as a debt signal — they compute from invoices, `movimientos_metodo_cobro`, and cash directly. `movimientos_cuenta` MUST remain immutable; this change MUST NOT perform any historical repair of existing rows. All reads and writes MUST remain scoped by `empresa_id`.

#### Scenario: Vueltos and abonos unchanged

- GIVEN the standing-credit model is implemented
- WHEN a cajero gives vuelto, or registers an abono against a specific invoice or globally
- THEN the resulting `movimientos_metodo_cobro` / `movimientos_cuenta` / invoice updates are identical to pre-change behavior

#### Scenario: No historical repair

- GIVEN a test client's ledger has pre-existing netting corruption from earlier bugs
- WHEN this change ships
- THEN no existing `movimientos_cuenta` row is edited or deleted
- AND validation uses a freshly-created test client instead of the corrupted one

### Requirement: POS Credit-Limit Gate Never Includes Standing Credit as a Term

**STATUS: RESOLVED** (design.md Decision 3, corrected and user-approved — see `openspec/changes/cxc-saldo-favor-modelo/design.md` and the binding business rule captured alongside it). The original guard-rail-vs-structural fork from exploration is resolved in favor of the **structural** path, with the originally-proposed additive formula (`limite - deuda + creditoSAF`) explicitly REJECTED: it was found to be a financial-control hole, allowing standing credit to enlarge how much a client can be invoiced on credit (e.g. limit 800 + SAF 200 would incorrectly authorize a 1000 credit invoice), and would turn a misregistered excess payment into fake credit capacity.

The POS credit-limit "disponible" gate (`cobro-modal.tsx` enforcement, `pos-terminal.tsx`/`cliente-selector.tsx` display) is re-sourced to:

```
disponible = MAX(0, limite_credito_usd - deudaFacturasUsd)
```

where `deudaFacturasUsd = SUM(ventas.saldo_pend_usd)` for that client's pending invoices (the same never-netted debt source as Slice A). Standing credit (`creditoDisponibleUsd`, the `SUM(SAFC) - SUM(SAF)` source) is **NEVER** a term in this formula — it is computed and displayed separately. This mirrors the Odoo credit-limit model: the limit measures EXPOSURE (how much a client is authorized to come to owe), not netted by prepayments; standing credit only reduces COLLECTION (how much they currently owe) once explicitly applied to an invoice via "Aplicar saldo a favor."

This is strictly MORE CONSERVATIVE than the pre-change `limite - saldo_actual` (netted) formula — it can only ever authorize equal-or-less credit than before, never more. It is a correctness fix, not a new financial risk.

Any client-facing consult (POS `cliente-selector.tsx`, CxC `cxc-cliente-detalle.tsx`/`cxc-list.tsx`) MUST show three independent, never-netted numbers: **Crédito disponible** (`limite - deudaFacturas`), **Deuda acumulada** (`SUM` pending invoices), **Saldo a favor** (`creditoDisponibleUsd`).

#### Scenario: Credit-limit does not grow when standing credit exists

- GIVEN client X has `limite_credito_usd = 800`, pending invoice debt `deudaFacturasUsd = 600`, and a $200 standing credit (SAF)
- WHEN credit-limit `disponible` is computed at POS
- THEN `disponible = MAX(0, 800 - 600) = 200` — the $200 standing credit is NOT added, so `disponible` is NOT `400`

#### Scenario: Standing credit must be applied to an invoice before it helps authorize new credit

- GIVEN client X wants to buy a $1000 item on credit, has `limite_credito_usd = 800`, `deudaFacturasUsd = 0`, and a $200 standing credit
- WHEN the cajero attempts to route the $1000 directly to credit
- THEN the system rejects it (`disponible = MAX(0, 800 - 0) = 800 < 1000`)
- WHEN the user first applies the $200 standing credit to reduce the pending amount to $800
- THEN the remaining $800 fits within `disponible` and the credit sale is authorized

#### Scenario: Disponible stays at 0 when debt equals the limit, regardless of standing credit

- GIVEN client X has `limite_credito_usd = 800`, `deudaFacturasUsd = 800`, and any nonzero standing credit
- WHEN credit-limit `disponible` is computed
- THEN `disponible = 0` — the standing credit never "unlocks" additional credit-limit room
