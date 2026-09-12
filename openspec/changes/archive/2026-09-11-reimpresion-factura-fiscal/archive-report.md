# Archive Report: reimpresion-factura-fiscal

_Change: reimpresion-factura-fiscal | Archived: 2026-09-11 | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, VERIFY PASS, **NOT YET MERGED**

Unlike prior archived changes in this repo (all archived post-merge to `develop`), this change is archived **while still on its feature branch** (`feat/reimpresion-factura-fiscal`, 4 commits, not pushed/merged). This is an explicit instruction for this pass: merge/PR/QA is handled separately by the user. The SDD artifact lifecycle (proposal → spec → design → tasks → apply → verify) is complete and the archive step reflects that; the archive commit rides on the same feature branch and will be included whenever that branch is merged.

## Executive Summary

Delivered a single-surface invoice reprint feature from Clientes → Gestión → detalle de cliente: clicking a row in `FacturasEmpresaTable` opens `ReimprimirFacturaModal`, showing `FacturaDetallePanel` (reused as-is) plus "Descargar PDF" / "Compartir" buttons wired to the existing thermal 58mm pipeline (`descargarReciboPdf` / `compartirReciboImagen`). The reprint is marked with a centered "REIMPRESION" line between header and article table — the only visual diff versus the original receipt — via an additive `esReimpresion?: boolean` flag (default `false`, byte-identical when omitted).

As a side-effect, the previously duplicated `ventas → ReciboData` reconstruction (byte-identical in `nota-credito-pos-modal.tsx` and `crear-ncr-modal.tsx`) was extracted into one pure function (`buildReciboDataDesdeFacturaGuardada`) plus a composing hook (`useReciboDesdeFactura`) for the new modal. Both FROZEN NC modals were touched **extraction-only** — zero behavior change, their existing test suites pass **UNMODIFIED**.

Delivered as 4 chained slices:

| PR | Commit | Content |
|---|---|---|
| PR1 | `0a394ee` | `esReimpresion` marker + `centrarTexto` helper in `factura-export.ts` |
| PR2 | `bd01431` | `recibo-desde-factura.ts` extraction (pure fn + hook), swapped into both NC modals |
| PR3a | `9107580` | `onRowClick` on `FacturasEmpresaTable` + `cliente-detalle.tsx` state wiring |
| PR3b | `1d357ed` | `ReimprimirFacturaModal` (final slice, feature complete) |

