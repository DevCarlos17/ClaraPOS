# Tasks: CxC/CxP Mobile Responsive — Phase 2

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~675-975 total (S1 shared card ~130-180, S2 CxC ~185-285, S3a CxP facturas+Volver ~240-330, S3b CxP gastos ~120-180) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (guard-recommended; in tension with session-fixed single-PR strategy — see note) |
| Suggested split | 4 commits on one branch: S1 shared card → S2 CxC → S3a CxP facturas+Volver → S3b CxP gastos |
| Delivery strategy | ask-always |
| Chain strategy | single branch `feat/cxc-cxp-mobile-responsive` (from `develop`), separate commits, ONE PR to `develop` — fixed by session context |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

**Note (tension flag)**: the ~800+ line total estimate clearly exceeds the 400-line reviewer budget for a single PR. Session context already fixed the delivery as one branch / one PR, so this is recorded as a `size-exception` per the guard, not silently accepted. Recommend the reviewer explicitly confirm the exception before apply, or reconsider splitting into 2 PRs (PR1: shared card + CxC, PR2: CxP facturas + gastos) if review load becomes a real blocker.

### Suggested Work Units (commits, single branch)

| Unit | Goal | Commit | Notes |
|---|---|---|---|
| 1 | Shared `deuda-card.tsx` + tests | commit 1 | No screen wiring yet |
| 2 | CxC master-detail + row→card + toolbar wrap | commit 2 | Uses `DeudaCard` from Unit 1 |
| 3a | CxP master-detail + Volver + facturas row→card | commit 3 | New Volver control (none exists today) |
| 3b | CxP gastos row→card | commit 4 | Same file as 3a, split commit for reviewability |

## Phase 1: Shared Card (RED → GREEN → REFACTOR)

- [x] 1.1 RED: write `src/components/shared/__tests__/deuda-card.test.tsx` — assert numero/fecha/tipo badge/total/pendiente/equivBs?/accion render from props, and `onAccion` fires with the row id
- [x] 1.2 GREEN: create `src/components/shared/deuda-card.tsx` — pure presentational, normalized props, no CxC/CxP domain types
- [x] 1.3 REFACTOR: confirm no `any`, named export, matches project card styling (rounded-2xl, shadow, tabular-nums)

## Phase 2: CxC Mobile (RED → GREEN)

- [ ] 2.1 RED in `cxc-list.test.tsx`: list wrapper `hidden md:flex` when `clienteSeleccionado` set, `flex md:flex` when null
- [ ] 2.2 RED in `cxc-cliente-detalle.test.tsx`: table has `hidden md:block`; `md:hidden` card list renders one `DeudaCard` per row; tapping a card's accion calls the same handler as the row click; toolbar wraps for phone width
- [ ] 2.3 RED: existing close "X" still resets `clienteSeleccionado` to `null` (Volver contract — no new handler needed)
- [ ] 2.4 GREEN: edit `cxc-list.tsx` wrapper classes only (no new state)
- [ ] 2.5 GREEN: edit `cxc-cliente-detalle.tsx` — wrap table, add `DeudaCard` list mapped from `facturasSorted`, wrap toolbar
- [ ] 2.6 Run `yarn test:run -- cxc`, confirm all green, no regressions

## Phase 3: CxP Mobile — Master-detail + Volver + Facturas (RED → GREEN)

- [ ] 3.1 RED in `cxp-page.test.tsx`: left panel `hidden md:flex` / detail `flex md:flex` per `proveedorSeleccionado`
- [ ] 3.2 RED: new Volver button renders `md:hidden` inside `DetallePanel`; tapping it resets `proveedorSeleccionado` to `null`
- [ ] 3.3 RED: facturas `<table>` `hidden md:block` + `md:hidden` card list via `DeudaCard`; Pagar fires `onPagar` with correct factura
- [ ] 3.4 GREEN: edit `cxp-page.tsx` wrapper classes; add `onVolver` to `DetallePanelProps` + Volver button; convert facturas table
- [ ] 3.5 Run `yarn test:run -- cxp`, confirm green

## Phase 4: CxP Mobile — Gastos row→card (RED → GREEN)

- [ ] 4.1 RED: gastos `<table>` `hidden md:block` + `md:hidden` card list; `onPagarGasto` fires with correct gasto
- [ ] 4.2 GREEN: convert gastos table using `DeudaCard`
- [ ] 4.3 Run full `yarn test:run`, confirm no regressions across CxC/CxP suites

## Phase 5: Verification & Manual QA Gate

- [ ] 5.1 `yarn type-check` clean, no new `any`
- [ ] 5.2 Grep confirms no `use-mobile` import introduced (dead hook, rejected pattern)
- [ ] 5.3 Confirm `empresa_id` filtering untouched in `use-cxc.ts`/`use-cxp.ts` (no diff there)
- [ ] 5.4 Document MANUAL PHONE QA as pending: real-device check of list↔detail switching, card readability, Volver, full-width — jsdom cannot verify CSS visibility, this is the honest gate before merge
