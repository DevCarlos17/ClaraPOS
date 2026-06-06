# Design: CxC Mejoras de Pagos

_Change: cxc-mejoras-pagos | Date: 2026-06-06 | Model: anthropic/claude-opus-4-6_

---

## Technical Approach

Add manual SAF selection to CxC modals and POS checkout by: (1) extracting SAF detection into a shared hook, (2) extending `registrarPagoFactura`/`registrarAbonoGlobal`/`crearVenta` with optional SAF params that run atomically inside the existing `db.writeTransaction`, (3) adding `saf_origen_refs` column via additive migration, (4) converting FIFO display to respect payment currency, (5) adding vuelto per-currency breakdown.

## Architecture Decisions

| Decision | Choice | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Hook location | `src/core/hooks/use-saldo-a-favor.ts` | Inside `features/cxc/hooks/` | Used by both CxC and POS — shared core hook avoids cross-feature imports |
| SAF in transaction | Inline SAF steps inside existing `writeTransaction` of each function | Separate `aplicarSaldoFavor` call after main tx | Atomicity — SAF + payment must succeed or fail together. Existing separate `aplicarSaldoFavor` remains for the standalone `AplicarSafModal` |
| SAF origin refs source | Caller provides `safOrigenRefs` from UI context | Auto-query inside tx | Keep hook pure — modal already has access to client movements. Avoids expensive scan inside tx |
| POS SAF entry | New `safEntry` param on `CrearVentaParams` | Reuse `PagoEntry[]` with virtual metodo | SAF doesn't insert into `pagos` — it inserts `movimiento_cuenta`. Separate param avoids confusing the pagos loop |
| FIFO display | Inline ternary `moneda === 'BS' ? formatBs(x * tasa) : formatUsd(x)` | New `formatFifoMonto()` helper | Ternary is 1 line, helper adds indirection for 2 usages. Too simple for a helper — use inline |
| `saf_origen_refs` content | JSON array of movimiento_cuenta references (e.g. `["PAG-000001","SAF-ANTICIPO-000003"]`) | Store movimiento_cuenta UUIDs | Human-readable references match what the UI shows in payment history |

## Data Flow

```
PagoFacturaModal / AbonoGlobalModal / CobroModal
    │
    ├── useSaldoAFavor(clienteId) → { disponible, tieneSaf }
    │
    └── onSubmit()
         │
         └── db.writeTransaction()
              ├── 1. INSERT pago (monto - montoSaf) [if non-SAF amount > 0]
              ├── 2. INSERT movimiento_cuenta tipo='SAF' + saf_origen_refs [if SAF]
              ├── 3. UPDATE ventas.saldo_pend_usd -= (montoSaf + pagoUsd)
              ├── 4. UPDATE clientes.saldo_actual += montoSaf (consume credit)
              └── 5. banco + contabilidad [if applicable]
```

## Interfaces / Contracts

