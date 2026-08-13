# Archive Report: gasto-detalle-total-desglose

_Change: gasto-detalle-total-desglose | Archived: 2026-08-13 | Model: anthropic/claude-sonnet-5_

---

## Status: ARCHIVED — DONE, re-verified PASS

## Executive Summary

Fixed "Detalle de Gasto" (`FacturaProveedorModal`, tipo=`GASTO`) showing the pre-IVA base
(`monto_factura`) as "Total Factura" instead of the tax-inclusive total (`monto_usd`), and ported
the existing Base/IVA/Total breakdown (from PR #25's dead `gasto-detalle-modal.tsx`) into the live
modal via a new pure function `deriveGastoTotales()` in `gasto-montos.ts`.

A first-pass fresh-context verify caught a **CRITICAL** regression introduced by the literal
implementation of the design's BS/tasa-paralela formula: it divided the already-converted
`monto_usd` by the exchange rate a second time, producing values ~40x too small (e.g. a real
$116.00 total rendered as $2.90). This was root-caused against `crearGasto`'s real persistence
math, fixed in commit `90c6673`, and independently re-verified fresh: **PASS**.

**Verification result**: PASS (re-verify, engram #1512, supersedes an earlier FAIL). 328/328 tests
green, `yarn type-check:test` clean. No CRITICAL or new WARNING issues remain.

---

## Final Scope Delivered

- **Core fix** (`totalProveedorUsd`): now derives from `monto_usd` (base + IVA), never from
  `monto_factura` (base) alone.
- **Base/IVA/Total breakdown**: dynamic per `tipo_impuesto` (Gravable / Exento / Exonerado),
  reusing `montoCostoGasto`/`montoIvaGasto`/`montoTotalGasto` from `gasto-montos.ts`, rendered with
  USD + Bs equivalents matching the existing bimonetary pattern.
- **New pure function**: `deriveGastoTotales(gasto, tasaValor)` in
  `src/features/contabilidad/lib/gasto-montos.ts`, exported with `GastoTotalesInput` /
  `GastoTotalesResult` interfaces.
- **Dead code flagged, not removed**: `gasto-detalle-modal.tsx` annotated with a
  `// TODO(dead-code):` header comment (not imported anywhere).
- **Post-verify critical fix** (commit `90c6673`): removed a double-currency-conversion bug —
  `totalProveedorUsd` now equals `totalContableUsd` (`= monto_usd`) unconditionally, with no
  division and no branching on `moneda_factura`/`usa_tasa_paralela`.

---

## Commits (branch `feat/gasto-detalle-total-desglose`, base `develop`)

| Commit | Message |
|---|---|
| `c6cacc6` | fix(contabilidad): add deriveGastoTotales pure function with base/IVA/total desglose |
| `76bc401` | fix(compras): wire deriveGastoTotales into factura-proveedor-modal GASTO branch |
| `90c6673` | fix(contabilidad): remove double currency conversion in deriveGastoTotales |

---

## IMPORTANT Reconciliation: Design vs. Final Implemented Behavior

`design.md`'s "Decision: Convert the TOTAL (not the base) for the BS/parallel-rate case" specified
dividing `monto_usd` by `tasa_proveedor`/`tasa` for the BS + tasa-paralela case. **This formula was
WRONG** — it was implemented literally (Phase 2.2 of `tasks.md`), and caused a CRITICAL
double-currency-conversion bug caught by a fresh-context re-verify pass.

**Root cause** (confirmed by reading `use-gastos.ts::crearGasto` L204-218): `monto_usd` is already
the final USD total (base + IVA), converted from Bs to USD exactly ONCE at Gasto-creation time, for
ALL currency modes (USD, BS no-paralela, BS paralela). It is never a "still needs converting" raw
Bs value. Dividing it again at render time was a second, spurious conversion.

**Corrected final behavior**: `totalProveedorUsd = totalContableUsd` (`= monto_usd`)
**unconditionally** — no division, no branching on `moneda_factura` or `usa_tasa_paralela`, for any
GASTO record.

Both `design.md` and the spec (`specs/gasto-detalle-desglose/spec.md`, requirement "Conversion con
Tasa Paralela Usa el Total") have been amended in-place in this archived copy to record the
correction (marked with `> **AMENDMENT**` / `> **Correction note**` blocks) rather than silently
rewriting history. The main spec synced to `openspec/specs/gasto-detalle-desglose/spec.md` reflects
**only the corrected, final behavior** — the requirement is renamed to "Total Factura Usa el Monto
USD Canonico (Sin Reconversion)" to describe what actually ships.

---

## Verification Evidence

- **Apply (Phases 0-5)**: 326/326 tests, `yarn type-check:test` clean (engram apply-progress,
  first batch, part of #1511).
- **First verify pass** (engram #1512/#1513, superseded): found the CRITICAL double-conversion bug
  described above.
- **Post-verify fix** (engram #1511, continuation batch, commit `90c6673`): TDD RED→GREEN — 9/24
  tests in `gasto-montos.test.ts` failed as expected before the fix (ground-truth values re-traced
  from `crearGasto`'s real math), 24/24 green after. Full suite `yarn test:run` → 328/328 passed
  (25 files). `yarn type-check:test` clean.
- **Re-verify** (engram #1512, fresh context, PASS): independently re-traced `crearGasto`'s math by
  hand for all 3 currency modes, confirmed `deriveGastoTotales` (source-read, `gasto-montos.ts`
  L86-100) no longer divides by any rate. Confirmed `git diff 76bc401..90c6673 --
  factura-proveedor-modal.tsx` is empty (zero regression risk in the modal). Confirmed zero
  `writeTransaction`/`UPDATE gastos` in the modal (still display-only). Ran tests/type-check fresh
  itself rather than trusting the prior report. **Verdict: PASS.**

**Remaining non-blocking WARNINGs** (carried from #1512, unresolved by design — flagged for future
work, not required for this change):
- "Coherencia con Confirmar Registro" (spec scenario) has unit-level invariant coverage
  (`baseUsd + ivaUsd === totalContableUsd`) but no literal cross-screen/component-level test
  comparing against `gasto-form.tsx`'s `ResumenConfirm` rendering.
- "Abono igual al total no muestra incoherencia" has a numeric worst-case invariant test but no
  direct UI/component-level test.
- **SUGGESTION** (non-urgent): the `totalProveedorUsd`/`totalContableUsd` dual-field distinction on
  `GastoTotalesResult` could be collapsed to one field in a future cleanup, since they are now
  provably always equal for GASTO records. Kept as two fields to avoid touching
  `factura-proveedor-modal.tsx`'s consumer code.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/gasto-detalle-desglose/spec.md` | **Created** (new domain, no prior main spec existed) | 6 Requirements, 12 scenarios. Delta spec copied from `specs/gasto-detalle-desglose/spec.md` with one requirement corrected (see Reconciliation above) to reflect the final, post-fix behavior instead of the original flawed BS/tasa-paralela division formula. |

---

## SDD Cycle Summary

| Phase | Status |
|-------|--------|
| Proposal | Complete (engram #1500 / `proposal.md`) |
| Spec | Complete (engram #1502 / `specs/gasto-detalle-desglose/spec.md`, amended on archive) |
| Design | Complete (engram #1504 / `design.md`, amended on archive) |
| Tasks | Complete (engram #1507 / `tasks.md`, 6/6 phases — 5 planned + 1 post-verify fix, all `[x]`) |
| Apply | Complete — 3 commits on `feat/gasto-detalle-total-desglose` (engram apply-progress #1511) |
| Verify | PASS — re-verify fresh context (engram #1512), supersedes an earlier FAIL on the same topic key |
| Archive | Complete — this report |

The SDD cycle for `gasto-detalle-total-desglose` is fully complete: 328/328 tests green,
`yarn type-check:test` clean, no CRITICAL issues, no open blockers. Ready for PR review (handled
by the orchestrator, not this agent).
</content>
