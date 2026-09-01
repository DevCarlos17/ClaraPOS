# Manual Verify: POS checkout con saldo a favor (SAF)

Not machine-verified by `calcular-cierre-venta-saf.test.ts` (pure math only) — this covers `crearVenta()` tx wiring, the derived-credit gate, and cuadre exclusion. Requires a live/dev app instance (PowerSync + Supabase), a fresh test client, tasa Bs 500. Migration 0090 (`SAFC`/`SAF` movimiento types) is already in `develop` — no migration needed for this change.

## Setup

1. Create a test client (empresa de prueba) with `saldo_actual = 0`.
2. Give it $2.00 standing credit: insert a `movimientos_cuenta` row `tipo='SAFC'`, `monto=2.00` for that client (or via whatever UI flow currently grants SAF).
3. Confirm the POS cobro-modal SAF checkbox shows `$2.00` disponible before each scenario, and re-top-up/reset between scenarios as needed.

## Scenario 1 — Full coverage (CONTADO, no CxC)

1. Reset client credit to $2.00. Start a sale, total $1.30.
2. Apply SAF $1.30 (fully covers the sale). Submit.
3. **Expect**: invoice `tipo='CONTADO'`, `saldo_pend_usd=0`, does NOT appear in CxC / cuentas por cobrar for this client.
4. **Expect**: client SAF credit becomes $0.70 (derived `SUM(SAFC)-SUM(SAF)`).
5. **Expect**: a `movimientos_cuenta` row `tipo='SAF'`, `monto=1.30`, `venta_id` = this sale's id.

## Scenario 2 — Partial SAF + cash (CONTADO)

1. Reset client credit to $0.50. Start a sale, total $1.30.
2. Apply SAF $0.50 + pay $0.80 cash. Submit.
3. **Expect**: `tipo='CONTADO'`, `saldo_pend_usd=0`, not in CxC.
4. **Expect**: client SAF credit becomes $0.00.
5. **Expect**: cash payment of $0.80 recorded normally (`pagos` row).

## Scenario 3 — Partial SAF + rest on credit (CREDITO, regression)

1. Reset client credit to $0.50. Start a sale, total $1.30.
2. Apply SAF $0.50 and leave the remainder on credit (do not add cash).
3. **Expect**: `tipo='CREDITO'`.
4. **Expect**: CxC shows `saldo_pend_usd = 0.80` — **NOT $1.30**. This is the exact regression the fix addresses.
5. **Expect**: a `movimientos_cuenta` row `tipo='SAF'`, `monto=0.50`, `venta_id` = this sale — visible as an abono against the invoice.
6. **Expect**: client SAF credit becomes $0.00.

## Scenario 4 — Cap when requested exceeds available

1. Reset client credit to $0.50. Start a sale where the UI would otherwise allow requesting more (simulate a stale/race value if the input doesn't block it, e.g. via direct API call) — request SAF $0.80.
2. **Expect**: applied SAF is capped at $0.50 (never negative credit).
3. **Expect**: a non-blocking `toast.warning` appears post-sale (cobro-modal, Work Unit 3) informing the cajero that the available credit changed and the available amount was applied instead.
4. **Expect**: the sale still completes successfully.

## Scenario 5 — Cierre de caja excludes SAF from cash totals

1. Run a sale with SAF $0.50 applied + $0.80 cash paid (same as Scenario 2).
2. Open the current caja session's cuadre / rendimiento report.
3. **Expect**: only the $0.80 cash payment counts toward cash totals for that session.
4. **Expect**: the SAF portion ($0.50) is excluded from cash totals — no `pagos` row is created for SAF, so cuadre math is unaffected.

## Sign-off

| Scenario | Result | Notes |
|----------|--------|-------|
| 1. Full coverage | ⬜ Pass / ⬜ Fail | |
| 2. Partial + cash | ⬜ Pass / ⬜ Fail | |
| 3. Partial + credit (regression) | ⬜ Pass / ⬜ Fail | |
| 4. Cap + toast | ⬜ Pass / ⬜ Fail | |
| 5. Cuadre exclusion | ⬜ Pass / ⬜ Fail | |
