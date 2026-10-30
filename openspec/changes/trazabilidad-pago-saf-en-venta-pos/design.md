# Design: Trazabilidad Pago SAF en Venta POS

## Technical Approach

Mirror the `bridgeEntries[]` fan-in already proven in `registrarAbonoGlobal` (`use-cxc.ts:1116-1502`). `aplicarPagoFacturaEnTx` stops being a silent `void` helper and returns the `pagoId`/`montoUsd` it just created. Paso 7c (`use-ventas.ts`, SAF branch) collects one bridge entry per FIFO-to-old-invoice pago **and** the remainder/anticipo pago into a function-scoped array keyed to the single leg (`pagoSaf`) funding the SAF discrepancy. Paso 8 flushes that array into `movimientos_bancarios_pagos` against that leg's `movBancoId`, additive to the existing `correlacion` row for the same leg. No new tables, no new detection logic — `previewFacturasAfectadas` and `reversarAbonoDirectoDesdeTesoreria` already consume this table correctly.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Return shape | `aplicarPagoFacturaEnTx`: `void` → `Promise<{pagoId, montoUsd: Decimal}>` | Re-query created pagos by discriminator | No reliable correlator (`venta_id` points to the OLD invoice); inline capture matches existing CxC convention |
| Correlation key | `pagoSafIndex = pagos.indexOf(pagoSaf)`, computed once, reused in Paso 8 | Re-derive `pagoSaf` inside Paso 8's loop | A second independent `.find()` could resolve to a different leg under mixed-method edge cases; one index threaded through removes that risk |
| Duplication | Keep delegating to shared `aplicarPagoFacturaEnTx` | Inline-duplicate FIFO SQL in `use-ventas.ts` | Avoids duplicating ~70 lines of financial-critical logic; flagged as worst risk/reward in exploration |

## Data Flow — Paso 7c → Paso 8 fan-in

```
Paso 7c (discrepancy.mode === 'SAF')
  pagoSafIndex = pagos.indexOf(pagoSaf)        // computed ONCE, function scope
  safFifoBridgeEntries: Array<{pagoId, montoUsd}> = []

  Paso A — for each inv in invoiceAssignments (montoUsd > 0.001):
    { pagoId, montoUsd } = await aplicarPagoFacturaEnTx(tx, {...isPosAllocation:true,
                                                            skipBankAndAccounting:true}, now)
    safFifoBridgeEntries.push({ pagoId, montoUsd })   // montoUsd = Decimal returned by the fn,
                                                       // NOT re-derived from inv.montoUsd

  Paso B — if remainingSaf > 0.001:
    pagoExcedenteIdSaf = uuidv4(); INSERT pagos (venta_id=NULL) ...
    safFifoBridgeEntries.push({ pagoId: pagoExcedenteIdSaf, montoUsd: remainingSaf })

Paso 8 — for (const [i, pago] of pagos.entries()):
  ... existing movBancoId creation, existing `correlacion` bridge row ...
  if (i === pagoSafIndex) {
    for (const entry of safFifoBridgeEntries) {
      INSERT INTO movimientos_bancarios_pagos (ingreso_id: movBancoId, pago_id: entry.pagoId,
                                                monto_aplicado_usd: toStorageString(entry.montoUsd))
    }
  }
```

`pagoSafIndex` is the single correlation key. If `pagoSaf` is not deposito-directo, Paso 8 never creates a `movBancoId` for that leg — `safFifoBridgeEntries` stays unflushed, same pre-existing residual limitation as any other leg (out of scope, not expanded).

## Monto aplicado precision

Both entries read full-precision `Decimal` values, never masked display strings: Paso A's `montoUsd` comes from `aplicarPagoFacturaEnTx`'s own capped computation (`Decimal.min` against `saldoFactura`, same guard CxC's FIFO loop uses); Paso B's is `remainingSaf` (already a `Decimal`). `toStorageString()` is applied only at the INSERT boundary, mirroring `registrarAbonoGlobal`.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/cxc/hooks/use-cxc.ts` | Modify | L500-504 return type → `{pagoId, montoUsd}`; `return` added at function end (L779) |
| `src/features/ventas/hooks/use-ventas.ts` | Modify | L1150 capture `pagoSafIndex`; L1143-1313 hoist `safFifoBridgeEntries[]`; L1716-1813 flush when `i === pagoSafIndex` |
| `src/features/ventas/hooks/__tests__/use-ventas.test.ts` | Modify | Extend `VentaTxFixtures` with `ventasPendientes` map (old-invoice rows) — required so `aplicarPagoFacturaEnTx`'s real FIFO path resolves instead of throwing `Factura no encontrada`; add cases below |
| `src/features/cxc/hooks/__tests__/use-cxc.test.ts` | Modify | Shape assertion on new return value in existing bridge describe block (~L1492) |

## Interfaces / Contracts

```typescript
export async function aplicarPagoFacturaEnTx(
  tx: Transaction, params: AplicarPagoEnTxParams, now: string
): Promise<{ pagoId: string; montoUsd: Decimal }>   // was: Promise<void>
```
Both existing call sites (`registrarPagoFactura` L927, `crearVenta` Paso A L1168) already `await` without destructuring — purely additive, zero compile breakage.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (`use-cxc.test.ts`) | New return shape | RED: destructure `pagoId`/`montoUsd` on an existing call |
| Integration (`use-ventas.test.ts`) | FIFO-only surplus → 1 bridge row/old invoice | RED: real `montoUsd > 0.001`, `ventasPendientes` fixture |
| Integration | Remainder-only surplus → 1 bridge row for anticipo | RED: `remainingSaf > 0.001`, empty `invoiceAssignments` |
| Integration | Combined FIFO+remainder → N+1 rows, same `ingreso_id` | RED: both paths active at once |
| Integration | Mixed methods + SAF → rows attach to `pagoSafIndex`'s leg, not another | RED: 2 legs, `pagoSaf`=leg 1 (BS), assert `ingreso_id` |
| Regression | Both suites stay green | `yarn test:run` |
| Types | New return type compiles at both call sites | `yarn type-check` |

## Migration / Rollout

No migration required. Additive wiring only — `pagos`, `saf_creditos_lotes`, `movimientos_cuenta` writes unchanged.

**Rollback**: revert the wiring commit. The return-type change and the two new bridge-insert blocks sit entirely on top of pre-existing, unmodified writes; reverting simply stops populating `movimientos_bancarios_pagos` for the SAF path — no data loss, no breaking change at either call site.

## Open Questions

None.
