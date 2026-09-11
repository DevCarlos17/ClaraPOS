# Archive Report: consulta-factura-evolucion

_Change: consulta-factura-evolucion | Archived: 2026-09-11 | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, VERIFY PASS, **NOT YET MERGED**

Same convention as the prior archive in this repo (`2026-09-11-reimpresion-factura-fiscal`): this change is archived **while still on its feature branch** (`feat/consulta-factura-evolucion`, 7 commits, based on `feat/reimpresion-factura-fiscal`, not pushed/merged). Merge/PR/QA is handled separately by the user. The SDD artifact lifecycle (proposal → design → tasks → apply → verify) is complete and this archive step reflects that; the archive commit rides on the same feature branch and will be included whenever that branch is merged.

## Executive Summary

Delivered 3 parts on top of the `ConsultaFacturaModal` (formerly `ReimprimirFacturaModal`) read-only surface:

- **A. Rename**: `reimprimir-factura-modal.tsx`/`ReimprimirFacturaModal` → `consulta-factura-modal.tsx`/`ConsultaFacturaModal`; title "Reimprimir Factura" → "Consulta de Factura". Same prop shape (`{ venta, isOpen, onClose }`). 1 consumer (`cliente-detalle.tsx`) + 2 test files updated.
- **B. Payment parity**: un-hid the "Métodos de pago" block in `FacturaDetallePanel` (helpers already exported, zero new query) — now at parity with PDF/text/PNG, which already showed it.
- **C. Post-emission evolution** (new, additive, across all 3 render paths — modal, PDF, text/PNG): `ReciboData.evolucion` with real-amount reversals (via extended `useReversosFactura` reading `notas_credito.total_usd/total_bs`), plus abonos / reversos-de-pago / saldo-a-favor-generado (via new `useEvolucionFactura` hook reading `movimientos_cuenta` `PAG`/`REV`/`SAFC`, `empresa_id`-scoped). Replaces the old quantity-only "Notas de crédito aplicadas" block on the Consulta surface.

Delivered as 6 chained slices + 1 follow-up test-coverage commit:

| PR | Commit | Content |
|---|---|---|
| PR1 | `da039c5` | Rename to `ConsultaFacturaModal` + un-hide "Métodos de pago" |
| PR2 | `691f4c7` | Extend `useReversosFactura` with reversed amount (`total_usd`/`total_bs`) |
| PR3 | `538cf73` | New `useEvolucionFactura` hook (PAG/REV/SAFC, `empresa_id`-scoped) |
| PR4 | `4e88540` | Compose factura evolucion into `ReciboData` |
| PR5 | `83559b1` | Render evolucion in PDF and text/PNG receipt paths (+ byte-identical regression guard) |
| PR6 | `89e11ac` | Render evolucion section in factura detalle modal (final integration) |
| follow-up | `072cccd` | `test(ventas): cubrir caso multi-SAFC en reducirSaldoAFavorGenerado` — closes the verify WARNING |