**Verification result**: PASS. 1335/1335 tests (113 files) green, `yarn type-check:test` clean apart from one documented pre-existing error unrelated to this diff. FROZEN NC modal test files confirmed zero-diff. Regression guard present and passing (`esReimpresion` omitted/false → byte-identical to pre-change output). Pure-read confirmed via grep (no `writeTransaction`/INSERT/UPDATE/DELETE in any reprint-path file). See `verify-report.md` (filesystem copy of Engram `sdd/reimpresion-factura-fiscal/verify`, obs #3324).

**Merge**: Not merged. Branch `feat/reimpresion-factura-fiscal` left as-is for the user to merge/QA separately, per explicit instruction for this archive pass.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/reimpresion-factura/spec.md` | **Created** (canonical location did not exist yet) | Copied verbatim from this change's delta spec — 8 Requirements, 10 scenarios. New capability domain, no merge needed. |

No modification to any existing main spec was required — `reimpresion-factura` is a brand-new capability domain. The change's own proposal explicitly declares "Modified Capabilities: None" (the NC-modal extraction is an internal refactor with no observable behavior change, confirmed by the FROZEN test-file zero-diff proof above).

---

## Archive Contents

- `proposal.md` — present
- `exploration.md` — present (pre-proposal research, confirms saved-invoice reconstruction data already exists in persisted tables)
- `specs/reimpresion-factura/spec.md` — present (delta, copied verbatim to `openspec/specs/reimpresion-factura/spec.md`)
- `design.md` — present (5 architecture decisions, data flow, interfaces/contracts, testing strategy)
- `tasks.md` — present (30/30 tasks `[x]` across PR1, PR2, PR3a, PR3b — T1-01..10 checked off in this pass, see verify-report.md WARNING)
- `verify-report.md` — present (filesystem copy of Engram obs #3324, created during this archive pass)

---

## Follow-up Debt (recorded, NOT fixed in this archive pass)

Carried forward exactly as scoped in `proposal.md` §Out of Scope and `design.md`/verify report, none introduced by this change:

1. **Reprint inside `nota-credito-pos-modal.tsx`** (FROZEN) — deferred per proposal. The extraction (PR2) makes this a small future addition (swap in the same `buildReciboDataDesdeFacturaGuardada` call with `esReimpresion: true`), but it is intentionally NOT done here to keep the FROZEN file's diff at zero.
2. **`ventas-consultas-modal.tsx` (Ventas → consulta de facturas)** — its ad-hoc non-thermal PDF is untouched, not replaced. Explicit out-of-scope per proposal.
3. **`empresa_id` gap in `useDetalleFactura`/`usePagosFactura`** (`src/features/cxc/hooks/use-cxc.ts`) — both hooks filter only by `venta_id`, not `empresa_id`. Pre-existing gap, **not introduced or fixed by this change** (confirmed zero diff to `use-cxc.ts` in verify). Practical risk is low here because `venta.id` always arrives already empresa_id-scoped via `useFacturasEmpresa` upstream in `cliente-detalle.tsx`. This is the same gap previously flagged in the `notas-credito-ui-pos` and `notas-credito-ruta-administrativa` archive reports — still open, now confirmed touched by a third consumer (`ReimprimirFacturaModal`) without being fixed. A future SDD change should close this gap directly in `use-cxc.ts` since three call sites now depend on it.
4. **No per-row action button** — any future per-row action UI (beyond the row-click-opens-modal pattern used here) is explicitly out of scope, per proposal §Out of Scope.
5. **Not merged** — `feat/reimpresion-factura-fiscal` (4 commits + this archive commit) has not been pushed, merged, or opened as a PR. Left entirely to the user, per explicit instruction for this session.

---

## Verification Evidence

- **Verify report** (Engram obs #3324, `sdd/reimpresion-factura-fiscal/verify`, filesystem copy at `verify-report.md`): PASS. 1335/1335 tests (113 files), `yarn type-check:test` clean (one pre-existing unrelated error). 8/8 requirement groups / 10/10 scenarios compliant. FROZEN confirmed (zero diff on both NC modal test files). Regression guard present and passing. Pure-read confirmed via grep.
- **Diff scope**: 4 commits on `feat/reimpresion-factura-fiscal` — `0a394ee` (PR1), `bd01431` (PR2), `9107580` (PR3a), `1d357ed` (PR3b).
- **Tasks**: `tasks.md` 30/30 items `[x]` (T1-01..10, T2-01..09, T3a-01..04, T3b-01..10) after this pass ticked off the T1 series that verify flagged as a doc-tracking gap (functionally complete at verify time).

---

## SDD Cycle Summary

| Phase | Status |
|-------|--------|
| Exploration | Complete (`exploration.md`) |
| Proposal | Complete (`proposal.md`) |
| Spec | Complete (`specs/reimpresion-factura/spec.md`, 8 Requirements / 10 scenarios) |
| Design | Complete (`design.md`, 5 architecture decisions) |
| Tasks | Complete (`tasks.md`, 30/30 items `[x]` across PR1/PR2/PR3a/PR3b) |
| Apply | Complete — chain PR1 → PR2 → PR3a → PR3b (commits `0a394ee`, `bd01431`, `9107580`, `1d357ed`) |
| Verify | PASS (Engram obs #3324 / `verify-report.md`) |
| Merge | **Pending** — left to the user, out of scope for this session |
| Archive | Complete — this report |

The SDD cycle for `reimpresion-factura-fiscal` is fully complete on the artifact side: implemented, 1335/1335 tests green, `type-check:test` clean, 0 CRITICAL issues, spec/design/tasks all traced to shipped code, 5 follow-up debt items recorded above. No source code under `src/` was touched by this archive pass — only `openspec/` bookkeeping. Merge, push, and QA are explicitly left for the user.
