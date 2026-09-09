# Proposal: POS Cobro Flow — Typography, Layout, Decimal Correctness & Checkout Guards

## Intent

Six user-reported issues on the POS checkout path: 2 UX friction, 1 financial-display bug (rule #10 violation, float mid-chain rounding), 3 checkout-gate guards against half-entered payments. Additive/corrective only — no new capability, no schema change.

## Scope

### In Scope

**Cosmetic (UI-only)**
- R1: Grow USD total font, `pos-terminal.tsx` desktop panel — stays smaller/muted, below Bs total.
- R2: `producto-buscador.tsx` dropdown full-width on mobile (`<768px`), unchanged on desktop, via `matchMedia` in the existing `useLayoutEffect`.

**Financial correctness (display-only)**
- R3: `venta-exitosa-modal.tsx` "Pendiente" recomputes via float `.toFixed(2)` before reconverting to Bs. Fix: thread exact `pendienteBs4` Decimal from `cobro-modal.tsx` through `onSuccess(...)`; consume, don't recompute. `currency.ts`/`crearVenta` untouched.

**Checkout gate guards (`cobro-modal.tsx`, additive only)**
- R4: Remove auto-select `discrepancyMode = 'CREDITO'` on open with balance. Keep `DIFERENCIAL_FALTANTE` sub-cent auto-suggestion.
- R5: Block Procesar + all 6 mode selectors (buttons + F5/F6/F7) while `montoStr`/`referencia` is uncommitted. Warn cashier; glow "+".
- R6: Block processing when `metodoId` is selected with no amount. Alert cashier.

### Out of Scope

- `currency.ts`, `crearVenta(...)` write path — R3 is display-only.
- `DIFERENCIAL_FALTANTE` auto-select; mobile bottom bar/Sheet totals (R1 pattern, deferred).
- Splitting into two changes — kept as one; ~70-115 lines, within 400-line budget.

## Capabilities

### New Capabilities
- `pos-cobro-checkout-guards`: R4+R5+R6 — gate MUST NOT pre-select credit-sale default; MUST block on uncommitted payment or amount-less method.
- `pos-cobro-pendiente-exacto`: R3 — "Pendiente" MUST equal the exact Decimal chain used for "Total" minus payments, never a rounded-midpoint re-derivation.

### Modified Capabilities
None. R1/R2 are UI-only; no existing spec covers this.

## Approach

Contained edits. R3 threads one Decimal field through an existing payload. R4 deletes one `useEffect` branch. R5/R6 share one pre-submit guard plus a glow state.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `pos-terminal.tsx` | Modified | R1 typography |
| `producto-buscador.tsx` | Modified | R2 `matchMedia` branch |
| `cobro-modal.tsx` | Modified | R3 payload, R4 removal, R5/R6 guard+glow |
| `venta-exitosa-modal.tsx` | Modified | R3 consume `pendienteBs4` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| R3 touches sale write | Low | `crearVenta` runs before `onSuccess`; payload-only |
| R5/R6 miss an entry point (8 total) | Medium | Shared guard fn; QA checklist per path |

## Rollback Plan

4 files, no DB/schema/migration. `git revert`; no data backfill needed.

## Dependencies

None.

## Success Criteria

- [ ] R1/R2: USD total grows (muted/below Bs); dropdown full-width mobile, matches search bar on desktop.
- [ ] R3: "Pendiente" = `totalEfectivoBs + igtfBs - totalPagadoBs` (Bs 2.704 case fixed).
- [ ] R4: `discrepancyMode` unset on open; sub-cent auto-select still fires.
- [ ] R5/R6: uncommitted entry/amount-less method blocks processing; "+" glows.
