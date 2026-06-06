# Spec: Prestamos — Abono via PagoFacturaModal

> **Domain**: prestamos (cross-cutting: `features/ventas` + `features/cxc`)
> **Last updated by change**: `cxc-mejoras-pagos` (2026-06-06) — added REQ-005, resolved BRECHA-002

---

## Requirements

### REQ-001: "Abonar" Button in PrestamoDetalleModal

`PrestamoDetalleModal` MUST render an "Abonar" button in its footer if and only if
`prestamo.status === 'PENDIENTE'` AND `saldo_pendiente_usd > 0.005`. Clicking the button
MUST open `PagoFacturaModal` with `defaultDestino = 'PRESTAMO'` and the current
`prestamo` passed as `vencimientoInicial`. No inline payment form MUST exist inside
`PrestamoDetalleModal`.

#### Scenario: Button visible for pending loan

- GIVEN a loan record with `status = 'PENDIENTE'` and `saldo_pendiente_usd > 0.005`
- WHEN PrestamoDetalleModal opens
- THEN the "Abonar" button is visible in the modal footer
- AND no inline `FormAbonoPrestamo` or "Registrar Abono" section is rendered

#### Scenario: Button absent for paid loan

- GIVEN a loan record with `status = 'PAGADO'`
- WHEN PrestamoDetalleModal opens
- THEN no "Abonar" button is rendered in the footer

#### Scenario: PagoFacturaModal opens on PRESTAMO destination

- GIVEN a PENDIENTE loan and the user clicks "Abonar"
- WHEN `PagoFacturaModal` mounts
- THEN `destino` initializes to `'PRESTAMO'`
- AND the specific cuota is pre-selected in the loan selector

---

### REQ-002: PagoFacturaModal Optional Loan Entry-Point Props

`PagoFacturaModal` MUST accept two new optional props:
`defaultDestino?: 'FACTURA' | 'PRESTAMO'` and `vencimientoInicial?: VencimientoPrestamo`.

| Condition | Behavior |
|-----------|----------|
| `defaultDestino` provided | Initial `destino` state MUST equal the supplied value |
| `vencimientoInicial` provided | Initial `vencimientoId` MUST equal `vencimientoInicial.id` |
| `factura` is null AND `defaultDestino = 'PRESTAMO'` | FACTURA destination selector MUST be hidden |
| Neither new prop provided | Behavior MUST be identical to pre-change implementation |

#### Scenario: Opens in PRESTAMO mode with pre-selected cuota

- GIVEN `defaultDestino = 'PRESTAMO'` and `vencimientoInicial` set to a valid cuota
- WHEN `PagoFacturaModal` mounts
- THEN `destino` initializes to `'PRESTAMO'` and `vencimientoId` equals `vencimientoInicial.id`

#### Scenario: No invoice — FACTURA selector hidden

- GIVEN `factura = null` and `defaultDestino = 'PRESTAMO'`
- WHEN `PagoFacturaModal` renders
- THEN the FACTURA destination button/option is not shown
- AND the user can complete a cuota payment without error

#### Scenario: Backward compatibility

- GIVEN an existing CxC caller passing only legacy props
- WHEN `PagoFacturaModal` renders
- THEN behavior is identical to the pre-change implementation

---

### REQ-004: PrestamosPage Query Reactivity

`PrestamosPage` MUST display updated `saldo_pendiente_usd` and `status` values
after a payment without manual query invalidation. The `useQuery` hook from
`@powersync/react` provides automatic reactivity over `vencimientos_cobrar` —
no additional refetch logic is required.

#### Scenario: Table row reflects payment automatically

- GIVEN a PENDIENTE loan row displayed in `PrestamosPage`
- WHEN a payment is recorded via `PagoFacturaModal`
- THEN `saldo_pendiente_usd` and `status` update in the table row automatically
- AND no manual `refetch` or query invalidation call is made in `PrestamosPage`

---

### REQ-005: Overpayment in PagoFacturaModal Routes to SAF UI

> **Added by change**: `cxc-mejoras-pagos` (2026-06-06)

When a loan payment via `PagoFacturaModal` results in overpayment, the excess MUST be
offered via the manual "Usar saldo a favor" section defined in CAP-1 of `cxc-mejoras-pagos`.
The system MUST NOT automatically distribute the excess to other invoices or loans.

#### Scenario: Loan overpayment — manual SAF section offered

- GIVEN a loan with `saldo_pendiente_usd = $50` and the user enters $80
- WHEN `PagoFacturaModal` processes the payment
- THEN the $30 excess is offered via "Usar saldo a favor" (not auto-applied to other loans)

#### Scenario: Cashier declines SAF — excess credited

- GIVEN a loan overpayment of $30
- WHEN the cashier does not enable the SAF option
- THEN the $30 increases `cliente.saldo_actual` as new SAF credit

---

## Known Open Items

| ID | Description |
|----|-------------|
| BRECHA-003 | `movimientos_cuenta` entry for loan payments — not implemented |
| BRECHA-004 | Atomicity in `AbonoGlobalModal` — not implemented |
| BRECHA-007 | Standalone loan egress for BANCO/EFECTIVO_EMPRESA origins — not implemented |
