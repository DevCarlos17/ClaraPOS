# Design: CxC Saldo a Favor Model

## Technical Approach

Debt and credit become two independently-derived reads, never netted. Debt = `SUM(ventas.saldo_pend_usd)` (already the correct source, per `cxc-cliente-detalle.tsx`'s existing workaround). Credit = a new SQL derivation over `movimientos_cuenta`, keyed by a **new `tipo` value** that finally lets the ledger distinguish credit-creation from credit-consumption — resolving the proposal's "touch no invoice debt" vs "don't change `saldo_actual` semantics" tension by relabeling, not restructuring.

## Decision 1 — Credit tracking: derived-on-read (firm)

**Choice**: no new column/table. `creditoDisponibleUsd(cliente) = MAX(0, SUM(monto WHERE tipo='SAFC') - SUM(monto WHERE tipo='SAF'))`, scoped by `cliente_id + empresa_id`. Both `monto` values are always positive (`CHECK monto > 0`), so this is a plain conditional SUM — no delta/sign inspection needed.
**Rejected**: dedicated column/ledger — reintroduces exactly the "another field to keep in sync" bug class this change fixes.
**Known limitation**: pre-existing rows where old code wrote `tipo='SAF'` for creation are miscounted as consumption. Accepted per proposal's "no historical repair" non-goal (V00000001 is test noise; validate with a fresh client). Formula clamps at 0, so it degrades to "credit unknown → $0", never a wrong negative.

## Decision 2 — New tipo `SAFC` (SAF Creación); trigger unchanged

`SAFC` = pure credit creation (today: Paso B mislabels it `PAG`; `registrarSafExcedente` mislabels it `SAF`). `SAF` is redefined as **exclusively** consumption/application (`aplicarSaldoFavor`'s existing semantics — no change there).

**Trigger impact: none.** Since `migrations/0088` (`fix/saldo-a-favor-trigger`, merged in `develop`), the trigger already trusts app-supplied `saldo_nuevo` for any tipo it doesn't recognize (same fallback REV/SAL/SAF use). `saldo_nuevo`/`saldo_anterior` are `NOT NULL`, so the app must always supply them — meaning `SAFC` rows compute `saldo_nuevo = saldo_anterior - monto`, **bit-identical** to what the buggy `PAG` write does today. Only the CHECK constraint needs widening. This is the key reconciliation: `saldo_actual`'s value and the trigger's logic are **not touched at all** — only the row's `tipo` label changes, which is what unlocks correct derivation.

## Decision 3 — Credit-limit: re-source from invoice debt, standing credit NEVER folded in (✅ user-approved, corrects prior draft)

**Choice**: `disponible = MAX(0, limiteCreditoUsd - deudaFacturasUsd)`. Standing credit (saldo a favor) is **not a term in this formula, ever**. Replaces `limite - saldo_actual` in `cobro-modal.tsx:350-361` (enforcement), `pos-terminal.tsx:729-736`, `cliente-selector.tsx:106-149,178-181` (display). `creditoDisponibleUsd` (Decision 1) is read and shown **separately**, never netted into `disponible`.
**Rejected (prior draft of this design)**: `disponible = MAX(0, limite - deuda + credito)`. User-identified financial-control hole: folding standing credit into the limit lets it *enlarge* how much a client can be invoiced on credit (e.g. limit 800 + SAF 200 → a 1000 credit invoice would pass, exceeding the actual limit). A misregistered excess payment would silently become fake credit capacity.
**Rationale (matches Odoo's model)**: the credit limit measures **exposure** — how much debt the business tolerates — and is not netted by prepayments. The limit and the standing credit act at different moments: the limit gates **authorization** (how much a client can come to *owe*); standing credit reduces **collection** (how much a client *does* owe) only once explicitly applied to an invoice. Standing credit helps a client *fit within* the limit by being applied, never by *enlarging* the limit itself.
**Flow example**: invoice 1000, limite 800, SAF 200 → cannot go straight to credit (1000 > 800). User applies the SAF 200 first → 800 pending remain, which fits the limit exactly. If limite were 700 instead, the client must abonar more — the SAF alone still doesn't clear it.
**Consult contract**: any client consult (POS `cliente-selector.tsx`, CxC `cxc-cliente-detalle.tsx`/`cxc-list.tsx`) must show **three independent, never-netted** numbers: **Crédito disponible** (`limite - deudaFacturas`), **Deuda acumulada** (`SUM ventas.saldo_pend_usd`), **Saldo a favor** (`creditoDisponibleUsd`, Decision 1).
**Why not guard-rail**: blocking "dejar" when unrelated debt exists is unnecessary — `saldo_actual`'s value doesn't change (Decision 2), so there's no netting-at-write-time to guard against anymore.
**Why not structural**: doesn't touch `saldo_actual`/trigger; keeps proposal's stated non-goal literally true.
**Behavior**: **strictly more conservative** than today's `limite - saldo_actual` (never over-extends credit) — this is a correctness fix (debt sourced from invoices instead of a netted, drift-prone `saldo_actual`), not a new user-visible risk. A client at `deuda == limite` with nonzero standing credit still shows `disponible = 0`; standing credit never extends the limit.

## Decision 4 — Slices (independently shippable)

| Slice | Scope | Ships alone? |
|---|---|---|
| **A — Read** | `use-cxc.ts` (`useClientesConDeuda`/`useBuscarClientesDeuda` → invoice-sum debt + derived credit), `cxc-list.tsx` KPIs, `cxc-cliente-detalle.tsx` (`safCxcValue`, `AbonoGlobalModal` prop), `aplicar-saf-modal.tsx` (`creditoDisponible`), `use-cxc-reportes.ts` (3 hooks), `cxc-cliente-reporte.tsx` header | **Yes** — fixes the disappearing-client bug immediately (debt no longer netted). Credit column safely shows $0 until Slice B ships `SAFC` (clamped, never wrong-negative). |
| **B — Write + Apply + Credit-limit** | `migrations/0090_add_safc_tipo_movimientos_cuenta.sql`, `use-ventas.ts` Paso B (`PAG`→`SAFC`), `use-cxc.ts` `registrarSafExcedente` (`SAF`→`SAFC`) + `aplicarSaldoFavor` gate re-source, `use-saldo-a-favor.ts`, `cobro-modal.tsx`/`pos-terminal.tsx`/`cliente-selector.tsx` disponible formula | Depends on A's derivation lib (shared, built once in A). |

Recommend shipping B shortly after A — A alone leaves credit under-reported.

## Decision 5 — Shared pure functions + tests

`src/features/cxc/lib/deuda-credito-cliente.ts`:
- `calcularCreditoDisponible(totalCreadoUsd, totalConsumidoUsd): Decimal` → `Decimal.max(0, creado.minus(consumido))` — unchanged; feeds the **separate** saldo-a-favor display, never the credit-limit calc.
- `calcularDisponibleCredito(limiteCreditoUsd, deudaFacturasUsd): Decimal` → `Decimal.max(0, limite.minus(deuda))` — **signature reduced from 3 args to 2**; the `creditoDisponibleUsd` param is dropped entirely, not just zeroed, so a future caller cannot accidentally re-fold it in.

Mirrors the `saldo-cliente.ts` pattern from `saldo-a-favor-fix`. Tests (`__tests__/deuda-credito-cliente.test.ts`): create-only, create+full-consume→0, partial-consume, defensive clamp (consume>create→0, not negative), disponible with debt-only (matches legacy value), disponible floor at 0, **disponible does NOT increase when standing credit is nonzero (regression test for the rejected formula)**, **disponible stays 0 when `deuda == limite` even with nonzero standing credit (credit never extends the limit)**. SQL aggregates (`use-cxc.ts`, `use-cxc-reportes.ts`) stay integration-only, cross-referenced in comments; manual-verify checklist covers CxC list end-to-end, POS credit-limit gate (confirm applying SAF before invoicing is required to fit the limit, per Decision 3's flow example), Aplicar-SAF flow on a fresh client.

## Decision 6 — Out-of-plan surfaces

| Surface | Verdict | Why |
|---|---|---|
| `use-saldo-a-favor.ts` (POS SAF button gate) | **IN** | Same enforcement family as Decision 3; leaving it on `saldo_actual` reintroduces the corrupted gate at the SAF button. |
| Clientes module (`cliente-list.tsx`, `-detalle.tsx`, `-form.tsx`) | **OUT** | Informational display; deactivation guard (`saldo_actual != 0`) still validly detects "any open ledger entry" even unsplit. Follow-up relabel, not required for correctness. |
| `ventas-consultas-modal.tsx:202` | **OUT** | Informational, non-enforcement, outside CxC/POS domain. |
| `cxc-cliente-reporte.tsx:139` | **IN** | Same screen family as `cxc-cliente-detalle.tsx`; already has the data as props once Slice A lands. |

## Migration

**Required**: `migrations/0090_add_safc_tipo_movimientos_cuenta.sql` — widen `movimientos_cuenta_tipo_check` to include `SAFC`. No trigger function change (Decision 2). Next free number confirmed 0090: this checkout's disk shows 0087 highest, but `origin/develop` already merged PR #65 (`0088_fix_saf_trigger_sign.sql`, `0089_repair_saldo_actual_saf.sql`) — branch must rebase before adding 0090.

## Open Questions

- [x] **User sign-off on Decision 3**: resolved 2026-09-01 — user rejected the `+ creditoDisponibleUsd` term (financial-control hole); corrected to `disponible = MAX(0, limite - deudaFacturas)`, standing credit shown separately, never netted. See rationale above.
- [ ] Confirm Decision 6's OUT surfaces are acceptable to defer (no financial enforcement depends on them).
