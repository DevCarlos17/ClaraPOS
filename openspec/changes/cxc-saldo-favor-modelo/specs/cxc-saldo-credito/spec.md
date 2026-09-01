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

### Requirement (CONDITIONAL — NEEDS DESIGN RESOLUTION): POS Credit-Limit Behavior When Standing Credit Exists

**STATUS: OPEN.** Whether the POS credit-limit "disponible" gate (`cobro-modal.tsx` enforcement, formula `limite_credito_usd - saldo_actual`) reflects a client's standing credit is a DESIGN DECISION, not a fixed behavior of this spec. Design MUST choose and document exactly ONE mechanism before implementation:

- **Guard-rail**: block/redirect "dejar saldo a favor" when the client has unrelated existing debt on `saldo_actual`, keeping `saldo_actual` writes and credit-limit behavior identical to today.
- **Structural**: stop standing-credit creation from touching `clientes.saldo_actual` entirely, which changes what `disponible` represents and requires a new formula.

#### Scenario: Guard-rail path (IF chosen by design)

- GIVEN client X has unrelated existing debt reflected in `saldo_actual`
- WHEN the cajero attempts "dejar saldo a favor"
- THEN the system blocks or redirects the action, and `saldo_actual`/credit-limit `disponible` behave exactly as before this change

#### Scenario: Structural path (IF chosen by design)

- GIVEN client X leaves a $0.70 standing credit under the structural model
- WHEN credit-limit `disponible` is computed at POS
- THEN `disponible` does NOT increase from this credit event (a documented, visible behavior change from today), and design MUST specify the exact new formula

This requirement MUST be resolved explicitly in `sdd-design`, not left implicit.
