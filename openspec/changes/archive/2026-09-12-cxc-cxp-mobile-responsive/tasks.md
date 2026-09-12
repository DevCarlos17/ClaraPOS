# Tasks: CxC/CxP Mobile Responsive — Phase 2 (as shipped)

## Post-implementation note (added in `sdd-archive`, 2026-09-12)

The design planned below (master-detail hide/show + a new "Volver" control for CxP)
was superseded mid-flight, before merge, by an explicit user decision: keep the
list always visible and use a shadcn `Dialog` modal for the mobile detail, plus
client-side pagination (`PAGE_SIZE=12`) instead of the originally-planned layout
switch. CxP reused Radix Dialog's default close "X" — no bespoke Volver control
was built. The task checklist below is corrected to describe what actually
shipped (see `verify-report-fase2.md` and `verify-report-pra.md` for the
adversarial verification that confirmed this). The pagination introduced here
was later REMOVED by the separate change `cxc-cxp-scroll-altura` (PR #109) in
favor of a full scrollable list — see that change's spec/verify-report for the
current final behavior.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~675-975 total (S1 shared card ~130-180, S2 CxC ~185-285, S3a CxP facturas ~240-330, S3b CxP gastos ~120-180) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (guard-recommended; in tension with session-fixed single-PR strategy — see note) |
| Suggested split | 4 commits on one branch: S1 shared card → S2 CxC → S3a CxP facturas → S3b CxP gastos |
| Delivery strategy | ask-always |
| Chain strategy | single branch `feat/cxc-cxp-mobile-responsive` (from `develop`), separate commits, ONE PR to `develop` — fixed by session context |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

**Note (tension flag)**: the ~800+ line total estimate clearly exceeds the 400-line reviewer budget for a single PR. Session context already fixed the delivery as one branch / one PR, so this is recorded as a `size-exception` per the guard, not silently accepted.

### Actual Work Units (commits, single branch)

| Unit | Goal | Commit | Notes |
|---|---|---|---|
| 1 | Shared `deuda-card.tsx` + tests | `99152c0` | No screen wiring yet |
| 2 (superseded) | CxC master-detail attempt | `f6187f0` | SUPERSEDED same session — replaced by Unit 3 before merge |
| 3 | CxC rework: modal + pagination + row→card | `72bfcd1` | Final CxC design: list always visible, Dialog modal, PAGE_SIZE=12 |
| 4 | CxP: modal + pagination + facturas row→card | `4d33840` | Same pattern as Unit 3, built directly (no master-detail attempt) |
| 5 | CxP gastos row→card | `238ceb9` | Same file as Unit 4, split commit for reviewability |

## Phase 1: Shared Card (RED → GREEN → REFACTOR)

- [x] 1.1 RED: write `src/components/shared/__tests__/deuda-card.test.tsx` — assert numero/fecha/tipo badge/total/pendiente/equivBs?/accion render from props, and `onAccion` fires with the row id
- [x] 1.2 GREEN: create `src/components/shared/deuda-card.tsx` — pure presentational, normalized props, no CxC/CxP domain types
- [x] 1.3 REFACTOR: confirm no `any`, named export, matches project card styling (rounded-2xl, shadow, tabular-nums)

## Phase 2: CxC Mobile (shipped as modal + pagination, not master-detail)

- [x] 2.1 RED/GREEN in `cxc-list.test.tsx`: list panel wrapper stays visible (never `hidden`) regardless of `clienteSeleccionado`; `PAGE_SIZE=12` pagination (Anterior/Siguiente) added over the filtered list; KPIs computed from the full unsliced array
- [x] 2.2 RED/GREEN in `cxc-cliente-detalle.test.tsx`: table has `hidden md:block`; `md:hidden` card list (`cxc-mobile-card-list`) renders one `DeudaCard` per row; tapping a card's accion calls the same handler as the row click
- [x] 2.3 RED/GREEN: tapping a debtor opens a shadcn `Dialog` modal with the detail; closing it leaves the list visible and unchanged (existing close "X" closes the modal — no master-detail state)
- [x] 2.4 Run `yarn test:run -- cxc`, confirm all green, no regressions

## Phase 3: CxP Mobile — Modal + Facturas row→card (shipped, no Volver control)

- [x] 3.1 RED/GREEN in `cxp-page.test.tsx`: list panel stays visible regardless of `proveedorSeleccionado`; `PAGE_SIZE=12` pagination added
- [x] 3.2 RED/GREEN: tapping a proveedor opens a `Dialog` modal with `DetallePanel`; closing uses Radix's default close "X" (no new Volver button was built — the originally-planned dedicated control was dropped in favor of the modal's built-in close)
- [x] 3.3 RED/GREEN: facturas `<table>` `hidden md:block` + `md:hidden` card list via `DeudaCard`; Pagar fires `onPagar` with correct factura
- [x] 3.4 Run `yarn test:run -- cxp`, confirm green

## Phase 4: CxP Mobile — Gastos row→card (RED → GREEN)

- [x] 4.1 RED/GREEN: gastos `<table>` `hidden md:block` + `md:hidden` card list; `onPagarGasto` fires with correct gasto
- [x] 4.2 Run full `yarn test:run`, confirm no regressions across CxC/CxP suites (1456/1456 at this phase)

## Phase 5: Verification & Manual QA Gate

- [x] 5.1 `yarn type-check` clean, no new `any` (1 pre-existing unrelated error in `use-pwa-update.ts`, not introduced by this change)
- [x] 5.2 Grep confirmed no `use-mobile` import introduced (dead hook, rejected pattern)
- [x] 5.3 Confirmed `empresa_id` filtering untouched in `use-cxc.ts`/`use-cxp.ts` (0 lines changed per `git diff --stat`)
- [x] 5.4 `sdd-verify` PASS WITH WARNINGS (`verify-report-fase2.md`); documentation drift (this file + specs) flagged and corrected during `sdd-archive`
- [ ] 5.5 MANUAL PHONE QA — real-device check of modal open/close, pagination controls, card readability — still pending, not automatable (carried over as a standing gate item)