```typescript
// src/core/hooks/use-saldo-a-favor.ts
export interface SaldoAFavor {
  disponible: number   // Math.abs(saldo_actual) when < -0.001, else 0
  tieneSaf: boolean    // disponible > 0
}
export function useSaldoAFavor(clienteId: string | null): SaldoAFavor

// Extended PagoFacturaParams (use-cxc.ts)
export interface PagoFacturaParams {
  // ... all existing fields unchanged ...
  aplicarSaf?: boolean        // user opted to use SAF
  montoSaf?: number           // USD amount of SAF to apply
  safOrigenRefs?: string[]    // payment references that originated the credit
}

// Extended AbonoGlobalParams (use-cxc.ts)
export interface AbonoGlobalParams {
  // ... all existing fields unchanged ...
  aplicarSaf?: boolean
  montoSaf?: number
  safOrigenRefs?: string[]
}

// New SAF entry for POS (use-ventas.ts)
export interface SafEntry {
  clienteId: string
  montoUsd: number            // SAF amount to apply in USD
  safOrigenRefs?: string[]    // traceability refs
}

// Extended CrearVentaParams (use-ventas.ts)
export interface CrearVentaParams {
  // ... all existing fields unchanged ...
  safEntry?: SafEntry         // SAF as payment method
}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/0050_saf_origen_refs.sql` | Create | `ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT` |
| `src/core/db/powersync/schema.ts` | Modify | Add `saf_origen_refs: column.text` to `movimientos_cuenta` table (line ~551) |
| `backend/powersync-sync-rules.yaml` | No change | Uses `SELECT *` — new column auto-syncs |
| `src/core/hooks/use-saldo-a-favor.ts` | Create | Shared hook: queries `clientes` by id + `empresa_id`, returns `SaldoAFavor` |
| `src/features/cxc/hooks/use-cxc.ts` | Modify | Add SAF params to `PagoFacturaParams` and `AbonoGlobalParams`. Inside `aplicarPagoFacturaEnTx`: if `aplicarSaf`, INSERT movimiento_cuenta tipo='SAF' with `saf_origen_refs`, reduce effective payment. Same pattern in `registrarAbonoGlobal` |
| `src/features/cxc/components/pago-factura-modal.tsx` | Modify | Remove auto `aplicarSaldoFavor` call on FIFO sub-mode. Add "Usar saldo a favor" collapsible section gated by `useSaldoAFavor`. Pass SAF params to `registrarPagoFactura` |
| `src/features/cxc/components/abono-global-modal.tsx` | Modify | Add "Usar saldo a favor" section (same pattern). FIFO table: replace `formatUsd(p.aplicar)` with currency-aware inline ternary using `moneda`/`tasaEfectiva` already in scope |
| `src/features/ventas/hooks/use-ventas.ts` | Modify | Add `SafEntry` interface + `safEntry?` to `CrearVentaParams`. In `crearVenta`: if `safEntry`, INSERT movimiento_cuenta tipo='SAF' with `saf_origen_refs = [ventaId]`, reduce `saldoPend` by `safEntry.montoUsd`, UPDATE `clientes.saldo_actual` |
| `src/features/ventas/components/cobro-modal.tsx` | Modify | Add "Saldo a favor" option in payment methods (gated by `useSaldoAFavor`). Add collapsible vuelto per-currency breakdown panel |

## Transaction Strategy: SAF + Payment (atomic)

Inside `db.writeTransaction` for `registrarPagoFactura` with SAF:

1. Read `clientes.saldo_actual` → validate `saldo_actual < -0.001` and `montoSaf <= abs(saldo_actual)`
2. Read `ventas.saldo_pend_usd` → validate `montoSaf + montoUsd <= saldoPend + 0.01`
3. **If non-SAF payment > 0**: INSERT `pagos` + `movimientos_metodo_cobro` (existing logic, monto reduced by SAF)
4. **If SAF**: INSERT `movimientos_cuenta tipo='SAF'` with `saf_origen_refs`, referencia=`SAF-CXC-{nroFactura}`
5. UPDATE `ventas.saldo_pend_usd -= (montoSaf + pagoUsd)`
6. UPDATE `clientes.saldo_actual += montoSaf` (consume credit: -50 + 30 = -20)
7. Banco + contabilidad (only for non-SAF portion)

**Failure at any step** → entire transaction rolls back. No partial state.

**SAF > debt**: If `montoSaf >= saldoPend`, SAF covers everything. No `pagos` INSERT needed. Excess remains as credit (no saldo_actual change beyond what's consumed).

## Migration / Rollout

```sql
-- migrations/0050_saf_origen_refs.sql
ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT;
-- Nullable, no backfill. Existing rows get NULL.
-- Rollback: ALTER TABLE movimientos_cuenta DROP COLUMN saf_origen_refs;
```

Apply before frontend deploy. Additive, safe for "Sabro Queso 2" live data.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `useSaldoAFavor` returns correct values for positive, negative, zero saldo | Manual verification (no test infra) |
| Integration | SAF + payment atomicity in `registrarPagoFactura` | Manual: apply SAF, verify movimiento_cuenta, verify saldo_actual |
| E2E | Full flow: overpay → SAF credit → use SAF on next invoice | Manual walkthrough on dev |

> No test infrastructure exists. All verification is manual per project constraints.

## Open Questions

- [x] FIFO helper vs inline — resolved: inline ternary, too simple for helper
- [x] `saf_origen_refs` content format — resolved: JSON array of human-readable references