**Verification result**: **PASS** (was PASS WITH WARNINGS at verify time; the one WARNING — untested 2+-row multi-SAFC branch in `reducirSaldoAFavorGenerado` — was resolved by commit `072cccd` before this archive pass, adding the missing test). Full suite: **1376/1376 tests green** (113 files, was 1375 at verify + 1 new test). `yarn type-check:test` clean apart from one documented pre-existing error unrelated to this diff. FROZEN NC modal suites (`nota-credito-pos-modal.test.tsx`, `crear-ncr-modal.test.tsx`) confirmed zero-diff and green throughout all 6 PRs. Both regression guards (byte-identical text/PNG, unchanged PDF `autoTable` count) present and passing when evolucion is empty/undefined. Pure-read confirmed via grep (no `writeTransaction`/INSERT/UPDATE/DELETE in any evolution-path file). `empresa_id` confirmed present in all new code (`useEvolucionFactura`). See `verify-report.md` (filesystem copy of Engram `sdd/consulta-factura-evolucion/verify`, obs #3341).

**Merge**: Not merged. Branch `feat/consulta-factura-evolucion` left as-is for the user to merge/QA separately, per explicit instruction for this archive pass.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/reimpresion-factura/spec.md` | **Updated** | Purpose paragraph updated to reflect the rename (`ConsultaFacturaModal`) and expanded scope (consulta + evolución, reimpresión kept as one action). Added a "Nota de historial" callout. Added 2 new Requirements: "Métodos de pago visibles en el detalle" (Part B) and "Evolución post-emisión en el detalle" (Part C, modal side, 2 scenarios: populated/empty). Added the SAF-FIFO fix-deferral bullet to "Out of Scope". |
| `openspec/specs/recibo-venta-exportacion/spec.md` | **Updated** | Added 1 new Requirement: "Sección de evolución post-emisión en el recibo" (Part C, PDF + texto/PNG side, 3 scenarios: populated/empty/multi-line-NC-counted-once). Existing sibling-change coordination note left untouched (out of scope for this archive — pre-existing accumulated debt, not introduced or worsened by this change). |

**Process deviation, reconciled here**: this change did **not** create a `specs/` subfolder under `openspec/changes/consulta-factura-evolucion/` — `proposal.md` declared "Modified Capabilities" inline (`reimpresion-factura`, `recibo-venta-exportacion`) instead of writing delta-spec files, and `sdd-verify` flagged this explicitly as a non-blocking process deviation (verified against proposal.md + design.md + exploration.md + tasks.md as ground truth instead). During this archive pass, the two living specs above were updated **directly** from that proposal/design/exploration content, following the same Requirement/Scenario structure and RFC-2119 keyword conventions used elsewhere in both spec files — functionally equivalent to merging a delta spec, just without an intermediate delta-spec file on disk.

---

## Archive Contents

- `proposal.md` — present
- `exploration.md` — present (pre-proposal research: confirms the SAF-FIFO capped-pagos root cause, the 4 exact evolution data sources, and the contado-NC unreliability of `movimientos_cuenta` `NCR`)
- `design.md` — present (3 architecture decisions, data flow, interfaces/contracts, testing strategy)
- `tasks.md` — present (30/30 tasks `[x]` across PR1-PR6)
- `verify-report.md` — present (filesystem copy of Engram obs #3341, created during this archive pass, annotated with the post-verify `072cccd` resolution)
- No `specs/` subfolder existed on disk for this change (see "Specs Synced" above for how this was reconciled)

---

## Follow-up Debt (recorded, NOT fixed in this archive pass)

Carried forward exactly as scoped in `proposal.md` §Out of Scope, none introduced by this change:

1. **`empresa_id` gap in `useDetalleFactura`/`usePagosFactura`** (`src/features/cxc/hooks/use-cxc.ts`) — both hooks still filter only by `venta_id`, not `empresa_id`. Pre-existing gap, **not introduced or fixed by this change**; the new `useEvolucionFactura` hook added in this change correctly filters by both `venta_id` AND `empresa_id` (confirmed in verify), so it does NOT repeat the gap. This is the same gap flagged in `notas-credito-ui-pos`, `notas-credito-ruta-administrativa`, and `reimpresion-factura-fiscal` archive reports — still open, now confirmed touched by a fourth consumer path (`ConsultaFacturaModal`'s evolution composition, indirectly, via the unchanged `useDetalleFactura`/`usePagosFactura` calls inside `useReciboDesdeFactura`) without being fixed. A future SDD change should close this gap directly in `use-cxc.ts` since multiple call sites now depend on it.
2. **SAF-FIFO capped-amount caveat, now visible on screen** — un-hiding "Métodos de pago" in the panel (Part B) surfaces, for the first time on screen, the pre-existing SAF-FIFO origin-invoice capped-pagos caveat (previously only visible in PDF/shared image). This is **accepted, not a bug introduced here** — root cause lives in `use-ventas.ts` (`crearVenta`), explicitly out of scope per proposal (§Out of Scope: "Corregir la causa raíz del 'capped pagos' SAF-FIFO en `use-ventas.ts`"). Documented in the rewritten `factura-detalle-panel.tsx` L117-132 comment and compensated by Part C's "Genero saldo a favor" line on the origin-invoice side.
3. **POS notas-credito modal reprint** (`nota-credito-pos-modal.tsx`, FROZEN) — reprint-with-`esReimpresion:true` was already deferred in `reimpresion-factura-fiscal`; still deferred here. `nota-credito-pos-modal.tsx` and `crear-ncr-modal.tsx` remain untouched (zero-diff confirmed via `git diff` in both verify and this archive), so this remains a small, well-understood future addition (swap in `buildReciboDataDesdeFacturaGuardada` with `esReimpresion: true`).
4. **`ventas-consultas-modal.tsx` reprint** (Ventas → consulta de facturas, ad-hoc non-thermal PDF) — untouched, not replaced. Explicit out-of-scope per both `reimpresion-factura-fiscal` and this change's proposal.
5. **Not merged** — `feat/consulta-factura-evolucion` (7 commits + this archive commit) has not been pushed, merged, or opened as a PR. Left entirely to the user, per explicit instruction for this session.

---

## Verification Evidence

- **Verify report** (Engram obs #3341, `sdd/consulta-factura-evolucion/verify`, filesystem copy at `verify-report.md`): PASS WITH WARNINGS at verify time → PASS after `072cccd`. 1376/1376 tests (113 files) after the follow-up commit, `yarn type-check:test` clean (one pre-existing unrelated error). FROZEN confirmed (zero diff on both NC modal files/tests across all 6 PRs). Both regression guards present and passing. Pure-read confirmed via grep. `empresa_id` confirmed in all new query code.
- **Diff scope**: 7 commits on `feat/consulta-factura-evolucion` (base `feat/reimpresion-factura-fiscal`) — `da039c5` (PR1), `691f4c7` (PR2), `538cf73` (PR3), `4e88540` (PR4), `83559b1` (PR5), `89e11ac` (PR6), `072cccd` (test fix, resolves verify WARNING).
- **Tasks**: `tasks.md` 30/30 items `[x]` (PR1 6 tasks, PR2 5, PR3 2, PR4 8, PR5 6, PR6 4) — all were already checked at archive time, no additional ticking needed in this pass.

---

## SDD Cycle Summary

| Phase | Status |
|-------|--------|
| Exploration | Complete (`exploration.md`) |
| Proposal | Complete (`proposal.md`, Modified Capabilities declared inline) |
| Spec | **Deviated** — no delta `specs/` subfolder created; reconciled directly into living specs during archive (see "Specs Synced") |
| Design | Complete (`design.md`, 3 architecture decisions, full interfaces/contracts) |
| Tasks | Complete (`tasks.md`, 30/30 items `[x]` across PR1-PR6) |
| Apply | Complete — chain PR1 → PR2 → PR3 → PR4 → PR5 → PR6 (commits `da039c5`, `691f4c7`, `538cf73`, `4e88540`, `83559b1`, `89e11ac`) + follow-up test commit `072cccd` |
| Verify | PASS WITH WARNINGS → PASS (Engram obs #3341 / `verify-report.md`, WARNING resolved by `072cccd` before archive) |
| Merge | **Pending** — left to the user, out of scope for this session |
| Archive | Complete — this report |

The SDD cycle for `consulta-factura-evolucion` is fully complete on the artifact side: implemented, 1376/1376 tests green, `type-check:test` clean, 0 CRITICAL issues, 0 open WARNINGs (1 resolved pre-archive), proposal/design/tasks all traced to shipped code, both affected living specs (`reimpresion-factura`, `recibo-venta-exportacion`) updated to reflect the new behavior, 5 follow-up debt items recorded above (none introduced by this change). No source code under `src/` was touched by this archive pass — only `openspec/` bookkeeping. Merge, push, and QA are explicitly left for the user.
