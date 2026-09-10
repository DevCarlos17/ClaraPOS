# pos-cobro-pendiente-exacto Specification

## Purpose

The POS success screen (`venta-exitosa-modal.tsx`) MUST display the "Pendiente" balance (USD and Bs) using the exact Decimal chain already computed in `cobro-modal.tsx`, never a value re-derived through an intermediate float rounding step. This enforces rule #10 (round only at the end of the chain; `precision_calc=8` internal, `precision_view=2` display).

## Requirements

### Requirement: Pendiente Bs equals the exact source Decimal, not a re-derivation

The success screen's "Pendiente" (Bs) row MUST equal `totalEfectivoBs.plus(igtfBs).minus(totalPagadoBs)` — the same all-Decimal value already computed in `cobro-modal.tsx` (`pendienteBs4`) — passed through `onSuccess(...)` into `VentaExitosaData` and consumed directly. The success screen MUST NOT recompute the pending amount from `pagos`/`totalUsd`/`tasa` using `Number(...)`/`.toFixed(2)` float arithmetic.

#### Scenario: Fully-unpaid credit sale

- GIVEN a credit sale with `totalUsd = 5.41`, `tasa = 500`, zero payments applied
- WHEN the success screen renders
- THEN "Total" shows Bs 2.704,00
- AND "Pendiente" ALSO shows Bs 2.704,00 (not Bs 2.705,00)

#### Scenario: Partially-paid credit sale

- GIVEN a credit sale with `totalEfectivoBs = 2704.00`, one payment of Bs 1000,00 applied
- WHEN the success screen renders
- THEN "Pendiente" shows the exact remainder `totalEfectivoBs - totalPagadoBs` = Bs 1.704,00
- AND the value is NOT derived by rounding a USD intermediate to 2 decimals before reconverting to Bs

#### Scenario: Contado (fully paid) sale

- GIVEN a sale fully paid at checkout (`pendienteBs4` ≤ Bs 0,01 in absolute value)
- WHEN the success screen renders
- THEN no "Pendiente" row is shown

#### Scenario: No intermediate float rounding

- GIVEN any credit or partial-credit sale
- WHEN the pending amount is computed for display
- THEN the computation chain uses Decimal values only from `cobro-modal.tsx` through to render
- AND no step converts to a 2-decimal-rounded USD `number` before a subsequent Bs multiplication or subtraction

### Requirement: Pendiente USD aligns with the same source of truth

The success screen's "Pendiente" (USD) row MUST be derived from the same exact pending-balance source as the Bs row (e.g. `bsToUsd(pendienteBs4, tasaUsada)` or an equivalently exact USD Decimal passed through the same payload field), not from a separately re-derived `data.totalUsd - totalAbonadoUsd` float reduction.

#### Scenario: USD pending matches Bs pending at the current rate

- GIVEN a credit sale with `pendienteBs4` exact and `tasaUsada` the rate captured at sale time
- WHEN the success screen renders both "Pendiente" rows
- THEN the displayed USD pending amount, reconverted at `tasaUsada`, is consistent with the displayed Bs pending amount within `precision_view=2` rounding only at final display
