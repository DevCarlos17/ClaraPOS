# Tasks: CxC Saldo a Favor — Modelo Deuda/Crédito No Neteado

## Review Workload Forecast — Slice A (READ)

Estimated changed lines: ~260–340

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending — standalone PR
400-line budget risk: Medium

## Review Workload Forecast — Slice B (WRITE + APPLY + CREDIT-LIMIT)

Estimated changed lines: ~230–350

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending — sequential, rebase onto develop first
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | PR |
|---|---|---|
| 1 | Shared lib + Slice A reads — fixes disappearing-client bug | PR A, standalone |
| 2 | Migration 0090 + SAFC write path + gate/credit-limit resource | PR B, after PR A merges |

## Phase 0: Shared Foundation (TDD — ships with Slice A)

- [x] 0.1 RED: `src/features/cxc/lib/__tests__/deuda-credito-cliente.test.ts` — failing tests: creditoDisponible clamps at 0; disponibleCredito clamps at 0 AND doesn't increase with standing credit (regression).
- [x] 0.2 GREEN: `src/features/cxc/lib/deuda-credito-cliente.ts` — implement both pure functions (Decision 3: 2-arg signature, no credito term).

## Phase 1: Slice A — Never-Netted Debt/Credit Reads

- [x] 1.1 `src/features/cxc/hooks/use-cxc.ts` (~73–110) — useClientesConDeuda/useBuscarClientesDeuda: debt=SUM(ventas.saldo_pend_usd); credit=calcularCreditoDisponible(SUM SAFC, SUM SAF) subquery; drop saldo_actual filter.
- [x] 1.2 `src/features/reportes/hooks/use-cxc-reportes.ts` (useCxcKpis/useTopDeudores/useUtilizacionCredito) — same invoice-sum debt source, drop saldo_actual.
- [x] 1.3 `src/features/cxc/components/cxc-list.tsx` — KPI cards + rows from new debt/credit columns.
- [x] 1.4 `src/features/cxc/components/cxc-cliente-detalle.tsx` — safCxcValue + AbonoGlobalModal prop re-source.
- [x] 1.5 `src/features/cxc/components/aplicar-saf-modal.tsx` — creditoDisponible via calcularCreditoDisponible.
- [x] 1.6 `src/features/cxc/components/cxc-cliente-reporte.tsx` — header balance re-source.
- [x] 1.7 `manual-verify.md` (new) — Slice A: fresh test client, disappearing-client scenario, KPI/reportes parity.
- [x] 1.8 (discovered during apply, not originally listed) `src/features/cxc/components/cxc-reportes-general.tsx` — print reports for the CxC list re-source debt from `deuda_usd`; same "All CxC Debt/Credit Surfaces" spec requirement, this component receives the exact same `ClienteConDeuda[]` as `cxc-list.tsx`.

## Phase 2: Slice B — Migration + SAFC Write Path

- [x] 2.1 Branch already based on develop@892a3d1 (includes 0088/0089); no rebase needed, 0090 was the next free number.
- [x] 2.2 `migrations/0090_add_safc_tipo_movimientos_cuenta.sql` — widen movimientos_cuenta_tipo_check, add 'SAFC' (follows 0057 pattern).
- [x] 2.3 `use-ventas.ts` (~987–1029) — Paso B "dejar saldo a favor" writes tipo='SAFC' not 'PAG'.
- [x] 2.4 `use-cxc.ts` registrarSafExcedente (~1872–1914) — writes tipo='SAFC'.
- [x] 2.5 `use-cxc.ts` aplicarSaldoFavor (~1558–1660) — gate re-source: credit from SUM(SAFC)-SUM(SAF), not saldo_actual.
- [x] 2.6 `use-cxc.ts` registrarPagoFactura inline SAF branch (~590–658) — same gate re-source (same bug, same file).

## Phase 3: Slice B — Credit-Limit Re-Source (limite − deudaFacturas, no SAF term)

- [x] 3.1 `src/core/hooks/use-saldo-a-favor.ts` — disponible via calcularCreditoDisponible(SUM SAFC, SUM SAF), replacing saldo_actual logic.
- [x] 3.2 NEW `src/features/cxc/hooks/use-deuda-cliente.ts` — useDeudaFacturasCliente (single) + useDeudaFacturasClientes (batch IN) for POS deudaFacturas; does NOT touch `use-clientes.ts` (Clientes module untouched); consumed by 3.3–3.5.
- [x] 3.3 `cliente-selector.tsx` (~106–149, ~178–181) — disponible = calcularDisponibleCredito(limite, deudaFacturas); "Saldo" label changed to "Deuda" (never-netted) for consistency.
- [x] 3.4 `pos-terminal.tsx` (~729–736) — same corrected formula for credit badge.
- [x] 3.5 `cobro-modal.tsx` (~349–362) — credit-limit gate uses corrected formula only, no SAF term.
- [x] 3.6 `manual-verify.md` — Slice B: SAFC trigger check (fresh client, POS Paso B + registrarSafExcedente CxC overpayment path), credit-limit-not-inflated-by-SAF regression, FIFO apply scenario.
