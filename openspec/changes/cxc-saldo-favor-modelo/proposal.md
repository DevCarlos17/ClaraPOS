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
- Trigger `actualizar_saldo_cliente()` / `saldo_actual` semantics (still drives credit-limit).
- "Aplicar a facturas" FIFO, "Dar vuelto", "Propina" — already correct.
- Historical repair of `movimientos_cuenta` (immutable); V00000001 is test noise, use a fresh client.
- Building `notas-credito` itself — only its credit foundation.

## Capabilities

### New Capabilities
- `cxc-saldo-credito`: client standing credit tracked independently of netted `saldo_actual` — source of truth for debt/credit display and credit-creation.

### Modified Capabilities
None.

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

## Risks

- Third partial fix here → structural/root-cause, not another patch.
- Credit-limit coupling breaks → `saldo_actual` semantics untouched.
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
- [ ] `saldo_actual`/trigger/credit-limit calc unchanged
