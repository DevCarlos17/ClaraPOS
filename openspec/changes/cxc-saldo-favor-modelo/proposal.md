# Proposal: Separate Client Debt and Credit (CxC Saldo a Favor Model)

## Intent

`clientes.saldo_actual` nets client DEBT and CREDIT into ONE trigger field — a pure standing credit can't exist without offsetting whatever unrelated invoice debt already sits there.
- **Write**: "dejar saldo a favor" (`use-ventas.ts:987-1050`) and `registrarSafExcedente` (`use-cxc.ts:1856-1914`) subtract from shared `saldo_actual`, netting against unrelated invoices' debt without touching their `saldo_pend_usd` (confirmed 1.30 vs 2.60 divergence).
- **Read**: CxC list, KPIs, Reportes CxC, and Aplicar-SAF's `creditoDisponible` read the same netted field — clients with live debt vanish, and the fully-built "Aplicar saldo a favor" flow (`use-cxc.ts:1558-1660`) never works because its input is corrupted.

Also the foundation `notas-credito` needs — credit notes generate client credits constantly and must rest on correct debt/credit separation, not this bug.

## Scope

### In Scope
- **Slice A (read)**: debt = `SUM(ventas.saldo_pend_usd WHERE pending)`; credit = independent, never-netted source. Applies to CxC list/KPIs, Reportes CxC, `aplicar-saf-modal.tsx` `creditoDisponible`.
- **Slice B (write)**: "dejar saldo a favor" + `registrarSafExcedente` create pure credit touching no invoice's debt; "Aplicar saldo a favor" repointed to the trustworthy source.
- Design picks the mechanism (derived aggregation vs. dedicated tracking) — open question from exploration.

### Out of Scope
- Trigger `actualizar_saldo_cliente()` internals (INSERT-time recalculation of `saldo_actual` for FAC/PAG/NCR/etc.) — untouched.
- **RESOLVED by design.md Decision 3 (corrected, user-approved — see `openspec/changes/cxc-saldo-favor-modelo/design.md`):** the POS credit-limit gate was originally going to stay `limite_credito_usd - saldo_actual` (netted, unchanged). That formula was rejected during design review as a financial-control hole — it would let standing credit enlarge how much a client can be invoiced on credit. The credit-limit gate is now **structurally re-sourced** to `disponible = MAX(0, limite_credito_usd - deudaFacturasUsd)`, where `deudaFacturasUsd = SUM(ventas.saldo_pend_usd)` (never-netted, same source as Slice A debt reads). Standing credit (SAF) is **never** a term in this formula — it only reduces debt once explicitly applied to an invoice via "Aplicar saldo a favor." This is strictly more conservative than the old netted formula (never over-extends credit), so it is a correctness fix, not a new risk. See "Modified Capabilities" below.
- "Aplicar a facturas" FIFO, "Dar vuelto", "Propina" — already correct.
- Historical repair of `movimientos_cuenta` (immutable); V00000001 is test noise, use a fresh client.
- Building `notas-credito` itself — only its credit foundation.

## Capabilities

### New Capabilities
- `cxc-saldo-credito`: client standing credit tracked independently of netted `saldo_actual` — source of truth for debt/credit display and credit-creation.

### Modified Capabilities
- POS credit-limit enforcement gate (`cobro-modal.tsx`, `pos-terminal.tsx`, `cliente-selector.tsx`): re-sourced from `limite_credito_usd - saldo_actual` (netted) to `limite_credito_usd - deudaFacturasUsd` (never-netted, standing credit excluded). See design.md Decision 3 (RESOLVED).

## Affected Areas

| Area | Change |
|------|--------|
| `use-ventas.ts:987-1050` | pure credit |
| `use-cxc.ts:1856-1914` | `registrarSafExcedente` → pure credit |
| `use-cxc.ts:1558-1660` | `aplicarSaldoFavor` → new source |
| `use-cxc.ts:77-109` | list/search → invoice-sum debt |
| `cxc-list.tsx:92-97` | KPIs, separate debt/credit |
| `aplicar-saf-modal.tsx:34` | `creditoDisponible` → new source |
| `use-cxc-reportes.ts` | KPIs/deudores/utilización |
| `use-deuda-cliente.ts` (new) | `useDeudaFacturasCliente`/`useDeudaFacturasClientes` — dedicated `SUM(ventas.saldo_pend_usd)` source for the POS credit-limit gate |
| `deuda-credito-cliente.ts` | `calcularDisponibleCredito(limite, deuda)` — pure, 2-arg, SAF never a term (Decision 3 RESOLVED) |
| `cobro-modal.tsx` / `pos-terminal.tsx` / `cliente-selector.tsx` | credit-limit gate/display re-sourced to `limite - deudaFacturas` |

## Risks

- Third partial fix here → structural/root-cause, not another patch.
- Credit-limit coupling breaks → mitigated by design: the gate was deliberately RE-SOURCED away from `saldo_actual` to `limite - deudaFacturas` (Decision 3, RESOLVED), which is strictly more conservative than the old netted formula — it can only ever be equal-or-lower, never grant more credit than before.
- Immutable ledger blocks repair → none attempted.
- New source diverges from `saldo_actual` → design defines reconciliation invariant.

## Rollback Plan

Additive/query-level changes — revert commits; any new column/table must be nullable.

## Dependencies

- Design resolves derived vs. dedicated credit tracking.
- `notas-credito` (future) depends on this foundation.

## Success Criteria

- [ ] CxC list/KPIs/Reportes never show debt reduced by unrelated credit
- [ ] "Dejar saldo a favor" creates credit without altering any invoice's `saldo_pend_usd`
- [ ] "Aplicar saldo a favor" works end-to-end on a fresh client
- [ ] Trigger `actualizar_saldo_cliente()` internals unchanged; credit-limit `disponible` is re-sourced to `MAX(0, limite_credito_usd - deudaFacturasUsd)` — standing credit (SAF) is never a term (Decision 3, RESOLVED — see design.md)
